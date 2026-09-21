import { createHmac, timingSafeEqual } from "node:crypto";

function workforceSecret() {
  const value = process.env.WORKFORCE_QR_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("WORKFORCE_QR_SECRET is not configured");
  return value;
}
function hmac(value: string, purpose: string) { return createHmac("sha256", `${purpose}:${workforceSecret()}`).update(value).digest("base64url"); }
export function employeeQrPayload(employeeDotykackaId: string, barcode: string) { const data = Buffer.from(JSON.stringify({ employeeDotykackaId, barcode })).toString("base64url"); return `ATELIER-WORK.${data}.${hmac(data, "qr")}`; }
export function parseEmployeeQrPayload(payload: string) { const [prefix, data, received] = payload.trim().split("."); if (prefix !== "ATELIER-WORK" || !data || !received) return null; const expected = hmac(data, "qr"); const left = Buffer.from(received); const right = Buffer.from(expected); if (left.length !== right.length || !timingSafeEqual(left, right)) return null; try { const parsed = JSON.parse(Buffer.from(data, "base64url").toString()) as { employeeDotykackaId?: string; barcode?: string }; return parsed.employeeDotykackaId && parsed.barcode ? { employeeDotykackaId: parsed.employeeDotykackaId, barcode: parsed.barcode } : null; } catch { return null; } }
export function calendarToken(employeeDotykackaId: string) { return hmac(employeeDotykackaId, "calendar"); }
export function validCalendarToken(employeeDotykackaId: string, token: string) { const expected = calendarToken(employeeDotykackaId); const left = Buffer.from(token); const right = Buffer.from(expected); return left.length === right.length && timingSafeEqual(left, right); }
