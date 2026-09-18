import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { guestSurveyQuestions, waiterEmployees, waiterEmployeeThankYouMedia, waiterTables } from "../db/schema";
import { DotykackaClient } from "./dotykacka/client";
import { getDotykackaConfig } from "./dotykacka/config";
import { buildGuestReceipt, isClosedReceipt, type GuestReceipt } from "./guest-receipt";

export async function loadGuestReceipt(orderId: string, presentedBy?: string): Promise<GuestReceipt> {
  const config = await getDotykackaConfig();
  const [detail, tables, questions, presentingEmployees, thankYouMedia] = await Promise.all([
    new DotykackaClient(config).closedOrderDetail(orderId),
    getDb().select({ id: waiterTables.dotykackaId, name: waiterTables.name }).from(waiterTables).where(eq(waiterTables.deleted, false)),
    getDb().select({ id: guestSurveyQuestions.id, prompt: guestSurveyQuestions.prompt, kind: guestSurveyQuestions.kind, options: guestSurveyQuestions.options, required: guestSurveyQuestions.required }).from(guestSurveyQuestions).where(eq(guestSurveyQuestions.active, true)).orderBy(asc(guestSurveyQuestions.sortOrder), asc(guestSurveyQuestions.id)),
    presentedBy ? getDb().select({
      name: waiterEmployees.name,
    }).from(waiterEmployees).where(eq(waiterEmployees.dotykackaId, presentedBy)).limit(1) : Promise.resolve([]),
    presentedBy ? getDb().select({
      mediaPath: waiterEmployeeThankYouMedia.mediaPath,
      mediaType: waiterEmployeeThankYouMedia.mediaType,
    }).from(waiterEmployeeThankYouMedia).where(eq(waiterEmployeeThankYouMedia.employeeDotykackaId, presentedBy)).orderBy(asc(waiterEmployeeThankYouMedia.id)) : Promise.resolve([]),
  ]);
  if (!isClosedReceipt(detail.order, config.branchId)) throw new Error("Ten rachunek nie jest dostępnym, zamkniętym paragonem.");
  const tableNames = new Map(tables.map((table) => [table.id, table.name]));
  const reviewUrl = validReviewUrl(process.env.GOOGLE_REVIEW_URL);
  const presentingEmployee = presentingEmployees[0];
  const selectedMedia = thankYouMedia.length ? thankYouMedia[Math.floor(Math.random() * thankYouMedia.length)] : null;
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
    servedBy: presentingEmployee ? {
      name: presentingEmployee.name,
      mediaUrl: selectedMedia?.mediaPath ?? null,
      mediaType: selectedMedia?.mediaType === "GIF" ? "GIF" : selectedMedia?.mediaType === "VIDEO" ? "VIDEO" : null,
    } : null,
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
