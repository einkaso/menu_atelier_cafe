export const LIGHTING_COMMAND_STATUSES = ["QUEUED", "CLAIMED", "SUCCEEDED", "PARTIAL", "FAILED", "EXPIRED"] as const;
export type LightingCommandStatus = typeof LIGHTING_COMMAND_STATUSES[number];

export const LIGHTING_COMMAND_KINDS = ["ON", "OFF", "BRIGHTNESS", "SHUTTER_UP", "SHUTTER_DOWN", "SHUTTER_STOP", "SHUTTER_POSITION", "GROUP", "SCENE", "ALL_OFF"] as const;
export type LightingCommandKind = typeof LIGHTING_COMMAND_KINDS[number];

export const LIGHTING_STATE_QUALITIES = ["CONFIRMED", "STALE", "UNKNOWN", "ERROR"] as const;
export type LightingStateQuality = typeof LIGHTING_STATE_QUALITIES[number];

export type LightingCapabilities = {
  onOff: boolean;
  dimming: boolean;
  rgbw?: boolean;
  shutter?: boolean;
};

export type LightingOutputState = {
  outputId: number;
  isOn: boolean | null;
  brightness: number | null;
  position?: number | null;
  desiredPosition?: number | null;
  motion?: "UP" | "DOWN" | "STOPPED" | "UNKNOWN" | null;
  calibrated?: boolean | null;
  observedAt: string | null;
  quality: LightingStateQuality;
  lastError: string | null;
};
