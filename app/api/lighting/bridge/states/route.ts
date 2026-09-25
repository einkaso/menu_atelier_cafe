import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { lightingDevices, lightingOutputs, lightingOutputStates } from "../../../../../db/schema";
import { currentLightingBridge } from "../../../../../lib/lighting/bridge-request-auth";
import { lightingBridgeStates } from "../../../../../lib/lighting/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bridge = await currentLightingBridge(request);
  if (!bridge) return Response.json({ error: "Nieprawidłowy token agenta." }, { status: 401 });
  const input = lightingBridgeStates.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Nieprawidłowy raport stanów." }, { status: 400 });
  const ids = input.data.states.map((state) => state.outputId);
  const allowed = ids.length ? await getDb().select({ id: lightingOutputs.id }).from(lightingOutputs)
    .innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId))
    .where(and(eq(lightingDevices.bridgeId, bridge.id), inArray(lightingOutputs.id, ids))) : [];
  const allowedIds = new Set(allowed.map((item) => item.id));
  if (allowedIds.size !== new Set(ids).size) return Response.json({ error: "Raport zawiera obcy punkt oświetlenia." }, { status: 403 });
  const now = new Date();
  await getDb().transaction(async (tx) => {
    for (const state of input.data.states) {
      await tx.insert(lightingOutputStates).values({
        outputId: state.outputId,
        isOn: state.isOn,
        brightness: state.brightness,
        position: state.position ?? null,
        desiredPosition: state.desiredPosition ?? null,
        motion: state.motion ?? null,
        calibrated: state.calibrated ?? null,
        observedAt: state.observedAt,
        quality: state.error ? "ERROR" : "CONFIRMED",
        lastError: state.error ?? null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: lightingOutputStates.outputId,
        set: { isOn: state.isOn, brightness: state.brightness, position: state.position ?? null, desiredPosition: state.desiredPosition ?? null, motion: state.motion ?? null, calibrated: state.calibrated ?? null, observedAt: state.observedAt, quality: state.error ? "ERROR" : "CONFIRMED", lastError: state.error ?? null, updatedAt: now },
      });
    }
  });
  return Response.json({ status: "ok", states: input.data.states.length });
}
