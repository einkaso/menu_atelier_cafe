import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, server: { middlewareMode: true } });
after(async () => vite.close());

test("validates and normalizes MB card registration data", async () => {
  const { validateLoyaltyRegistration } = await vite.ssrLoadModule("/lib/loyalty-registration.ts");
  const result = validateLoyaltyRegistration({
    firstName: " Marta ", lastName: " Banaszek ", email: " M@EXAMPLE.PL ", phone: "123456789",
    barcode: " mb-12 ", marketingConsent: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.email, "m@example.pl");
  assert.equal(result.data.barcode, "MB-12");
});

test("rejects an invalid card code and missing consent", async () => {
  const { validateLoyaltyRegistration } = await vite.ssrLoadModule("/lib/loyalty-registration.ts");
  const base = { firstName: "Marta", lastName: "Banaszek", email: "m@example.pl", phone: "123456789" };
  assert.equal(validateLoyaltyRegistration({ ...base, barcode: "12", marketingConsent: true }).ok, false);
  assert.equal(validateLoyaltyRegistration({ ...base, barcode: "MB-12", marketingConsent: false }).ok, false);
});

test("reads the provider CSRF token and recognizes successful redirect", async () => {
  const { extractCsrfToken, registrationSucceeded } = await vite.ssrLoadModule("/lib/loyalty-registration.ts");
  assert.equal(extractCsrfToken('<input name="csrfmiddlewaretoken" value="abc123">'), "abc123");
  assert.equal(registrationSucceeded(302, ""), true);
  assert.equal(registrationSucceeded(200, '<form action="/dotykacka/c/marta-banaszek-atelier-cafe/register">'), false);
});
