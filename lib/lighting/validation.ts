import { z } from "zod";
import { LIGHTING_COMMAND_KINDS } from "./types";

const outputId = z.number().int().positive();

export const lightingCommandInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ON"), outputId }),
  z.object({ kind: z.literal("OFF"), outputId }),
  z.object({ kind: z.literal("BRIGHTNESS"), outputId, brightness: z.number().int().min(0).max(100) }),
  z.object({ kind: z.literal("GROUP"), groupId: z.number().int().positive(), command: z.enum(["ON", "OFF"]), brightness: z.number().int().min(0).max(100).optional() }),
  z.object({ kind: z.literal("SCENE"), sceneId: z.number().int().positive() }),
  z.object({ kind: z.literal("ALL_OFF"), confirmation: z.literal("HOLD") }),
]);

export const lightingBridgeState = z.object({
  outputId: outputId,
  isOn: z.boolean().nullable(),
  brightness: z.number().int().min(0).max(100).nullable(),
  observedAt: z.coerce.date(),
  error: z.string().max(500).nullable().optional(),
});

export const lightingBridgeStates = z.object({
  states: z.array(lightingBridgeState).max(500),
});

export function assertKnownLightingCommand(kind: string): asserts kind is typeof LIGHTING_COMMAND_KINDS[number] {
  if (!(LIGHTING_COMMAND_KINDS as readonly string[]).includes(kind)) throw new Error("Nieznany typ polecenia oświetlenia.");
}
