import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { inventoryCountEntries, inventoryEvents, inventoryExports, inventoryStageItems, inventoryStages } from "../db/schema";

const teaImages: Array<[RegExp, string]> = [
  [/hot cinnamon spice/i, "/tea/hot-cinnamon-spice.jpg"],
  [/\bparisb?\b/i, "/tea/paris.jpg"],
  [/english breakfast/i, "/tea/english-breakfast.jpg"],
  [/earl grey/i, "/tea/earl-grey.jpg"],
  [/ctc assam/i, "/tea/ctc-assam.jpg"],
  [/japanese sencha/i, "/tea/japanese-sencha.jpg"],
  [/jasmine/i, "/tea/jasmine.jpg"],
  [/peppermint/i, "/tea/peppermint.jpg"],
  [/rooibos chai/i, "/tea/rooibos-chai.jpg"],
];

function inventoryImage(imagePath: string | null, productName: string) {
  return imagePath || teaImages.find(([pattern]) => pattern.test(productName))?.[1] || null;
}

export async function inventoryStageDetail(stageId: number) {
  const db = getDb();
  const [[stage], items, entries, events, [inventoryExport]] = await Promise.all([
    db.select().from(inventoryStages).where(eq(inventoryStages.id, stageId)).limit(1),
    db.select().from(inventoryStageItems).where(eq(inventoryStageItems.stageId, stageId)).orderBy(asc(inventoryStageItems.productName)),
    db.select().from(inventoryCountEntries)
      .innerJoin(inventoryStageItems, eq(inventoryCountEntries.itemId, inventoryStageItems.id))
      .where(eq(inventoryStageItems.stageId, stageId))
      .orderBy(asc(inventoryCountEntries.id)),
    db.select().from(inventoryEvents).where(eq(inventoryEvents.stageId, stageId)).orderBy(desc(inventoryEvents.createdAt)),
    db.select().from(inventoryExports).where(eq(inventoryExports.stageId, stageId)).limit(1),
  ]);
  if (!stage) return null;
  const entriesByItem = new Map<number, Array<typeof inventoryCountEntries.$inferSelect>>();
  for (const row of entries) {
    const current = entriesByItem.get(row.inventory_count_entries.itemId) ?? [];
    current.push(row.inventory_count_entries);
    entriesByItem.set(row.inventory_count_entries.itemId, current);
  }
  return {
    ...stage,
    items: items.map((item) => ({ ...item, imagePath: inventoryImage(item.imagePath, item.productName), entries: entriesByItem.get(item.id) ?? [] })),
    events,
    export: inventoryExport ?? null,
  };
}
