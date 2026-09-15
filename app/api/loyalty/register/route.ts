import {
  extractCsrfToken,
  loyaltyRegistrationUrl,
  registrationSucceeded,
  validateLoyaltyRegistration,
} from "../../../../lib/loyalty-registration";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "cache-control": "no-store, no-cache, must-revalidate" };
const providerOrigin = new URL(loyaltyRegistrationUrl).origin;

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: noStoreHeaders });
}

function cookieHeader(headers: Headers) {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = extended.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  return setCookies.map((cookie) => cookie.split(";", 1)[0]).filter(Boolean).join("; ");
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response({ error: "Nieprawidłowy format zgłoszenia." }, 415);
  }

  const validation = validateLoyaltyRegistration(await request.json().catch(() => null));
  if (!validation.ok) return response({ error: validation.error }, 400);

  try {
    const registrationPage = await fetch(loyaltyRegistrationUrl, {
      cache: "no-store",
      redirect: "manual",
      headers: { "user-agent": "Atelier-Cafe-Menu/1.0 (+https://menu.martabanaszek.pl)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!registrationPage.ok) throw new Error(`Registration page returned ${registrationPage.status}`);

    const html = await registrationPage.text();
    const csrfToken = extractCsrfToken(html);
    if (!csrfToken) throw new Error("Registration token is unavailable");

    const data = validation.data;
    const form = new URLSearchParams({
      csrfmiddlewaretoken: csrfToken,
      tenant_confirmation: "marta-banaszek-atelier-cafe",
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      barcode: data.barcode,
      marketing_consent: "on",
    });
    const providerResponse = await fetch(loyaltyRegistrationUrl, {
      method: "POST",
      cache: "no-store",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: cookieHeader(registrationPage.headers),
        origin: providerOrigin,
        referer: loyaltyRegistrationUrl,
        "user-agent": "Atelier-Cafe-Menu/1.0 (+https://menu.martabanaszek.pl)",
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const providerHtml = providerResponse.status === 200 ? await providerResponse.text() : "";

    if (registrationSucceeded(providerResponse.status, providerHtml)) {
      return response({ ok: true });
    }
    if (providerResponse.status === 200) {
      return response({ error: "Nie udało się zarejestrować karty. Sprawdź dane i upewnij się, że karta nie była już rejestrowana." }, 422);
    }
    throw new Error(`Registration provider returned ${providerResponse.status}`);
  } catch (error) {
    console.error("Loyalty registration provider unavailable", error instanceof Error ? error.message : error);
    return response({ error: "System rejestracji jest chwilowo niedostępny. Spróbuj ponownie za moment lub poproś obsługę o pomoc." }, 503);
  }
}
