import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildGuestReceipt, isClosedReceipt } from "../lib/guest-receipt.ts";

const now = new Date("2026-09-15T12:00:00.000Z");
const order = { id: 123, _branchId: 7, _tableId: 4, status: "closed", documentType: "receipt", completed: "2026-09-15T11:30:00.000Z", documentNumber: "1/2026", totalValueRounded: 32, currency: "PLN" };

test("accepts only recent, closed receipts from the selected branch", () => {
  assert.equal(isClosedReceipt(order, "7", now), true);
  assert.equal(isClosedReceipt({ ...order, status: "open" }, "7", now), false);
  assert.equal(isClosedReceipt({ ...order, _branchId: 8 }, "7", now), false);
  assert.equal(isClosedReceipt({ ...order, completed: "2026-09-13T11:30:00.000Z" }, "7", now), false);
});

test("builds the guest receipt from final POS lines and omits canceled lines", () => {
  const receipt = buildGuestReceipt(order, [
    { id: 1, name: "Espresso", quantity: 2, billedUnitPriceWithVat: 12, totalPriceWithVat: 24, vat: 23 },
    { id: 2, name: "Usunięta pozycja", quantity: 1, totalPriceWithVat: 8, canceledDate: "2026-09-15T11:20:00Z" },
    { id: 3, name: "Woda", quantity: 1, totalPriceWithVat: 8 },
  ], [{ id: 9, paymentTypeId: 900000002, amount: 32, currency: "PLN" }], new Map([["4", "Ogródek 4"]]));
  assert.deepEqual(receipt.items.map((item) => item.name), ["Espresso", "Woda"]);
  assert.equal(receipt.tableName, "Ogródek 4");
  assert.equal(receipt.payments[0].label, "Karta");
});

test("keeps pre-order and post-receipt surveys separate", async () => {
  const [schema, waiter, guest] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/kelner/waiter-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/kelner/guest-receipt-view.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /waiterSurveyQuestions = pgTable\("waiter_survey_questions"/);
  assert.match(schema, /guestSurveyQuestions = pgTable\("guest_survey_questions"/);
  assert.match(schema, /guestSurveyResponses = pgTable\("guest_survey_responses"/);
  assert.match(waiter, /Dalej: krótka ankieta/);
  assert.match(guest, /JUŻ PO RACHUNKU/);
});
