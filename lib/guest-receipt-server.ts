import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { guestSurveyQuestions, waiterTables } from "../db/schema";
import { DotykackaClient } from "./dotykacka/client";
import { getDotykackaConfig } from "./dotykacka/config";
import { buildGuestReceipt, isClosedReceipt, type GuestReceipt } from "./guest-receipt";

export async function loadGuestReceipt(orderId: string): Promise<GuestReceipt> {
  const config = await getDotykackaConfig();
  const [detail, tables, questions] = await Promise.all([
    new DotykackaClient(config).closedOrderDetail(orderId),
    getDb().select({ id: waiterTables.dotykackaId, name: waiterTables.name }).from(waiterTables).where(eq(waiterTables.deleted, false)),
    getDb().select({ id: guestSurveyQuestions.id, prompt: guestSurveyQuestions.prompt, kind: guestSurveyQuestions.kind, options: guestSurveyQuestions.options, required: guestSurveyQuestions.required }).from(guestSurveyQuestions).where(eq(guestSurveyQuestions.active, true)).orderBy(asc(guestSurveyQuestions.sortOrder), asc(guestSurveyQuestions.id)),
  ]);
  if (!isClosedReceipt(detail.order, config.branchId)) throw new Error("Ten rachunek nie jest dostępnym, zamkniętym paragonem.");
  const tableNames = new Map(tables.map((table) => [table.id, table.name]));
  const reviewUrl = validReviewUrl(process.env.GOOGLE_REVIEW_URL);
  return {
    ...buildGuestReceipt(detail.order, detail.items, detail.payments, tableNames),
    surveyQuestions: questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      kind: question.kind === "RATING" ? "RATING" : "SINGLE_CHOICE",
      options: question.options,
      required: question.required,
    })),
    reviewUrl,
  };
}

function validReviewUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
