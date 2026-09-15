import "server-only";
import type { DotykackaDeliveryNote, DotykackaProduct } from "./types";
import type { DotykackaClient } from "./client";

type DeliveryItem = { sku: string | null; name: string | null; eans: string[] };
type SupplierMatch = { supplierName: string; detectedAt: Date | null; documentId: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase("pl").replace(/\s+/g, " ");
const compact = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, " ")) : null;
}

export function parseDeliveryNoteItems(xml: string): DeliveryItem[] {
  const blocks = xml.match(/<ITEM(?:\s[^>]*)?>[\s\S]*?<\/ITEM>/gi) ?? [];
  return blocks.map((block) => {
    const eans = Array.from(block.matchAll(/<(?:BARCODE|EAN)(?:\s[^>]*)?>([\s\S]*?)<\/(?:BARCODE|EAN)>/gi))
      .map((match) => compact(decodeXml(match[1].replace(/<[^>]+>/g, " ")))).filter(Boolean);
    return { sku: tag(block, "SKU"), name: tag(block, "PRODUCT_NAME"), eans };
  });
}

function matchesProduct(item: DeliveryItem, product: DotykackaProduct) {
  const supplierCode = product.supplierProductCode ? compact(product.supplierProductCode) : "";
  if (supplierCode && item.sku && compact(item.sku) === supplierCode) return true;
  const productEans = new Set((product.ean ?? []).map((ean) => compact(String(ean))).filter(Boolean));
  if (item.eans.some((ean) => productEans.has(ean))) return true;
  return Boolean(item.name && normalize(item.name) === normalize(product.name));
}

export async function matchLatestDeliveryNoteSuppliers(client: DotykackaClient, notes: DotykackaDeliveryNote[], products: DotykackaProduct[]) {
  const matches = new Map<string, SupplierMatch>();
  const candidates = notes.filter((note) => !note.deleted && note.url && note.supplierName)
    .sort((a, b) => Date.parse(b.expeditionDate ?? b.created ?? "") - Date.parse(a.expeditionDate ?? a.created ?? ""))
    .slice(0, 150);

  for (let index = 0; index < candidates.length && matches.size < products.length; index += 5) {
    const batch = candidates.slice(index, index + 5);
    const documents = await Promise.all(batch.map(async (note) => {
      try { return { note, items: parseDeliveryNoteItems(await client.deliveryNoteDocument(note.url!)) }; }
      catch { return { note, items: [] as DeliveryItem[] }; }
    }));
    for (const { note, items } of documents) {
      for (const product of products) {
        const productId = String(product.id);
        if (matches.has(productId) || !items.some((item) => matchesProduct(item, product))) continue;
        const dateText = note.expeditionDate ?? note.created;
        matches.set(productId, {
          supplierName: note.supplierName!.trim(),
          detectedAt: dateText && !Number.isNaN(Date.parse(dateText)) ? new Date(dateText) : null,
          documentId: String(note.id),
        });
      }
    }
  }
  return matches;
}
