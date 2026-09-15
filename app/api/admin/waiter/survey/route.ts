import { getDb } from "../../../../../db";
import { waiterSurveyQuestions } from "../../../../../db/schema";
import { isAdmin } from "../../../../../lib/admin-auth";

type QuestionInput = { id?: unknown; prompt?: unknown; kind?: unknown; options?: unknown; required?: unknown; active?: unknown };

export async function PUT(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { questions?: unknown };
  if (!Array.isArray(body.questions) || body.questions.length > 20) return Response.json({ error: "Nieprawidłowa lista pytań." }, { status: 400 });
  const questions = body.questions as QuestionInput[];
  const normalized = questions.map((question, index) => {
    const prompt = typeof question.prompt === "string" ? question.prompt.trim().slice(0, 240) : "";
    const kind = question.kind === "SINGLE_CHOICE" ? "SINGLE_CHOICE" : "YES_NO";
    const options = kind === "YES_NO" ? ["Tak", "Nie"] : Array.isArray(question.options) ? question.options.map(String).map((option) => option.trim().slice(0, 80)).filter(Boolean).slice(0, 12) : [];
    const id = Number(question.id);
    return { id: Number.isInteger(id) && id > 0 ? id : null, prompt, kind, options, required: question.required === true, active: question.active !== false, sortOrder: index };
  });
  if (normalized.some((question) => !question.prompt || question.options.length < 2)) return Response.json({ error: "Każde pytanie musi mieć treść i co najmniej dwie odpowiedzi." }, { status: 400 });
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(waiterSurveyQuestions);
    if (normalized.length) await tx.insert(waiterSurveyQuestions).values(normalized.map((question) => ({
      prompt: question.prompt, kind: question.kind, options: question.options, required: question.required,
      active: question.active, sortOrder: question.sortOrder, updatedAt: new Date(),
    })));
  });
  return Response.json({ ok: true });
}
