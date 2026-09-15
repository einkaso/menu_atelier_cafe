import { isAdmin } from "../../../../lib/admin-auth";
import { syncDotykackaMenu } from "../../../../lib/dotykacka/sync";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ status: "ok", ...(await syncDotykackaMenu()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronizacja nie powiodła się.";
    return Response.json({ error: message }, { status: 502 });
  }
}
