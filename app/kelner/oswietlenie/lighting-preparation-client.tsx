"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { clearWaiterSessionToken, createClientRequestId, waiterSessionHeaders } from "../waiter-session-client";
import { WaiterSectionHeader } from "../staff-navigation";

type Employee = { name: string };
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
  lastError: string | null;
};
type LightingResponse = {
  bridge: { online: boolean; lastHeartbeatAt: string | null; error: string | null };
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

  const groups = useMemo(() => {
    const result = new Map<string, LightingOutput[]>();
    for (const output of data?.outputs ?? []) {
      const room = output.roomName || "Bez przypisanego pomieszczenia";
      result.set(room, [...(result.get(room) ?? []), output]);
    }
    return [...result.entries()];
  }, [data]);

  async function sendCommand(output: LightingOutput, command: "ON" | "OFF") {
    setBusyOutputId(output.id);
    setError("");
    try {
      const response = await fetch("/api/waiter/lighting/commands", {
        method: "POST",
        credentials: "same-origin",
        headers: waiterSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ outputId: output.id, command, idempotencyKey: createClientRequestId() }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (response.status === 401) {
        clearWaiterSessionToken();
        window.location.replace("/kelner");
        return;
      }
      if (!response.ok) setError(body.error ?? "Nie udało się wysłać polecenia.");
      else window.setTimeout(() => void load(), 1_000);
    } catch {
      setError("Tablet nie zdołał wysłać polecenia. Sprawdź połączenie z siecią i spróbuj ponownie.");
    } finally {
      setBusyOutputId(null);
    }
  }

  return <main className="waiter-lighting-page">
    <WaiterSectionHeader eyebrow="Sterowanie światłem" title="Oświetlenie lokalu" employeeName={employee?.name}/>
    <section className={data?.bridge.online ? "waiter-lighting-connection is-online" : "waiter-lighting-connection is-offline"}>
      <div><span className="waiter-lighting-connection-dot"/><strong>{data?.bridge.online ? "System połączony" : "Brak połączenia z lokalnym sterownikiem"}</strong></div>
      <small>{data?.bridge.lastHeartbeatAt ? `Ostatni kontakt: ${freshness(data.bridge.lastHeartbeatAt)}` : "Oczekiwanie na pierwszy kontakt"}</small>
    </section>
    {error && <div className="waiter-lighting-message is-error">{error}</div>}
    {forbidden ? <section className="waiter-lighting-empty"><strong>Brak uprawnienia</strong><p>Administrator musi włączyć dla Twojego konta uprawnienie „Sterowanie oświetleniem”.</p></section> : null}
    {!forbidden && data && !data.outputs.length ? <section className="waiter-lighting-empty"><strong>Nie skonfigurowano jeszcze punktów światła</strong><p>Administrator powinien zatwierdzić właściwe wyjścia BleBox i przypisać im nazwy oraz pomieszczenia.</p></section> : null}
    {!forbidden && groups.map(([room, outputs]) => {
      const desktopColumns = Math.min(outputs.length, 4);
      const tabletColumns = Math.min(outputs.length, 2);
      const roomStyle = {
        "--lighting-room-columns": desktopColumns,
        "--lighting-room-tablet-columns": tabletColumns,
        "--lighting-room-width": `${desktopColumns * 232 + Math.max(0, desktopColumns - 1) * 12}px`,
        "--lighting-room-tablet-width": `${tabletColumns * 232 + Math.max(0, tabletColumns - 1) * 12}px`,
      } as CSSProperties;
      return <section className="waiter-lighting-room" key={room} style={roomStyle}>
      <header><span>STREFA</span><h2>{room}</h2></header>
      <div className="waiter-lighting-grid">{outputs.map((output) => {
        const unavailable = !data?.bridge.online || output.stale || busyOutputId === output.id;
        return <article className={output.isOn ? "waiter-lighting-card is-on" : "waiter-lighting-card"} key={output.id}>
          <div className="waiter-lighting-card-top"><span className="waiter-lighting-bulb" aria-hidden="true"/><span className={output.stale ? "waiter-lighting-reading is-stale" : "waiter-lighting-reading"}>{output.stale ? "Stan nieaktualny" : freshness(output.observedAt)}</span></div>
          <h3>{output.label}</h3>
          <p>{output.deviceName}</p>
          <strong className="waiter-lighting-state">{output.isOn === null ? "Brak stanu" : output.isOn ? "Włączone" : "Wyłączone"}</strong>
          {output.brightness !== null && !output.controlAvailable ? <span className="waiter-lighting-brightness">Jasność {output.brightness}% · regulacja po teście pilotażowym</span> : null}
          {output.lastError ? <small className="waiter-lighting-device-error">{output.lastError}</small> : null}
          <div className="waiter-lighting-actions">
            <button type="button" disabled={unavailable || !output.controlAvailable || output.isOn === true} onClick={() => void sendCommand(output, "ON")}>Włącz</button>
            <button type="button" disabled={unavailable || !output.controlAvailable || output.isOn === false} onClick={() => void sendCommand(output, "OFF")}>Wyłącz</button>
          </div>
        </article>;
      })}</div>
    </section>})}
    {!data && !forbidden && !error ? <section className="waiter-lighting-empty"><strong>Ładuję stan oświetlenia…</strong></section> : null}
  </main>;
}
