import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { guestSurveyQuestions, guestSurveyResponses } from "../../../../db/schema";
import { currentGuestReceipt } from "../../../../lib/guest-receipt-auth";

export async function POST(request: Request) {
  const session = await currentGuestReceipt();
  if (!session) return Response.json({ error: "Sesja rachunku wygasła." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { answers?: unknown };
  const submitted = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers as Record<string, unknown> : {};
  const questions = await getDb().select().from(guestSurveyQuestions).where(eq(guestSurveyQuestions.active, true)).orderBy(asc(guestSurveyQuestions.sortOrder), asc(guestSurveyQuestions.id));
  const answers = questions.flatMap((question) => {
    const answer = typeof submitted[String(question.id)] === "string" ? String(submitted[String(question.id)]).trim() : "";
    if (!answer) return [];
    if (!question.options.includes(answer)) return [];
    return [{ questionId: question.id, question: question.prompt, answer }];
  });
  if (questions.some((question) => question.required && !answers.some((answer) => answer.questionId === question.id))) {
    return Response.json({ error: "Odpowiedz na wymagane pytania." }, { status: 400 });
  }
  try {
    await getDb().insert(guestSurveyResponses).values({
      dotykackaOrderId: session.orderId,
      documentNumber: session.documentNumber,
      tableDotykackaId: session.tableId,
      presentedByEmployeeDotykackaId: session.presentedBy,
      answers,
    }).onConflictDoUpdate({
      target: guestSurveyResponses.dotykackaOrderId,
      set: { answers, submittedAt: new Date() },
    });
    return Response.json({ status: "saved" });
  } catch (error) {
    console.error("Guest feedback save failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Nie udało się zapisać odpowiedzi." }, { status: 500 });
  }
}
