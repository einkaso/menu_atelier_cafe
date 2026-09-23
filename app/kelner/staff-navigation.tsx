"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WaiterInstructionEntry from "./instruction-reminder";
import WaiterWorkforceEntry from "./workforce-entry";
import ReservationReminder from "./reservation-reminder";
import { clearWaiterSessionToken, waiterSessionHeaders } from "./waiter-session-client";

export function WaiterSectionHeader({ eyebrow, title, employeeName, className = "" }: { eyebrow: string; title: string; employeeName?: string; className?: string }) {
  async function logout() {
    const response = await fetch("/api/waiter/session", { method: "DELETE", credentials: "same-origin", headers: waiterSessionHeaders() }).catch(() => null);
    if (!response?.ok) {
      window.alert("Nie udało się bezpiecznie zakończyć sesji. Nie przekazuj jeszcze tabletu innej osobie.");
      return;
    }
    clearWaiterSessionToken();
    window.location.replace("/");
  }

  return <header className={`waiter-section-header ${className}`.trim()}>
    <img src="/logo-cafe.png" alt="Marta Banaszek atelier-café"/>
    <div className="waiter-section-title">
      <span>{eyebrow}</span>
      <strong>{title}</strong>
      {employeeName && <small>{employeeName}</small>}
    </div>
    <nav className="waiter-section-controls" aria-label="Nawigacja pracownika">
      <Link href="/kelner">← Menu</Link>
      <button type="button" onClick={() => void logout()}>Wyloguj</button>
    </nav>
  </header>;
}

export function WaiterStaffNavigation({ className = "" }: { className?: string }) {
  return <aside className={`waiter-staff-navigation ${className}`.trim()} role="navigation" aria-label="Narzędzia pracownika">
    <WaiterInstructionEntry/>
    <WaiterWorkforceEntry/>
    <ReservationReminder/>
  </aside>;
}

export default function WaiterStaffDock() {
  const pathname = usePathname();
  if (pathname === "/kelner" || ["/kelner/instrukcje", "/kelner/grafik", "/kelner/rezerwacje", "/kelner/inventory", "/kelner/oswietlenie"].some((path) => pathname.startsWith(path))) return null;
  return <WaiterStaffNavigation className="waiter-staff-floating"/>;
}
