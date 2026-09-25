const RELAY_PRODUCTS = new Set(["switchBox", "switchBoxLight", "switchBoxD", "switchBoxD_DIN", "switchBoxDC"]);
const DIMMER_PRODUCTS = new Set(["dimmerBox", "dimmerBox_v2"]);
const RGBW_PRODUCTS = new Set(["wLightBox", "wLightBox_v2"]);
const SHUTTER_PRODUCTS = new Set(["shutterBox", "shutterBox_v2", "shutterBoxV2", "shutterBoxDC", "shutterBoxDC_v2", "shutterBoxDIN"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value) {
  return Number.isInteger(value) ? value : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeBrightness(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  return Math.round((clamp(value, 0, 255) / 255) * 100);
}

export function classifyBleboxDevice(device) {
  const type = text(device?.type);
  const product = text(device?.product);

  if (DIMMER_PRODUCTS.has(product) || type === "dimmerBox") {
    return { adapter: "dimmer", controllable: true, capabilities: { onOff: true, dimming: true } };
  }
  if (RGBW_PRODUCTS.has(product) || type === "wLightBox") {
    return { adapter: "rgbw", controllable: true, capabilities: { onOff: true, dimming: true, rgbw: true } };
  }
  if (SHUTTER_PRODUCTS.has(product) || type === "shutterBox" || type === "shutterBoxDC") {
    return { adapter: "shutter", controllable: true, capabilities: { onOff: false, dimming: false, shutter: true } };
  }
  if (RELAY_PRODUCTS.has(product) || type === "switchBox" || type === "switchBoxD") {
    return { adapter: "relay", controllable: true, capabilities: { onOff: true, dimming: false } };
  }
  if (type === "buttonBox" || product === "actionBox") {
    return { adapter: "input", controllable: false, capabilities: { onOff: false, dimming: false } };
  }
  return { adapter: "unsupported", controllable: false, capabilities: { onOff: false, dimming: false } };
}

export function stateReadPaths(adapter) {
  if (adapter === "relay") return ["/state/extended", "/api/relay/extended/state", "/state", "/api/relay/state"];
  if (adapter === "dimmer") return ["/state/extended", "/api/dimmer/extended/state", "/state", "/api/dimmer/state"];
  if (adapter === "rgbw") return ["/api/rgbw/state", "/state"];
  if (adapter === "shutter") return ["/state/extended", "/api/shutter/extended/state", "/state", "/api/shutter/state"];
  if (adapter === "input") return ["/state/extended", "/api/buttonbox/state", "/state"];
  return [];
}

function parseRelayState(body) {
  if (!Array.isArray(body?.relays)) return null;
  const outputs = body.relays.flatMap((relay, fallbackChannel) => {
    const channel = integer(relay?.relay) ?? fallbackChannel;
    const state = integer(relay?.state);
    if (channel < 0 || (state !== 0 && state !== 1)) return [];
    return [{
      channel: `relay:${channel}`,
      label: text(relay?.name) || `Wyjście ${channel + 1}`,
      isOn: state === 1,
      brightness: state === 1 ? 100 : 0,
      minBrightness: 0,
      maxBrightness: 100,
      capabilities: { onOff: true, dimming: false },
    }];
  });
  return outputs.length ? outputs : null;
}

function parseDimmerState(body) {
  const dimmer = body?.dimmer;
  const brightness = normalizeBrightness(dimmer?.currentBrightness);
  if (!dimmer || brightness === null) return null;
  return [{
    channel: "dimmer:0",
    label: "Ściemniacz",
    isOn: brightness > 0,
    brightness,
    minBrightness: normalizeBrightness(dimmer.minimumBrightness) ?? 0,
    maxBrightness: 100,
    capabilities: { onOff: true, dimming: true },
    diagnostics: {
      overloaded: Boolean(dimmer.overloaded),
      overheated: Boolean(dimmer.overheated),
      temperature: Number.isFinite(Number(dimmer.temperature)) ? Number(dimmer.temperature) : null,
    },
  }];
}

function parseRgbwState(body) {
  const rgbw = body?.rgbw ?? body?.light;
  const raw = Array.isArray(rgbw?.currentColor) ? rgbw.currentColor : rgbw?.color;
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const channels = raw.slice(0, 4).map(normalizeBrightness);
  if (channels.some((value) => value === null)) return null;
  const brightness = Math.max(...channels);
  return [{
    channel: "rgbw:0",
    label: "RGBW",
    isOn: brightness > 0,
    brightness,
    rgbw: channels,
    minBrightness: 0,
    maxBrightness: 100,
    capabilities: { onOff: true, dimming: true, rgbw: true },
  }];
}

function parseShutterState(body) {
  const shutter = body?.shutter;
  if (!shutter) return null;
  const position = integer(shutter?.currentPos?.position);
  const desiredPosition = integer(shutter?.desiredPos?.position);
  if (position !== null && (position < 0 || position > 100)) return null;
  if (desiredPosition !== null && (desiredPosition < 0 || desiredPosition > 100)) return null;
  const state = integer(shutter.state);
  const motion = state === 0 ? "UP" : state === 1 ? "DOWN" : state === 2 ? "STOPPED" : "UNKNOWN";
  return [{
    channel: "shutter:0",
    label: "Ekran",
    isOn: motion === "UP" || motion === "DOWN",
    brightness: 0,
    position,
    desiredPosition,
    motion,
    calibrated: Number(shutter?.calibrationParameters?.isCalibrated) === 1,
    minBrightness: 0,
    maxBrightness: 100,
    capabilities: { onOff: false, dimming: false, shutter: true },
  }];
}

export function parseBleboxState(adapter, body) {
  if (adapter === "relay") return parseRelayState(body);
  if (adapter === "dimmer") return parseDimmerState(body);
  if (adapter === "rgbw") return parseRgbwState(body);
  if (adapter === "shutter") return parseShutterState(body);
  return null;
}

export function normalizeDeviceInfo(host, payload) {
  const device = payload?.device;
  const stableId = text(device?.id);
  if (!stableId || !/^[a-fA-F0-9]{12,64}$/.test(stableId)) return null;
  const classification = classifyBleboxDevice(device);
  return {
    stableId: stableId.toLowerCase(),
    host,
    name: text(device.deviceName) || text(device.product) || "BleBox",
    type: text(device.type),
    product: text(device.product),
    apiLevel: text(device.apiLevel) || null,
    hardwareVersion: text(device.hv) || null,
    firmwareVersion: text(device.fv) || null,
    ...classification,
    approval: "REQUIRED",
  };
}
