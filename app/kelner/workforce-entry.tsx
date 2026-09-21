"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { waiterSessionHeaders } from "./waiter-session-client";

type AlertData = { schedule: { id: number } | null; calendarNeedsUpdate: boolean; alerts: { overdueOpen: unknown[]; missedShifts: unknown[] } };
export default function WaiterWorkforceEntry() {
  const [alerts, setAlerts] = useState<AlertData | null>(null); const [open, setOpen] = useState(false);
  const load = useCallback(async (show = false) => { const response = await fetch("/api/waiter/workforce", { cache: "no-store", headers: waiterSessionHeaders() }).catch(() => null); if (!response?.ok) return; const body = await response.json() as AlertData; setAlerts(body); if (show && (body.alerts.overdueOpen.length > 0 || body.alerts.missedShifts.length > 0 || body.calendarNeedsUpdate)) setOpen(true); }, []);
  // Hydrate the badge and subscribe to explicit PIN-login events.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(false); const login = () => void load(true); window.addEventListener("waiter-session-changed", login); return () => window.removeEventListener("waiter-session-changed", login); }, [load]);
  const count = (alerts?.alerts.overdueOpen.length ?? 0) + (alerts?.alerts.missedShifts.length ?? 0) + (alerts?.calendarNeedsUpdate ? 1 : 0);
  return <>{<Link className="waiter-workforce-floating" href="/kelner/grafik">Grafik{count > 0 && <b>{count}</b>}</Link>}{open && <div className="waiter-workforce-alert-backdrop"><section><span>UWAGA · CZAS PRACY</span><h2>Sprawdź swoją ewidencję</h2>{(alerts?.alerts.overdueOpen.length ?? 0) > 0 && <p>Masz niezamknięte wejście do pracy. Jeśli zapomniałeś/aś odbić wyjście, złóż wniosek o korektę.</p>}{(alerts?.alerts.missedShifts.length ?? 0) > 0 && <p>System nie znalazł odbicia dla zaplanowanej zmiany. Sprawdź godziny i w razie potrzeby poproś o ich dopisanie.</p>}{alerts?.calendarNeedsUpdate && <p>Twój grafik został zmieniony. Zaktualizuj kalendarz w telefonie.</p>}<footer><button onClick={() => setOpen(false)}>Zamknij na teraz</button><Link href="/kelner/grafik">Otwórz grafik</Link></footer></section></div>}</>;
}
