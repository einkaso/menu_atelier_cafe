"use client";

import { useCallback, useEffect, useState } from "react";
import { WaiterSectionHeader } from "../staff-navigation";
import { clearWaiterSessionToken, waiterSessionHeaders } from "../waiter-session-client";

type Room = { id: number; name: string; battery: number | null; hasGateway: boolean; state: "LOCKED" | "UNLOCKED" | "LOCKING" | "UNLOCKING" | "UNKNOWN" };
type RoomsResponse = { configured?: boolean; rooms?: Room[]; employeeName?: string; error?: string };
const stateLabel = { LOCKED: "Zamknięte", UNLOCKED: "Otwarte", LOCKING: "Zamykanie…", UNLOCKING: "Otwieranie…", UNKNOWN: "Stan nieznany" } as const;

export default function RoomsEmployeeClient() {
  const [data, setData] = useState<RoomsResponse | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/waiter/rooms", { cache: "no-store", headers: waiterSessionHeaders() });
    const body = await response.json().catch(() => ({})) as RoomsResponse;
    if (response.status === 401) { clearWaiterSessionToken(); window.location.replace("/kelner"); return; }
    if (response.status === 403) { setForbidden(true); setError(body.error ?? "Brak uprawnienia do pomieszczeń."); return; }
    if (!response.ok) { setError(body.error ?? "Nie udało się pobrać stanu zamków."); return; }
    setForbidden(false); setError(""); setData(body);
  }, []);

  useEffect(() => {
    // Initial permission check and current lock state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function command(room: Room, action: "LOCK" | "UNLOCK") {
    const wording = action === "UNLOCK" ? "OTWORZYĆ" : "ZAMKNĄĆ";
    if (!window.confirm(`${wording} „${room.name}”?\n\nPolecenie wykona się natychmiast i zostanie zapisane z Twoim nazwiskiem.`)) return;
    setBusy(room.id); setError("");
    const response = await fetch("/api/waiter/rooms", { method: "POST", credentials: "same-origin", headers: waiterSessionHeaders({ "content-type": "application/json" }), body: JSON.stringify({ lockId: room.id, action }) }).catch(() => null);
    const body = await response?.json().catch(() => ({})) as { error?: string; state?: Room["state"] } | undefined;
    if (response?.status === 401) { clearWaiterSessionToken(); window.location.replace("/kelner"); return; }
    if (!response?.ok) setError(body?.error ?? "Nie udało się wysłać polecenia do zamka.");
    else {
      setData((current) => current ? { ...current, rooms: current.rooms?.map((item) => item.id === room.id ? { ...item, state: body?.state ?? "UNKNOWN" } : item) } : current);
      window.setTimeout(() => void load(), 1_500);
    }
    setBusy(null);
  }

  return <main className="waiter-rooms-page">
    <WaiterSectionHeader eyebrow="Dostęp do lokalu" title="Pomieszczenia" employeeName={data?.employeeName}/>
    <section className="waiter-rooms-intro"><span>TTLOCK · STEROWANIE PRZEZ BRAMKĘ</span><h1>Wybierz pomieszczenie</h1><p>Stan zamków odświeża się automatycznie. Przed wykonaniem polecenia system zawsze poprosi Cię o potwierdzenie.</p></section>
    {error && <div className="waiter-rooms-message is-error" role="alert">{error}</div>}
    {forbidden && <section className="waiter-rooms-empty"><strong>Brak uprawnienia</strong><p>Administrator musi nadać Ci osobne uprawnienie „Pomieszczenia”.</p></section>}
    {!forbidden && data?.configured === false && <section className="waiter-rooms-empty"><strong>System zamków nie jest jeszcze skonfigurowany</strong><p>Administrator musi połączyć konto TTLock na serwerze.</p></section>}
    <section className="waiter-rooms-grid">{data?.rooms?.map((room) => <article className={`waiter-room-card is-${room.state.toLowerCase()}`} key={room.id}>
      <header><span>{room.state === "UNLOCKED" ? "OTWARTE" : "POMIESZCZENIE"}</span><i className={room.hasGateway ? "is-online" : ""}>{room.hasGateway ? "Bramka" : "Offline"}</i></header>
      <h2>{room.name}</h2><strong>{stateLabel[room.state]}</strong><small>{room.battery === null ? "Bateria: brak odczytu" : `Bateria: ${room.battery}%`}</small>
      <div><button type="button" disabled={!room.hasGateway || busy === room.id || room.state === "UNLOCKED"} onClick={() => void command(room, "UNLOCK")}>Otwórz</button><button type="button" disabled={!room.hasGateway || busy === room.id || room.state === "LOCKED"} onClick={() => void command(room, "LOCK")}>Zamknij</button></div>
    </article>)}</section>
    {!data && !forbidden && !error && <section className="waiter-rooms-empty"><strong>Sprawdzam zamki…</strong></section>}
  </main>;
}
