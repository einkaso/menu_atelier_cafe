"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { waiterSessionHeaders } from "./waiter-session-client";

type ReminderInstruction = { id: number; title: string; due: boolean; canDefer: boolean };

export default function WaiterInstructionEntry() {
  const [instructions, setInstructions] = useState<ReminderInstruction[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/waiter/instructions", { cache: "no-store", credentials: "same-origin", headers: waiterSessionHeaders() }).catch(() => null);
    if (!response?.ok) { setAuthenticated(false); return; }
    const body = await response.json().catch(() => ({})) as { instructions?: ReminderInstruction[]; pendingCount?: number };
    setInstructions(body.instructions ?? []);
    setPendingCount(body.pendingCount ?? 0);
    setAuthenticated(true);
  }, []);

  useEffect(() => {
    // Initial fetch is an external session synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("waiter-session-changed", refresh);
    window.addEventListener("staff-instructions-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("waiter-session-changed", refresh);
      window.removeEventListener("staff-instructions-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const due = instructions.find((instruction) => instruction.due) ?? null;
  const dueCount = instructions.filter((instruction) => instruction.due).length;

  if (!authenticated) return null;

  async function defer() {
    if (!due || !due.canDefer || busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/waiter/instructions", {
      method: "POST",
      credentials: "same-origin",
      headers: waiterSessionHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ instructionId: due.id, action: "DEFER" }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się odłożyć instrukcji.");
    else await load();
    setBusy(false);
  }

  return <>
    <Link className="waiter-instructions-entry" href="/kelner/instrukcje">Instrukcje{pendingCount > 0 && <b>{pendingCount}</b>}</Link>
    {due && <div className="waiter-instruction-reminder-backdrop" role="presentation">
      <section className="waiter-instruction-reminder" role="alertdialog" aria-modal="true" aria-labelledby="instruction-reminder-title">
        <div className="waiter-instruction-reminder-icon" aria-hidden="true">i</div>
        <div><span>NOWA INSTRUKCJA DLA PRACOWNIKA</span><h2 id="instruction-reminder-title">{due.title}</h2><p>Masz instrukcję, z którą musisz się zapoznać i potwierdzić jej przeczytanie.{dueCount > 1 ? ` Łącznie czekają ${dueCount} instrukcje.` : ""}</p>{error && <small role="alert">{error}</small>}<footer>{due.canDefer && <button type="button" className="is-later" disabled={busy} onClick={() => void defer()}>{busy ? "Odkładam…" : "Zostaw na później · 2 godziny"}</button>}<Link href={`/kelner/instrukcje?open=${due.id}`}>Przeczytaj teraz →</Link></footer>{!due.canDefer && <em>Ta instrukcja była już odłożona. Teraz wymaga przeczytania i potwierdzenia.</em>}</div>
      </section>
    </div>}
  </>;
}
