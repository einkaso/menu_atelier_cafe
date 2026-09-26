import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyBleboxDevice,
  normalizeDeviceInfo,
  parseBleboxState,
  stateReadPaths,
} from "../bridge/lighting/blebox-adapters.mjs";
import { hostsFromCidr, isPrivateIpv4 } from "../bridge/lighting/discovery.mjs";
import { temperatureReadings } from "../bridge/lighting/temperature-monitor.mjs";
import { dimmerBrightnessPath, relayCommandPayload, shutterCommandPath } from "../bridge/lighting/agent.mjs";

test("BleBox discovery classifies actual Atelier product families without trusting names", () => {
  assert.equal(classifyBleboxDevice({ deviceName: "Dowolna nazwa", type: "switchBox", product: "switchBoxD_DIN" }).adapter, "relay");
  assert.equal(classifyBleboxDevice({ type: "dimmerBox", product: "dimmerBox_v2" }).adapter, "dimmer");
  assert.equal(classifyBleboxDevice({ type: "buttonBox", product: "actionBox" }).controllable, false);
  assert.equal(classifyBleboxDevice({ type: "shutterBox", product: "shutterBox" }).adapter, "shutter");
});

test("relay state keeps channels separate and uses absolute state", () => {
  const outputs = parseBleboxState("relay", {
    relays: [
      { relay: 0, state: 1, name: "Nad stołem" },
      { relay: 1, state: 0, name: "Przy biurze" },
    ],
  });
  assert.deepEqual(outputs.map(({ channel, label, isOn, brightness }) => ({ channel, label, isOn, brightness })), [
    { channel: "relay:0", label: "Nad stołem", isOn: true, brightness: 100 },
    { channel: "relay:1", label: "Przy biurze", isOn: false, brightness: 0 },
  ]);
});

test("relay commands use explicit target state and never a toggle", () => {
  assert.deepEqual(relayCommandPayload("relay:1", "ON"), { relays: [{ relay: 1, state: 1 }] });
  assert.deepEqual(relayCommandPayload("relay:0", "OFF"), { relays: [{ relay: 0, state: 0 }] });
  assert.throws(() => relayCommandPayload("dimmer:0", "ON"), /nieobsługiwane polecenie/);
  assert.throws(() => relayCommandPayload("relay:0", "TOGGLE"), /nieobsługiwane polecenie/);
});

test("dimmer commands convert an absolute percentage to the BleBox hexadecimal path", () => {
  assert.equal(dimmerBrightnessPath("dimmer:0", 0), "/s/00");
  assert.equal(dimmerBrightnessPath("dimmer:0", 50), "/s/80");
  assert.equal(dimmerBrightnessPath("dimmer:0", 100), "/s/FF");
  assert.throws(() => dimmerBrightnessPath("relay:0", 50), /nieprawidłową wartość jasności/);
  assert.throws(() => dimmerBrightnessPath("dimmer:0", 101), /nieprawidłową wartość jasności/);
});

test("dimmer state converts BleBox 0-255 values to panel percentages", () => {
  const [output] = parseBleboxState("dimmer", {
    dimmer: { currentBrightness: 128, minimumBrightness: 51, overloaded: false, overheated: false, temperature: 28 },
  });
  assert.equal(output.channel, "dimmer:0");
  assert.equal(output.isOn, true);
  assert.equal(output.brightness, 50);
  assert.equal(output.minBrightness, 20);
  assert.equal(output.diagnostics.temperature, 28);
});

test("shutter state and commands expose screen movement and calibrated position", () => {
  const [output] = parseBleboxState("shutter", { shutter: {
    state: 2,
    currentPos: { position: 74 },
    desiredPos: { position: 75 },
    calibrationParameters: { isCalibrated: 1 },
  } });
  assert.equal(output.channel, "shutter:0");
  assert.equal(output.position, 74);
  assert.equal(output.desiredPosition, 75);
  assert.equal(output.motion, "STOPPED");
  assert.equal(output.calibrated, true);
  assert.equal(shutterCommandPath("shutter:0", "SHUTTER_UP"), "/s/u");
  assert.equal(shutterCommandPath("shutter:0", "SHUTTER_DOWN"), "/s/d");
  assert.equal(shutterCommandPath("shutter:0", "SHUTTER_STOP"), "/s/s");
  assert.equal(shutterCommandPath("shutter:0", "SHUTTER_POSITION", 75), "/s/p/75");
});

test("all discovered devices require explicit approval", () => {
  const device = normalizeDeviceInfo("192.168.1.20", {
    device: { id: "aabbccddeeff", deviceName: "Ściemniacz", type: "dimmerBox", product: "dimmerBox_v2", apiLevel: "20200831" },
  });
  assert.equal(device.stableId, "aabbccddeeff");
  assert.equal(device.approval, "REQUIRED");
  assert.equal(device.controllable, true);
  assert.deepEqual(stateReadPaths(device.adapter).slice(0, 2), ["/state/extended", "/api/dimmer/extended/state"]);
});

test("network discovery is limited to small private IPv4 ranges", () => {
  assert.equal(isPrivateIpv4("192.168.1.20"), true);
  assert.equal(isPrivateIpv4("8.8.8.8"), false);
  assert.equal(hostsFromCidr("192.168.1.0/30").length, 2);
  assert.throws(() => hostsFromCidr("8.8.8.0/24"), /prywatnej sieci/);
  assert.throws(() => hostsFromCidr("192.168.0.0/16"), /od \/22 do \/30/);
});

test("temperature monitor maps all four Atelier temperature probes", () => {
  const readings = temperatureReadings({ multiSensor: { sensors: [
    { type: "temperature", id: 0, value: 1968 },
    { type: "temperature", id: 1, value: 1812 },
    { type: "temperature", id: 2, value: -801 },
    { type: "temperature", id: 3, value: -2001 },
  ] } }, new Date("2026-09-23T12:00:00Z"));
  assert.deepEqual(readings, [
    { key: "room-ambient", temperatureC: 19.68, observedAt: "2026-09-23T12:00:00.000Z" },
    { key: "fridge-glass", temperatureC: 18.12, observedAt: "2026-09-23T12:00:00.000Z" },
    { key: "freezer-small", temperatureC: -8.01, observedAt: "2026-09-23T12:00:00.000Z" },
    { key: "freezer-large", temperatureC: -20.01, observedAt: "2026-09-23T12:00:00.000Z" },
  ]);
});
