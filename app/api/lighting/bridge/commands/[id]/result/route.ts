import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../../../../db";
import { lightingCommandItems, lightingCommands, lightingOutputStates } from "../../../../../../../db/schema";
import { currentLightingBridge } from "../../../../../../../lib/lighting/bridge-request-auth";

export const dynamic = "force-dynamic";

const resultInput = z.object({
  success: z.boolean(),
  outputId: z.number().int().positive(),
  isOn: z.boolean().nullable(),
  brightness: z.number().int().min(0).max(100).nullable(),
  observedAt: z.coerce.date(),
  error: z.string().max(500).nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const bridge = await currentLightingBridge(request);
  if (!bridge) return Response.json({ error: "Nieprawidłowy token agenta." }, { status: 401 });
  const { id } = await params;
  const input = resultInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Nieprawidłowy wynik polecenia." }, { status: 400 });
  const [command] = await getDb().select({ id: lightingCommands.id }).from(lightingCommands)
    .innerJoin(lightingCommandItems, eq(lightingCommandItems.commandId, lightingCommands.id))
    .where(and(
      eq(lightingCommands.id, id),
      eq(lightingCommands.bridgeId, bridge.id),
      eq(lightingCommands.status, "CLAIMED"),
      eq(lightingCommandItems.outputId, input.data.outputId),
    )).limit(1);
  if (!command) return Response.json({ error: "Polecenie nie istnieje albo nie zostało przejęte." }, { status: 404 });
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx.update(lightingCommandItems).set({ result: input.data.success ? "SUCCEEDED" : "FAILED", error: input.data.error }).where(and(eq(lightingCommandItems.commandId, id), eq(lightingCommandItems.outputId, input.data.outputId)));
    await tx.insert(lightingOutputStates).values({
      outputId: input.data.outputId,
      isOn: input.data.isOn,
      brightness: input.data.brightness,
      observedAt: input.data.observedAt,
      quality: input.data.success ? "CONFIRMED" : "ERROR",
      lastError: input.data.error,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: lightingOutputStates.outputId,
      set: { isOn: input.data.isOn, brightness: input.data.brightness, observedAt: input.data.observedAt, quality: input.data.success ? "CONFIRMED" : "ERROR", lastError: input.data.error, updatedAt: now },
    });
    await tx.update(lightingCommands).set({ status: input.data.success ? "SUCCEEDED" : "FAILED", finishedAt: now, error: input.data.error }).where(eq(lightingCommands.id, id));
  });
  return Response.json({ status: "ok" });
}
