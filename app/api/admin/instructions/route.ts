import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { staffInstructionReceipts, staffInstructions, waiterEmployees } from "../../../../db/schema";
import { currentAdmin } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

type InstructionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

function instructionCopy(body: { title?: unknown; content?: unknown }) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (title.length < 3 || title.length > 180) throw new Error("Tytuł instrukcji musi mieć od 3 do 180 znaków.");
  if (content.length < 10 || content.length > 50_000) throw new Error("Treść instrukcji musi mieć od 10 do 50 000 znaków.");
  return { title, content };
}

export async function GET() {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const [instructions, employees] = await Promise.all([
    db.select().from(staffInstructions).orderBy(desc(staffInstructions.updatedAt), desc(staffInstructions.id)),
    db.select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name })
      .from(waiterEmployees).where(and(eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))).orderBy(asc(waiterEmployees.name)),
  ]);
  const receipts = instructions.length ? await db.select().from(staffInstructionReceipts)
    .where(inArray(staffInstructionReceipts.instructionId, instructions.map((instruction) => instruction.id))) : [];
  const activeIds = new Set(employees.map((employee) => employee.dotykackaId));
  const now = Date.now();
  return Response.json({
    activeEmployeeCount: employees.length,
    instructions: instructions.map((instruction) => {
      const currentReceipts = receipts.filter((receipt) => receipt.instructionId === instruction.id
        && receipt.instructionRevision === instruction.revision && activeIds.has(receipt.employeeDotykackaId));
      const byEmployee = new Map(currentReceipts.map((receipt) => [receipt.employeeDotykackaId, receipt]));
      const recipients = employees.map((employee) => {
        const receipt = byEmployee.get(employee.dotykackaId);
        const state = receipt?.acknowledgedAt ? "ACKNOWLEDGED"
          : receipt?.deferredUntil && receipt.deferredUntil.getTime() > now ? "DEFERRED" : "PENDING";
        return { ...employee, state, deferredUntil: receipt?.deferredUntil ?? null, acknowledgedAt: receipt?.acknowledgedAt ?? null };
      });
      const acknowledgedCount = recipients.filter((recipient) => recipient.state === "ACKNOWLEDGED").length;
      const deferredCount = recipients.filter((recipient) => recipient.state === "DEFERRED").length;
      return { ...instruction, acknowledgedCount, deferredCount, pendingCount: employees.length - acknowledgedCount, recipients };
    }),
  });
}

export async function POST(request: Request) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const copy = instructionCopy(await request.json().catch(() => ({})));
    const [created] = await getDb().insert(staffInstructions).values({
      ...copy,
      status: "DRAFT",
      createdBy: administrator.username,
      updatedBy: administrator.username,
    }).returning();
    return Response.json({ instruction: created }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się utworzyć instrukcji." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { id?: unknown; action?: unknown; title?: unknown; content?: unknown };
  const id = Number(body.id);
  const action = typeof body.action === "string" ? body.action : "";
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Nieprawidłowa instrukcja." }, { status: 400 });
  const db = getDb();
  const [instruction] = await db.select().from(staffInstructions).where(eq(staffInstructions.id, id)).limit(1);
  if (!instruction) return Response.json({ error: "Instrukcja nie istnieje." }, { status: 404 });
  const status = instruction.status as InstructionStatus;
  const now = new Date();
  try {
    if (action === "SAVE") {
      if (status !== "DRAFT") return Response.json({ error: "Wysłaną instrukcję można zmienić tylko przez ponowne wysłanie nowej wersji." }, { status: 409 });
      const copy = instructionCopy(body);
      await db.update(staffInstructions).set({ ...copy, updatedBy: administrator.username, updatedAt: now }).where(eq(staffInstructions.id, id));
    } else if (action === "PUBLISH") {
      if (status !== "DRAFT") return Response.json({ error: "Do pracowników można wysłać wyłącznie szkic." }, { status: 409 });
      const copy = instructionCopy(body);
      await db.update(staffInstructions).set({ ...copy, status: "PUBLISHED", publishedAt: now, archivedAt: null, updatedBy: administrator.username, updatedAt: now }).where(eq(staffInstructions.id, id));
    } else if (action === "REPUBLISH") {
      if (status !== "PUBLISHED") return Response.json({ error: "Ponownie wysłać można wyłącznie aktywną instrukcję." }, { status: 409 });
      const copy = instructionCopy(body);
      await db.update(staffInstructions).set({ ...copy, revision: instruction.revision + 1, publishedAt: now, updatedBy: administrator.username, updatedAt: now }).where(eq(staffInstructions.id, id));
    } else if (action === "ARCHIVE") {
      if (status !== "PUBLISHED") return Response.json({ error: "Archiwizować można wyłącznie aktywną instrukcję." }, { status: 409 });
      await db.update(staffInstructions).set({ status: "ARCHIVED", archivedAt: now, updatedBy: administrator.username, updatedAt: now }).where(eq(staffInstructions.id, id));
    } else if (action === "RESTORE") {
      if (status !== "ARCHIVED") return Response.json({ error: "Przywrócić można wyłącznie instrukcję archiwalną." }, { status: 409 });
      await db.update(staffInstructions).set({ status: "DRAFT", revision: instruction.revision + 1, publishedAt: null, archivedAt: null, updatedBy: administrator.username, updatedAt: now }).where(eq(staffInstructions.id, id));
    } else {
      return Response.json({ error: "Nieznana operacja." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać instrukcji." }, { status: 400 });
  }
}
