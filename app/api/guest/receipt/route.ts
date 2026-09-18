import { currentGuestReceipt, guestReceiptCookie, httpOnlyCookie, requestUsesHttps } from "../../../../lib/guest-receipt-auth";
import { loadGuestReceipt } from "../../../../lib/guest-receipt-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentGuestReceipt();
  if (!session) return Response.json({ error: "Brak aktywnego rachunku dla gościa." }, { status: 401 });
  try {
    return Response.json({ receipt: await loadGuestReceipt(session.orderId, session.presentedBy) });
  } catch (error) {
    console.error("Guest receipt load failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Nie udało się odświeżyć rachunku." }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const response = Response.json({ status: "ok" });
  response.headers.append("Set-Cookie", httpOnlyCookie(guestReceiptCookie.name, "", 0, requestUsesHttps(request)));
  return response;
}
