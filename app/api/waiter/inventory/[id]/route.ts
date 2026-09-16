import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { inventoryCountEntries, inventoryEvents, inventoryStageItems, inventoryStages } from "../../../../../db/schema";
import { inventoryStageDetail } from "../../../../../lib/inventory-data";
import { cleanInventoryLocation, inventoryDifference, millisToQuantity, nonNegativeWholeNumber, quantityToMillis, validInventoryReason, wineBottleQuantityMillis } from "../../../../../lib/inventory";
import { currentWaiter } from "../../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

function stageIdFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function ownedStage(stageId: number, employeeDotykackaId: string) {
  const [stage] = await getDb().select().from(inventoryStages).where(and(eq(inventoryStages.id, stageId), eq(inventoryStages.assignedEmployeeDotykackaId, employeeDotykackaId))).limit(1);
  return stage ?? null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const stageId = stageIdFrom((await context.params).id);
  if (!stageId || !(await ownedStage(stageId, employee.dotykackaId))) return Response.json({ error: "Etap nie istnieje lub nie jest przypisany do Ciebie." }, { status: 404 });
  const detail = await inventoryStageDetail(stageId);
  return Response.json({ stage: detail });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const stageId = stageIdFrom((await context.params).id);
  if (!stageId) return Response.json({ error: "Nieprawidłowy etap." }, { status: 400 });
  const stage = await ownedStage(stageId, employee.dotykackaId);
  if (!stage) return Response.json({ error: "Etap nie istnieje lub nie jest przypisany do Ciebie." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { action?: unknown; itemId?: unknown; entries?: unknown; countStatus?: unknown; reasonCode?: unknown; note?: unknown };
  const action = typeof body.action === "string" ? body.action : "";
  const db = getDb();

  if (action === "START") {
    if (!["ASSIGNED", "CHANGES_REQUESTED"].includes(stage.status)) return Response.json({ error: "Tego etapu nie można teraz rozpocząć." }, { status: 409 });
    await db.transaction(async (tx) => {
      await tx.update(inventoryStages).set({ status: "IN_PROGRESS", startedAt: stage.startedAt ?? new Date(), updatedAt: new Date() }).where(eq(inventoryStages.id, stageId));
      await tx.insert(inventoryEvents).values({ stageId, actorType: "WORKER", actorId: employee.dotykackaId, actorName: employee.name, action: stage.status === "CHANGES_REQUESTED" ? "CORRECTION_STARTED" : "STARTED", details: {} });
    });
    return Response.json({ ok: true });
  }

  if (action === "SAVE_ITEM") {
    if (!["ASSIGNED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(stage.status)) return Response.json({ error: "Etap jest już zamknięty do edycji." }, { status: 409 });
    const itemId = Number(body.itemId);
    const countStatus = body.countStatus === "NOT_FOUND" ? "NOT_FOUND" : "COUNTED";
    const [item] = await db.select().from(inventoryStageItems).where(and(eq(inventoryStageItems.id, itemId), eq(inventoryStageItems.stageId, stageId))).limit(1);
    if (!item) return Response.json({ error: "Pozycja nie należy do tego etapu." }, { status: 404 });
    const submittedEntries = Array.isArray(body.entries) ? body.entries.slice(0, 20) : [];
    const normalizedEntries: Array<{ location: string; quantity: string; wholeContainers: number | null; looseServings: number | null; note: string | null }> = [];
    const seenLocations = new Set<string>();
    let countedMillis = 0;
    let totalWholeContainers = 0;
    let totalLooseServings = 0;
    const wineCounting = item.countingMode === "WINE_BOTTLE" && item.servingsPerContainer != null;
    const bottleOnlyCounting = item.countingMode === "BOTTLE_ONLY";
    if (countStatus === "NOT_FOUND") {
      normalizedEntries.push({ location: "Nie znaleziono", quantity: "0", wholeContainers: wineCounting || bottleOnlyCounting ? 0 : null, looseServings: wineCounting ? 0 : null, note: null });
    } else {
      for (const raw of submittedEntries) {
        if (!raw || typeof raw !== "object") continue;
        const record = raw as { location?: unknown; quantity?: unknown; wholeContainers?: unknown; looseServings?: unknown; note?: unknown };
        const location = cleanInventoryLocation(record.location);
        if (!location) continue;
        const locationKey = location.toLocaleLowerCase("pl");
        if (seenLocations.has(locationKey)) return Response.json({ error: `Miejsce „${location}” występuje więcej niż raz.` }, { status: 400 });
        let quantityMillis: number | null;
        let wholeContainers: number | null = null;
        let looseServings: number | null = null;
        if (wineCounting) {
          wholeContainers = nonNegativeWholeNumber(record.wholeContainers);
          looseServings = nonNegativeWholeNumber(record.looseServings);
          if (wholeContainers == null || looseServings == null) return Response.json({ error: `Wpisz pełne butelki i dostępne kieliszki dla miejsca „${location}”.` }, { status: 400 });
          quantityMillis = wineBottleQuantityMillis(wholeContainers, looseServings, item.servingsPerContainer!);
          totalWholeContainers += wholeContainers;
          totalLooseServings += looseServings;
        } else if (bottleOnlyCounting) {
          wholeContainers = nonNegativeWholeNumber(record.wholeContainers);
          if (wholeContainers == null) return Response.json({ error: `Wpisz liczbę pełnych butelek dla miejsca „${location}”.` }, { status: 400 });
          quantityMillis = wholeContainers * 1000;
          totalWholeContainers += wholeContainers;
        } else {
          quantityMillis = quantityToMillis(record.quantity);
        }
        if (quantityMillis == null) return Response.json({ error: `Nieprawidłowa ilość dla miejsca „${location}”.` }, { status: 400 });
        seenLocations.add(locationKey);
        if (!wineCounting && !bottleOnlyCounting) countedMillis += quantityMillis;
        normalizedEntries.push({ location, quantity: millisToQuantity(quantityMillis), wholeContainers, looseServings, note: typeof record.note === "string" ? record.note.trim().slice(0, 300) || null : null });
      }
      if (!normalizedEntries.length) return Response.json({ error: "Dodaj co najmniej jedno miejsce i policzoną ilość — zero także trzeba wpisać jawnie." }, { status: 400 });
      if (wineCounting) countedMillis = wineBottleQuantityMillis(totalWholeContainers, totalLooseServings, item.servingsPerContainer!) ?? 0;
      else if (bottleOnlyCounting) countedMillis = totalWholeContainers * 1000;
    }
    const countedQuantity = millisToQuantity(countedMillis);
    const reasonCode = validInventoryReason(body.reasonCode) ? body.reasonCode : null;
    if (inventoryDifference(item.expectedQuantity, countedQuantity) && !reasonCode) return Response.json({ error: "Dla różnicy wybierz przyczynę." }, { status: 400 });
    const workerNote = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.delete(inventoryCountEntries).where(eq(inventoryCountEntries.itemId, itemId));
      await tx.insert(inventoryCountEntries).values(normalizedEntries.map((entry) => ({ ...entry, itemId, createdByDotykackaId: employee.dotykackaId, createdByName: employee.name, createdAt: now, updatedAt: now })));
      await tx.update(inventoryStageItems).set({ countedQuantity, countStatus, reasonCode, workerNote, countedAt: now, updatedAt: now }).where(eq(inventoryStageItems.id, itemId));
      await tx.update(inventoryStages).set({ status: "IN_PROGRESS", startedAt: stage.startedAt ?? now, updatedAt: now }).where(eq(inventoryStages.id, stageId));
      await tx.insert(inventoryEvents).values({ stageId, actorType: "WORKER", actorId: employee.dotykackaId, actorName: employee.name, action: "ITEM_SAVED", details: { itemId, product: item.productName, previousQuantity: item.countedQuantity, countedQuantity, countStatus, reasonCode, entries: normalizedEntries } });
    });
    return Response.json({ ok: true, countedQuantity });
  }

  if (action === "SUBMIT") {
    if (!["ASSIGNED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(stage.status)) return Response.json({ error: "Tego etapu nie można teraz zakończyć." }, { status: 409 });
    const [missing] = await db.select({ id: inventoryStageItems.id }).from(inventoryStageItems).where(and(eq(inventoryStageItems.stageId, stageId), eq(inventoryStageItems.countStatus, "PENDING"))).limit(1);
    if (missing) return Response.json({ error: "Potwierdź stan każdej pozycji, również produktów z ilością zero." }, { status: 409 });
    const workerNote = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(inventoryStages).set({ status: "SUBMITTED", workerNote, submittedAt: now, updatedAt: now }).where(eq(inventoryStages.id, stageId));
      await tx.insert(inventoryEvents).values({ stageId, actorType: "WORKER", actorId: employee.dotykackaId, actorName: employee.name, action: "SUBMITTED", details: { note: workerNote } });
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Nieznana akcja." }, { status: 400 });
}
