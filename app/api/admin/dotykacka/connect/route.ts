import { createHmac, randomBytes } from "node:crypto";
import { isAdmin } from "../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

const escapeAttribute = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character] ?? character));

export async function GET() {
  if (!(await isAdmin())) return new Response("Brak dostępu.", { status: 401 });
  const clientId = process.env.DOTYKACKA_CONNECTOR_CLIENT_ID;
  const clientSecret = process.env.DOTYKACKA_CONNECTOR_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientId || !clientSecret || !siteUrl) {
    return new Response("Integracja Dotykački nie została skonfigurowana na serwerze.", { status: 503 });
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", clientSecret).update(timestamp).digest("hex");
  const state = randomBytes(32).toString("base64url");
  const redirectUri = new URL("/api/dotykacka/callback", siteUrl).toString();
  const fields = { client_id: clientId, timestamp, signature, scope: "*", redirect_uri: redirectUri, state };
  const inputs = Object.entries(fields).map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeAttribute(value)}">`).join("");
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Łączenie z Dotykačką</title></head><body><p>Przekierowuję do bezpiecznego logowania Dotykački…</p><form id="connect" method="post" action="https://admin.dotykacka.cz/client/connect/v2">${inputs}<button type="submit">Przejdź do Dotykački</button></form><script>document.getElementById("connect").submit()</script></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action https://admin.dotykacka.cz; base-uri 'none'",
      "referrer-policy": "no-referrer",
      "set-cookie": `mb_dotykacka_state=${state}; Path=/api/dotykacka/callback; HttpOnly; SameSite=Lax; Max-Age=1200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    },
  });
}
