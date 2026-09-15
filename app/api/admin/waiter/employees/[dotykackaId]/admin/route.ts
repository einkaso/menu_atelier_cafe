import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../../db";
import { adminUsers, waiterEmployees } from "../../../../../../../db/schema";
import { currentAdmin } from "../../../../../../../lib/admin-auth";
import { hashAdminPassword, normalizeAdminUsername, validAdminPassword, validAdminUsername } from "../../../../../../../lib/admin-password";

export async function PUT(request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  const actor = await currentAdmin();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { dotykackaId } = await context.params;
  const body = await request.json().catch(() => ({})) as { username?: unknown; password?: unknown };
  const username = normalizeAdminUsername(typeof body.username === "string" ? body.username : "");
  const password = typeof body.password === "string" ? body.password : "";
  if (!validAdminUsername(username)) {
    return Response.json({ error: "Login musi mieć 3–50 znaków: małe litery, cyfry, kropka, myślnik lub podkreślenie." }, { status: 400 });
  }
  if (username === normalizeAdminUsername(process.env.ADMIN_USERNAME ?? "admin")) {
    return Response.json({ error: "Ten login jest zarezerwowany dla głównego administratora." }, { status: 409 });
  }

  const [[employee], [existing], [usernameOwner]] = await Promise.all([
    getDb().select({ name: waiterEmployees.name }).from(waiterEmployees).where(and(
      eq(waiterEmployees.dotykackaId, dotykackaId),
      eq(waiterEmployees.enabled, true),
      eq(waiterEmployees.deleted, false),
    )).limit(1),
    getDb().select({ passwordHash: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.employeeDotykackaId, dotykackaId)).limit(1),
    getDb().select({ employeeDotykackaId: adminUsers.employeeDotykackaId }).from(adminUsers).where(eq(adminUsers.username, username)).limit(1),
  ]);
  if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny w Dotykačce." }, { status: 404 });
  if (usernameOwner && usernameOwner.employeeDotykackaId !== dotykackaId) {
    return Response.json({ error: "Ten login jest już przypisany innemu pracownikowi." }, { status: 409 });
  }
  if (!existing && !validAdminPassword(password)) {
    return Response.json({ error: "Nowe hasło musi mieć od 10 do 128 znaków." }, { status: 400 });
  }
  if (password && !validAdminPassword(password)) {
    return Response.json({ error: "Hasło musi mieć od 10 do 128 znaków." }, { status: 400 });
  }

  const passwordHash = password ? await hashAdminPassword(password) : existing!.passwordHash;
  const now = new Date();
  await getDb().insert(adminUsers).values({
    employeeDotykackaId: dotykackaId,
    employeeName: employee.name,
    username,
    passwordHash,
    enabled: true,
    createdBy: actor.username,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: adminUsers.employeeDotykackaId,
    set: { employeeName: employee.name, username, passwordHash, enabled: true, updatedAt: now },
  });
  return Response.json({ ok: true, username });
}

export async function DELETE(_request: Request, context: { params: Promise<{ dotykackaId: string }> }) {
  const actor = await currentAdmin();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { dotykackaId } = await context.params;
  if (actor.kind === "DATABASE" && actor.employeeDotykackaId === dotykackaId) {
    return Response.json({ error: "Nie możesz wyłączyć własnego konta administracyjnego." }, { status: 409 });
  }
  await getDb().update(adminUsers).set({ enabled: false, updatedAt: new Date() }).where(eq(adminUsers.employeeDotykackaId, dotykackaId));
  return Response.json({ ok: true });
}
