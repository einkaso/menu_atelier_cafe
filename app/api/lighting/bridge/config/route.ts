import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { lightingDevices, lightingOutputs } from "../../../../../db/schema";
import { currentLightingBridge } from "../../../../../lib/lighting/bridge-request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const bridge = await currentLightingBridge(request);
  if (!bridge) return Response.json({ error: "Nieprawidłowy token agenta." }, { status: 401 });
  const rows = await getDb().select({
    outputId: lightingOutputs.id,
    stableId: lightingDevices.stableId,
    host: lightingDevices.host,
    adapter: lightingDevices.apiType,
    channel: lightingOutputs.channel,
    capabilities: lightingOutputs.capabilities,
  }).from(lightingOutputs).innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId)).where(and(
    eq(lightingDevices.bridgeId, bridge.id),
    eq(lightingDevices.active, true),
    eq(lightingOutputs.active, true),
  )).orderBy(asc(lightingOutputs.id));
  return Response.json({ outputs: rows });
}
