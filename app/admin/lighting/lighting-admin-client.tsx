"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AdminSectionHeader from "../admin-section-header";

type Bridge = { id: number; name: string; active: boolean; agentVersion: string | null; lastHeartbeatAt: string | null; lastError: string | null };
type Device = { id: number; bridgeId: number; stableId: string; name: string; host: string; apiType: string; apiLevel: string | null; firmwareVersion: string | null; channels: string[]; active: boolean; lastSeenAt: string | null; lastError: string | null };
type Capabilities = { onOff: boolean; dimming: boolean; rgbw?: boolean };
type Output = { id: number; deviceId: number; channel: string; label: string; roomId: number | null; capabilities: Capabilities; minBrightness: number; maxBrightness: number; active: boolean; isOn: boolean | null; brightness: number | null; observedAt: string | null; quality: string | null; lastError: string | null };
type Room = { id: number; name: string; sortOrder: number; active: boolean };
type Draft = Pick<Output, "label" | "roomId" | "active">;

function relativeTime(value: string | null, now: number) {
  if (!value) return "brak odczytu";
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s temu`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min temu`;
  return `${Math.round(seconds / 3600)} godz. temu`;
}

export default function LightingAdminClient() {
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/lighting/config", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { bridges?: Bridge[]; devices?: Device[]; outputs?: Output[]; rooms?: Room[]; error?: string };
    if (!response.ok) return setError(body.error ?? "Nie udało się pobrać konfiguracji oświetlenia.");
    const nextOutputs = body.outputs ?? [];
    setBridges(body.bridges ?? []); setDevices(body.devices ?? []); setOutputs(nextOutputs); setRooms(body.rooms ?? []);
    setDrafts(Object.fromEntries(nextOutputs.map((output) => [output.id, { label: output.label, roomId: output.roomId, active: output.active }])));
    setNow(Date.now());
  }, []);

  // Initial hydration from the administrator-only endpoint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 20_000); return () => window.clearInterval(timer); }, [load]);

  const outputsByDevice = useMemo(() => {
    const grouped = new Map<number, Output[]>();
    for (const output of outputs) grouped.set(output.deviceId, [...(grouped.get(output.deviceId) ?? []), output]);
    return grouped;
  }, [outputs]);
  const bridge = bridges[0];
  const bridgeOnline = Boolean(bridge?.lastHeartbeatAt && now - new Date(bridge.lastHeartbeatAt).getTime() <= 60_000);
  const approvedCount = outputs.filter((output) => output.active).length;

  async function saveOutput(output: Output) {
    const draft = drafts[output.id];
    if (!draft) return;
    setBusy(`output:${output.id}`); setError(""); setMessage("");
    const response = await fetch("/api/admin/lighting/config", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ outputId: output.id, ...draft }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać punktu.");
    else { setMessage(`Zapisano punkt „${draft.label}”.`); await load(); }
    setBusy("");
  }

  async function addRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("room"); setError(""); setMessage("");
    const response = await fetch("/api/admin/lighting/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: String(data.get("name") ?? "") }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się dodać pomieszczenia.");
    else { form.reset(); setMessage("Pomieszczenie zostało dodane."); await load(); }
    setBusy("");
  }

  return <main className="admin-dashboard lighting-admin-page">
    <AdminSectionHeader eyebrow="Automatyka Atelier" title="Konfiguracja oświetlenia" links={[{ href: "/admin/waiters", label: "Uprawnienia pracowników" }, { href: "/kelner/oswietlenie", label: "Podgląd pracownika" }]}/>
    {(message || error) && <div className={error ? "admin-status is-error" : "admin-status"}>{error || message}</div>}
    <section className="lighting-admin-summary">
      <article className={bridgeOnline ? "is-online" : "is-offline"}><span>Agent lokalny</span><strong>{bridgeOnline ? "Połączony" : "Brak połączenia"}</strong><small>{bridge?.lastHeartbeatAt ? `Ostatni sygnał: ${relativeTime(bridge.lastHeartbeatAt, now)}` : "Agent nie wysłał jeszcze heartbeat"}</small></article>
      <article><span>Urządzenia BleBox</span><strong>{devices.length}</strong><small>Wykrywane automatycznie w sieci Atelier</small></article>
      <article><span>Kanały wyjściowe</span><strong>{outputs.length}</strong><small>Nie każdy kanał jest oświetleniem</small></article>
      <article><span>Zatwierdzone światła</span><strong>{approvedCount}</strong><small>Widoczne dla uprawnionych pracowników</small></article>
    </section>
    <section className="lighting-admin-intro"><div><span>BEZPIECZNA KONFIGURACJA</span><h2>Najpierw zatwierdź rzeczywiste lampy</h2><p>Agent wykrywa wszystkie urządzenia, także głośniki, zapach, ekran i urządzenia gastronomiczne. Włączaj wyłącznie kanały, które fizycznie sterują światłem. Zmiana adresu IP nie wymaga ponownego dodawania — urządzenie rozpoznajemy po stałym identyfikatorze.</p></div><form onSubmit={addRoom}><label>Nazwa nowego pomieszczenia<input name="name" required maxLength={80} placeholder="np. Kawiarnia, Atelier, Biuro"/></label><button className="admin-primary" disabled={busy === "room"}>{busy === "room" ? "Dodaję…" : "Dodaj pomieszczenie"}</button></form></section>
    <section className="lighting-device-list">
      {devices.map((device) => {
        const deviceOutputs = outputsByDevice.get(device.id) ?? [];
        return <article className="lighting-device-card" key={device.id}>
          <header><div><span>{device.apiType} · API {device.apiLevel ?? "—"}</span><h2>{device.name}</h2><p>{device.host} · ID {device.stableId} · firmware {device.firmwareVersion ?? "—"}</p></div><div className={device.lastSeenAt && now - new Date(device.lastSeenAt).getTime() < 15 * 60_000 ? "is-seen" : "is-missing"}>{relativeTime(device.lastSeenAt, now)}</div></header>
          {!deviceOutputs.length ? <p className="lighting-device-excluded">Urządzenie nie udostępnia kanałów oświetleniowych i pozostaje wykluczone ze sterowania.</p> : <div className="lighting-output-list">{deviceOutputs.map((output) => {
            const draft = drafts[output.id] ?? { label: output.label, roomId: output.roomId, active: output.active };
            return <section className={draft.active ? "lighting-output is-approved" : "lighting-output"} key={output.id}>
              <label className="lighting-approval"><input type="checkbox" checked={draft.active} onChange={(event) => setDrafts((current) => ({ ...current, [output.id]: { ...draft, active: event.target.checked } }))}/><span><b>{draft.active ? "Zatwierdzony punkt światła" : "Niezatwierdzony kanał"}</b><small>{output.channel} · {output.capabilities.dimming ? "ściemnianie" : "włącz / wyłącz"}</small></span></label>
              <label>Nazwa w panelu<input value={draft.label} maxLength={120} onChange={(event) => setDrafts((current) => ({ ...current, [output.id]: { ...draft, label: event.target.value } }))}/></label>
              <label>Pomieszczenie<select value={draft.roomId ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [output.id]: { ...draft, roomId: event.target.value ? Number(event.target.value) : null } }))}><option value="">Bez pomieszczenia</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}</select></label>
              <div className="lighting-output-state"><span className={output.isOn ? "is-on" : "is-off"}>{output.isOn === null ? "Brak stanu" : output.isOn ? "Włączone" : "Wyłączone"}</span><small>{output.observedAt ? relativeTime(output.observedAt, now) : "czekam na odczyt"}</small></div>
              <button className="admin-primary" disabled={busy === `output:${output.id}` || !draft.label.trim()} onClick={() => void saveOutput(output)}>{busy === `output:${output.id}` ? "Zapisuję…" : "Zapisz"}</button>
            </section>;
          })}</div>}
        </article>;
      })}
      {!devices.length && <div className="lighting-admin-empty"><strong>Czekam na pierwszą inwentaryzację agenta</strong><span>Urządzenia pojawią się automatycznie po połączeniu lokalnej usługi BleBox.</span></div>}
    </section>
  </main>;
}
