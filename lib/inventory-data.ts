import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { inventoryCountEntries, inventoryEvents, inventoryExports, inventoryStageItems, inventoryStages } from "../db/schema";

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
    items: items.map((item) => ({ ...item, entries: entriesByItem.get(item.id) ?? [] })),
    events,
    export: inventoryExport ?? null,
  };
}
