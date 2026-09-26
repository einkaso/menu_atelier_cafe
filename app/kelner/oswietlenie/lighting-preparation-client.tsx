"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearWaiterSessionToken, createClientRequestId, waiterSessionHeaders } from "../waiter-session-client";
import { WaiterSectionHeader } from "../staff-navigation";

type Employee = { name: string };
type LightingScene = { id: number; name: string; roomId: number | null; roomName: string | null; actionCount: number; sequenceDurationSeconds: number };
type LightingOutput = {
  id: number;
  label: string;
  deviceName: string;
  roomName: string | null;
  isOn: boolean | null;
  brightness: number | null;
  observedAt: string | null;
  stale: boolean;
  controlAvailable: boolean;
  dimmingAvailable: boolean;
  shutterAvailable: boolean;
  minBrightness: number;
  maxBrightness: number;
  preferredPosition: number;
  position: number | null;
  desiredPosition: number | null;
  motion: "UP" | "DOWN" | "STOPPED" | "UNKNOWN" | null;
  calibrated: boolean | null;
  lastError: string | null;
};
type LightingResponse = {
  bridge: { online: boolean; lastHeartbeatAt: string | null; error: string | null };
  scenes: LightingScene[];
  outputs: LightingOutput[];
  error?: string;
};

function freshness(value: string | null) {
  if (!value) return "Brak odczytu";
  return new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

export default function LightingPreparationClient() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [data, setData] = useState<LightingResponse | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [busyOutputId, setBusyOutputId] = useState<number | null>(null);
  const [busySceneId, setBusySceneId] = useState<number | null>(null);
  const [sceneMessage, setSceneMessage] = useState("");
  const [delayValue, setDelayValue] = useState(0);
  const [delayUnit, setDelayUnit] = useState<"SECONDS" | "MINUTES">("SECONDS");
  const [brightnessDrafts, setBrightnessDrafts] = useState<Record<number, number>>({});
  const brightnessTimers = useRef(new Map<number, number>());

  const load = useCallback(async () => {
    const response = await fetch("/api/waiter/lighting", { cache: "no-store", headers: waiterSessionHeaders() });
    const body = await response.json().catch(() => ({})) as LightingResponse;
    if (response.status === 401) {
      clearWaiterSessionToken();
      window.location.replace("/kelner");
      return;
    }
    if (response.status === 403) {
      setForbidden(true);
      setError(body.error ?? "Nie masz uprawnienia do sterowania oświetleniem.");
      return;
    }
    if (!response.ok) {
      setError(body.error ?? "Nie udało się pobrać stanu oświetlenia.");
      return;
    }
    setForbidden(false);
    setError("");
    setData(body);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/waiter/session", { cache: "no-store", headers: waiterSessionHeaders() })
      .then(async (response) => {
        if (response.status === 401) {
          clearWaiterSessionToken();
          window.location.replace("/kelner");
          return null;
        }
        if (!response.ok) return null;
        return response.json() as Promise<{ employee: Employee }>;
      })
      .then((body) => { if (active && body?.employee) setEmployee(body.employee); });
    // Initial hydration from the permission-protected lighting endpoint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [load]);

  useEffect(() => () => {
    for (const timer of brightnessTimers.current.values()) window.clearTimeout(timer);
    brightnessTimers.current.clear();
  }, []);

  const groups = useMemo(() => {
    const result = new Map<string, LightingOutput[]>();
    for (const output of data?.outputs ?? []) {
      const room = output.roomName || "Bez przypisanego pomieszczenia";
      result.set(room, [...(result.get(room) ?? []), output]);
    }
    return [...result.entries()];
  }, [data]);
  const sceneGroups = useMemo(() => {
    const scenes = data?.scenes ?? [];
    const result: Array<{ key: string; name: string; global: boolean; scenes: LightingScene[] }> = [];
    const globalScenes = scenes.filter((scene) => scene.roomId === null);
    if (globalScenes.length) result.push({ key: "global", name: "ATELIER CAFE", global: true, scenes: globalScenes });
    const byRoom = new Map<number, LightingScene[]>();
    for (const scene of scenes) {
      if (scene.roomId === null) continue;
      byRoom.set(scene.roomId, [...(byRoom.get(scene.roomId) ?? []), scene]);
    }
    for (const [roomId, roomScenes] of byRoom) result.push({ key: `room-${roomId}`, name: roomScenes[0]?.roomName ?? "Pomieszczenie", global: false, scenes: roomScenes });
    return result;
  }, [data]);

  function clearBrightnessDraft(outputId: number) {
    setBrightnessDrafts((current) => {
      if (!(outputId in current)) return current;
      const next = { ...current };
      delete next[outputId];
      return next;
    });
  }

  async function sendCommand(output: LightingOutput, command: "ON" | "OFF" | "BRIGHTNESS" | "SHUTTER_UP" | "SHUTTER_DOWN" | "SHUTTER_STOP" | "SHUTTER_POSITION", brightness?: number, position?: number) {
    setBusyOutputId(output.id);
    setError("");
    try {
      const response = await fetch("/api/waiter/lighting/commands", {
        method: "POST",
        credentials: "same-origin",
        headers: waiterSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ outputId: output.id, command, brightness, position, idempotencyKey: createClientRequestId() }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (response.status === 401) {
        clearWaiterSessionToken();
        window.location.replace("/kelner");
        return;
      }
      if (!response.ok) {
        setError(body.error ?? "Nie udało się wysłać polecenia.");
        if (command === "BRIGHTNESS") clearBrightnessDraft(output.id);
      } else if (command === "BRIGHTNESS") {
        window.setTimeout(() => { void load().finally(() => clearBrightnessDraft(output.id)); }, 2_500);
      } else window.setTimeout(() => void load(), 1_000);
    } catch {
      setError("Tablet nie zdołał wysłać polecenia. Sprawdź połączenie z siecią i spróbuj ponownie.");
      if (command === "BRIGHTNESS") clearBrightnessDraft(output.id);
    } finally {
      setBusyOutputId(null);
    }
  }

  async function savePreferredPosition(output: LightingOutput) {
    setBusyOutputId(output.id);
    setError("");
    try {
      const response = await fetch("/api/waiter/lighting/preferred-position", {
        method: "PUT",
        credentials: "same-origin",
        headers: waiterSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ outputId: output.id }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (response.status === 401) {
        clearWaiterSessionToken();
        window.location.replace("/kelner");
        return;
      }
      if (!response.ok) setError(body.error ?? "Nie udało się zapamiętać pozycji ekranu.");
      else await load();
    } catch {
      setError("Tablet nie zdołał zapamiętać pozycji ekranu. Spróbuj ponownie.");
    } finally {
      setBusyOutputId(null);
    }
  }

  async function runScene(scene: LightingScene) {
    const delaySeconds = Math.min(3600, Math.max(0, Math.round(delayValue * (delayUnit === "MINUTES" ? 60 : 1))));
    setBusySceneId(scene.id);
    setError("");
    setSceneMessage("");
    try {
      const response = await fetch("/api/waiter/lighting/scenes", {
        method: "POST",
        credentials: "same-origin",
        headers: waiterSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ sceneId: scene.id, delaySeconds, idempotencyKey: createClientRequestId() }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; completesAt?: string };
      if (response.status === 401) {
        clearWaiterSessionToken();
        window.location.replace("/kelner");
        return;
      }
      if (!response.ok) setError(body.error ?? "Nie udało się uruchomić sceny.");
      else {
        const delayLabel = delaySeconds >= 60 && delaySeconds % 60 === 0 ? `${delaySeconds / 60} min` : `${delaySeconds} s`;
        const timing = delaySeconds === 0 ? "uruchamia się teraz" : `uruchomi się za ${delayLabel}`;
        const sequence = scene.sequenceDurationSeconds > 0 ? ` Sekwencja zakończy się w ciągu maks. ${scene.sequenceDurationSeconds} s od startu sceny.` : "";
        setSceneMessage(`Scena „${scene.name}” ${timing}.${sequence}`);
        window.setTimeout(() => void load(), Math.min(10_000, delaySeconds * 1000 + 2_000));
      }
    } catch {
      setError("Tablet nie zdołał zaplanować sceny. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setBusySceneId(null);
    }
  }

  function scheduleBrightness(output: LightingOutput, requestedValue: number) {
    const rounded = Math.round(requestedValue);
    const brightness = rounded === 0 ? 0 : Math.min(output.maxBrightness, Math.max(output.minBrightness, rounded));
    setBrightnessDrafts((current) => ({ ...current, [output.id]: brightness }));
    const previousTimer = brightnessTimers.current.get(output.id);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      brightnessTimers.current.delete(output.id);
      void sendCommand(output, "BRIGHTNESS", brightness);
    }, 450);
    brightnessTimers.current.set(output.id, timer);
  }

  return <main className="waiter-lighting-page">
    <WaiterSectionHeader eyebrow="Sterowanie światłem" title="Oświetlenie lokalu" employeeName={employee?.name}/>
    <section className={data?.bridge.online ? "waiter-lighting-connection is-online" : "waiter-lighting-connection is-offline"}>
      <div><span className="waiter-lighting-connection-dot"/><strong>{data?.bridge.online ? "System połączony" : "Brak połączenia z lokalnym sterownikiem"}</strong></div>
      <small>{data?.bridge.lastHeartbeatAt ? `Ostatni kontakt: ${freshness(data.bridge.lastHeartbeatAt)}` : "Oczekiwanie na pierwszy kontakt"}</small>
    </section>
    {error && <div className="waiter-lighting-message is-error">{error}</div>}
    {sceneMessage && <div className="waiter-lighting-message is-success">{sceneMessage}</div>}
    {forbidden ? <section className="waiter-lighting-empty"><strong>Brak uprawnienia</strong><p>Administrator musi włączyć dla Twojego konta uprawnienie „Sterowanie oświetleniem”.</p></section> : null}
    {!forbidden && data && !data.outputs.length ? <section className="waiter-lighting-empty"><strong>Nie skonfigurowano jeszcze punktów światła</strong><p>Administrator powinien zatwierdzić właściwe wyjścia BleBox i przypisać im nazwy oraz pomieszczenia.</p></section> : null}
    {!forbidden && groups.map(([room, outputs]) => {
      const desktopColumns = Math.min(outputs.length, 4);
      const tabletColumns = Math.min(outputs.length, 2);
      const hasDimmers = outputs.some((output) => output.dimmingAvailable);
      const cardWidth = outputs.some((output) => output.dimmingAvailable || output.shutterAvailable) ? 286 : 232;
      const effectiveCardWidth = outputs.length === 1 && hasDimmers ? 584 : cardWidth;
      const roomStyle = {
        "--lighting-room-columns": desktopColumns,
        "--lighting-room-tablet-columns": tabletColumns,
        "--lighting-room-width": `${desktopColumns * effectiveCardWidth + Math.max(0, desktopColumns - 1) * 12}px`,
        "--lighting-room-tablet-width": `${tabletColumns * effectiveCardWidth + Math.max(0, tabletColumns - 1) * 12}px`,
      } as CSSProperties;
      return <section className={`waiter-lighting-room${hasDimmers ? " has-dimmers" : ""}`} key={room} style={roomStyle}>
      <header><span>STREFA</span><h2>{room}</h2></header>
      <div className="waiter-lighting-grid">{outputs.map((output) => {
        const unavailable = !data?.bridge.online || output.stale || busyOutputId === output.id;
        const brightness = brightnessDrafts[output.id] ?? output.brightness ?? 0;
        const cardClassName = `waiter-lighting-card${output.isOn && !output.shutterAvailable ? " is-on" : ""}${output.dimmingAvailable ? " is-dimmer" : ""}${output.dimmingAvailable && desktopColumns > 1 ? " is-wide" : ""}${output.shutterAvailable ? " is-shutter" : ""}`;
        return <article className={cardClassName} key={output.id}>
          <div className="waiter-lighting-card-top"><span className="waiter-lighting-bulb" aria-hidden="true"/><span className={output.stale ? "waiter-lighting-reading is-stale" : "waiter-lighting-reading"}>{output.stale ? "Stan nieaktualny" : freshness(output.observedAt)}</span></div>
          <h3>{output.label}</h3>
          <p>{output.deviceName}</p>
          <strong className="waiter-lighting-state">{output.shutterAvailable ? output.motion === "UP" ? "Jedzie w górę" : output.motion === "DOWN" ? "Jedzie w dół" : output.motion === "STOPPED" ? "Zatrzymany" : "Stan nieznany" : output.isOn === null ? "Brak stanu" : output.isOn ? "Włączone" : "Wyłączone"}</strong>
          {output.shutterAvailable ? <div className="waiter-lighting-shutter">
            <div className="waiter-lighting-screen-position"><span style={{ height: `${output.position ?? 0}%` }}/><b>{output.position === null ? "—" : `${output.position}%`}</b><small>opuszczenia</small></div>
            <div className="waiter-lighting-shutter-controls"><button type="button" disabled={unavailable} onClick={() => void sendCommand(output, "SHUTTER_UP")}>↑ Góra</button><button type="button" className="is-stop" disabled={!data?.bridge.online || busyOutputId === output.id} onClick={() => void sendCommand(output, "SHUTTER_STOP")}>Stop</button><button type="button" disabled={unavailable} onClick={() => void sendCommand(output, "SHUTTER_DOWN")}>↓ Dół</button></div>
            <button type="button" className="waiter-lighting-work-position" disabled={unavailable || output.calibrated !== true} onClick={() => void sendCommand(output, "SHUTTER_POSITION", undefined, output.preferredPosition)}>Pozycja robocza · {output.preferredPosition}%</button>
            <button type="button" className="waiter-lighting-save-position" disabled={unavailable || output.calibrated !== true || output.motion !== "STOPPED" || output.position === null || output.position === output.preferredPosition} onClick={() => void savePreferredPosition(output)}>Zapamiętaj obecną pozycję</button>
            {output.calibrated !== true ? <small className="waiter-lighting-calibration-note">Pozycja procentowa wymaga jednorazowej kalibracji ekranu w aplikacji wBox.</small> : null}
          </div> : output.dimmingAvailable ? <div className="waiter-lighting-dimmer">
            <div><span>Natężenie światła</span><strong>{brightness}%</strong></div>
            {/* The ref-backed timer is read only after this input event fires. */}
            {/* eslint-disable-next-line react-hooks/refs */}
            <input type="range" min="0" max={output.maxBrightness} step="1" value={brightness} disabled={unavailable} aria-label={`Jasność: ${output.label}`} style={{ "--lighting-level": `${brightness}%` } as CSSProperties} onChange={(event) => { const value = Number(event.currentTarget.value); scheduleBrightness(output, value); }}/>
            <footer><button type="button" disabled={unavailable || brightness === 0} onClick={() => scheduleBrightness(output, 0)}>Wyłącz</button><button type="button" disabled={unavailable || brightness === output.maxBrightness} onClick={() => scheduleBrightness(output, output.maxBrightness)}>Pełna moc</button></footer>
          </div> : output.brightness !== null && !output.controlAvailable ? <span className="waiter-lighting-brightness">Jasność {output.brightness}%</span> : null}
          {output.lastError ? <small className="waiter-lighting-device-error">{output.lastError}</small> : null}
          {output.controlAvailable ? <div className="waiter-lighting-actions">
            <button type="button" disabled={unavailable || !output.controlAvailable || output.isOn === true} onClick={() => void sendCommand(output, "ON")}>Włącz</button>
            <button type="button" disabled={unavailable || !output.controlAvailable || output.isOn === false} onClick={() => void sendCommand(output, "OFF")}>Wyłącz</button>
          </div> : null}
        </article>;
      })}</div>
    </section>})}
    {!forbidden && data?.scenes.length ? <section className="waiter-lighting-scenes">
      <header><div><span>GOTOWE USTAWIENIA</span><h2>Sceny oświetlenia</h2><p>Wybierz scenę i zdecyduj, czy ma uruchomić się teraz, czy po krótkim czasie.</p></div><div className="waiter-lighting-delay"><label>Uruchom za<input type="number" min="0" max={delayUnit === "MINUTES" ? 60 : 3600} step="1" value={delayValue} onChange={(event) => setDelayValue(Math.min(delayUnit === "MINUTES" ? 60 : 3600, Math.max(0, Number(event.target.value) || 0)))}/></label><select aria-label="Jednostka opóźnienia" value={delayUnit} onChange={(event) => { const unit = event.target.value as "SECONDS" | "MINUTES"; setDelayUnit(unit); if (unit === "MINUTES") setDelayValue((value) => Math.min(60, value)); }}><option value="SECONDS">sekund</option><option value="MINUTES">minut</option></select></div></header>
      <div className="waiter-lighting-scene-groups">{sceneGroups.map((group) => <section className={group.global ? "waiter-lighting-scene-group is-global" : "waiter-lighting-scene-group"} key={group.key}><header><span>{group.global ? "CAŁY LOKAL" : "POMIESZCZENIE"}</span><strong>{group.name}</strong></header><div className="waiter-lighting-scene-buttons">{group.scenes.map((scene) => <button type="button" key={scene.id} disabled={!data.bridge.online || busySceneId !== null} onClick={() => void runScene(scene)}><em>SCENA</em><span>{busySceneId === scene.id ? "Uruchamiam…" : scene.name}</span><small>{scene.actionCount} {scene.actionCount === 1 ? "ustawienie" : "ustawień"}{scene.sequenceDurationSeconds > 0 ? ` · sekwencja ${scene.sequenceDurationSeconds} s` : ""}</small></button>)}</div></section>)}</div>
    </section> : null}
    {!data && !forbidden && !error ? <section className="waiter-lighting-empty"><strong>Ładuję stan oświetlenia…</strong></section> : null}
  </main>;
}
