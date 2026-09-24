import "server-only";

const DEFAULT_API_BASE_URL = "https://api.sciener.com";
const REQUEST_TIMEOUT_MS = 10_000;

type TtLockEnvelope = { errcode?: number; errmsg?: string; description?: string };
type TtLockListItem = { lockId: number; lockName?: string; lockAlias?: string; electricQuantity?: number; hasGateway?: number };
type TtLockListResponse = TtLockEnvelope & { list?: TtLockListItem[] };
type TtLockStateResponse = TtLockEnvelope & { state?: number };

export type RoomLockState = "LOCKED" | "UNLOCKED" | "LOCKING" | "UNLOCKING" | "UNKNOWN";
export type RoomLock = { id: number; name: string; battery: number | null; hasGateway: boolean; state: RoomLockState };

function configuration() {
  const clientId = process.env.TTLOCK_CLIENT_ID?.trim();
  const accessToken = process.env.TTLOCK_ACCESS_TOKEN?.trim();
  if (!clientId || !accessToken) throw new Error("Połączenie TTLock nie zostało jeszcze skonfigurowane.");
  const apiBaseUrl = (process.env.TTLOCK_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/$/, "");
  if (new URL(apiBaseUrl).protocol !== "https:") throw new Error("Adres TTLock API musi używać bezpiecznego połączenia HTTPS.");
  return {
    clientId,
    accessToken,
    apiBaseUrl,
  };
}

export function ttlockConfigured() {
  return Boolean(process.env.TTLOCK_CLIENT_ID?.trim() && process.env.TTLOCK_ACCESS_TOKEN?.trim());
}

async function ttlockRequest<T extends TtLockEnvelope>(path: string, parameters: Record<string, string | number> = {}) {
  const { clientId, accessToken, apiBaseUrl } = configuration();
  const body = new URLSearchParams({ clientId, accessToken, date: String(Date.now()) });
  for (const [key, value] of Object.entries(parameters)) body.set(key, String(value));
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const result = await response.json().catch(() => null) as T | null;
  if (!response.ok || !result) throw new Error("TTLock nie odpowiedział prawidłowo.");
  if (typeof result.errcode === "number" && result.errcode !== 0) throw new Error(result.errmsg || result.description || `TTLock odrzucił polecenie (${result.errcode}).`);
  return result;
}

export async function listTtLocks() {
  const response = await ttlockRequest<TtLockListResponse>("/v3/lock/list", { pageNo: 1, pageSize: 1000 });
  return (response.list ?? []).filter((lock) => Number.isSafeInteger(lock.lockId) && lock.lockId > 0);
}

function roomState(value: number | undefined): RoomLockState {
  if (value === 0) return "LOCKED";
  if (value === 1) return "UNLOCKED";
  if (value === 3) return "LOCKING";
  if (value === 4) return "UNLOCKING";
  return "UNKNOWN";
}

export async function queryTtLockState(lockId: number) {
  const response = await ttlockRequest<TtLockStateResponse>("/v3/lock/queryOpenState", { lockId });
  return roomState(response.state);
}

export async function listRoomLocks(): Promise<RoomLock[]> {
  const locks = await listTtLocks();
  return Promise.all(locks.map(async (lock) => ({
    id: lock.lockId,
    name: lock.lockAlias?.trim() || lock.lockName?.trim() || `Pomieszczenie ${lock.lockId}`,
    battery: Number.isFinite(lock.electricQuantity) ? Number(lock.electricQuantity) : null,
    hasGateway: lock.hasGateway === 1,
    state: lock.hasGateway === 1 ? await queryTtLockState(lock.lockId).catch(() => "UNKNOWN" as const) : "UNKNOWN",
  })));
}

export async function commandTtLock(lockId: number, action: "LOCK" | "UNLOCK") {
  await ttlockRequest<TtLockEnvelope>(action === "LOCK" ? "/v3/lock/lock" : "/v3/lock/unlock", { lockId });
}
