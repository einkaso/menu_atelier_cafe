import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { waiterEmployees } from "../../../../db/schema";
import { createWaiterToken, currentWaiter, validWaiterPin, verifyWaiterPin, waiterCookie } from "../../../../lib/waiter-auth";
import { clearWaiterLoginFailures, noteWaiterLoginFailure, waiterLoginBlocked, waiterLoginKey } from "../../../../lib/waiter-rate-limit";

export const dynamic = "force-dynamic";

function cookie(value: string, maxAge: number) {
  return `${waiterCookie.name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export async function GET(request: Request) {
  const employee = await currentWaiter(request);
  return employee ? Response.json({ employee }) : Response.json({ error: "Sesja kelnera wygasła." }, { status: 401 });
}

export async function POST(request: Request) {
  const key = waiterLoginKey(request);
  if (waiterLoginBlocked(key)) return Response.json({ error: "Za dużo nieudanych prób. Spróbuj ponownie za 10 minut." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!validWaiterPin(pin)) return Response.json({ error: "PIN musi mieć od 4 do 8 cyfr." }, { status: 400 });
  const employees = await getDb().select({
    dotykackaId: waiterEmployees.dotykackaId,
    name: waiterEmployees.name,
    pinHash: waiterEmployees.pinHash,
  }).from(waiterEmployees).where(and(
    eq(waiterEmployees.enabled, true),
    eq(waiterEmployees.deleted, false),
    isNotNull(waiterEmployees.pinHash),
  ));
  let match: (typeof employees)[number] | undefined;
  for (const employee of employees) {
    if (employee.pinHash && await verifyWaiterPin(pin, employee.pinHash)) {
      match = employee;
      break;
    }
  }
  if (!match) {
    noteWaiterLoginFailure(key);
    return Response.json({ error: "Nieprawidłowy PIN." }, { status: 401 });
  }
  clearWaiterLoginFailures(key);
  const token = createWaiterToken(match.dotykackaId);
  const response = Response.json({ employee: { dotykackaId: match.dotykackaId, name: match.name }, token });
  response.headers.append("Set-Cookie", cookie(token, waiterCookie.maxAge));
  return response;
}

export async function PUT(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja kelnera wygasła." }, { status: 401 });
  const token = createWaiterToken(employee.dotykackaId);
  const response = Response.json({ employee, token });
  response.headers.append("Set-Cookie", cookie(token, waiterCookie.maxAge));
  return response;
}

export async function DELETE() {
  const response = Response.json({ status: "ok" });
  response.headers.append("Set-Cookie", cookie("", 0));
  return response;
}
