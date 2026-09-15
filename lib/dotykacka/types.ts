export type DotykackaCategory = {
  id: number;
  name: string;
  display: boolean;
  deleted: boolean;
  sortOrder?: number | null;
  versionDate?: string | null;
};

export type DotykackaProduct = {
  id: number;
  externalId?: string | null;
  externalIds?: string[] | null;
  _categoryId?: number | null;
  _supplierId?: number | null;
  deliveryNoteIds?: string | null;
  name: string;
  description?: string | null;
  priceWithVat?: number | null;
  currency?: string | null;
  display: boolean;
  deleted: boolean;
  stockDeduct: boolean;
  unit?: string | null;
  stockOverdraft?: "ALLOW" | "WARN" | "DISABLE" | null;
  ean?: string[] | null;
  plu?: string[] | string | null;
  supplierProductCode?: string | null;
  imageUrl?: string | null;
  tags?: string[] | null;
  allergens?: number[] | null;
  features?: string[] | null;
  sortOrder?: number | null;
  versionDate?: string | null;
  translatedName?: Record<string, string> | null;
  translatedDescription?: Record<string, string> | null;
};

export type DotykackaProductCustomization = {
  id: number;
  _categoryId: number;
  _productId: number;
  name?: string | null;
  sortOrder?: number | null;
  deleted: boolean;
};

export type DotykackaDeliveryNote = {
  id: number | string;
  supplierName?: string | null;
  created?: string | null;
  expeditionDate?: string | null;
  deleted?: boolean;
  documentNumber?: string | null;
  status?: number | null;
  url?: string | null;
};

export type DotykackaSupplier = {
  id: number;
  name: string;
  websiteUrl?: string | null;
};

export type DotykackaSalesReport = {
  revenue?: {
    totalWithVat?: number | null;
    paymentTypeInfo?: Array<{
      typeId?: number | null;
      count?: number | null;
      total?: number | null;
      rawTotal?: number | null;
      currency?: string | null;
    }>;
  };
  productSales?: Array<{
    id: number;
    name: string;
    count: number;
    categoryId?: number | null;
  }>;
};

export type DotykackaStockProduct = DotykackaProduct & {
  _warehouseId?: number;
  stockQuantityStatus?: number | null;
  stockStatusVersiondate?: string | null;
};

export type DotykackaStockTakingResponse = {
  _cloudId: number;
  _warehouseId: number;
  _stockTransactionId: number | string;
  statusWebhookUrl: string;
};

export type DotykackaStockTakingStatus = {
  status: "PROCESSING" | "FINISHED" | "FAILED";
  error?: string | null;
  errors?: Array<{ code?: string; message?: string }>;
};

export type DotykackaPosActionResponse = {
  code: number;
  message?: string;
  localizedMessage?: string;
  deviceTimestamp?: number;
  order?: {
    id: number;
    "external-id"?: string | null;
    "order-number"?: string | null;
    status?: string;
  };
  items?: Array<{ id: number; "product-id": number; qty: number }>;
};

export type DotykackaConfig = {
  apiUrl: string;
  refreshToken: string;
  cloudId: string;
  warehouseId?: string;
  branchId?: string;
  menuTag: string;
  timeoutMs: number;
};

export type DotykackaNamedEntity = {
  id: number;
  name: string;
  display?: boolean;
  deleted?: boolean;
};

export type DotykackaWebhook = {
  id: number;
  _cloudId: number;
  _warehouseId?: number | null;
  method: "POST" | "GET";
  url: string;
  payloadEntity: string;
  payloadVersion: string;
  versionDate?: string | null;
};

export type DotykackaEmployee = {
  id: number;
  name: string;
  enabled?: boolean;
  deleted?: boolean;
  accessLevel?: number | string | null;
  requirePinAlways?: boolean;
  versionDate?: string | null;
};

export type DotykackaTable = {
  id: number;
  name: string;
  display?: boolean;
  enabled?: boolean;
  deleted?: boolean;
  versionDate?: string | null;
};
