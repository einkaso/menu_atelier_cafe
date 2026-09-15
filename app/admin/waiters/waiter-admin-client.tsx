"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Employee = {
  dotykackaId: string;
  name: string;
  accessLevel: string | null;
  pinConfigured: boolean;
  adminConfigured: boolean;
  adminUsername: string | null;
  adminLastLoginAt: string | null;
};
type Table = { dotykackaId: string; name: string; display: boolean; deleted: boolean };
type SurveyQuestion = { id?: number; prompt: string; kind: "YES_NO" | "SINGLE_CHOICE"; options: string[]; required: boolean; active: boolean };

export default function WaiterAdminClient() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [posEnabled, setPosEnabled] = useState(false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/admin/waiter/employees", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { employees?: Employee[]; tables?: Table[]; surveyQuestions?: SurveyQuestion[]; posActionsEnabled?: boolean; error?: string };
    if (!response.ok) return setError(body.error ?? "Nie udało się pobrać pracowników.");
    setEmployees(body.employees ?? []); setTables(body.tables ?? []); setQuestions(body.surveyQuestions ?? []); setPosEnabled(Boolean(body.posActionsEnabled));
  }, []);
  // Initial hydration from the administrator-only endpoint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function savePin(event: FormEvent<HTMLFormElement>, employee: Employee) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(`pin:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/pin`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: String(form.get("pin") ?? "") }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać PIN-u.");
    else { formElement.reset(); setMessage(`PIN pracownika ${employee.name} został zapisany.`); await load(); }
    setBusy("");
  }

  async function clearPin(employee: Employee) {
    setBusy(`pin:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/pin`, { method: "DELETE" });
    if (!response.ok) setError("Nie udało się wyłączyć PIN-u.");
    else { setMessage(`Dostęp pracownika ${employee.name} został wyłączony.`); await load(); }
    setBusy("");
  }

  async function saveAdminAccess(event: FormEvent<HTMLFormElement>, employee: Employee) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(`admin:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/admin`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: String(form.get("username") ?? ""), password: String(form.get("password") ?? "") }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać dostępu administracyjnego.");
    else {
      const passwordInput = formElement.elements.namedItem("password") as HTMLInputElement | null;
      if (passwordInput) passwordInput.value = "";
      setMessage(`Dostęp do panelu dla ${employee.name} został zapisany.`);
      await load();
    }
    setBusy("");
  }

  async function disableAdminAccess(employee: Employee) {
    setBusy(`admin:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/admin`, { method: "DELETE" });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się wyłączyć dostępu administracyjnego.");
    else { setMessage(`Dostęp administracyjny pracownika ${employee.name} został wyłączony.`); await load(); }
    setBusy("");
  }

  function updateQuestion(index: number, patch: Partial<SurveyQuestion>) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question));
  }

  async function saveQuestions() {
    setBusy("survey"); setError(""); setMessage("");
    const response = await fetch("/api/admin/waiter/survey", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ questions }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać ankiety.");
    else { setMessage("Pytania ankiety zostały zapisane."); await load(); }
    setBusy("");
  }

  return <main className="waiter-admin">
    <header className="admin-topbar"><img src="/logo-cafe.png" alt="Marta Banaszek atelier-café"/><div><span className="admin-eyebrow">Uprawnienia zespołu</span><h1>Pracownicy i dostępy</h1></div><div className="admin-top-actions"><a className="admin-secondary" href="/admin/settlements">Rozliczenia</a><a className="admin-secondary" href="/admin">Wróć do menu</a></div></header>
    {(message || error) && <div className={error ? "admin-status is-error" : "admin-status"}>{error || message}</div>}
    <div className="waiter-admin-content">
      <section className="waiter-admin-intro"><div><span className="admin-eyebrow">Jedna lista z Dotykački</span><h2>Dostęp dla obsługi</h2><p>Aktywnemu pracownikowi możesz niezależnie nadać PIN do strefy kelnera oraz login do całego panelu zarządzania menu. Hasła i PIN-y zapisujemy wyłącznie jako bezpieczne skróty.</p></div><a className="admin-primary" href="/admin">Synchronizuj w panelu</a></section>
      {!posEnabled && <p className="waiter-admin-warning"><b>Tryb projektowy:</b> wysyłanie zamówień do POS jest zablokowane. Można bezpiecznie ustawić PIN-y i sprawdzić interfejs.</p>}
      <div className="waiter-admin-summary"><span><b>{employees.length}</b> aktywnych pracowników</span><span><b>{employees.filter((item) => item.pinConfigured).length}</b> z PIN-em kelnera</span><span><b>{employees.filter((item) => item.adminConfigured).length}</b> administratorów menu</span><span><b>{tables.filter((item) => item.display && !item.deleted).length}</b> aktywnych stolików</span></div>
      <section className="waiter-admin-list">{employees.map((employee) => <article className="waiter-admin-row" key={employee.dotykackaId}>
        <div className="waiter-employee-heading"><div><h3>{employee.name}</h3><small>ID Dotykački: {employee.dotykackaId}{employee.accessLevel ? ` · poziom ${employee.accessLevel}` : ""}</small></div></div>
        <div className="waiter-access-grid">
          <section className="waiter-access-card"><header><div><b>Strefa kelnera</b><small>Krótki PIN do zamówień i rozliczeń</small></div><span className={`waiter-admin-state ${employee.pinConfigured ? "is-ready" : ""}`}>{employee.pinConfigured ? "Aktywny" : "Brak PIN-u"}</span></header><form className="waiter-pin-form" onSubmit={(event) => savePin(event, employee)}><input name="pin" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} autoComplete="new-password" placeholder="••••" aria-label={`Nowy PIN dla ${employee.name}`} required/><button className="admin-primary" disabled={busy === `pin:${employee.dotykackaId}`}>{employee.pinConfigured ? "Zmień PIN" : "Nadaj PIN"}</button>{employee.pinConfigured && <button type="button" className="admin-secondary" disabled={busy === `pin:${employee.dotykackaId}`} onClick={() => clearPin(employee)}>Wyłącz</button>}</form></section>
          <section className="waiter-access-card is-admin"><header><div><b>Administrator menu</b><small>{employee.adminLastLoginAt ? `Ostatnie logowanie: ${new Date(employee.adminLastLoginAt).toLocaleString("pl-PL")}` : "Dostęp do panelu /admin"}</small></div><span className={`waiter-admin-state ${employee.adminConfigured ? "is-ready" : ""}`}>{employee.adminConfigured ? "Aktywny" : "Wyłączony"}</span></header><form className="waiter-admin-login-form" onSubmit={(event) => saveAdminAccess(event, employee)}><label>Login<input name="username" defaultValue={employee.adminUsername ?? ""} minLength={3} maxLength={50} pattern="[a-z0-9._-]+" autoComplete="off" placeholder="np. anna.nowak" required/></label><label>{employee.adminConfigured ? "Nowe hasło (opcjonalnie)" : "Hasło"}<input name="password" type="password" minLength={10} maxLength={128} autoComplete="new-password" placeholder={employee.adminConfigured ? "pozostaw puste bez zmiany" : "minimum 10 znaków"} required={!employee.adminConfigured}/></label><div><button className="admin-primary" disabled={busy === `admin:${employee.dotykackaId}`}>{employee.adminConfigured ? "Zapisz zmiany" : "Nadaj dostęp"}</button>{employee.adminConfigured && <button type="button" className="admin-secondary" disabled={busy === `admin:${employee.dotykackaId}`} onClick={() => disableAdminAccess(employee)}>Wyłącz</button>}</div></form></section>
        </div>
      </article>)}{!employees.length && <p className="admin-muted">Brak aktywnych pracowników. Uruchom synchronizację z Dotykačką w głównym panelu.</p>}</section>
      <section className="waiter-survey-admin"><div className="waiter-admin-intro"><div><span className="admin-eyebrow">Przed wysłaniem zamówienia</span><h2>Krótka ankieta dla gościa</h2><p>Pytania pojawiają się kelnerowi po sprawdzeniu koszyka. Odpowiedzi są przypisane do zamówienia, bez zapisywania danych osobowych gościa.</p></div><button className="admin-secondary" onClick={() => setQuestions((current) => [...current, { prompt: "", kind: "YES_NO", options: ["Tak", "Nie"], required: false, active: true }])}>Dodaj pytanie</button></div><div className="waiter-survey-list">{questions.map((question, index) => <article key={question.id ?? `new-${index}`}><div className="waiter-survey-order"><button disabled={index === 0} onClick={() => setQuestions((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button disabled={index === questions.length - 1} onClick={() => setQuestions((current) => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}>↓</button></div><label>Treść pytania<input value={question.prompt} maxLength={240} onChange={(event) => updateQuestion(index, { prompt: event.target.value })}/></label><label>Rodzaj<select value={question.kind} onChange={(event) => updateQuestion(index, { kind: event.target.value as SurveyQuestion["kind"], options: event.target.value === "YES_NO" ? ["Tak", "Nie"] : question.options })}><option value="YES_NO">Tak / nie</option><option value="SINGLE_CHOICE">Wybór jednej odpowiedzi</option></select></label>{question.kind === "SINGLE_CHOICE" && <label className="waiter-survey-options">Odpowiedzi (oddzielone przecinkami)<input value={question.options.join(", ")} onChange={(event) => updateQuestion(index, { options: event.target.value.split(",").map((item) => item.trim()) })}/></label>}<label className="waiter-survey-check"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, { required: event.target.checked })}/> obowiązkowe</label><label className="waiter-survey-check"><input type="checkbox" checked={question.active} onChange={(event) => updateQuestion(index, { active: event.target.checked })}/> aktywne</label><button className="admin-secondary" onClick={() => setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))}>Usuń</button></article>)}</div><div className="waiter-survey-save"><button className="admin-primary" disabled={busy === "survey"} onClick={saveQuestions}>{busy === "survey" ? "Zapisuję…" : "Zapisz ankietę"}</button></div></section>
    </div>
  </main>;
}
