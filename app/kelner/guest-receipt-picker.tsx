"use client";

import { useCallback, useEffect, useState } from "react";
import type { GuestReceipt, GuestReceiptListItem } from "../../lib/guest-receipt";
import { lockAppLandscapeOrientation, lockGuestPortraitOrientation } from "./guest-orientation";
import { waiterSessionHeaders } from "./waiter-session-client";

const money = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const date = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

export default function GuestReceiptPicker({ employeeName, onBack, onHandoff, onLogout }: { employeeName: string; onBack: () => void; onHandoff: (receipt: GuestReceipt) => void; onLogout: () => void }) {
  const [receipts, setReceipts] = useState<GuestReceiptListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const response = await fetch("/api/waiter/guest-receipts", { cache: "no-store", credentials: "same-origin", headers: waiterSessionHeaders() }).catch(() => null);
    const body = await response?.json().catch(() => ({})) as { receipts?: GuestReceiptListItem[]; error?: string } | undefined;
    if (!response?.ok) setError(body?.error ?? "Nie udało się pobrać rachunków.");
    else setReceipts(body?.receipts ?? []);
    setLoading(false);
  }, []);

  // Initial server-backed list hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function handoff(orderId: string) {
    void lockGuestPortraitOrientation();
    setOpening(orderId); setError("");
    const response = await fetch("/api/waiter/guest-receipts", { method: "POST", credentials: "same-origin", headers: waiterSessionHeaders({ "content-type": "application/json" }), body: JSON.stringify({ orderId }) }).catch(() => null);
    const body = await response?.json().catch(() => ({})) as { receipt?: GuestReceipt; error?: string } | undefined;
    if (!response?.ok || !body?.receipt) {
      void lockAppLandscapeOrientation();
      setError(body?.error ?? "Nie udało się otworzyć rachunku.");
    }
    else onHandoff(body.receipt);
    setOpening(null);
  }

  return <main className="waiter-app guest-receipt-picker-screen"><header className="waiter-header"><button onClick={onBack}>← Zamówienia</button><div><span>Rachunek dla gościa</span><strong>{employeeName}</strong></div><button onClick={onLogout}>Wyloguj</button></header><section className="guest-receipt-picker"><div className="waiter-review-title"><span>DOWOLNY TABLET · DOWOLNY STOLIK</span><h1>Wybierz rachunek</h1><p>Lista pokazuje zamknięte rachunki z ostatnich 12 godzin. Po wyborze tablet przejdzie w bezpieczny tryb dla gościa i wyloguje kelnera.</p></div><div className="guest-receipt-picker-actions"><button onClick={() => void load()} disabled={loading}>{loading ? "Odświeżam…" : "Odśwież listę"}</button></div>{error && <p className="waiter-error" role="alert">{error}</p>}{!loading && !receipts.length && <p className="waiter-empty">Brak zamkniętych rachunków do wyświetlenia.</p>}<div className="guest-receipt-list">{receipts.map((receipt) => <article key={receipt.orderId}><div><span>{receipt.tableName}</span><h2>{receipt.documentNumber}</h2><small>{date.format(new Date(receipt.completedAt))}</small></div><strong>{money.format(Number(receipt.total))}</strong><button disabled={opening !== null} onClick={() => void handoff(receipt.orderId)}>{opening === receipt.orderId ? "Otwieram…" : "Pokaż gościowi"}</button></article>)}</div></section></main>;
}
