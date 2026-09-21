import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { staffInstructionReceipts, staffInstructions } from "../../../../db/schema";
import { currentWaiter } from "../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";
const DEFER_MILLISECONDS = 2 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const db = getDb();
  const instructions = await db.select().from(staffInstructions)
    .where(inArray(staffInstructions.status, ["PUBLISHED", "ARCHIVED"]))
    .orderBy(desc(staffInstructions.publishedAt), desc(staffInstructions.id));
  const receipts = instructions.length ? await db.select().from(staffInstructionReceipts).where(and(
    eq(staffInstructionReceipts.employeeDotykackaId, employee.dotykackaId),
    inArray(staffInstructionReceipts.instructionId, instructions.map((instruction) => instruction.id)),
  )) : [];
  const receiptByVersion = new Map(receipts.map((receipt) => [`${receipt.instructionId}:${receipt.instructionRevision}`, receipt]));
  const now = Date.now();
  const result = instructions.map((instruction) => {
    const receipt = receiptByVersion.get(`${instruction.id}:${instruction.revision}`);
    const acknowledged = Boolean(receipt?.acknowledgedAt);
    const deferred = !acknowledged && Boolean(receipt?.deferredUntil && receipt.deferredUntil.getTime() > now);
    const due = instruction.status === "PUBLISHED" && !acknowledged && !deferred;
    return {
      id: instruction.id,
      title: instruction.title,
      content: instruction.content,
      attachments: instruction.attachments,
      status: instruction.status,
      revision: instruction.revision,
      publishedAt: instruction.publishedAt,
      archivedAt: instruction.archivedAt,
      acknowledgedAt: receipt?.acknowledgedAt ?? null,
      deferredUntil: receipt?.deferredUntil ?? null,
      canDefer: instruction.status === "PUBLISHED" && !acknowledged && !receipt?.deferredAt,
      due,
    };
  });
  return Response.json({
    employee,
    instructions: result,
    pendingCount: result.filter((instruction) => instruction.status === "PUBLISHED" && !instruction.acknowledgedAt).length,
    dueCount: result.filter((instruction) => instruction.due).length,
  });
}

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { instructionId?: unknown; action?: unknown; declaration?: unknown };
  const instructionId = Number(body.instructionId);
  const action = typeof body.action === "string" ? body.action : "";
  if (!Number.isInteger(instructionId) || instructionId < 1) return Response.json({ error: "Nieprawidłowa instrukcja." }, { status: 400 });
  const db = getDb();
  const [instruction] = await db.select().from(staffInstructions).where(eq(staffInstructions.id, instructionId)).limit(1);
  if (!instruction || instruction.status !== "PUBLISHED") return Response.json({ error: "Ta instrukcja nie jest już aktywna." }, { status: 409 });
  const [receipt] = await db.select().from(staffInstructionReceipts).where(and(
    eq(staffInstructionReceipts.instructionId, instruction.id),
    eq(staffInstructionReceipts.instructionRevision, instruction.revision),
    eq(staffInstructionReceipts.employeeDotykackaId, employee.dotykackaId),
  )).limit(1);
  if (receipt?.acknowledgedAt) return Response.json({ ok: true, acknowledgedAt: receipt.acknowledgedAt });
  const now = new Date();
  if (action === "DEFER") {
    if (receipt?.deferredAt) return Response.json({ error: "Tę instrukcję można odłożyć tylko jeden raz." }, { status: 409 });
    const deferredUntil = new Date(now.getTime() + DEFER_MILLISECONDS);
    await db.insert(staffInstructionReceipts).values({
      instructionId: instruction.id,
      instructionRevision: instruction.revision,
      employeeDotykackaId: employee.dotykackaId,
      employeeName: employee.name,
      firstPresentedAt: now,
      deferredAt: now,
      deferredUntil,
    }).onConflictDoUpdate({
      target: [staffInstructionReceipts.instructionId, staffInstructionReceipts.employeeDotykackaId, staffInstructionReceipts.instructionRevision],
      set: { employeeName: employee.name, firstPresentedAt: receipt?.firstPresentedAt ?? now, deferredAt: now, deferredUntil, updatedAt: now },
    });
    return Response.json({ ok: true, deferredUntil });
  }
  if (action === "ACKNOWLEDGE") {
    if (body.declaration !== "I_HAVE_READ") return Response.json({ error: "Potwierdź oświadczenie o zapoznaniu się z instrukcją." }, { status: 400 });
    await db.insert(staffInstructionReceipts).values({
      instructionId: instruction.id,
      instructionRevision: instruction.revision,
      employeeDotykackaId: employee.dotykackaId,
      employeeName: employee.name,
      firstPresentedAt: receipt?.firstPresentedAt ?? now,
      deferredAt: receipt?.deferredAt ?? null,
      deferredUntil: receipt?.deferredUntil ?? null,
      acknowledgedAt: now,
    }).onConflictDoUpdate({
      target: [staffInstructionReceipts.instructionId, staffInstructionReceipts.employeeDotykackaId, staffInstructionReceipts.instructionRevision],
      set: { employeeName: employee.name, firstPresentedAt: receipt?.firstPresentedAt ?? now, acknowledgedAt: now, updatedAt: now },
    });
    return Response.json({ ok: true, acknowledgedAt: now });
  }
  return Response.json({ error: "Nieznana operacja." }, { status: 400 });
}
