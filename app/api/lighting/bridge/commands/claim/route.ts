import { and, asc, eq, gt, lt, lte } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { lightingCommandItems, lightingCommands, lightingDevices, lightingOutputs } from "../../../../../../db/schema";
import { currentLightingBridge } from "../../../../../../lib/lighting/bridge-request-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bridge = await currentLightingBridge(request);
  if (!bridge) return Response.json({ error: "Nieprawidłowy token agenta." }, { status: 401 });
  const now = new Date();
  await getDb().update(lightingCommands).set({ status: "EXPIRED", finishedAt: now, error: "Polecenie wygasło przed wykonaniem." }).where(and(
    eq(lightingCommands.bridgeId, bridge.id), eq(lightingCommands.status, "QUEUED"), lt(lightingCommands.expiresAt, now),
  ));
  const [candidate] = await getDb().select({
    id: lightingCommands.id,
    kind: lightingCommands.kind,
    expiresAt: lightingCommands.expiresAt,
    outputId: lightingCommandItems.outputId,
    host: lightingDevices.host,
    adapter: lightingDevices.apiType,
    channel: lightingOutputs.channel,
    requestedBrightness: lightingCommandItems.requestedBrightness,
    requestedPosition: lightingCommandItems.requestedPosition,
  }).from(lightingCommands)
    .innerJoin(lightingCommandItems, eq(lightingCommandItems.commandId, lightingCommands.id))
    .innerJoin(lightingOutputs, eq(lightingOutputs.id, lightingCommandItems.outputId))
    .innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId))
    .where(and(eq(lightingCommands.bridgeId, bridge.id), eq(lightingCommands.status, "QUEUED"), lte(lightingCommands.executeAt, now), gt(lightingCommands.expiresAt, now), eq(lightingOutputs.active, true)))
    .orderBy(asc(lightingCommands.executeAt), asc(lightingCommands.createdAt)).limit(1);
  if (!candidate) return new Response(null, { status: 204 });
  const claimed = await getDb().update(lightingCommands).set({ status: "CLAIMED", claimedAt: now }).where(and(eq(lightingCommands.id, candidate.id), eq(lightingCommands.status, "QUEUED"))).returning({ id: lightingCommands.id });
  if (!claimed.length) return new Response(null, { status: 204 });
  return Response.json({ command: candidate });
}
