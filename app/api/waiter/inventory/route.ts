import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { inventoryStageItems, inventoryStages } from "../../../../db/schema";
import { currentWaiter } from "../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const db = getDb();
  const stages = await db.select().from(inventoryStages).where(eq(inventoryStages.assignedEmployeeDotykackaId, employee.dotykackaId)).orderBy(desc(inventoryStages.createdAt)).limit(50);
  const items = stages.length ? await db.select({ stageId: inventoryStageItems.stageId, countStatus: inventoryStageItems.countStatus }).from(inventoryStageItems).where(inArray(inventoryStageItems.stageId, stages.map((stage) => stage.id))) : [];
  const stats = new Map<number, { total: number; counted: number }>();
  for (const item of items) {
    const value = stats.get(item.stageId) ?? { total: 0, counted: 0 };
    value.total += 1;
    value.counted += item.countStatus === "PENDING" ? 0 : 1;
    stats.set(item.stageId, value);
  }
  return Response.json({
    employee,
    stages: stages.map((stage) => ({ ...stage, totalItems: stats.get(stage.id)?.total ?? 0, countedItems: stats.get(stage.id)?.counted ?? 0 })),
  });
}
