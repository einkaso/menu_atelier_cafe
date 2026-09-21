import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { staffInstructions, type StaffInstructionAttachment } from "../../../../../../db/schema";
import { currentAdmin } from "../../../../../../lib/admin-auth";
import {
  importStaffInstructionAttachment,
  removeStaffInstructionAttachment,
} from "../../../../../../lib/staff-instruction-attachments";

export const dynamic = "force-dynamic";
const MAX_ATTACHMENTS = 10;

function instructionId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function changedInstructionValues(status: string, revision: number, username: string) {
  const now = new Date();
  return status === "PUBLISHED"
    ? { revision: revision + 1, publishedAt: now, updatedAt: now, updatedBy: username }
    : { updatedAt: now, updatedBy: username };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = instructionId((await context.params).id);
  if (!id) return Response.json({ error: "Nieprawidłowa instrukcja." }, { status: 400 });

  const db = getDb();
  const [instruction] = await db.select().from(staffInstructions).where(eq(staffInstructions.id, id)).limit(1);
  if (!instruction) return Response.json({ error: "Instrukcja nie istnieje." }, { status: 404 });
  if (instruction.status === "ARCHIVED") return Response.json({ error: "Najpierw przywróć instrukcję z archiwum." }, { status: 409 });

  const formData = await request.formData().catch(() => null);
  const files = formData?.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0) ?? [];
  if (!files.length) return Response.json({ error: "Wybierz co najmniej jedno zdjęcie lub plik PDF." }, { status: 400 });
  if (files.length > MAX_ATTACHMENTS) return Response.json({ error: `Jednocześnie można dodać maksymalnie ${MAX_ATTACHMENTS} plików.` }, { status: 400 });

  const current = instruction.attachments ?? [];
  const currentPaths = new Set(current.map((attachment) => attachment.path));
  const imported: StaffInstructionAttachment[] = [];
  try {
    for (const file of files) imported.push(await importStaffInstructionAttachment(id, file));
    const byId = new Map(current.map((attachment) => [attachment.id, attachment]));
    for (const attachment of imported) if (!byId.has(attachment.id)) byId.set(attachment.id, attachment);
    const attachments = [...byId.values()];
    if (attachments.length > MAX_ATTACHMENTS) throw new Error(`Instrukcja może mieć maksymalnie ${MAX_ATTACHMENTS} załączników.`);
    if (attachments.length === current.length) {
      return Response.json({ attachments: current, revision: instruction.revision, republished: false, duplicate: true });
    }

    const values = changedInstructionValues(instruction.status, instruction.revision, administrator.username);
    await db.update(staffInstructions).set({ attachments, ...values }).where(eq(staffInstructions.id, id));
    return Response.json({
      attachments,
      revision: instruction.status === "PUBLISHED" ? instruction.revision + 1 : instruction.revision,
      republished: instruction.status === "PUBLISHED",
    });
  } catch (error) {
    await Promise.all(imported
      .filter((attachment, index, list) => !currentPaths.has(attachment.path) && list.findIndex((item) => item.path === attachment.path) === index)
      .map((attachment) => removeStaffInstructionAttachment(attachment.path).catch(() => undefined)));
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się dodać załącznika." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = instructionId((await context.params).id);
  if (!id) return Response.json({ error: "Nieprawidłowa instrukcja." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { attachmentId?: unknown };
  const attachmentId = typeof body.attachmentId === "string" && /^[a-f0-9]{16}$/.test(body.attachmentId) ? body.attachmentId : null;
  if (!attachmentId) return Response.json({ error: "Nieprawidłowy załącznik." }, { status: 400 });

  const db = getDb();
  const [instruction] = await db.select().from(staffInstructions).where(eq(staffInstructions.id, id)).limit(1);
  if (!instruction) return Response.json({ error: "Instrukcja nie istnieje." }, { status: 404 });
  if (instruction.status === "ARCHIVED") return Response.json({ error: "Najpierw przywróć instrukcję z archiwum." }, { status: 409 });
  const removed = (instruction.attachments ?? []).find((attachment) => attachment.id === attachmentId);
  if (!removed) return Response.json({ error: "Załącznik nie istnieje." }, { status: 404 });
  const attachments = (instruction.attachments ?? []).filter((attachment) => attachment.id !== attachmentId);
  const values = changedInstructionValues(instruction.status, instruction.revision, administrator.username);
  await db.update(staffInstructions).set({ attachments, ...values }).where(eq(staffInstructions.id, id));
  await removeStaffInstructionAttachment(removed.path).catch(() => undefined);
  return Response.json({
    attachments,
    revision: instruction.status === "PUBLISHED" ? instruction.revision + 1 : instruction.revision,
    republished: instruction.status === "PUBLISHED",
  });
}
