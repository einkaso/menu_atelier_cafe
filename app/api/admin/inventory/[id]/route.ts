import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { inventoryCountEntries, inventoryEvents, inventoryExports, inventoryStageItems, inventoryStages } from "../../../../../db/schema";
import { currentAdmin } from "../../../../../lib/admin-auth";
import { inventoryStageDetail } from "../../../../../lib/inventory-data";
import { inventoryDifference, millisToQuantity, quantityToMillis, validInventoryReason } from "../../../../../lib/inventory";
import { DotykackaClient } from "../../../../../lib/dotykacka/client";
import { getDotykackaConfig } from "../../../../../lib/dotykacka/config";

export const dynamic = "force-dynamic";

function stageIdFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const stageId = stageIdFrom((await context.params).id);
  if (!stageId) return Response.json({ error: "Nieprawidłowy etap." }, { status: 400 });
  const detail = await inventoryStageDetail(stageId);
  return detail ? Response.json({ stage: detail, inventoryWriteEnabled: process.env.DOTYKACKA_INVENTORY_WRITE_ENABLED === "true" }) : Response.json({ error: "Etap nie istnieje." }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await currentAdmin();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const stageId = stageIdFrom((await context.params).id);
  if (!stageId) return Response.json({ error: "Nieprawidłowy etap." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { action?: unknown; itemId?: unknown; countedQuantity?: unknown; reasonCode?: unknown; note?: unknown };
  const action = typeof body.action === "string" ? body.action : "";
  const db = getDb();
  const [stage] = await db.select().from(inventoryStages).where(eq(inventoryStages.id, stageId)).limit(1);
  if (!stage) return Response.json({ error: "Etap nie istnieje." }, { status: 404 });
  const actorName = actor.employeeName ?? actor.username;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";

  if (action === "ADJUST_ITEM") {
    if (stage.status !== "SUBMITTED") return Response.json({ error: "Pozycje można poprawiać dopiero po zakończeniu etapu przez pracownika." }, { status: 409 });
    const itemId = Number(body.itemId);
    const countedMillis = quantityToMillis(body.countedQuantity);
    if (!Number.isInteger(itemId) || countedMillis == null) return Response.json({ error: "Podaj prawidłową ilość." }, { status: 400 });
    const [item] = await db.select().from(inventoryStageItems).where(and(eq(inventoryStageItems.id, itemId), eq(inventoryStageItems.stageId, stageId))).limit(1);
    if (!item) return Response.json({ error: "Pozycja nie należy do tego etapu." }, { status: 404 });
    const countedQuantity = millisToQuantity(countedMillis);
    const reasonCode = validInventoryReason(body.reasonCode) ? body.reasonCode : null;
    if (inventoryDifference(item.expectedQuantity, countedQuantity) && !reasonCode) return Response.json({ error: "Dla różnicy wybierz przyczynę." }, { status: 400 });
    if (!note) return Response.json({ error: "Korekta administratora wymaga notatki." }, { status: 400 });
    await db.transaction(async (tx) => {
      await tx.delete(inventoryCountEntries).where(eq(inventoryCountEntries.itemId, itemId));
      await tx.insert(inventoryCountEntries).values({ itemId, location: "Stan potwierdzony przez administratora", quantity: countedQuantity, note, createdByName: actorName });
      await tx.update(inventoryStageItems).set({ countedQuantity, countStatus: "COUNTED", reasonCode, adminNote: note, countedAt: new Date(), updatedAt: new Date() }).where(eq(inventoryStageItems.id, itemId));
      await tx.insert(inventoryEvents).values({ stageId, actorType: "ADMIN", actorId: actor.username, actorName, action: "ITEM_ADJUSTED", details: { itemId, product: item.productName, previousQuantity: item.countedQuantity, countedQuantity, reasonCode, note } });
    });
    return Response.json({ ok: true });
  }

  if (action === "REQUEST_CHANGES") {
    if (stage.status !== "SUBMITTED") return Response.json({ error: "Ten etap nie czeka na weryfikację." }, { status: 409 });
    if (!note) return Response.json({ error: "Podaj pracownikowi, co należy sprawdzić." }, { status: 400 });
    await db.transaction(async (tx) => {
      await tx.update(inventoryStages).set({ status: "CHANGES_REQUESTED", adminNote: note, updatedAt: new Date() }).where(eq(inventoryStages.id, stageId));
      await tx.insert(inventoryEvents).values({ stageId, actorType: "ADMIN", actorId: actor.username, actorName, action: "CHANGES_REQUESTED", details: { note } });
    });
    return Response.json({ ok: true });
  }

  if (action === "APPROVE") {
    if (stage.status !== "SUBMITTED") return Response.json({ error: "Ten etap nie czeka na zatwierdzenie." }, { status: 409 });
    const items = await db.select().from(inventoryStageItems).where(eq(inventoryStageItems.stageId, stageId));
    if (!items.length || items.some((item) => item.countStatus === "PENDING" || item.countedQuantity == null)) return Response.json({ error: "Każda pozycja musi mieć potwierdzony stan." }, { status: 409 });
    const missingReasons = items.filter((item) => inventoryDifference(item.expectedQuantity, item.countedQuantity) && !item.reasonCode);
    if (missingReasons.length) return Response.json({ error: `Uzupełnij przyczynę różnicy dla: ${missingReasons.slice(0, 3).map((item) => item.productName).join(", ")}.` }, { status: 409 });
    await db.transaction(async (tx) => {
      await tx.update(inventoryStages).set({ status: "APPROVED", approvedAt: new Date(), approvedBy: actor.username, adminNote: note || stage.adminNote, updatedAt: new Date() }).where(eq(inventoryStages.id, stageId));
      await tx.insert(inventoryEvents).values({ stageId, actorType: "ADMIN", actorId: actor.username, actorName, action: "APPROVED", details: { note, differences: items.filter((item) => inventoryDifference(item.expectedQuantity, item.countedQuantity)).length } });
    });
    return Response.json({ ok: true });
  }

  if (action === "SEND") {
    if (process.env.DOTYKACKA_INVENTORY_WRITE_ENABLED !== "true") return Response.json({ error: "Wysyłanie stanów do Dotykački pozostaje zablokowane do kontrolowanego testu." }, { status: 409 });
    if (stage.status !== "APPROVED") return Response.json({ error: "Najpierw zatwierdź etap." }, { status: 409 });
    const [existingExport] = await db.select().from(inventoryExports).where(eq(inventoryExports.stageId, stageId)).limit(1);
    if (existingExport) return Response.json({ error: "Ten etap ma już utworzoną operację wysyłki. Nie można wysłać go ponownie." }, { status: 409 });
    const items = await db.select().from(inventoryStageItems).where(eq(inventoryStageItems.stageId, stageId));
    const stockTakingDate = (stage.submittedAt ?? stage.approvedAt ?? new Date()).toISOString();
    const externalId = randomUUID();
    const payload = { note: `inventory_stage=${stage.externalId}; export=${externalId}`, stockTakingDate, items: items.map((item) => ({ _productId: Number(item.productDotykackaId), quantity: Number(item.countedQuantity) })) };
    if (payload.items.some((item) => !Number.isSafeInteger(item._productId) || !Number.isFinite(item.quantity))) return Response.json({ error: "Etap zawiera nieprawidłowy identyfikator lub ilość." }, { status: 409 });
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    let client: DotykackaClient;
    try {
      const config = await getDotykackaConfig();
      if (!config.warehouseId) return Response.json({ error: "Nie wybrano magazynu Dotykački." }, { status: 409 });
      client = new DotykackaClient(config);
      const latestDates = await client.stockTakingDates(payload.items.map((item) => item._productId));
      const conflicts = latestDates.filter((item) => item.stockTakingDate && new Date(item.stockTakingDate).getTime() >= stage.expectedSnapshotAt.getTime());
      if (conflicts.length) return Response.json({ error: "Co najmniej jeden produkt został zinwentaryzowany po zakończeniu tego etapu. Utwórz nowy etap dla konfliktowych pozycji." }, { status: 409 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Nie udało się wykonać kontroli przed wysyłką." }, { status: 502 });
    }
    const [createdExport] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(inventoryExports).values({ stageId, externalId, payload, payloadHash, status: "READY", createdBy: actor.username }).returning();
      await tx.update(inventoryStages).set({ status: "SENDING", updatedAt: new Date() }).where(and(eq(inventoryStages.id, stageId), eq(inventoryStages.status, "APPROVED")));
      await tx.update(inventoryExports).set({ status: "SENDING", updatedAt: new Date() }).where(eq(inventoryExports.id, created.id));
      await tx.insert(inventoryEvents).values({ stageId, actorType: "ADMIN", actorId: actor.username, actorName, action: "SEND_STARTED", details: { externalId, payloadHash } });
      return [created];
    });
    try {
      const result = await client.createStockTaking(payload);
      await db.transaction(async (tx) => {
        await tx.update(inventoryExports).set({ status: "PROCESSING", stockTransactionId: String(result._stockTransactionId), statusWebhookUrl: result.statusWebhookUrl, sentAt: new Date(), updatedAt: new Date() }).where(eq(inventoryExports.id, createdExport.id));
        await tx.update(inventoryStages).set({ status: "PROCESSING", updatedAt: new Date() }).where(eq(inventoryStages.id, stageId));
        await tx.insert(inventoryEvents).values({ stageId, actorType: "SYSTEM", actorId: "dotykacka", actorName: "Dotykačka", action: "SEND_ACCEPTED", details: { stockTransactionId: String(result._stockTransactionId) } });
      });
      return Response.json({ ok: true, status: "PROCESSING" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nieznany błąd wysyłki.";
      await db.transaction(async (tx) => {
        await tx.update(inventoryExports).set({ status: "UNKNOWN", error: message, updatedAt: new Date() }).where(eq(inventoryExports.id, createdExport.id));
        await tx.update(inventoryStages).set({ status: "UNKNOWN", updatedAt: new Date() }).where(eq(inventoryStages.id, stageId));
        await tx.insert(inventoryEvents).values({ stageId, actorType: "SYSTEM", actorId: "dotykacka", actorName: "Dotykačka", action: "SEND_UNCERTAIN", details: { error: message } });
      });
      return Response.json({ error: `${message} Nie ponawiaj wysyłki automatycznie — operacja ma status niepewny.` }, { status: 502 });
    }
  }

  if (action === "POLL_STATUS") {
    const [inventoryExport] = await db.select().from(inventoryExports).where(eq(inventoryExports.stageId, stageId)).limit(1);
    if (!inventoryExport?.statusWebhookUrl || !["PROCESSING", "UNKNOWN"].includes(inventoryExport.status)) return Response.json({ error: "Brak operacji, której status można sprawdzić." }, { status: 409 });
    try {
      const client = new DotykackaClient(await getDotykackaConfig());
      const result = await client.stockTakingStatus(inventoryExport.statusWebhookUrl);
      const status = result.status;
      const finished = status === "FINISHED" ? new Date() : null;
      await db.transaction(async (tx) => {
        await tx.update(inventoryExports).set({ status, error: result.error ?? (result.errors?.length ? JSON.stringify(result.errors) : null), finishedAt: finished, updatedAt: new Date() }).where(eq(inventoryExports.id, inventoryExport.id));
        await tx.update(inventoryStages).set({ status, finishedAt: finished, updatedAt: new Date() }).where(eq(inventoryStages.id, stageId));
        await tx.insert(inventoryEvents).values({ stageId, actorType: "SYSTEM", actorId: "dotykacka", actorName: "Dotykačka", action: `STATUS_${status}`, details: { error: result.error, errors: result.errors } });
      });
      return Response.json({ ok: true, status });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Nie udało się sprawdzić statusu." }, { status: 502 });
    }
  }

  return Response.json({ error: "Nieznana akcja." }, { status: 400 });
}
