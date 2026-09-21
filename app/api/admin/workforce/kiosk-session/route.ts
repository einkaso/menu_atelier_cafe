import { currentAdmin } from "../../../../../lib/admin-auth";
import { createKioskToken, workforceKioskCookie } from "../../../../../lib/workforce-kiosk-auth";
export async function POST() { if (!await currentAdmin()) return Response.json({ error: "Unauthorized" }, { status: 401 }); const token = createKioskToken(); const response = Response.json({ ok: true }); response.headers.append("Set-Cookie", `${workforceKioskCookie.name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${workforceKioskCookie.maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`); return response; }
