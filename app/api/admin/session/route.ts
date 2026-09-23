import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adminUsers, waiterEmployees } from "../../../../db/schema";
import { adminCookie, constantTimeMatch, createAdminToken, currentAdmin } from "../../../../lib/admin-auth";
import { normalizeAdminUsername, verifyAdminPassword } from "../../../../lib/admin-password";

export const dynamic = "force-dynamic";

const privateHeaders = { "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate" };

export async function GET() {
  const administrator = await currentAdmin();
  return administrator
    ? Response.json({ administrator: { username: administrator.username } }, { headers: privateHeaders })
    : Response.json({ error: "Sesja administratora wygasła." }, { status: 401, headers: privateHeaders });
}

export async function POST(request: Request) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!process.env.ADMIN_SESSION_SECRET) {
    return Response.json({ error: "Panel administratora nie został skonfigurowany." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  const receivedUsername = typeof body.username === "string" ? body.username : "";
  const receivedPassword = typeof body.password === "string" ? body.password : "";
  const rootUsername = process.env.ADMIN_USERNAME ?? "admin";
  let username = "";
  let kind: "ENV" | "DATABASE" = "ENV";

  if (configuredPassword && receivedUsername === rootUsername && constantTimeMatch(receivedPassword, configuredPassword)) {
    username = rootUsername;
  } else {
    const normalizedUsername = normalizeAdminUsername(receivedUsername);
    const [administrator] = await getDb().select({
      id: adminUsers.id,
      username: adminUsers.username,
      passwordHash: adminUsers.passwordHash,
    }).from(adminUsers).innerJoin(waiterEmployees, eq(adminUsers.employeeDotykackaId, waiterEmployees.dotykackaId)).where(and(
      eq(adminUsers.username, normalizedUsername),
      eq(adminUsers.enabled, true),
      eq(waiterEmployees.enabled, true),
      eq(waiterEmployees.deleted, false),
    )).limit(1);
    if (administrator && await verifyAdminPassword(receivedPassword, administrator.passwordHash)) {
      username = administrator.username;
      kind = "DATABASE";
      await getDb().update(adminUsers).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(adminUsers.id, administrator.id));
    }
  }
  if (!username) return Response.json({ error: "Nieprawidłowy login lub hasło." }, { status: 401 });
  const response = Response.json({ status: "ok" });
  response.headers.append("Set-Cookie", `${adminCookie.name}=${createAdminToken(username, kind)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${adminCookie.maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}

export async function DELETE() {
  const response = Response.json({ status: "ok" });
  response.headers.append("Set-Cookie", `${adminCookie.name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
