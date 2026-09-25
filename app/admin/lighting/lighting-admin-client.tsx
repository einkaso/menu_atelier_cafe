"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AdminSectionHeader from "../admin-section-header";

type Bridge = { id: number; name: string; active: boolean; agentVersion: string | null; lastHeartbeatAt: string | null; lastError: string | null };
type Device = { id: number; bridgeId: number; stableId: string; name: string; host: string; apiType: string; apiLevel: string | null; firmwareVersion: string | null; channels: string[]; active: boolean; lastSeenAt: string | null; lastError: string | null };
type Capabilities = { onOff: boolean; dimming: boolean; rgbw?: boolean; shutter?: boolean };
type Output = { id: number; deviceId: number; channel: string; label: string; roomId: number | null; capabilities: Capabilities; minBrightness: number; maxBrightness: number; preferredPosition: number; active: boolean; isOn: boolean | null; brightness: number | null; position: number | null; motion: string | null; calibrated: boolean | null; observedAt: string | null; quality: string | null; lastError: string | null };
type Room = { id: number; name: string; sortOrder: number; active: boolean };
type Draft = Pick<Output, "label" | "roomId" | "active">;
type SceneAction = { id: number; sceneId: number; outputId: number; outputLabel: string; roomName: string | null; command: "ON" | "OFF" | "BRIGHTNESS"; brightness: number | null; fadeDurationMs: number };
type Scene = { id: number; name: string; sortOrder: number; active: boolean; actions: SceneAction[] };
type SceneActionDraft = { command: "KEEP" | "ON" | "OFF" | "BRIGHTNESS"; brightness: number; fadeDurationSeconds: number };

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
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [sceneName, setSceneName] = useState("");
  const [editingSceneId, setEditingSceneId] = useState<number | null>(null);
  const [sceneDrafts, setSceneDrafts] = useState<Record<number, SceneActionDraft>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const [response, scenesResponse] = await Promise.all([fetch("/api/admin/lighting/config", { cache: "no-store" }), fetch("/api/admin/lighting/scenes", { cache: "no-store" })]);
    const body = await response.json().catch(() => ({})) as { bridges?: Bridge[]; devices?: Device[]; outputs?: Output[]; rooms?: Room[]; error?: string };
    const scenesBody = await scenesResponse.json().catch(() => ({})) as { scenes?: Scene[]; error?: string };
    if (!response.ok || !scenesResponse.ok) return setError(body.error ?? scenesBody.error ?? "Nie udało się pobrać konfiguracji oświetlenia.");
    const nextOutputs = body.outputs ?? [];
    setBridges(body.bridges ?? []); setDevices(body.devices ?? []); setOutputs(nextOutputs); setRooms(body.rooms ?? []); setScenes(scenesBody.scenes ?? []);
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
  const sceneOutputs = useMemo(() => outputs.filter((output) => {
    if (!output.active || output.capabilities.shutter) return false;
    const adapter = devices.find((device) => device.id === output.deviceId)?.apiType;
    return adapter === "relay" || adapter === "dimmer";
  }), [devices, outputs]);
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

  function resetSceneEditor() {
    setEditingSceneId(null);
    setSceneName("");
    setSceneDrafts({});
  }

  function editScene(scene: Scene) {
    setEditingSceneId(scene.id);
    setSceneName(scene.name);
    setSceneDrafts(Object.fromEntries(scene.actions.map((action) => [action.outputId, {
      command: action.command,
      brightness: action.brightness ?? 0,
      fadeDurationSeconds: Math.round(action.fadeDurationMs / 1000),
    }])));
    window.setTimeout(() => document.querySelector(".lighting-scene-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function updateSceneDraft(output: Output, patch: Partial<SceneActionDraft>) {
    const current = sceneDrafts[output.id] ?? { command: "KEEP", brightness: output.brightness ?? output.maxBrightness, fadeDurationSeconds: 0 };
    setSceneDrafts((drafts) => ({ ...drafts, [output.id]: { ...current, ...patch } }));
  }

  async function saveScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const actions = sceneOutputs.flatMap((output) => {
      const draft = sceneDrafts[output.id];
      if (!draft || draft.command === "KEEP") return [];
      return [{ outputId: output.id, command: draft.command, brightness: draft.command === "BRIGHTNESS" ? draft.brightness : null, fadeDurationSeconds: draft.command === "BRIGHTNESS" ? draft.fadeDurationSeconds : 0 }];
    });
    if (!sceneName.trim() || !actions.length) { setError("Podaj nazwę sceny i ustaw co najmniej jedną lampę."); return; }
    setBusy("scene"); setError(""); setMessage("");
    const response = await fetch("/api/admin/lighting/scenes", { method: editingSceneId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editingSceneId ?? undefined, name: sceneName, actions }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać sceny.");
    else { setMessage(`Scena „${sceneName.trim()}” została zapisana.`); resetSceneEditor(); await load(); }
    setBusy("");
  }

  async function deleteScene(scene: Scene) {
    if (!window.confirm(`Usunąć scenę „${scene.name}”?`)) return;
    setBusy(`scene-delete:${scene.id}`); setError(""); setMessage("");
    const response = await fetch("/api/admin/lighting/scenes", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: scene.id }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się usunąć sceny.");
    else { if (editingSceneId === scene.id) resetSceneEditor(); setMessage(`Scena „${scene.name}” została usunięta.`); await load(); }
    setBusy("");
  }

  return <main className="admin-dashboard lighting-admin-page">
    <AdminSectionHeader eyebrow="Automatyka Atelier" title="Konfiguracja oświetlenia" links={[{ href: "/admin/waiters", label: "Uprawnienia pracowników" }, { href: "/kelner/oswietlenie", label: "Podgląd pracownika" }]}/>
    {(message || error) && <div className={error ? "admin-status is-error" : "admin-status"}>{error || message}</div>}
    <section className="lighting-admin-summary">
      <article className={bridgeOnline ? "is-online" : "is-offline"}><span>Agent lokalny</span><strong>{bridgeOnline ? "Połączony" : "Brak połączenia"}</strong><small>{bridge?.lastHeartbeatAt ? `Ostatni sygnał: ${relativeTime(bridge.lastHeartbeatAt, now)}` : "Agent nie wysłał jeszcze heartbeat"}</small></article>
      <article><span>Urządzenia BleBox</span><strong>{devices.length}</strong><small>Wykrywane automatycznie w sieci Atelier</small></article>
      <article><span>Kanały wyjściowe</span><strong>{outputs.length}</strong><small>Nie każdy kanał jest oświetleniem</small></article>
      <article><span>Zatwierdzone urządzenia</span><strong>{approvedCount}</strong><small>Widoczne dla uprawnionych pracowników</small></article>
    </section>
    <section className="lighting-admin-intro"><div><span>BEZPIECZNA KONFIGURACJA</span><h2>Najpierw zatwierdź rzeczywiste urządzenia</h2><p>Agent wykrywa urządzenia BleBox w sieci. Zatwierdzaj wyłącznie właściwe lampy, ściemniacze i ekran. Zmiana adresu IP nie wymaga ponownego dodawania — urządzenie rozpoznajemy po stałym identyfikatorze.</p></div><form onSubmit={addRoom}><label>Nazwa nowego pomieszczenia<input name="name" required maxLength={80} placeholder="np. Kawiarnia, Atelier, Biuro"/></label><button className="admin-primary" disabled={busy === "room"}>{busy === "room" ? "Dodaję…" : "Dodaj pomieszczenie"}</button></form></section>
    <section className="lighting-scenes-admin">
      <header><div><span>SCENY OŚWIETLENIA</span><h2>Jednym przyciskiem ustaw cały lokal</h2><p>Zapisz stan wybranych lamp. Przy ściemniaczach możesz określić czas łagodnego przejścia do nowej jasności.</p></div><button type="button" className="admin-primary" onClick={resetSceneEditor}>Nowa scena</button></header>
      {scenes.length ? <div className="lighting-scene-list">{scenes.map((scene) => <article key={scene.id}><div><strong>{scene.name}</strong><small>{scene.actions.length} {scene.actions.length === 1 ? "ustawienie" : "ustawień"}{Math.max(0, ...scene.actions.map((action) => action.fadeDurationMs)) > 0 ? ` · przejście do ${Math.round(Math.max(...scene.actions.map((action) => action.fadeDurationMs)) / 1000)} s` : ""}</small></div><div><button type="button" onClick={() => editScene(scene)}>Edytuj</button><button type="button" className="is-delete" disabled={busy === `scene-delete:${scene.id}`} onClick={() => void deleteScene(scene)}>{busy === `scene-delete:${scene.id}` ? "Usuwam…" : "Usuń"}</button></div></article>)}</div> : <div className="lighting-scene-empty">Nie ma jeszcze scen. Zacznij od „Dzień”, „Wieczór” albo „Zamknięty lokal”.</div>}
      <form className="lighting-scene-editor" onSubmit={saveScene}>
        <div className="lighting-scene-editor-heading"><label>Nazwa sceny<input value={sceneName} maxLength={60} required placeholder="np. Wieczór" onChange={(event) => setSceneName(event.target.value)}/></label><div><span>Szybka nazwa</span>{["Dzień", "Wieczór", "Zamknięty lokal"].map((name) => <button type="button" key={name} onClick={() => setSceneName(name)}>{name}</button>)}</div></div>
        <div className="lighting-scene-output-list">{sceneOutputs.map((output) => {
          const draft = sceneDrafts[output.id] ?? { command: "KEEP", brightness: output.brightness ?? output.maxBrightness, fadeDurationSeconds: 0 };
          return <article key={output.id}><div><strong>{output.label}</strong><small>{rooms.find((room) => room.id === output.roomId)?.name ?? "Bez pomieszczenia"} · {output.capabilities.dimming ? "ściemniacz" : "włącz / wyłącz"}</small></div><label>Ustawienie<select value={draft.command} onChange={(event) => updateSceneDraft(output, { command: event.target.value as SceneActionDraft["command"] })}><option value="KEEP">Bez zmiany</option>{output.capabilities.dimming ? <option value="BRIGHTNESS">Ustaw jasność</option> : <><option value="ON">Włącz</option><option value="OFF">Wyłącz</option></>}</select></label>{output.capabilities.dimming && draft.command === "BRIGHTNESS" ? <><label>Jasność <b>{draft.brightness}%</b><input type="range" min="0" max={output.maxBrightness} value={draft.brightness} onChange={(event) => { const value = Number(event.target.value); updateSceneDraft(output, { brightness: value === 0 ? 0 : Math.max(output.minBrightness, value) }); }}/></label><label>Czas przejścia<input type="number" min="0" max="300" step="1" value={draft.fadeDurationSeconds} onChange={(event) => updateSceneDraft(output, { fadeDurationSeconds: Math.max(0, Math.min(300, Number(event.target.value) || 0)) })}/><small>sekundy · 0 oznacza natychmiast</small></label></> : null}</article>;
        })}</div>
        {!sceneOutputs.length ? <p className="lighting-scene-no-outputs">Najpierw zatwierdź co najmniej jeden punkt światła.</p> : null}
        <footer><button type="submit" className="admin-primary" disabled={busy === "scene"}>{busy === "scene" ? "Zapisuję…" : editingSceneId ? "Zapisz zmiany sceny" : "Dodaj scenę"}</button>{editingSceneId ? <button type="button" onClick={resetSceneEditor}>Anuluj edycję</button> : null}</footer>
      </form>
    </section>
    <section className="lighting-device-list">
      {devices.map((device) => {
        const deviceOutputs = outputsByDevice.get(device.id) ?? [];
        return <article className="lighting-device-card" key={device.id}>
          <header><div><span>{device.apiType} · API {device.apiLevel ?? "—"}</span><h2>{device.name}</h2><p>{device.host} · ID {device.stableId} · firmware {device.firmwareVersion ?? "—"}</p></div><div className={device.lastSeenAt && now - new Date(device.lastSeenAt).getTime() < 15 * 60_000 ? "is-seen" : "is-missing"}>{relativeTime(device.lastSeenAt, now)}</div></header>
          {!deviceOutputs.length ? <p className="lighting-device-excluded">Urządzenie nie udostępnia kanałów oświetleniowych i pozostaje wykluczone ze sterowania.</p> : <div className="lighting-output-list">{deviceOutputs.map((output) => {
            const draft = drafts[output.id] ?? { label: output.label, roomId: output.roomId, active: output.active };
            return <section className={draft.active ? "lighting-output is-approved" : "lighting-output"} key={output.id}>
              <label className="lighting-approval"><input type="checkbox" checked={draft.active} onChange={(event) => setDrafts((current) => ({ ...current, [output.id]: { ...draft, active: event.target.checked } }))}/><span><b>{draft.active ? "Zatwierdzone urządzenie" : "Niezatwierdzony kanał"}</b><small>{output.channel} · {output.capabilities.shutter ? "ekran góra / dół / stop" : output.capabilities.dimming ? "ściemnianie" : "włącz / wyłącz"}</small></span></label>
              <label>Nazwa w panelu<input value={draft.label} maxLength={120} onChange={(event) => setDrafts((current) => ({ ...current, [output.id]: { ...draft, label: event.target.value } }))}/></label>
              <label>Pomieszczenie<select value={draft.roomId ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [output.id]: { ...draft, roomId: event.target.value ? Number(event.target.value) : null } }))}><option value="">Bez pomieszczenia</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}</select></label>
              <div className="lighting-output-state"><span className={output.isOn ? "is-on" : "is-off"}>{output.capabilities.shutter ? output.position === null ? "Brak pozycji" : `Opuszczenie ${output.position}%` : output.isOn === null ? "Brak stanu" : output.isOn ? "Włączone" : "Wyłączone"}</span><small>{output.observedAt ? relativeTime(output.observedAt, now) : "czekam na odczyt"}</small></div>
              <button className="admin-primary" disabled={busy === `output:${output.id}` || !draft.label.trim()} onClick={() => void saveOutput(output)}>{busy === `output:${output.id}` ? "Zapisuję…" : "Zapisz"}</button>
            </section>;
          })}</div>}
        </article>;
      })}
      {!devices.length && <div className="lighting-admin-empty"><strong>Czekam na pierwszą inwentaryzację agenta</strong><span>Urządzenia pojawią się automatycznie po połączeniu lokalnej usługi BleBox.</span></div>}
    </section>
  </main>;
}
