import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { waiterCashDays, waiterSettlementEvents, waiterSettlements, waiterTipAllocations } from "../../../../../db/schema";
import { isAdmin } from "../../../../../lib/admin-auth";
import { currentBusinessDate } from "../../../../../lib/cash-day";

export const dynamic = "force-dynamic";

const amount = (value: string | null | undefined) => Number(value ?? 0);

export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const now = new Date();
  const today = currentBusinessDate(now);
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : defaultFrom;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : today;
  const status = url.searchParams.get("status") ?? "ALL";
  const conditions = [gte(waiterSettlements.businessDate, from), lte(waiterSettlements.businessDate, to)];
  if (["SUBMITTED", "VERIFIED", "NEEDS_CORRECTION"].includes(status)) conditions.push(eq(waiterSettlements.status, status));
  const db = getDb();
  const [settlements, ledgerSettlements] = await Promise.all([
    db.select().from(waiterSettlements).where(and(...conditions))
      .orderBy(desc(waiterSettlements.businessDate), desc(waiterSettlements.submittedAt)).limit(500),
    db.select().from(waiterSettlements)
      .where(and(gte(waiterSettlements.businessDate, from), lte(waiterSettlements.businessDate, to)))
      .orderBy(waiterSettlements.submittedAt, waiterSettlements.id).limit(1000),
  ]);
  const cashDays = await db.select().from(waiterCashDays)
    .where(and(gte(waiterCashDays.businessDate, from), lte(waiterCashDays.businessDate, to)))
    .orderBy(desc(waiterCashDays.businessDate), desc(waiterCashDays.openedAt)).limit(500);
  const settlementIds = settlements.map((item) => item.id);
  const allocations = settlementIds.length ? await db.select().from(waiterTipAllocations)
    .where(inArray(waiterTipAllocations.settlementId, settlementIds)).orderBy(waiterTipAllocations.employeeName) : [];
  const settlementStatus = new Map(settlements.map((item) => [item.id, item.status]));
  const tipsByEmployee = new Map<string, { employeeDotykackaId: string; employeeName: string; total: number; due: number; pending: number; paid: number; allocationIds: number[] }>();
  for (const allocation of allocations) {
    const row = tipsByEmployee.get(allocation.employeeDotykackaId) ?? { employeeDotykackaId: allocation.employeeDotykackaId, employeeName: allocation.employeeName, total: 0, due: 0, pending: 0, paid: 0, allocationIds: [] };
    const value = amount(allocation.amount);
    row.total += value;
    if (allocation.payoutStatus === "PAID") row.paid += value;
    else if (settlementStatus.get(allocation.settlementId) === "VERIFIED") { row.due += value; row.allocationIds.push(allocation.id); }
    else row.pending += value;
    tipsByEmployee.set(allocation.employeeDotykackaId, row);
  }
  const latestCheckpointIds = new Set<number>();
  const seenCashDays = new Set<number>();
  for (const item of settlements) {
    if (!item.cashDayId) { latestCheckpointIds.add(item.id); continue; }
    if (!seenCashDays.has(item.cashDayId)) {
      seenCashDays.add(item.cashDayId);
      latestCheckpointIds.add(item.id);
    }
  }
  const summary = settlements.reduce((result, item) => ({
    count: result.count + 1,
    openingCash: result.openingCash + amount(item.openingCash),
    posCash: result.posCash + amount(item.posCash),
    posCard: result.posCard + amount(item.posCard),
    terminalCard: result.terminalCard + amount(item.terminalCard),
    countedCash: result.countedCash + amount(item.countedCash),
    cashLeft: result.cashLeft + (["CLOSE", "LEGACY"].includes(item.checkpointType) ? amount(item.cashLeft) : 0),
    envelopeCash: result.envelopeCash + amount(item.envelopeCash),
    expenses: result.expenses + amount(item.expensesTotal),
    tips: result.tips + amount(item.tipsTotal),
    cashDifference: result.cashDifference + (latestCheckpointIds.has(item.id) ? amount(item.cashDifference) : 0),
    terminalDifference: result.terminalDifference + amount(item.terminalDifference),
  }), { count: 0, openingCash: 0, posCash: 0, posCard: 0, terminalCard: 0, countedCash: 0, cashLeft: 0, envelopeCash: 0, expenses: 0, tips: 0, cashDifference: 0, terminalDifference: 0 });
  return Response.json({ from, to, cashDays, settlements, ledgerSettlements, allocations, tipsByEmployee: [...tipsByEmployee.values()], summary });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: unknown; settlementId?: unknown; note?: unknown; allocationIds?: unknown };
  const action = typeof body.action === "string" ? body.action : "";
  const db = getDb();
  const adminId = process.env.ADMIN_USERNAME ?? "admin";
  if (action === "VERIFY" || action === "NEEDS_CORRECTION") {
    const settlementId = Number(body.settlementId);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    if (!Number.isInteger(settlementId) || settlementId < 1 || (action === "NEEDS_CORRECTION" && !note)) {
      return Response.json({ error: "Podaj rozliczenie oraz komentarz wymaganej korekty." }, { status: 400 });
    }
    const [existing] = await db.select({ id: waiterSettlements.id }).from(waiterSettlements).where(eq(waiterSettlements.id, settlementId)).limit(1);
    if (!existing) return Response.json({ error: "Nie znaleziono rozliczenia." }, { status: 404 });
    const nextStatus = action === "VERIFY" ? "VERIFIED" : "NEEDS_CORRECTION";
    await db.transaction(async (tx) => {
      await tx.update(waiterSettlements).set({
        status: nextStatus, adminNote: note || null, verifiedBy: action === "VERIFY" ? adminId : null,
        verifiedAt: action === "VERIFY" ? new Date() : null, updatedAt: new Date(),
      }).where(eq(waiterSettlements.id, settlementId));
      await tx.insert(waiterSettlementEvents).values({ settlementId, actorType: "ADMIN", actorId: adminId, action: nextStatus, details: note ? { note } : {} });
    });
    return Response.json({ status: "ok" });
  }
  if (action === "MARK_TIPS_PAID") {
    const allocationIds = Array.isArray(body.allocationIds) ? [...new Set(body.allocationIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500) : [];
    if (!allocationIds.length) return Response.json({ error: "Wybierz napiwki do oznaczenia jako wypłacone." }, { status: 400 });
    const selected = await db.select({
      id: waiterTipAllocations.id,
      settlementId: waiterTipAllocations.settlementId,
      payoutStatus: waiterTipAllocations.payoutStatus,
      settlementStatus: waiterSettlements.status,
    }).from(waiterTipAllocations)
      .innerJoin(waiterSettlements, eq(waiterSettlements.id, waiterTipAllocations.settlementId))
      .where(inArray(waiterTipAllocations.id, allocationIds));
    if (selected.length !== allocationIds.length) return Response.json({ error: "Nie znaleziono części wpisów napiwków." }, { status: 404 });
    if (selected.some((item) => item.settlementStatus !== "VERIFIED")) {
      return Response.json({ error: "Napiwki można wypłacić dopiero po zatwierdzeniu rozliczenia." }, { status: 409 });
    }
    if (selected.some((item) => item.payoutStatus !== "DUE")) {
      return Response.json({ error: "Co najmniej jeden wybrany napiwek został już wypłacony." }, { status: 409 });
    }
    await db.transaction(async (tx) => {
      await tx.update(waiterTipAllocations).set({ payoutStatus: "PAID", paidAt: new Date(), updatedAt: new Date() })
        .where(and(inArray(waiterTipAllocations.id, allocationIds), eq(waiterTipAllocations.payoutStatus, "DUE")));
      for (const settlementId of [...new Set(selected.map((item) => item.settlementId))]) {
        await tx.insert(waiterSettlementEvents).values({ settlementId, actorType: "ADMIN", actorId: adminId, action: "TIPS_PAID", details: { allocationIds: selected.filter((item) => item.settlementId === settlementId).map((item) => item.id) } });
      }
    });
    return Response.json({ status: "ok" });
  }
  return Response.json({ error: "Nieznana operacja." }, { status: 400 });
}
