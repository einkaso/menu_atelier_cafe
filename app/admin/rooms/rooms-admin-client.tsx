"use client";

import { useCallback, useEffect, useState } from "react";
import AdminSectionHeader from "../admin-section-header";

type Room = { id: number; name: string; battery: number | null; hasGateway: boolean; state: "LOCKED" | "UNLOCKED" | "LOCKING" | "UNLOCKING" | "UNKNOWN" };
type Employee = { dotykackaId: string; name: string; canControlRooms: boolean };
type LockPermission = { employeeDotykackaId: string; lockId: string };
type RoomsResponse = { configured?: boolean; rooms?: Room[]; employees?: Employee[]; permissions?: LockPermission[]; error?: string };

const stateLabel = { LOCKED: "Zamknięte", UNLOCKED: "Otwarte", LOCKING: "Zamykanie…", UNLOCKING: "Otwieranie…", UNKNOWN: "Stan nieznany" } as const;

export default function RoomsAdminClient() {
  const [data, setData] = useState<RoomsResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [permissionBusy, setPermissionBusy] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/rooms", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as RoomsResponse;
    if (!response.ok) return setError(body.error ?? "Nie udało się połączyć z TTLock.");
    setData(body);
    setSelectedEmployeeId((current) => body.employees?.some((employee) => employee.dotykackaId === current)
      ? current
      : body.employees?.[0]?.dotykackaId ?? "");
    setError("");
  }, []);

  useEffect(() => {
    // Initial connection check and a conservative refresh of gateway state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function command(room: Room, action: "LOCK" | "UNLOCK") {
    setBusy(room.id); setError("");
    const response = await fetch("/api/admin/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lockId: room.id, action }) }).catch(() => null);
    const body = await response?.json().catch(() => ({})) as { error?: string; state?: Room["state"] } | undefined;
    if (!response?.ok) setError(body?.error ?? "Nie udało się wysłać polecenia do zamka.");
    else {
      setData((current) => current ? { ...current, rooms: current.rooms?.map((item) => item.id === room.id ? { ...item, state: body?.state ?? "UNKNOWN" } : item) } : current);
      window.setTimeout(() => void load(), 1_500);
    }
    setBusy(null);
  }

  async function setPermission(employee: Employee, room: Room, enabled: boolean) {
    const key = `${employee.dotykackaId}:${room.id}`;
    setPermissionBusy(key); setError("");
    const response = await fetch("/api/admin/rooms/permissions", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeDotykackaId: employee.dotykackaId, lockId: room.id, enabled }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({})) as { error?: string } | undefined;
    if (!response?.ok) setError(body?.error ?? "Nie udało się zapisać uprawnienia do zamka.");
    else setData((current) => {
      if (!current) return current;
      const permissions = (current.permissions ?? []).filter((permission) => !(permission.employeeDotykackaId === employee.dotykackaId && permission.lockId === String(room.id)));
      if (enabled) permissions.push({ employeeDotykackaId: employee.dotykackaId, lockId: String(room.id) });
      return {
        ...current,
        permissions,
        employees: current.employees?.map((item) => item.dotykackaId === employee.dotykackaId && enabled ? { ...item, canControlRooms: true } : item),
      };
    });
    setPermissionBusy("");
  }

  const selectedEmployee = data?.employees?.find((employee) => employee.dotykackaId === selectedEmployeeId);

  return <main className="rooms-admin-page">
    <AdminSectionHeader eyebrow="Dostęp do lokalu" title="Pomieszczenia" links={[{ href: "/admin/waiters", label: "Uprawnienia" }]}/>
    <section className="rooms-admin-intro">
      <div><span>TTLOCK · BRAMKA INTERNETOWA</span><h2>Zamki i dostęp do pomieszczeń</h2><p>Sterowanie odbywa się przez serwer. Dane TTLock nie są przekazywane do tabletu, a każda próba otwarcia lub zamknięcia trafia do historii.</p></div>
      <button type="button" onClick={() => void load()}>Odśwież stan</button>
    </section>
    {error && <div className="rooms-message is-error" role="alert">{error}</div>}
    {data?.configured === false && <section className="rooms-setup"><strong>Połączenie TTLock czeka na konfigurację</strong><p>Na serwerze ustaw <code>TTLOCK_CLIENT_ID</code> i <code>TTLOCK_ACCESS_TOKEN</code>. W aplikacji TTLock włącz zdalne otwieranie dla właściwych zamków.</p></section>}
    {data?.configured && data.rooms?.length === 0 && <section className="rooms-setup"><strong>Brak zamków na koncie</strong><p>Sprawdź, czy token ma dostęp do właściwego konta TTLock i czy zamki zostały dodane do bramki.</p></section>}
    {data?.configured && data.rooms && data.rooms.length > 0 && <section className="rooms-permissions">
      <header><div><span>UPRAWNIENIA PRACOWNIKÓW</span><h2>Kto może otwierać który zamek</h2><p>Wybierz pracownika, a następnie zaznacz tylko te pomieszczenia, do których ma mieć dostęp. Zapis działa od razu.</p></div></header>
      {data.employees && data.employees.length > 0 ? <>
        <div className="rooms-employee-tabs" role="tablist" aria-label="Wybierz pracownika">{data.employees.map((employee) => <button type="button" role="tab" aria-selected={employee.dotykackaId === selectedEmployeeId} className={employee.dotykackaId === selectedEmployeeId ? "is-active" : ""} key={employee.dotykackaId} onClick={() => setSelectedEmployeeId(employee.dotykackaId)}>{employee.name}</button>)}</div>
        {selectedEmployee && <div className="rooms-permission-grid">{data.rooms.map((room) => {
          const enabled = data.permissions?.some((permission) => permission.employeeDotykackaId === selectedEmployee.dotykackaId && permission.lockId === String(room.id)) ?? false;
          const key = `${selectedEmployee.dotykackaId}:${room.id}`;
          return <label className={enabled ? "is-enabled" : ""} key={room.id}>
            <input type="checkbox" checked={enabled} disabled={permissionBusy === key} onChange={(event) => void setPermission(selectedEmployee, room, event.target.checked)}/>
            <span><b>{room.name}</b><small>{enabled ? "Dostęp przyznany" : "Brak dostępu"}</small></span>
          </label>;
        })}</div>}
      </> : <div className="rooms-permissions-empty">Brak aktywnych pracowników. Dodaj lub aktywuj pracownika w sekcji „Uprawnienia”.</div>}
    </section>}
    <section className="rooms-grid">{data?.rooms?.map((room) => <article className={`room-card is-${room.state.toLowerCase()}`} key={room.id}>
      <header><span className="room-lock-symbol" aria-hidden="true">{room.state === "UNLOCKED" ? "⌁" : "●"}</span><span className={`room-gateway ${room.hasGateway ? "is-online" : ""}`}>{room.hasGateway ? "Bramka online" : "Brak bramki"}</span></header>
      <h2>{room.name}</h2><strong>{stateLabel[room.state]}</strong>
      <p>{room.battery === null ? "Brak odczytu baterii" : `Bateria ${room.battery}%`}</p>
      <div><button type="button" disabled={!room.hasGateway || busy === room.id || room.state === "UNLOCKED"} onClick={() => void command(room, "UNLOCK")}>Otwórz</button><button type="button" disabled={!room.hasGateway || busy === room.id || room.state === "LOCKED"} onClick={() => void command(room, "LOCK")}>Zamknij</button></div>
    </article>)}</section>
    {!data && !error && <section className="rooms-setup"><strong>Sprawdzam połączenie z TTLock…</strong></section>}
  </main>;
}
