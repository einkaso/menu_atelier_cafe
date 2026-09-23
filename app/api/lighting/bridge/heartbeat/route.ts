import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { lightingBridges } from "../../../../../db/schema";
import { currentLightingBridge } from "../../../../../lib/lighting/bridge-request-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bridge = await currentLightingBridge(request);
  if (!bridge) return Response.json({ error: "Nieprawidłowy token agenta." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { agentVersion?: unknown; error?: unknown };
  const agentVersion = typeof body.agentVersion === "string" ? body.agentVersion.slice(0, 80) : null;
  const error = typeof body.error === "string" ? body.error.slice(0, 500) : null;
  await getDb().update(lightingBridges).set({ agentVersion, lastHeartbeatAt: new Date(), lastError: error, updatedAt: new Date() }).where(eq(lightingBridges.id, bridge.id));
  return Response.json({ status: "ok" });
}
