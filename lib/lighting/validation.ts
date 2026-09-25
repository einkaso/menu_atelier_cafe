import { z } from "zod";
import { LIGHTING_COMMAND_KINDS } from "./types";

const outputId = z.number().int().positive();

export const lightingCommandInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ON"), outputId }),
  z.object({ kind: z.literal("OFF"), outputId }),
  z.object({ kind: z.literal("BRIGHTNESS"), outputId, brightness: z.number().int().min(0).max(100) }),
  z.object({ kind: z.enum(["SHUTTER_UP", "SHUTTER_DOWN", "SHUTTER_STOP"]), outputId }),
  z.object({ kind: z.literal("SHUTTER_POSITION"), outputId, position: z.number().int().min(0).max(100) }),
  z.object({ kind: z.literal("GROUP"), groupId: z.number().int().positive(), command: z.enum(["ON", "OFF"]), brightness: z.number().int().min(0).max(100).optional() }),
  z.object({ kind: z.literal("SCENE"), sceneId: z.number().int().positive() }),
  z.object({ kind: z.literal("ALL_OFF"), confirmation: z.literal("HOLD") }),
]);

export const lightingBridgeState = z.object({
  outputId: outputId,
  isOn: z.boolean().nullable(),
  brightness: z.number().int().min(0).max(100).nullable(),
  position: z.number().int().min(0).max(100).nullable().optional(),
  desiredPosition: z.number().int().min(0).max(100).nullable().optional(),
  motion: z.enum(["UP", "DOWN", "STOPPED", "UNKNOWN"]).nullable().optional(),
  calibrated: z.boolean().nullable().optional(),
  observedAt: z.coerce.date(),
  error: z.string().max(500).nullable().optional(),
});

export const lightingBridgeStates = z.object({
  states: z.array(lightingBridgeState).max(500),
});

export const coldStorageSensorKey = z.enum(["freezer-small", "freezer-large"]);

export const coldStorageTemperatureReport = z.object({
  readings: z.array(z.object({
    key: coldStorageSensorKey,
    temperatureC: z.number().finite().min(-100).max(100),
    observedAt: z.coerce.date(),
  })).length(2).refine((readings) => new Set(readings.map((reading) => reading.key)).size === readings.length, {
    message: "Raport musi zawierać dwa różne czujniki zamrażarek.",
  }),
});

const lightingCapabilities = z.object({
  onOff: z.boolean(),
  dimming: z.boolean(),
  rgbw: z.boolean().optional(),
  shutter: z.boolean().optional(),
});

export const lightingInventoryReport = z.object({
  agentVersion: z.string().trim().min(1).max(80),
  discoveredAt: z.coerce.date(),
  devices: z.array(z.object({
    stableId: z.string().regex(/^[a-f0-9]{12,64}$/),
    host: z.string().regex(/^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}$/),
    name: z.string().trim().min(1).max(200),
    adapter: z.enum(["relay", "dimmer", "rgbw", "shutter", "input", "unsupported"]),
    apiLevel: z.string().max(40).nullable(),
    hardwareVersion: z.string().max(80).nullable(),
    firmwareVersion: z.string().max(80).nullable(),
    controllable: z.boolean(),
    outputs: z.array(z.object({
      channel: z.string().regex(/^(relay:\d+|dimmer:0|rgbw:0|shutter:0)$/),
      label: z.string().trim().min(1).max(200),
      isOn: z.boolean(),
      brightness: z.number().int().min(0).max(100),
      position: z.number().int().min(0).max(100).nullable().optional(),
      desiredPosition: z.number().int().min(0).max(100).nullable().optional(),
      motion: z.enum(["UP", "DOWN", "STOPPED", "UNKNOWN"]).nullable().optional(),
      calibrated: z.boolean().nullable().optional(),
      minBrightness: z.number().int().min(0).max(100),
      maxBrightness: z.number().int().min(0).max(100),
      capabilities: lightingCapabilities,
    })).max(8),
  })).max(200),
});

export const lightingOutputConfigurationInput = z.object({
  outputId: z.number().int().positive(),
  active: z.boolean(),
  label: z.string().trim().min(1).max(120),
  roomId: z.number().int().positive().nullable(),
});

export const lightingRoomInput = z.object({ name: z.string().trim().min(1).max(80) });

export function assertKnownLightingCommand(kind: string): asserts kind is typeof LIGHTING_COMMAND_KINDS[number] {
  if (!(LIGHTING_COMMAND_KINDS as readonly string[]).includes(kind)) throw new Error("Nieznany typ polecenia oświetlenia.");
}
