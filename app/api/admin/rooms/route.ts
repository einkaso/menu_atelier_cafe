import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { roomLockEvents, roomLockPermissions, waiterEmployees } from "../../../../db/schema";
import { currentAdmin } from "../../../../lib/admin-auth";
import { commandTtLock, listRoomLocks, listTtLocks, queryTtLockState, ttlockConfigured } from "../../../../lib/ttlock";

export const dynamic = "force-dynamic";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Nie udało się wykonać polecenia zamka.";
}

export async function GET() {
  if (!(await currentAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [employees, permissions] = await Promise.all([
    getDb().select({ dotykackaId: waiterEmployees.dotykackaId, name: waiterEmployees.name, canControlRooms: waiterEmployees.canControlRooms })
      .from(waiterEmployees).where(and(eq(waiterEmployees.enabled, true), eq(waiterEmployees.deleted, false))).orderBy(asc(waiterEmployees.name)),
    getDb().select({ employeeDotykackaId: roomLockPermissions.employeeDotykackaId, lockId: roomLockPermissions.lockId })
      .from(roomLockPermissions),
  ]);
  if (!ttlockConfigured()) return Response.json({ configured: false, rooms: [], employees, permissions });
  try {
    return Response.json({ configured: true, rooms: await listRoomLocks(), employees, permissions });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { lockId?: unknown; action?: unknown };
  const lockId = Number(body.lockId);
  const action = body.action === "LOCK" || body.action === "UNLOCK" ? body.action : null;
  if (!Number.isSafeInteger(lockId) || lockId <= 0 || !action) return Response.json({ error: "Nieprawidłowe polecenie." }, { status: 400 });

  let lockName = `Pomieszczenie ${lockId}`;
  try {
    const lock = (await listTtLocks()).find((item) => item.lockId === lockId);
    if (!lock) return Response.json({ error: "Zamek nie istnieje na tym koncie TTLock." }, { status: 404 });
    lockName = lock.lockAlias?.trim() || lock.lockName?.trim() || lockName;
    if (lock.hasGateway !== 1) return Response.json({ error: "Ten zamek nie jest połączony z bramką internetową." }, { status: 409 });
    await commandTtLock(lockId, action);
    await getDb().insert(roomLockEvents).values({ actorDotykackaId: administrator.employeeDotykackaId, actorName: administrator.employeeName || administrator.username, lockId: String(lockId), lockName, action, status: "SUCCEEDED" }).catch(() => undefined);
    return Response.json({ ok: true, state: await queryTtLockState(lockId).catch(() => "UNKNOWN" as const) });
  } catch (error) {
    const errorMessage = message(error);
    await getDb().insert(roomLockEvents).values({ actorDotykackaId: administrator.employeeDotykackaId, actorName: administrator.employeeName || administrator.username, lockId: String(lockId), lockName, action, status: "FAILED", error: errorMessage.slice(0, 1000) }).catch(() => undefined);
    return Response.json({ error: errorMessage }, { status: 502 });
  }
}
