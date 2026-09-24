import { getDb } from "../../../../db";
import { and, eq } from "drizzle-orm";
import { roomLockEvents, roomLockPermissions } from "../../../../db/schema";
import { commandTtLock, listRoomLocks, listTtLocks, queryTtLockState, ttlockConfigured } from "../../../../lib/ttlock";
import { currentWaiter } from "../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Nie udało się wykonać polecenia zamka.";
}

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja wygasła." }, { status: 401 });
  if (!employee.canControlRooms) return Response.json({ error: "Nie masz uprawnienia do sterowania pomieszczeniami." }, { status: 403 });
  if (!ttlockConfigured()) return Response.json({ configured: false, rooms: [], employeeName: employee.name });
  try {
    const permissions = await getDb().select({ lockId: roomLockPermissions.lockId }).from(roomLockPermissions)
      .where(eq(roomLockPermissions.employeeDotykackaId, employee.dotykackaId));
    const allowedLockIds = new Set(permissions.map((permission) => permission.lockId));
    if (!allowedLockIds.size) return Response.json({ configured: true, rooms: [], employeeName: employee.name });
    const rooms = (await listRoomLocks()).filter((room) => allowedLockIds.has(String(room.id)));
    return Response.json({ configured: true, rooms, employeeName: employee.name });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja wygasła." }, { status: 401 });
  if (!employee.canControlRooms) return Response.json({ error: "Nie masz uprawnienia do sterowania pomieszczeniami." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { lockId?: unknown; action?: unknown };
  const lockId = Number(body.lockId);
  const action = body.action === "LOCK" || body.action === "UNLOCK" ? body.action : null;
  if (!Number.isSafeInteger(lockId) || lockId <= 0 || !action) return Response.json({ error: "Nieprawidłowe polecenie." }, { status: 400 });

  const [permission] = await getDb().select({ id: roomLockPermissions.id }).from(roomLockPermissions).where(and(
    eq(roomLockPermissions.employeeDotykackaId, employee.dotykackaId),
    eq(roomLockPermissions.lockId, String(lockId)),
  )).limit(1);
  if (!permission) return Response.json({ error: "Nie masz uprawnienia do tego zamka." }, { status: 403 });

  let lockName = `Pomieszczenie ${lockId}`;
  try {
    const lock = (await listTtLocks()).find((item) => item.lockId === lockId);
    if (!lock) return Response.json({ error: "Zamek nie istnieje na tym koncie TTLock." }, { status: 404 });
    lockName = lock.lockAlias?.trim() || lock.lockName?.trim() || lockName;
    if (lock.hasGateway !== 1) return Response.json({ error: "Ten zamek nie jest połączony z bramką internetową." }, { status: 409 });
    await commandTtLock(lockId, action);
    await getDb().insert(roomLockEvents).values({ actorDotykackaId: employee.dotykackaId, actorName: employee.name, lockId: String(lockId), lockName, action, status: "SUCCEEDED" }).catch(() => undefined);
    return Response.json({ ok: true, state: await queryTtLockState(lockId).catch(() => "UNKNOWN" as const) });
  } catch (error) {
    const errorMessage = message(error);
    await getDb().insert(roomLockEvents).values({ actorDotykackaId: employee.dotykackaId, actorName: employee.name, lockId: String(lockId), lockName, action, status: "FAILED", error: errorMessage.slice(0, 1000) }).catch(() => undefined);
    return Response.json({ error: errorMessage }, { status: 502 });
  }
}
