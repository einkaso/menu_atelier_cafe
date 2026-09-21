"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearWaiterSessionToken, waiterSessionHeaders } from "../waiter-session-client";
import { WaiterSectionHeader } from "../staff-navigation";

type Attachment = {
  id: string;
  path: string;
  type: "IMAGE" | "PDF";
  name: string;
  size: number;
};
type Instruction = {
  id: number;
  title: string;
  content: string;
  status: "PUBLISHED" | "ARCHIVED";
  revision: number;
  attachments: Attachment[];
  publishedAt: string | null;
  archivedAt: string | null;
  acknowledgedAt: string | null;
  deferredUntil: string | null;
  canDefer: boolean;
  due: boolean;
};
type Employee = { name: string };

const dateTime = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" });

export default function InstructionCatalogClient() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contentRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/waiter/instructions", { cache: "no-store", credentials: "same-origin", headers: waiterSessionHeaders() }).catch(() => null);
    if (!response) { setError("Nie udało się połączyć z katalogiem instrukcji."); setLoading(false); return; }
    if (response.status === 401) { clearWaiterSessionToken(); window.location.replace("/kelner"); return; }
    const body = await response.json().catch(() => ({})) as { employee?: Employee; instructions?: Instruction[]; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się pobrać instrukcji.");
    else {
      setEmployee(body.employee ?? null);
      setInstructions(body.instructions ?? []);
      const requested = Number(new URLSearchParams(window.location.search).get("open"));
      setSelectedId((current) => current ?? (Number.isInteger(requested) && requested > 0 ? requested : null));
    }
    setLoading(false);
  }, []);

  // Initial employee catalogue hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const selected = instructions.find((instruction) => instruction.id === selectedId) ?? null;
  const active = instructions.filter((instruction) => instruction.status === "PUBLISHED");
  const archived = instructions.filter((instruction) => instruction.status === "ARCHIVED");

  useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => {
      const node = contentRef.current;
      if (node && node.scrollHeight <= node.clientHeight + 8) setReachedEnd(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  function onInstructionScroll() {
    const node = contentRef.current;
    if (node && node.scrollTop + node.clientHeight >= node.scrollHeight - 24) setReachedEnd(true);
  }

  function onAttachmentLoaded() {
    const node = contentRef.current;
    if (node) setReachedEnd(node.scrollTop + node.clientHeight >= node.scrollHeight - 24);
  }

  function openInstruction(instructionId: number) {
    setReachedEnd(false);
    setSelectedId(instructionId);
  }

  async function instructionAction(action: "DEFER" | "ACKNOWLEDGE") {
    if (!selected || busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/waiter/instructions", {
      method: "POST",
      credentials: "same-origin",
      headers: waiterSessionHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ instructionId: selected.id, action, ...(action === "ACKNOWLEDGE" ? { declaration: "I_HAVE_READ" } : {}) }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać potwierdzenia.");
    else { await load(); window.dispatchEvent(new Event("staff-instructions-changed")); if (action === "ACKNOWLEDGE") setSelectedId(null); }
    setBusy(false);
  }

  if (loading) return <main className="waiter-instruction-catalog is-loading"><p>Otwieram katalog instrukcji…</p></main>;

  return <main className="waiter-instruction-catalog">
    <WaiterSectionHeader className="waiter-instruction-header" eyebrow="Katalog wiedzy" title="Instrukcje dla pracowników" employeeName={employee?.name}/>
    {error && <p className="waiter-instruction-error" role="alert">{error}</p>}
    <section className="waiter-instruction-intro"><div><span>CYFROWY SEGREGATOR</span><h1>Wszystko, co warto mieć pod ręką</h1><p>Aktywne instrukcje tworzą obowiązujący katalog pracy. Po przeczytaniu każdej nowej instrukcji potwierdź zapoznanie się z jej treścią.</p></div><b>{active.filter((instruction) => !instruction.acknowledgedAt).length}<small>do przeczytania</small></b></section>
    <section className="waiter-instruction-section"><header><h2>Aktywne instrukcje</h2><span>{active.length}</span></header><div className="waiter-instruction-grid">{active.map((instruction) => <button type="button" key={instruction.id} className={instruction.acknowledgedAt ? "is-read" : instruction.due ? "is-due" : "is-deferred"} onClick={() => openInstruction(instruction.id)}><small>{instruction.acknowledgedAt ? "PRZECZYTANA" : instruction.due ? "WYMAGA PRZECZYTANIA" : "ODŁOŻONA"}</small><strong>{instruction.title}</strong><span>{instruction.acknowledgedAt ? `Potwierdzono ${dateTime.format(new Date(instruction.acknowledgedAt))}` : instruction.deferredUntil ? `Przypomnienie ${dateTime.format(new Date(instruction.deferredUntil))}` : "Otwórz instrukcję"}</span></button>)}</div>{!active.length && <p className="waiter-instruction-empty">Nie ma jeszcze aktywnych instrukcji.</p>}</section>
    {archived.length > 0 && <details className="waiter-instruction-archive"><summary>Archiwum instrukcji <b>{archived.length}</b></summary><div className="waiter-instruction-grid">{archived.map((instruction) => <button type="button" key={instruction.id} className="is-archived" onClick={() => openInstruction(instruction.id)}><small>ARCHIWALNA · BEZ POTWIERDZENIA</small><strong>{instruction.title}</strong><span>Otwórz materiał archiwalny</span></button>)}</div></details>}
    {selected && <div className="waiter-instruction-reader-backdrop" role="presentation"><section className="waiter-instruction-reader" role="dialog" aria-modal="true" aria-labelledby="waiter-instruction-title"><header><div><span>{selected.status === "ARCHIVED" ? "INSTRUKCJA ARCHIWALNA" : `INSTRUKCJA · WERSJA ${selected.revision}`}</span><h2 id="waiter-instruction-title">{selected.title}</h2></div><button type="button" aria-label="Zamknij" onClick={() => setSelectedId(null)}>×</button></header><div ref={contentRef} className="waiter-instruction-reader-content" onScroll={onInstructionScroll}><div className="waiter-instruction-reader-copy">{selected.content}</div>{(selected.attachments ?? []).length > 0 && <section className="waiter-instruction-attachments"><h3>Załączniki</h3><div>{(selected.attachments ?? []).map((attachment) => attachment.type === "IMAGE" ? <a key={attachment.id} href={attachment.path} target="_blank" rel="noreferrer" className="is-image"><img src={attachment.path} alt={attachment.name} onLoad={onAttachmentLoaded}/><span>{attachment.name}</span></a> : <a key={attachment.id} href={attachment.path} target="_blank" rel="noreferrer" className="is-pdf"><b>PDF</b><span><strong>{attachment.name}</strong><small>Otwórz dokument</small></span></a>)}</div></section>}</div><footer>{selected.status === "PUBLISHED" && !selected.acknowledgedAt ? <>{!reachedEnd && <small>Przewiń instrukcję i załączniki do końca, aby potwierdzić przeczytanie.</small>}<div>{selected.canDefer && <button type="button" className="is-later" disabled={busy} onClick={() => void instructionAction("DEFER")}>Zostaw na później · 2 godziny</button>}<button type="button" disabled={!reachedEnd || busy} onClick={() => void instructionAction("ACKNOWLEDGE")}>{busy ? "Zapisuję…" : "Oświadczam, że zapoznałem/am się z treścią instrukcji"}</button></div></> : <div><span>{selected.acknowledgedAt ? `Potwierdzono ${dateTime.format(new Date(selected.acknowledgedAt))}` : "Materiał archiwalny nie wymaga potwierdzenia."}</span><button type="button" onClick={() => setSelectedId(null)}>Zamknij</button></div>}</footer></section></div>}
  </main>;
}
