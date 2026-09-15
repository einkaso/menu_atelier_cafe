import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { waiterSettlements, waiterTipAllocations } from "../../../../db/schema";
import { currentWaiter } from "../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });

  const allocations = await getDb().select({
    id: waiterTipAllocations.id,
    amount: waiterTipAllocations.amount,
  }).from(waiterTipAllocations)
    .innerJoin(waiterSettlements, eq(waiterSettlements.id, waiterTipAllocations.settlementId))
    .where(and(
      eq(waiterTipAllocations.employeeDotykackaId, employee.dotykackaId),
      eq(waiterTipAllocations.payoutStatus, "DUE"),
      eq(waiterSettlements.status, "VERIFIED"),
    ));

  const total = allocations.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  return Response.json({ count: allocations.length, total: total.toFixed(2) });
}
