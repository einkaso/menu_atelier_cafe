export type LoyaltyRegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  barcode: string;
  marketingConsent: boolean;
};

export const loyaltyRegistrationUrl =
  "https://club.mbstudio.online/dotykacka/c/marta-banaszek-atelier-cafe/register";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const barcodePattern = /^MB-\d+$/i;

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function validateLoyaltyRegistration(value: unknown) {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const data: LoyaltyRegistrationInput = {
    firstName: clean(body.firstName, 100),
    lastName: clean(body.lastName, 100),
    email: clean(body.email, 100).toLowerCase(),
    phone: clean(body.phone, 20),
    barcode: clean(body.barcode, 60).toUpperCase().replace(/\s+/g, ""),
    marketingConsent: body.marketingConsent === true,
  };

  if (!data.firstName || !data.lastName || !data.email || !data.phone || !data.barcode) {
    return { ok: false as const, error: "Uzupełnij wszystkie pola." };
  }
  if (!emailPattern.test(data.email)) {
    return { ok: false as const, error: "Wpisz poprawny adres e-mail." };
  }
  if (!barcodePattern.test(data.barcode)) {
    return { ok: false as const, error: "Kod karty powinien mieć format MB-numer, np. MB-12." };
  }
  if (!data.marketingConsent) {
    return { ok: false as const, error: "Zgoda jest wymagana do rejestracji karty." };
  }
  return { ok: true as const, data };
}

export function extractCsrfToken(html: string) {
  return html.match(/name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i)?.[1]
    ?? html.match(/value=["']([^"']+)["'][^>]*name=["']csrfmiddlewaretoken["']/i)?.[1]
    ?? null;
}

export function registrationSucceeded(status: number, html: string) {
  if (status >= 300 && status < 400) return true;
  if (status !== 200) return false;
  const stillShowsRegistrationForm = /<form\b[^>]*\/dotykacka\/c\/marta-banaszek-atelier-cafe\/register/i.test(html);
  return !stillShowsRegistrationForm && /(zarejestrow|dziękuj|dziekuj|aktywowan|gotow)/i.test(html);
}
