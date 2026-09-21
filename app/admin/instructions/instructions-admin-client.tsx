"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AdminSectionHeader from "../admin-section-header";

type Recipient = {
  dotykackaId: string;
  name: string;
  state: "ACKNOWLEDGED" | "DEFERRED" | "PENDING";
  deferredUntil: string | null;
  acknowledgedAt: string | null;
};
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
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  revision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  attachments: Attachment[];
  acknowledgedCount: number;
  deferredCount: number;
  pendingCount: number;
  recipients: Recipient[];
};
type EditableCopy = { title: string; content: string };

const dateTime = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" });
const statusLabel = (status: Instruction["status"]) => status === "PUBLISHED" ? "Aktywna" : status === "ARCHIVED" ? "Archiwalna" : "Szkic";
const attachmentAccept = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.pdf";
const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function InstructionsAdminClient() {
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [copies, setCopies] = useState<Record<number, EditableCopy>>({});
  const [activeEmployeeCount, setActiveEmployeeCount] = useState(0);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/instructions", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { instructions?: Instruction[]; activeEmployeeCount?: number; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się pobrać instrukcji.");
    else {
      const next = body.instructions ?? [];
      setInstructions(next);
      setActiveEmployeeCount(body.activeEmployeeCount ?? 0);
      setCopies(Object.fromEntries(next.map((instruction) => [instruction.id, { title: instruction.title, content: instruction.content }])));
    }
    setLoading(false);
  }, []);

  // Initial administrator-only catalogue hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function createInstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("create"); setError(""); setMessage("");
    const files = data.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const response = await fetch("/api/admin/instructions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: data.get("title"), content: data.get("content") }) });
    const body = await response.json().catch(() => ({})) as { instruction?: { id: number }; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się utworzyć instrukcji.");
    else if (files.length && body.instruction?.id) {
      const attachments = new FormData();
      for (const file of files) attachments.append("attachments", file);
      const upload = await fetch(`/api/admin/instructions/${body.instruction.id}/attachments`, { method: "POST", body: attachments });
      const uploadBody = await upload.json().catch(() => ({})) as { error?: string };
      form.reset();
      if (!upload.ok) setError(`Szkic utworzono, ale nie udało się dodać plików: ${uploadBody.error ?? "nieznany błąd"}`);
      else setMessage("Utworzono szkic instrukcji razem z załącznikami.");
      await load();
    } else { form.reset(); setMessage("Utworzono szkic instrukcji. Sprawdź treść i wyślij ją do pracowników."); await load(); }
    setBusy("");
  }

  async function addAttachments(instruction: Instruction, files: File[]) {
    if (!files.length || busy) return;
    if (instruction.status === "PUBLISHED" && !window.confirm("Dodanie pliku utworzy nową wersję aktywnej instrukcji. Wszyscy pracownicy będą musieli potwierdzić ją ponownie. Kontynuować?")) return;
    setBusy(`ATTACH:${instruction.id}`); setError(""); setMessage("");
    const data = new FormData();
    for (const file of files) data.append("attachments", file);
    const response = await fetch(`/api/admin/instructions/${instruction.id}/attachments`, { method: "POST", body: data });
    const body = await response.json().catch(() => ({})) as { error?: string; republished?: boolean; duplicate?: boolean };
    if (!response.ok) setError(body.error ?? "Nie udało się dodać załącznika.");
    else if (body.duplicate) setMessage("Ten plik jest już dołączony do instrukcji.");
    else setMessage(body.republished ? "Załącznik dodany. Nowa wersja instrukcji wymaga ponownego potwierdzenia." : "Załącznik dodany do szkicu.");
    await load();
    setBusy("");
  }

  async function removeAttachment(instruction: Instruction, attachment: Attachment) {
    if (busy) return;
    const warning = instruction.status === "PUBLISHED"
      ? `Usunąć plik „${attachment.name}”? Powstanie nowa wersja instrukcji wymagająca ponownego potwierdzenia.`
      : `Usunąć plik „${attachment.name}”?`;
    if (!window.confirm(warning)) return;
    setBusy(`REMOVE:${instruction.id}:${attachment.id}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/instructions/${instruction.id}/attachments`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attachmentId: attachment.id }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string; republished?: boolean };
    if (!response.ok) setError(body.error ?? "Nie udało się usunąć załącznika.");
    else setMessage(body.republished ? "Załącznik usunięty. Nowa wersja instrukcji wymaga ponownego potwierdzenia." : "Załącznik usunięty ze szkicu.");
    await load();
    setBusy("");
  }

  function updateCopy(id: number, patch: Partial<EditableCopy>) {
    setCopies((current) => ({ ...current, [id]: { ...(current[id] ?? { title: "", content: "" }), ...patch } }));
  }

  async function action(instruction: Instruction, actionName: "SAVE" | "PUBLISH" | "REPUBLISH" | "ARCHIVE" | "RESTORE") {
    if (busy) return;
    if (actionName === "PUBLISH" && !window.confirm(`Wysłać instrukcję „${instruction.title}” do ${activeEmployeeCount} aktywnych pracowników?`)) return;
    if (actionName === "REPUBLISH" && !window.confirm("Zapisanie nowej wersji wyzeruje dotychczasowe potwierdzenia dla tej instrukcji. Wszyscy aktywni pracownicy będą musieli przeczytać ją ponownie. Kontynuować?")) return;
    if (actionName === "ARCHIVE" && !window.confirm("Instrukcja pozostanie w archiwum, ale przestanie być wymagana od pracowników. Archiwizować?")) return;
    setBusy(`${actionName}:${instruction.id}`); setError(""); setMessage("");
    const copy = copies[instruction.id] ?? { title: instruction.title, content: instruction.content };
    const response = await fetch("/api/admin/instructions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: instruction.id, action: actionName, ...copy }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się wykonać operacji.");
    else {
      const labels = { SAVE: "Szkic zapisany.", PUBLISH: "Instrukcja została wysłana do pracowników.", REPUBLISH: "Nowa wersja została wysłana. Wymaga ponownego przeczytania.", ARCHIVE: "Instrukcja została przeniesiona do archiwum.", RESTORE: "Instrukcja wróciła jako szkic." };
      setMessage(labels[actionName]);
      await load();
    }
    setBusy("");
  }

  return <main className="instructions-admin">
    <AdminSectionHeader eyebrow="Wiedza zespołu" title="Instrukcje dla pracowników" links={[{ href: "/admin/waiters", label: "Pracownicy" }]}/>
    {(message || error) && <div className={`instructions-admin-status${error ? " is-error" : ""}`}>{error || message}</div>}
    <section className="instructions-admin-summary">
      <div><b>{instructions.filter((instruction) => instruction.status === "PUBLISHED").length}</b><span>aktywnych instrukcji</span></div>
      <div><b>{activeEmployeeCount}</b><span>aktywnych pracowników</span></div>
      <div><b>{instructions.reduce((sum, instruction) => sum + (instruction.status === "PUBLISHED" ? instruction.pendingCount : 0), 0)}</b><span>potwierdzeń oczekujących</span></div>
    </section>
    <section className="instructions-admin-create">
      <div><span>NOWA INSTRUKCJA</span><h2>Najpierw szkic, potem wysyłka</h2><p>Instrukcja zacznie obowiązywać dopiero po kliknięciu „Wyślij do pracowników”. Możesz od razu dołączyć zdjęcia albo dokument PDF.</p></div>
      <form onSubmit={createInstruction}>
        <label>Tytuł<input name="title" required minLength={3} maxLength={180} placeholder="np. Otwarcie kawiarni rano"/></label>
        <label>Treść<textarea name="content" required minLength={10} maxLength={50000} placeholder="Kolejne kroki, zasady, odpowiedzialność…"/></label>
        <label>Zdjęcia lub PDF <input name="attachments" type="file" accept={attachmentAccept} multiple/><small>Maksymalnie 10 plików, każdy do 25 MB.</small></label>
        <button disabled={busy === "create"}>{busy === "create" ? "Tworzę…" : "Utwórz szkic"}</button>
      </form>
    </section>
    <section className="instructions-admin-list">
      <header><h2>Katalog instrukcji</h2><span>{instructions.length}</span></header>
      {loading ? <p>Wczytuję instrukcje…</p> : instructions.map((instruction) => {
        const copy = copies[instruction.id] ?? { title: instruction.title, content: instruction.content };
        const attachments = instruction.attachments ?? [];
        return <article key={instruction.id} className={`is-${instruction.status.toLocaleLowerCase()}`}>
          <header>
            <div><span>{statusLabel(instruction.status)} · wersja {instruction.revision}</span><h3>{instruction.title}</h3><small>Aktualizacja: {dateTime.format(new Date(instruction.updatedAt))} · {instruction.updatedBy}</small></div>
            {instruction.status !== "DRAFT" && <div className="instructions-admin-progress"><b>{instruction.acknowledgedCount}/{activeEmployeeCount}</b><span>potwierdzono</span></div>}
          </header>
          <div className="instructions-admin-editor">
            <label>Tytuł<input value={copy.title} disabled={instruction.status === "ARCHIVED"} onChange={(event) => updateCopy(instruction.id, { title: event.target.value })}/></label>
            <label>Treść<textarea value={copy.content} disabled={instruction.status === "ARCHIVED"} onChange={(event) => updateCopy(instruction.id, { content: event.target.value })}/></label>
          </div>
          <section className="instructions-admin-attachments">
            <header>
              <div><strong>Załączniki</strong><span>{attachments.length}/10</span></div>
              {instruction.status !== "ARCHIVED" && <label className="instructions-admin-file-button">
                <input type="file" accept={attachmentAccept} multiple disabled={Boolean(busy) || attachments.length >= 10} onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void addAttachments(instruction, files);
                }}/>
                <span>{busy === `ATTACH:${instruction.id}` ? "Dodaję…" : "Dodaj zdjęcia lub PDF"}</span>
              </label>}
            </header>
            {attachments.length ? <div className="instructions-admin-attachment-grid">{attachments.map((attachment) => <div key={attachment.id} className={`is-${attachment.type.toLocaleLowerCase()}`}>
              <a href={attachment.path} target="_blank" rel="noreferrer">
                {attachment.type === "IMAGE" ? <img src={attachment.path} alt={attachment.name}/> : <b>PDF</b>}
                <span><strong>{attachment.name}</strong><small>{attachment.type === "PDF" ? "Dokument PDF" : "Zdjęcie"} · {fileSize(attachment.size)}</small></span>
              </a>
              {instruction.status !== "ARCHIVED" && <button type="button" aria-label={`Usuń ${attachment.name}`} disabled={Boolean(busy)} onClick={() => void removeAttachment(instruction, attachment)}>×</button>}
            </div>)}</div> : <p>Brak załączników. Możesz dodać zdjęcia lub dokument PDF.</p>}
          </section>
          {instruction.status !== "DRAFT" && <details className="instructions-admin-recipients">
            <summary>Stan zapoznania pracowników <b>{instruction.pendingCount} oczekuje</b>{instruction.deferredCount > 0 && <em>{instruction.deferredCount} odłożono</em>}</summary>
            <div>{instruction.recipients.map((recipient) => <p key={recipient.dotykackaId} className={`is-${recipient.state.toLocaleLowerCase()}`}><strong>{recipient.name}</strong><span>{recipient.state === "ACKNOWLEDGED" ? `Przeczytano ${dateTime.format(new Date(recipient.acknowledgedAt!))}` : recipient.state === "DEFERRED" ? `Odłożono do ${dateTime.format(new Date(recipient.deferredUntil!))}` : "Oczekuje na przeczytanie"}</span></p>)}</div>
          </details>}
          <footer>{instruction.status === "DRAFT" ? <>
            <button disabled={Boolean(busy)} onClick={() => void action(instruction, "SAVE")}>Zapisz szkic</button>
            <button className="is-primary" disabled={Boolean(busy)} onClick={() => void action(instruction, "PUBLISH")}>Wyślij do pracowników</button>
          </> : instruction.status === "PUBLISHED" ? <>
            <button disabled={Boolean(busy)} onClick={() => void action(instruction, "ARCHIVE")}>Oznacz jako archiwalną</button>
            <button className="is-primary" disabled={Boolean(busy)} onClick={() => void action(instruction, "REPUBLISH")}>Zapisz i wyślij nową wersję</button>
          </> : <button className="is-primary" disabled={Boolean(busy)} onClick={() => void action(instruction, "RESTORE")}>Przywróć jako szkic</button>}</footer>
        </article>;
      })}
      {!loading && !instructions.length && <p className="instructions-admin-empty">Nie ma jeszcze żadnych instrukcji.</p>}
    </section>
  </main>;
}
