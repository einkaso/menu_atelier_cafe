import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { waiterCashDays, waiterEmployees, waiterSettlementEvents, waiterSettlements, waiterTipAdjustments, waiterTipAllocations } from "../../../../../db/schema";
import { currentAdmin, isAdmin } from "../../../../../lib/admin-auth";
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
  const [tipAdjustments, employees] = await Promise.all([
    db.select().from(waiterTipAdjustments)
      .where(and(gte(waiterTipAdjustments.businessDate, from), lte(waiterTipAdjustments.businessDate, to)))
      .orderBy(desc(waiterTipAdjustments.createdAt), desc(waiterTipAdjustments.id)).limit(1000),
    db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name })
      .from(waiterEmployees).where(and(eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false)))
      .orderBy(asc(waiterEmployees.name)),
  ]);
  const settlementIds = settlements.map((item) => item.id);
  const allocations = settlementIds.length ? await db.select().from(waiterTipAllocations)
    .where(inArray(waiterTipAllocations.settlementId, settlementIds)).orderBy(waiterTipAllocations.employeeName) : [];
  const settlementStatus = new Map(settlements.map((item) => [item.id, item.status]));
  const tipsByEmployee = new Map<string, { employeeDotykackaId: string; employeeName: string; total: number; due: number; pending: number; paid: number; allocationIds: number[]; adjustmentIds: number[] }>();
  for (const allocation of allocations) {
    const row = tipsByEmployee.get(allocation.employeeDotykackaId) ?? { employeeDotykackaId: allocation.employeeDotykackaId, employeeName: allocation.employeeName, total: 0, due: 0, pending: 0, paid: 0, allocationIds: [], adjustmentIds: [] };
    const value = amount(allocation.amount);
    row.total += value;
    if (allocation.payoutStatus === "PAID") row.paid += value;
    else if (settlementStatus.get(allocation.settlementId) === "VERIFIED") { row.due += value; row.allocationIds.push(allocation.id); }
    else row.pending += value;
    tipsByEmployee.set(allocation.employeeDotykackaId, row);
  }
  for (const adjustment of tipAdjustments) {
    if (adjustment.voidedAt) continue;
    const row = tipsByEmployee.get(adjustment.employeeDotykackaId) ?? { employeeDotykackaId: adjustment.employeeDotykackaId, employeeName: adjustment.employeeName, total: 0, due: 0, pending: 0, paid: 0, allocationIds: [], adjustmentIds: [] };
    const value = amount(adjustment.amount);
    row.total += value;
    if (adjustment.payoutStatus === "PAID") row.paid += value;
    else { row.due += value; row.adjustmentIds.push(adjustment.id); }
    tipsByEmployee.set(adjustment.employeeDotykackaId, row);
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
  summary.tips += tipAdjustments.filter((item) => !item.voidedAt).reduce((sum, item) => sum + amount(item.amount), 0);
  return Response.json({ from, to, cashDays, settlements, ledgerSettlements, allocations, tipAdjustments, employees, tipsByEmployee: [...tipsByEmployee.values()], summary });
}

export async function PATCH(request: Request) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as {
    action?: unknown; settlementId?: unknown; note?: unknown; allocationIds?: unknown; adjustmentIds?: unknown;
    adjustmentId?: unknown; employeeDotykackaId?: unknown; businessDate?: unknown; amount?: unknown; direction?: unknown; reason?: unknown;
  };
  const action = typeof body.action === "string" ? body.action : "";
  const db = getDb();
  const adminId = administrator.username;
  if (action === "ADD_TIP_ADJUSTMENT") {
    const employeeDotykackaId = typeof body.employeeDotykackaId === "string" ? body.employeeDotykackaId.trim() : "";
    const businessDate = typeof body.businessDate === "string" ? body.businessDate.trim() : "";
    const direction = body.direction === "DEDUCT" ? "DEDUCT" : body.direction === "ADD" ? "ADD" : "";
    const adjustmentAmount = Number(body.amount);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!employeeDotykackaId || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || !direction || !Number.isFinite(adjustmentAmount) || adjustmentAmount <= 0 || adjustmentAmount > 100_000 || !reason) {
      return Response.json({ error: "Wybierz pracownika, datę, rodzaj korekty, dodatnią kwotę i podaj powód." }, { status: 400 });
    }
    const [employee] = await db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name })
      .from(waiterEmployees).where(and(eq(waiterEmployees.dotykackaId, employeeDotykackaId), eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))).limit(1);
    if (!employee) return Response.json({ error: "Nie znaleziono aktywnego pracownika." }, { status: 404 });
    const signedAmount = (direction === "DEDUCT" ? -adjustmentAmount : adjustmentAmount).toFixed(2);
    const [created] = await db.insert(waiterTipAdjustments).values({
      employeeDotykackaId: employee.dotykackaId,
      employeeName: employee.name,
      businessDate,
      amount: signedAmount,
      reason,
      createdBy: adminId,
    }).returning({ id: waiterTipAdjustments.id });
    return Response.json({ status: "ok", id: created.id });
  }
  if (action === "VOID_TIP_ADJUSTMENT") {
    const adjustmentId = Number(body.adjustmentId);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!Number.isInteger(adjustmentId) || adjustmentId < 1 || !reason) return Response.json({ error: "Podaj wpis i powód jego wycofania." }, { status: 400 });
    const [adjustment] = await db.select().from(waiterTipAdjustments).where(eq(waiterTipAdjustments.id, adjustmentId)).limit(1);
    if (!adjustment) return Response.json({ error: "Nie znaleziono korekty napiwku." }, { status: 404 });
    if (adjustment.voidedAt) return Response.json({ error: "Ten wpis został już wycofany." }, { status: 409 });
    if (adjustment.payoutStatus === "PAID") return Response.json({ error: "Wypłaconego wpisu nie można wycofać. Dodaj przeciwną korektę z wyjaśnieniem." }, { status: 409 });
    const voided = await db.update(waiterTipAdjustments).set({ voidedBy: adminId, voidedAt: new Date(), voidReason: reason, updatedAt: new Date() })
      .where(and(eq(waiterTipAdjustments.id, adjustmentId), eq(waiterTipAdjustments.payoutStatus, "DUE"), isNull(waiterTipAdjustments.voidedAt)))
      .returning({ id: waiterTipAdjustments.id });
    if (!voided.length) return Response.json({ error: "Wpis zmienił się w międzyczasie. Odśwież zestawienie." }, { status: 409 });
    return Response.json({ status: "ok" });
  }
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
    const adjustmentIds = Array.isArray(body.adjustmentIds) ? [...new Set(body.adjustmentIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500) : [];
    if (!allocationIds.length && !adjustmentIds.length) return Response.json({ error: "Wybierz napiwki do oznaczenia jako wypłacone." }, { status: 400 });
    const selected = allocationIds.length ? await db.select({
      id: waiterTipAllocations.id,
      settlementId: waiterTipAllocations.settlementId,
      payoutStatus: waiterTipAllocations.payoutStatus,
      settlementStatus: waiterSettlements.status,
    }).from(waiterTipAllocations)
      .innerJoin(waiterSettlements, eq(waiterSettlements.id, waiterTipAllocations.settlementId))
      .where(inArray(waiterTipAllocations.id, allocationIds)) : [];
    const selectedAdjustments = adjustmentIds.length ? await db.select({
      id: waiterTipAdjustments.id,
      payoutStatus: waiterTipAdjustments.payoutStatus,
      voidedAt: waiterTipAdjustments.voidedAt,
    }).from(waiterTipAdjustments).where(inArray(waiterTipAdjustments.id, adjustmentIds)) : [];
    if (selected.length !== allocationIds.length) return Response.json({ error: "Nie znaleziono części wpisów napiwków." }, { status: 404 });
    if (selectedAdjustments.length !== adjustmentIds.length) return Response.json({ error: "Nie znaleziono części korekt napiwków." }, { status: 404 });
    if (selected.some((item) => item.settlementStatus !== "VERIFIED")) {
      return Response.json({ error: "Napiwki można wypłacić dopiero po zatwierdzeniu rozliczenia." }, { status: 409 });
    }
    if (selected.some((item) => item.payoutStatus !== "DUE")) {
      return Response.json({ error: "Co najmniej jeden wybrany napiwek został już wypłacony." }, { status: 409 });
    }
    if (selectedAdjustments.some((item) => item.payoutStatus !== "DUE" || item.voidedAt)) {
      return Response.json({ error: "Co najmniej jedna korekta została już wypłacona albo wycofana." }, { status: 409 });
    }
    await db.transaction(async (tx) => {
      if (allocationIds.length) await tx.update(waiterTipAllocations).set({ payoutStatus: "PAID", paidAt: new Date(), updatedAt: new Date() })
        .where(and(inArray(waiterTipAllocations.id, allocationIds), eq(waiterTipAllocations.payoutStatus, "DUE")));
      if (adjustmentIds.length) await tx.update(waiterTipAdjustments).set({ payoutStatus: "PAID", paidAt: new Date(), updatedAt: new Date() })
        .where(and(inArray(waiterTipAdjustments.id, adjustmentIds), eq(waiterTipAdjustments.payoutStatus, "DUE"), isNull(waiterTipAdjustments.voidedAt)));
      for (const settlementId of [...new Set(selected.map((item) => item.settlementId))]) {
        await tx.insert(waiterSettlementEvents).values({ settlementId, actorType: "ADMIN", actorId: adminId, action: "TIPS_PAID", details: { allocationIds: selected.filter((item) => item.settlementId === settlementId).map((item) => item.id) } });
      }
    });
    return Response.json({ status: "ok" });
  }
  return Response.json({ error: "Nieznana operacja." }, { status: 400 });
}
