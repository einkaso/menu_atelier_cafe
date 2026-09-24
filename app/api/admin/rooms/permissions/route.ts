import { and, count, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { roomLockPermissions, waiterEmployees } from "../../../../../db/schema";
import { currentAdmin } from "../../../../../lib/admin-auth";
import { listTtLocks } from "../../../../../lib/ttlock";

export async function PUT(request: Request) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { employeeDotykackaId?: unknown; lockId?: unknown; enabled?: unknown };
  const employeeDotykackaId = typeof body.employeeDotykackaId === "string" ? body.employeeDotykackaId.trim() : "";
  const lockId = Number(body.lockId);
  if (!employeeDotykackaId || !Number.isSafeInteger(lockId) || lockId <= 0 || typeof body.enabled !== "boolean") {
    return Response.json({ error: "Nieprawidłowe uprawnienie do zamka." }, { status: 400 });
  }
  const [employee] = await getDb().select({ id: waiterEmployees.id, name: waiterEmployees.name })
    .from(waiterEmployees).where(and(
      eq(waiterEmployees.dotykackaId, employeeDotykackaId),
      eq(waiterEmployees.enabled, true),
      eq(waiterEmployees.deleted, false),
    )).limit(1);
  if (!employee) return Response.json({ error: "Pracownik nie istnieje lub jest nieaktywny." }, { status: 404 });

  if (!body.enabled) {
    await getDb().delete(roomLockPermissions).where(and(
      eq(roomLockPermissions.employeeDotykackaId, employeeDotykackaId),
      eq(roomLockPermissions.lockId, String(lockId)),
    ));
    const [remaining] = await getDb().select({ count: count() }).from(roomLockPermissions)
      .where(eq(roomLockPermissions.employeeDotykackaId, employeeDotykackaId));
    if ((remaining?.count ?? 0) === 0) {
      await getDb().update(waiterEmployees).set({ canControlRooms: false }).where(eq(waiterEmployees.dotykackaId, employeeDotykackaId));
    }
    return Response.json({ ok: true, enabled: false });
  }

  const lock = (await listTtLocks()).find((item) => item.lockId === lockId);
  if (!lock) return Response.json({ error: "Zamek nie istnieje na tym koncie TTLock." }, { status: 404 });
  const lockName = lock.lockAlias?.trim() || lock.lockName?.trim() || `Pomieszczenie ${lockId}`;
  const now = new Date();
  await getDb().insert(roomLockPermissions).values({
    employeeDotykackaId,
    lockId: String(lockId),
    lockName,
    createdBy: administrator.employeeName || administrator.username,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [roomLockPermissions.employeeDotykackaId, roomLockPermissions.lockId],
    set: { lockName, createdBy: administrator.employeeName || administrator.username, updatedAt: now },
  });
  await getDb().update(waiterEmployees).set({ canControlRooms: true }).where(eq(waiterEmployees.dotykackaId, employeeDotykackaId));
  return Response.json({ ok: true, enabled: true });
}
