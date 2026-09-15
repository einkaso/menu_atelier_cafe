import "server-only";
import type { DotykackaCategory, DotykackaConfig, DotykackaDeliveryNote, DotykackaEmployee, DotykackaNamedEntity, DotykackaPosActionResponse, DotykackaProduct, DotykackaProductCustomization, DotykackaSalesReport, DotykackaStockProduct, DotykackaStockTakingResponse, DotykackaStockTakingStatus, DotykackaSupplier, DotykackaTable, DotykackaWebhook } from "./types";

type Page<T> = T[] | { data?: T[]; items?: T[]; page?: number; pages?: number; totalPages?: number };

export class DotykackaClient {
  private accessToken?: string;
  constructor(private readonly config: DotykackaConfig) {}

  private async token() {
    if (this.accessToken) return this.accessToken;
    const response = await fetch(`${this.config.apiUrl}/signin/token`, {
      method: "POST",
      headers: { Authorization: `User ${this.config.refreshToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _cloudId: this.config.cloudId }),
      cache: "no-store",
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) throw new Error(`Dotykačka authorization failed (${response.status})`);
    const body = await response.json() as { accessToken?: string };
    if (!body.accessToken) throw new Error("Dotykačka did not return an access token");
    this.accessToken = body.accessToken;
    return body.accessToken;
  }

  private async request<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
    const accessToken = await this.token();
    const response = await fetch(`${this.config.apiUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(init?.timeoutMs ?? this.config.timeoutMs),
    });
    if (!response.ok) {
      const details = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 600);
      throw new Error(`Dotykačka request failed (${response.status})${details ? `: ${details}` : ""}`);
    }
    return response.json() as Promise<T>;
  }

  private async all<T>(path: string): Promise<T[]> {
    const limit = 100;
    const result: T[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const separator = path.includes("?") ? "&" : "?";
      const body = await this.request<Page<T>>(`${path}${separator}page=${page}&limit=${limit}`);
      const items = Array.isArray(body) ? body : body.data ?? body.items ?? [];
      result.push(...items);
      const totalPages = Array.isArray(body) ? undefined : body.totalPages ?? body.pages;
      if (!items.length || items.length < limit || (totalPages && page >= totalPages)) break;
    }
    return result;
  }

  categories() {
    return this.all<DotykackaCategory>(`/clouds/${this.config.cloudId}/categories`);
  }

  products() {
    return this.all<DotykackaProduct>(`/clouds/${this.config.cloudId}/products`);
  }

  productCustomizations() {
    return this.all<DotykackaProductCustomization>(`/clouds/${this.config.cloudId}/product-customizations`);
  }

  suppliers() {
    return this.all<DotykackaSupplier>(`/clouds/${this.config.cloudId}/suppliers`);
  }

  deliveryNotes() {
    return this.all<DotykackaDeliveryNote>(`/clouds/${this.config.cloudId}/delivery-notes`);
  }

  async deliveryNoteDocument(url: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Dotykačka returned an unsafe delivery note URL");
    const response = await fetch(parsed, { cache: "no-store", signal: AbortSignal.timeout(this.config.timeoutMs) });
    if (!response.ok) throw new Error(`Delivery note download failed (${response.status})`);
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > 2_000_000) throw new Error("Delivery note document is too large");
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error("Delivery note document is too large");
    return text;
  }

  warehouses() {
    return this.all<DotykackaNamedEntity>(`/clouds/${this.config.cloudId}/warehouses`);
  }

  branches() {
    return this.all<DotykackaNamedEntity>(`/clouds/${this.config.cloudId}/branches`);
  }

  employees() {
    return this.all<DotykackaEmployee>(`/clouds/${this.config.cloudId}/employees`);
  }

  tables() {
    return this.all<DotykackaTable>(`/clouds/${this.config.cloudId}/tables`);
  }

  salesReport(dateFrom: Date, dateTo: Date) {
    if (!this.config.branchId) return Promise.resolve(null);
    const query = new URLSearchParams({
      vatPayer: "true",
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      lang: "pl",
    });
    return this.request<DotykackaSalesReport>(`/clouds/${this.config.cloudId}/branches/${this.config.branchId}/sales-report?${query}`);
  }

  async salesReportRange(dateFrom: Date, dateTo: Date) {
    if (!this.config.branchId) return null;
    const windows: Array<[Date, Date]> = [];
    let cursor = dateFrom.getTime();
    const finalTime = dateTo.getTime();
    while (cursor < finalTime) {
      const nextCursor = Math.min(cursor + 24 * 60 * 60 * 1000, finalTime);
      windows.push([new Date(cursor), new Date(nextCursor - 1)]);
      cursor = nextCursor;
    }

    const reports: DotykackaSalesReport[] = [];
    for (let index = 0; index < windows.length; index += 5) {
      const results = await Promise.all(windows.slice(index, index + 5).map(([from, to]) => this.salesReport(from, to)));
      reports.push(...results.filter((report): report is DotykackaSalesReport => Boolean(report)));
    }

    const productSales = new Map<number, NonNullable<DotykackaSalesReport["productSales"]>[number]>();
    for (const report of reports) {
      for (const product of report.productSales ?? []) {
        const previous = productSales.get(product.id);
        productSales.set(product.id, {
          ...product,
          name: product.name || previous?.name || "",
          categoryId: product.categoryId ?? previous?.categoryId ?? null,
          count: Number(previous?.count ?? 0) + Number(product.count ?? 0),
        });
      }
    }
    return { productSales: Array.from(productSales.values()) } satisfies DotykackaSalesReport;
  }

  stockProducts() {
    if (!this.config.warehouseId) return Promise.resolve([] as DotykackaStockProduct[]);
    return this.all<DotykackaStockProduct>(`/clouds/${this.config.cloudId}/warehouses/${this.config.warehouseId}/products`);
  }

  posAction(input: Record<string, unknown>) {
    if (!this.config.branchId) throw new Error("Dotykačka branch is not configured");
    return this.request<DotykackaPosActionResponse>(
      `/clouds/${this.config.cloudId}/branches/${this.config.branchId}/pos-actions`,
      { method: "POST", body: input, timeoutMs: Math.max(this.config.timeoutMs, 25_000) },
    );
  }

  stockTakingDates(productIds: number[]) {
    if (!this.config.warehouseId) throw new Error("Dotykačka warehouse is not configured");
    return this.request<Array<{ _productId: number; stockTakingDate?: string | number | null }>>(
      `/clouds/${this.config.cloudId}/warehouses/${this.config.warehouseId}/stock-taking-dates`,
      { method: "POST", body: { _productIds: productIds } },
    );
  }

  createStockTaking(input: { note?: string; stockTakingDate: string; items: Array<{ _productId: number; quantity: number }> }) {
    if (!this.config.warehouseId) throw new Error("Dotykačka warehouse is not configured");
    return this.request<DotykackaStockTakingResponse>(
      `/clouds/${this.config.cloudId}/warehouses/${this.config.warehouseId}/stock-takings`,
      { method: "POST", body: input },
    );
  }

  async stockTakingStatus(statusWebhookUrl: string) {
    const base = new URL(this.config.apiUrl);
    const url = new URL(statusWebhookUrl);
    if (url.protocol !== "https:" || url.host !== base.host) throw new Error("Dotykačka returned an unsafe stock-taking status URL");
    const accessToken = await this.token();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) throw new Error(`Dotykačka stock-taking status failed (${response.status})`);
    return response.json() as Promise<DotykackaStockTakingStatus>;
  }

  webhooks() {
    return this.all<DotykackaWebhook>(`/clouds/${this.config.cloudId}/webhooks`);
  }

  registerStockWebhook(url: string) {
    return this.request<DotykackaWebhook>(`/clouds/${this.config.cloudId}/webhooks`, {
      method: "POST",
      body: {
        _warehouseId: this.config.warehouseId ? Number(this.config.warehouseId) : null,
        method: "POST",
        url,
        payloadEntity: "STOCKLOG",
        payloadVersion: "V1",
      },
    });
  }

  deleteWebhook(webhookId: number) {
    return this.request<unknown>(`/clouds/${this.config.cloudId}/webhooks/${webhookId}`, { method: "DELETE" });
  }
}
