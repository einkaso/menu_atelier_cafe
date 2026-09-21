"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WaiterInstructionEntry from "./instruction-reminder";
import WaiterWorkforceEntry from "./workforce-entry";
import ReservationReminder from "./reservation-reminder";
import { clearWaiterSessionToken } from "./waiter-session-client";

export function WaiterSectionHeader({ eyebrow, title, employeeName, className = "" }: { eyebrow: string; title: string; employeeName?: string; className?: string }) {
  function logout() {
    clearWaiterSessionToken();
    window.location.replace("/kelner");
  }

  return <header className={`waiter-section-header ${className}`.trim()}>
    <nav className="waiter-section-controls" aria-label="Nawigacja pracownika">
      <button type="button" onClick={logout}>Wyloguj</button>
      <Link href="/kelner">← Menu</Link>
    </nav>
    <img src="/logo-cafe.png" alt="Marta Banaszek atelier-café"/>
    <div className="waiter-section-title">
      <span>{eyebrow}</span>
      <strong>{title}</strong>
      {employeeName && <small>{employeeName}</small>}
    </div>
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
  if (pathname === "/kelner" || ["/kelner/instrukcje", "/kelner/grafik", "/kelner/rezerwacje", "/kelner/inventory"].some((path) => pathname.startsWith(path))) return null;
  return <WaiterStaffNavigation className="waiter-staff-floating"/>;
}
