import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { waiterSettlements, waiterTipAdjustments, waiterTipAllocations } from "../../../../db/schema";
import { currentWaiter } from "../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });

  const db = getDb();
  const [allocations, adjustments] = await Promise.all([
    db.select({
      id: waiterTipAllocations.id,
      amount: waiterTipAllocations.amount,
    }).from(waiterTipAllocations)
      .innerJoin(waiterSettlements, eq(waiterSettlements.id, waiterTipAllocations.settlementId))
      .where(and(
        eq(waiterTipAllocations.employeeDotykackaId, employee.dotykackaId),
        eq(waiterTipAllocations.payoutStatus, "DUE"),
        eq(waiterSettlements.status, "VERIFIED"),
      )),
    db.select({ id: waiterTipAdjustments.id, amount: waiterTipAdjustments.amount })
      .from(waiterTipAdjustments).where(and(
        eq(waiterTipAdjustments.employeeDotykackaId, employee.dotykackaId),
        eq(waiterTipAdjustments.payoutStatus, "DUE"),
        isNull(waiterTipAdjustments.voidedAt),
      )),
  ]);

  const total = [...allocations, ...adjustments].reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  return Response.json({ count: allocations.length + adjustments.length, total: Math.max(0, total).toFixed(2) });
}
