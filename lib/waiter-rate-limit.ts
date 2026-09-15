type Attempt = { failures: number; blockedUntil: number; lastSeen: number };

const attempts = new Map<string, Attempt>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

export function waiterLoginKey(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim();
}

export function waiterLoginBlocked(key: string) {
  const item = attempts.get(key);
  if (!item) return false;
  if (item.lastSeen + WINDOW_MS < Date.now()) {
    attempts.delete(key);
    return false;
  }
  return item.blockedUntil > Date.now();
}

export function noteWaiterLoginFailure(key: string) {
  const current = attempts.get(key);
  const failures = current && current.lastSeen + WINDOW_MS >= Date.now() ? current.failures + 1 : 1;
  attempts.set(key, { failures, lastSeen: Date.now(), blockedUntil: failures >= MAX_FAILURES ? Date.now() + WINDOW_MS : 0 });
}

export function clearWaiterLoginFailures(key: string) {
  attempts.delete(key);
}
