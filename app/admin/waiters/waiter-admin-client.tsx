"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import AdminSectionHeader from "../admin-section-header";
import { DEFAULT_EMPLOYEE_THANK_YOU } from "../../../lib/employee-thank-you";

type Employee = {
  dotykackaId: string;
  name: string;
  barcode: string | null;
  qrDataUrl: string | null;
  accessLevel: string | null;
  canManageMenuVisibility: boolean;
  canControlLighting: boolean;
  canControlRooms: boolean;
  pinConfigured: boolean;
  adminConfigured: boolean;
  adminUsername: string | null;
  adminLastLoginAt: string | null;
  thankYouMessage: string;
  includeInSchedule: boolean;
  hourlyRate: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  thankYouMedia: Array<{ id: number; mediaPath: string; mediaType: "GIF" | "VIDEO" }>;
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

  async function setMenuVisibilityAccess(employee: Employee, enabled: boolean) {
    setBusy(`visibility:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/visibility`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zmienić uprawnienia do widoczności menu.");
    else { setMessage(`${employee.name}: ${enabled ? "włączono" : "wyłączono"} zarządzanie widocznością menu.`); await load(); }
    setBusy("");
  }

  async function setLightingAccess(employee: Employee, enabled: boolean) {
    setBusy(`lighting:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/lighting`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zmienić uprawnienia do oświetlenia.");
    else { setMessage(`${employee.name}: ${enabled ? "włączono" : "wyłączono"} sterowanie oświetleniem.`); await load(); }
    setBusy("");
  }

  async function setRoomsAccess(employee: Employee, enabled: boolean) {
    setBusy(`rooms:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/rooms`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zmienić uprawnienia do pomieszczeń.");
    else { setMessage(`${employee.name}: ${enabled ? "włączono" : "wyłączono"} sterowanie zamkami.`); await load(); }
    setBusy("");
  }

  async function uploadThankYouMedia(event: FormEvent<HTMLFormElement>, employee: Employee) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(`thanks:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/thanks`, { method: "PUT", body: form });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać animacji.");
    else { formElement.reset(); setMessage(`Dodano animację z podziękowaniem dla ${employee.name}.`); await load(); }
    setBusy("");
  }

  async function removeThankYouMedia(employee: Employee, mediaId: number) {
    setBusy(`thanks:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/thanks`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaId }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się usunąć animacji.");
    else { setMessage(`Usunięto animację pracownika ${employee.name}.`); await load(); }
    setBusy("");
  }

  function editThankYouMessage(dotykackaId: string, thankYouMessage: string) {
    setEmployees((current) => current.map((employee) => employee.dotykackaId === dotykackaId ? { ...employee, thankYouMessage } : employee));
  }

  async function saveThankYouMessage(employee: Employee, reset = false) {
    setBusy(`thanks-message:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/thanks`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: reset ? DEFAULT_EMPLOYEE_THANK_YOU : employee.thankYouMessage }),
    });
    const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać treści podziękowania.");
    else {
      editThankYouMessage(employee.dotykackaId, body.message ?? DEFAULT_EMPLOYEE_THANK_YOU);
      setMessage(reset ? `Przywrócono domyślne podziękowanie dla ${employee.name}.` : `Podziękowanie pracownika ${employee.name} zostało zapisane.`);
    }
    setBusy("");
  }

  function editEmployeeProfile(dotykackaId: string, patch: Partial<Pick<Employee, "hourlyRate" | "contactPhone" | "contactEmail">>) {
    setEmployees((current) => current.map((employee) => employee.dotykackaId === dotykackaId ? { ...employee, ...patch } : employee));
  }

  async function saveEmployeeProfile(employee: Employee, includeInSchedule = employee.includeInSchedule) {
    setBusy(`profile:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/profile`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includeInSchedule, hourlyRate: employee.hourlyRate, contactPhone: employee.contactPhone, contactEmail: employee.contactEmail }),
    });
    const body = await response.json().catch(() => ({})) as { profile?: Pick<Employee, "includeInSchedule" | "hourlyRate" | "contactPhone" | "contactEmail">; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zapisać informacji o pracowniku.");
    else {
      setEmployees((current) => current.map((item) => item.dotykackaId === employee.dotykackaId ? { ...item, ...(body.profile ?? { includeInSchedule, hourlyRate: employee.hourlyRate, contactPhone: employee.contactPhone, contactEmail: employee.contactEmail }) } : item));
      setMessage(includeInSchedule === employee.includeInSchedule ? `Informacje o pracowniku ${employee.name} zostały zapisane.` : includeInSchedule ? `${employee.name} może ponownie być planowany/a w grafiku.` : `${employee.name} został/a wyłączony/a z planowania nowych zmian. Historyczne rozliczenia pozostają bez zmian.`);
    }
    setBusy("");
  }

  async function setScheduleAccess(employee: Employee, includeInSchedule: boolean) {
    if (includeInSchedule === employee.includeInSchedule || busy) return;
    if (!includeInSchedule && !window.confirm(`Wyłączyć pracownika ${employee.name} z planowania? Istniejące zmiany i rozliczenia pozostaną w historii.`)) return;
    await saveEmployeeProfile(employee, includeInSchedule);
  }

  async function generateEmployeeBarcode(employee: Employee) {
    if (busy || employee.barcode) return;
    if (!window.confirm(`Wygenerować nowy kod pracownika ${employee.name} i zapisać go w Dotykačce?`)) return;
    setBusy(`barcode:${employee.dotykackaId}`); setError(""); setMessage("");
    const response = await fetch(`/api/admin/waiter/employees/${encodeURIComponent(employee.dotykackaId)}/barcode`, { method: "POST" });
    const body = await response.json().catch(() => ({})) as { barcode?: string; created?: boolean; error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się wygenerować kodu pracownika.");
    else {
      setMessage(body.created ? `Kod ${body.barcode} został wygenerowany i zapisany w Dotykačce dla ${employee.name}.` : `Dotykačka miała już kod ${body.barcode}. Został zsynchronizowany z aplikacją.`);
      await load();
    }
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
    <AdminSectionHeader eyebrow="Uprawnienia zespołu" title="Pracownicy i dostępy" links={[{ href: "/admin/workforce", label: "Grafik" }, { href: "/admin/settlements", label: "Rozliczenia" }]}/>
    {(message || error) && <div className={error ? "admin-status is-error" : "admin-status"}>{error || message}</div>}
    <div className="waiter-admin-content">
      <section className="waiter-admin-intro"><div><span className="admin-eyebrow">Jedna lista z Dotykački</span><h2>Dostęp dla obsługi</h2><p>Aktywnemu pracownikowi możesz niezależnie nadać PIN do strefy kelnera oraz login do całego panelu zarządzania menu. Hasła i PIN-y zapisujemy wyłącznie jako bezpieczne skróty.</p></div><a className="admin-primary" href="/admin">Synchronizuj w panelu</a></section>
      <section className="waiter-qr-management"><div><span className="admin-eyebrow">EWIDENCJA CZASU PRACY</span><h2>Kody QR pracowników</h2><p>Kody są podpisane cyfrowo i tworzone automatycznie z identyfikatora oraz kodu kreskowego pracownika w Dotykačce.</p></div><div><a className="admin-primary" href="/admin/workforce/kiosk">Uruchom skaner QR</a><button type="button" className="admin-secondary" onClick={() => window.print()}>Drukuj wszystkie karty QR</button></div></section>
      {!posEnabled && <p className="waiter-admin-warning"><b>Tryb projektowy:</b> wysyłanie zamówień do POS jest zablokowane. Można bezpiecznie ustawić PIN-y i sprawdzić interfejs.</p>}
      <div className="waiter-admin-summary"><span><b>{employees.length}</b> aktywnych pracowników</span><span><b>{employees.filter((item) => item.pinConfigured).length}</b> z PIN-em kelnera</span><span><b>{employees.filter((item) => item.canManageMenuVisibility).length}</b> może zmieniać widoczność</span><span><b>{employees.filter((item) => item.canControlLighting).length}</b> może sterować światłem</span><span><b>{employees.filter((item) => item.canControlRooms).length}</b> może sterować zamkami</span><span><b>{employees.filter((item) => item.adminConfigured).length}</b> administratorów menu</span><span><b>{tables.filter((item) => item.display && !item.deleted).length}</b> aktywnych stolików</span></div>
      <section className="waiter-admin-list">{employees.map((employee) => <article className="waiter-admin-row" key={employee.dotykackaId}>
        <div className="waiter-employee-heading"><div><h3>{employee.name}</h3><small>ID Dotykački: {employee.dotykackaId}{employee.accessLevel ? ` · poziom ${employee.accessLevel}` : ""}</small></div><span className={`waiter-schedule-badge ${employee.includeInSchedule ? "is-on" : "is-off"}`}>Grafik: {employee.includeInSchedule ? "TAK" : "NIE"}</span></div>
        <div className="waiter-access-grid">
          <section className="waiter-access-card waiter-qr-card"><header><div><b>Karta QR czasu pracy</b><small>Wejście i wyjście na tablecie ze skanerem</small></div><span className={`waiter-admin-state ${employee.qrDataUrl ? "is-ready" : ""}`}>{employee.qrDataUrl ? "Gotowa" : "Brak kodu"}</span></header>{employee.qrDataUrl ? <div className="waiter-qr-card-body"><a href={employee.qrDataUrl} target="_blank" rel="noreferrer" aria-label={`Otwórz kod QR pracownika ${employee.name}`}><img src={employee.qrDataUrl} alt={`Kod QR — ${employee.name}`}/></a><div><strong>{employee.name}</strong><small>Kod kreskowy: {employee.barcode}</small><a className="admin-secondary" href={employee.qrDataUrl} download={`kod-qr-${employee.dotykackaId}.png`}>Pobierz PNG</a></div></div> : <div className="waiter-qr-missing"><p>Brak kodu kreskowego pracownika w Dotykačce. Możesz utworzyć bezpieczny, unikalny kod i od razu wysłać go do konta pracownika.</p><button type="button" className="admin-primary" disabled={Boolean(busy)} onClick={() => void generateEmployeeBarcode(employee)}>{busy === `barcode:${employee.dotykackaId}` ? "Wysyłam…" : "Wygeneruj i wyślij do Dotykački"}</button></div>}</section>
          <section className={`waiter-access-card waiter-schedule-card ${employee.includeInSchedule ? "is-on" : "is-off"}`}><header><div><b>Uwzględniać w grafiku?</b><small>Wyłączenie blokuje dodawanie nowych zmian</small></div><span className={`waiter-admin-state ${employee.includeInSchedule ? "is-ready" : ""}`}>{employee.includeInSchedule ? "Tak" : "Nie"}</span></header><div className="waiter-schedule-toggle" role="group" aria-label={`Uwzględnianie ${employee.name} w grafiku`}><button type="button" className={employee.includeInSchedule ? "is-active" : ""} disabled={Boolean(busy)} onClick={() => void setScheduleAccess(employee, true)}>Tak</button><button type="button" className={!employee.includeInSchedule ? "is-active is-no" : ""} disabled={Boolean(busy)} onClick={() => void setScheduleAccess(employee, false)}>Nie</button></div><p>{employee.includeInSchedule ? "Pracownik jest dostępny podczas układania grafiku i może zgłaszać dyspozycję." : "Pracownika nie można dodać do nowego grafiku. Jego godziny, rozliczenia i napiwki historyczne nadal są uwzględniane."}</p></section>
          <section className="waiter-access-card"><header><div><b>Strefa kelnera</b><small>Krótki PIN do zamówień i rozliczeń</small></div><span className={`waiter-admin-state ${employee.pinConfigured ? "is-ready" : ""}`}>{employee.pinConfigured ? "Aktywny" : "Brak PIN-u"}</span></header><form className="waiter-pin-form" onSubmit={(event) => savePin(event, employee)}><input name="pin" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} autoComplete="new-password" placeholder="••••" aria-label={`Nowy PIN dla ${employee.name}`} required/><button className="admin-primary" disabled={busy === `pin:${employee.dotykackaId}`}>{employee.pinConfigured ? "Zmień PIN" : "Nadaj PIN"}</button>{employee.pinConfigured && <button type="button" className="admin-secondary" disabled={busy === `pin:${employee.dotykackaId}`} onClick={() => clearPin(employee)}>Wyłącz</button>}</form></section>
          <section className="waiter-access-card is-admin"><header><div><b>Administrator menu</b><small>{employee.adminLastLoginAt ? `Ostatnie logowanie: ${new Date(employee.adminLastLoginAt).toLocaleString("pl-PL")}` : "Dostęp do panelu /admin"}</small></div><span className={`waiter-admin-state ${employee.adminConfigured ? "is-ready" : ""}`}>{employee.adminConfigured ? "Aktywny" : "Wyłączony"}</span></header><form className="waiter-admin-login-form" onSubmit={(event) => saveAdminAccess(event, employee)}><label>Login<input name="username" defaultValue={employee.adminUsername ?? ""} minLength={3} maxLength={50} pattern="[a-z0-9._-]+" autoComplete="off" placeholder="np. anna.nowak" required/></label><label>{employee.adminConfigured ? "Nowe hasło (opcjonalnie)" : "Hasło"}<input name="password" type="password" minLength={10} maxLength={128} autoComplete="new-password" placeholder={employee.adminConfigured ? "pozostaw puste bez zmiany" : "minimum 10 znaków"} required={!employee.adminConfigured}/></label><div><button className="admin-primary" disabled={busy === `admin:${employee.dotykackaId}`}>{employee.adminConfigured ? "Zapisz zmiany" : "Nadaj dostęp"}</button>{employee.adminConfigured && <button type="button" className="admin-secondary" disabled={busy === `admin:${employee.dotykackaId}`} onClick={() => disableAdminAccess(employee)}>Wyłącz</button>}</div></form></section>
          <section className="waiter-access-card waiter-menu-visibility-card"><header><div><b>Widoczność menu gościa</b><small>Włączanie i ukrywanie produktów z tagiem MENU</small></div><span className={`waiter-admin-state ${employee.canManageMenuVisibility ? "is-ready" : ""}`}>{employee.canManageMenuVisibility ? "Dozwolone" : "Zablokowane"}</span></header><p>Uprawnienie jest domyślnie wyłączone. Każda zmiana wymaga podania powodu i trafia do historii administratora.</p><button type="button" className={employee.canManageMenuVisibility ? "admin-secondary" : "admin-primary"} disabled={busy === `visibility:${employee.dotykackaId}`} onClick={() => void setMenuVisibilityAccess(employee, !employee.canManageMenuVisibility)}>{employee.canManageMenuVisibility ? "Odbierz uprawnienie" : "Nadaj uprawnienie"}</button></section>
          <section className="waiter-access-card"><header><div><b>Sterowanie oświetleniem</b><small>Mapa, grupy i zatwierdzone sceny w strefie kelnera</small></div><span className={`waiter-admin-state ${employee.canControlLighting ? "is-ready" : ""}`}>{employee.canControlLighting ? "Dozwolone" : "Zablokowane"}</span></header><p>Uprawnienie jest domyślnie wyłączone. Konfiguracja urządzeń, mapy i scen pozostaje dostępna wyłącznie dla administratorów.</p><button type="button" className={employee.canControlLighting ? "admin-secondary" : "admin-primary"} disabled={busy === `lighting:${employee.dotykackaId}`} onClick={() => void setLightingAccess(employee, !employee.canControlLighting)}>{employee.canControlLighting ? "Odbierz uprawnienie" : "Nadaj uprawnienie"}</button></section>
          <section className="waiter-access-card"><header><div><b>Pomieszczenia</b><small>Zamki TTLock przez bramkę internetową</small></div><span className={`waiter-admin-state ${employee.canControlRooms ? "is-ready" : ""}`}>{employee.canControlRooms ? "Dozwolone" : "Zablokowane"}</span></header><p>To jest główny dostęp do modułu. Konkretne zamki przypiszesz pracownikowi w sekcji „Pomieszczenia”; każde polecenie jest zapisywane z jego nazwiskiem.</p><button type="button" className={employee.canControlRooms ? "admin-secondary" : "admin-primary"} disabled={busy === `rooms:${employee.dotykackaId}`} onClick={() => void setRoomsAccess(employee, !employee.canControlRooms)}>{employee.canControlRooms ? "Odbierz uprawnienie" : "Nadaj uprawnienie"}</button></section>
          <section className="waiter-access-card waiter-thanks-card">
            <header><div><b>Podziękowanie na rachunku</b><small>Każdy pracownik może mieć własny tekst i do 3 animacji</small></div><span className={`waiter-admin-state ${employee.thankYouMedia.length ? "is-ready" : ""}`}>{employee.thankYouMedia.length}/3</span></header>
            <form className="waiter-thanks-message-form" onSubmit={(event) => { event.preventDefault(); void saveThankYouMessage(employee); }}>
              <label>Treść od pracownika<textarea required minLength={3} maxLength={280} value={employee.thankYouMessage} onChange={(event) => editThankYouMessage(employee.dotykackaId, event.target.value)}/><small>{employee.thankYouMessage.length}/280 znaków · tekst pojawi się obok imienia pracownika</small></label>
              <div><button type="button" className="admin-secondary" disabled={Boolean(busy) || employee.thankYouMessage === DEFAULT_EMPLOYEE_THANK_YOU} onClick={() => void saveThankYouMessage(employee, true)}>Przywróć domyślne</button><button className="admin-primary" disabled={Boolean(busy) || employee.thankYouMessage.trim().length < 3}>{busy === `thanks-message:${employee.dotykackaId}` ? "Zapisuję…" : "Zapisz treść"}</button></div>
            </form>
            {employee.thankYouMedia.length > 0 && <div className="waiter-thanks-gallery">{employee.thankYouMedia.map((media) => <figure key={media.id}>{media.mediaType === "GIF" ? <img src={media.mediaPath} alt={`Animacja ${employee.name}`}/> : <video src={media.mediaPath} autoPlay loop muted playsInline/>}<button type="button" aria-label={`Usuń animację ${employee.name}`} disabled={busy === `thanks:${employee.dotykackaId}`} onClick={() => void removeThankYouMedia(employee, media.id)}>×</button></figure>)}</div>}
            <form className="waiter-thanks-form" onSubmit={(event) => uploadThankYouMedia(event, employee)}><input name="media" type="file" accept="video/mp4,video/webm,image/gif,.mp4,.webm,.gif" required disabled={employee.thankYouMedia.length >= 3 || busy === `thanks:${employee.dotykackaId}`}/><button className="admin-primary" disabled={employee.thankYouMedia.length >= 3 || busy === `thanks:${employee.dotykackaId}`}>{employee.thankYouMedia.length >= 3 ? "Limit 3 animacji" : "Dodaj animację"}</button></form>
          </section>
          <details className="waiter-employee-private"><summary><span>Informacje o pracowniku</span><small>Stawka godzinowa, telefon i adres e-mail</small></summary><form onSubmit={(event) => { event.preventDefault(); void saveEmployeeProfile(employee); }}><label>Stawka za 1 godzinę pracy <span><input type="number" min="0" max="10000" step="0.01" inputMode="decimal" value={employee.hourlyRate ?? ""} onChange={(event) => editEmployeeProfile(employee.dotykackaId, { hourlyRate: event.target.value || null })}/><b>PLN</b></span></label><label>Numer telefonu<input type="tel" maxLength={40} value={employee.contactPhone ?? ""} onChange={(event) => editEmployeeProfile(employee.dotykackaId, { contactPhone: event.target.value || null })} placeholder="np. +48 500 000 000"/></label><label>Adres e-mail<input type="email" maxLength={254} value={employee.contactEmail ?? ""} onChange={(event) => editEmployeeProfile(employee.dotykackaId, { contactEmail: event.target.value || null })} placeholder="np. anna@example.com"/></label><button className="admin-primary" disabled={Boolean(busy)}>{busy === `profile:${employee.dotykackaId}` ? "Zapisuję…" : "Zapisz informacje"}</button></form></details>
        </div>
      </article>)}{!employees.length && <p className="admin-muted">Brak aktywnych pracowników. Uruchom synchronizację z Dotykačką w głównym panelu.</p>}</section>
      <section className="waiter-survey-admin"><div className="waiter-admin-intro"><div><span className="admin-eyebrow">Przed wysłaniem zamówienia</span><h2>Krótka ankieta dla gościa</h2><p>Pytania pojawiają się kelnerowi po sprawdzeniu koszyka. Odpowiedzi są przypisane do zamówienia, bez zapisywania danych osobowych gościa.</p></div><button className="admin-secondary" onClick={() => setQuestions((current) => [...current, { prompt: "", kind: "YES_NO", options: ["Tak", "Nie"], required: false, active: true }])}>Dodaj pytanie</button></div><div className="waiter-survey-list">{questions.map((question, index) => <article key={question.id ?? `new-${index}`}><div className="waiter-survey-order"><button disabled={index === 0} onClick={() => setQuestions((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button disabled={index === questions.length - 1} onClick={() => setQuestions((current) => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}>↓</button></div><label>Treść pytania<input value={question.prompt} maxLength={240} onChange={(event) => updateQuestion(index, { prompt: event.target.value })}/></label><label>Rodzaj<select value={question.kind} onChange={(event) => updateQuestion(index, { kind: event.target.value as SurveyQuestion["kind"], options: event.target.value === "YES_NO" ? ["Tak", "Nie"] : question.options })}><option value="YES_NO">Tak / nie</option><option value="SINGLE_CHOICE">Wybór jednej odpowiedzi</option></select></label>{question.kind === "SINGLE_CHOICE" && <label className="waiter-survey-options">Odpowiedzi (oddzielone przecinkami)<input value={question.options.join(", ")} onChange={(event) => updateQuestion(index, { options: event.target.value.split(",").map((item) => item.trim()) })}/></label>}<label className="waiter-survey-check"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, { required: event.target.checked })}/> obowiązkowe</label><label className="waiter-survey-check"><input type="checkbox" checked={question.active} onChange={(event) => updateQuestion(index, { active: event.target.checked })}/> aktywne</label><button className="admin-secondary" onClick={() => setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))}>Usuń</button></article>)}</div><div className="waiter-survey-save"><button className="admin-primary" disabled={busy === "survey"} onClick={saveQuestions}>{busy === "survey" ? "Zapisuję…" : "Zapisz ankietę"}</button></div></section>
    </div>
  </main>;
}
