"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { addDays, mondayFor, WEEK_DAYS, weekDates } from "../../../lib/workforce";
import AdminSectionHeader from "../admin-section-header";

type Employee = { dotykackaId: string; name: string; includeInSchedule: boolean };
type AvailabilityDay = { date: string; available: boolean; from: string | null; to: string | null; note: string | null };
type Availability = { employeeDotykackaId: string; employeeName: string; minShifts: number; maxShifts: number; days: AvailabilityDay[] };
type Shift = { id?: number; employeeDotykackaId: string; employeeName?: string; workDate: string; startsAt?: string; endsAt?: string; from: string; to: string; note: string };
type Schedule = { id: number; status: "DRAFT" | "PUBLISHED"; version: number; openingHours: Opening[]; availabilityLocked: boolean; publishedAt: string | null };
type Opening = { date: string; closed: boolean; from: string | null; to: string | null };
type Correction = { id: number; employeeName: string; workDate: string; requestedStart: string; requestedEnd: string; reason: string };
type Entry = { id: number; employeeDotykackaId: string; employeeName: string; startedAt: string; endedAt: string | null; workedMinutes: number | null; status: string };
type CalendarEvent = { uid: string; title: string; startsAt: string; endsAt: string | null; allDay: boolean };
type Reservation = { id: number; guestName: string | null; partySize: number | null; startsAt: string; endsAt: string; location: string | null; specialRequest: string | null };
type Data = { employees: Employee[]; settlementEmployees: Employee[]; availability: Availability[]; schedule: Schedule | null; shifts: Array<Omit<Shift, "from" | "to"> & { startsAt: string; endsAt: string }>; corrections: Correction[]; entries: Entry[]; weekEntries: Entry[]; events: CalendarEvent[]; reservations: Reservation[]; calendar: { connected: boolean; name: string; error: string | null } };
type SelectedCell = { employeeDotykackaId: string; date: string } | null;
type ShiftPreset = "FIRST" | "SECOND" | "MIDDLE";

const polishDate = new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "short" });
const polishTime = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" });
const warsawDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" });
const inputTime = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

function standardOpenings(weekStart: string): Opening[] {
  return weekDates(weekStart).map((date, index) => ({ date, closed: false, from: "09:00", to: index <= 2 || index === 6 ? "21:00" : "22:00" }));
}

function isLegacyOpeningHours(openings: Opening[]) {
  return openings.length === 7 && openings.every((opening) => !opening.closed && opening.from === "08:00" && opening.to === "22:00");
}

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function durationLabel(minutes: number) {
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default function WorkforceAdminClient() {
  const [weekStart, setWeekStart] = useState(mondayFor());
  const [data, setData] = useState<Data | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [openings, setOpenings] = useState<Opening[]>(standardOpenings(weekStart));
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [calendarForm, setCalendarForm] = useState({ name: "Kalendarz wydarzeń", url: "" });

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/admin/workforce?weekStart=${weekStart}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as Data & { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się pobrać grafiku.");
    else {
      const savedOpenings = body.schedule?.openingHours ?? [];
      const planningEmployeeIds = new Set(body.employees.map((employee) => employee.dotykackaId));
      setData(body);
      setOpenings(savedOpenings.length && !isLegacyOpeningHours(savedOpenings) ? savedOpenings : standardOpenings(weekStart));
      setShifts(body.shifts.filter((shift) => planningEmployeeIds.has(shift.employeeDotykackaId)).map((shift) => ({ ...shift, from: inputTime(shift.startsAt), to: inputTime(shift.endsAt), note: shift.note ?? "" })));
      setCalendarForm((current) => ({ ...current, name: body.calendar.name }));
      setSelectedCell(null);
    }
  }, [weekStart]);

  // Initial administrator planner hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const dates = weekDates(weekStart);
  const employeeById = new Map((data?.employees ?? []).map((employee) => [employee.dotykackaId, employee]));
  const monthly = useMemo(() => {
    const result = new Map<string, number>();
    for (const entry of data?.entries ?? []) result.set(entry.employeeDotykackaId, (result.get(entry.employeeDotykackaId) ?? 0) + (entry.workedMinutes ?? 0));
    return result;
  }, [data]);

  const selectedShiftIndex = selectedCell ? shifts.findIndex((shift) => shift.employeeDotykackaId === selectedCell.employeeDotykackaId && shift.workDate === selectedCell.date) : -1;
  const selectedShift = selectedShiftIndex >= 0 ? shifts[selectedShiftIndex] : null;
  const selectedEmployee = selectedCell ? employeeById.get(selectedCell.employeeDotykackaId) : null;

  function updateOpening(index: number, patch: Partial<Opening>) {
    setOpenings((current) => current.map((opening, position) => position === index ? { ...opening, ...patch } : opening));
  }

  function presetTimes(date: string, preset: ShiftPreset) {
    if (preset === "FIRST") return { from: "08:30", to: "15:30" };
    if (preset === "MIDDLE") return { from: "11:00", to: "19:00" };
    const closing = openings.find((opening) => opening.date === date)?.to ?? "21:00";
    return { from: "15:30", to: addMinutes(closing, 30) };
  }

  function assignPreset(preset: ShiftPreset) {
    if (!selectedCell || !selectedEmployee) return;
    const times = presetTimes(selectedCell.date, preset);
    const next: Shift = { ...(selectedShift ?? {}), employeeDotykackaId: selectedEmployee.dotykackaId, employeeName: selectedEmployee.name, workDate: selectedCell.date, ...times, note: selectedShift?.note ?? "" };
    setShifts((current) => selectedShiftIndex >= 0 ? current.map((shift, index) => index === selectedShiftIndex ? next : shift) : [...current, next]);
  }

  function updateSelectedShift(patch: Partial<Shift>) {
    if (selectedShiftIndex < 0) return;
    setShifts((current) => current.map((shift, index) => index === selectedShiftIndex ? { ...shift, ...patch } : shift));
  }

  function removeSelectedShift() {
    if (selectedShiftIndex < 0) return;
    setShifts((current) => current.filter((_, index) => index !== selectedShiftIndex));
  }

  function entriesFor(employeeDotykackaId: string, date: string) {
    return (data?.weekEntries ?? []).filter((entry) => entry.employeeDotykackaId === employeeDotykackaId && warsawDate.format(new Date(entry.startedAt)) === date);
  }

  function actualSummary(employeeDotykackaId: string, date: string) {
    const entries = entriesFor(employeeDotykackaId, date);
    if (!entries.length) return null;
    const first = entries.reduce((earliest, entry) => new Date(entry.startedAt) < new Date(earliest.startedAt) ? entry : earliest);
    const hasOpen = entries.some((entry) => !entry.endedAt);
    const completed = entries.filter((entry) => entry.endedAt);
    const last = completed.length ? completed.reduce((latest, entry) => new Date(entry.endedAt as string) > new Date(latest.endedAt as string) ? entry : latest) : null;
    const minutes = entries.reduce((sum, entry) => sum + (entry.workedMinutes ?? 0), 0);
    return { range: `${polishTime.format(new Date(first.startedAt))}–${hasOpen ? "trwa" : last?.endedAt ? polishTime.format(new Date(last.endedAt)) : "—"}`, duration: hasOpen ? "w trakcie" : durationLabel(minutes) };
  }

  async function savePlan(publish = false) {
    if (busy) return;
    setBusy(publish ? "publish" : "save"); setError(""); setMessage("");
    const save = await fetch("/api/admin/workforce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SAVE_PLAN", weekStart, openingHours: openings, shifts: shifts.map(({ employeeDotykackaId, workDate, from, to, note }) => ({ employeeDotykackaId, workDate, from, to, note })) }) });
    const saveBody = await save.json().catch(() => ({})) as { error?: string };
    if (!save.ok) setError(saveBody.error ?? "Nie udało się zapisać planu.");
    else if (publish) {
      const response = await fetch("/api/admin/workforce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "PUBLISH", weekStart }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) setError(body.error ?? "Nie udało się opublikować grafiku.");
      else setMessage("Grafik opublikowany. Pracownicy zobaczą swoje zmiany, a kalendarze wymagające odświeżenia zostaną oznaczone.");
    } else setMessage("Szkic grafiku zapisany.");
    await load(); setBusy("");
  }

  async function toggleAvailabilityLock() {
    if (busy) return;
    const locked = !data?.schedule?.availabilityLocked;
    setBusy("availability-lock"); setError(""); setMessage("");
    const response = await fetch("/api/admin/workforce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SET_AVAILABILITY_LOCK", weekStart, locked }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się zmienić blokady dyspozycji.");
    else setMessage(locked ? "Dyspozycje na ten tydzień zostały zablokowane." : "Pracownicy mogą ponownie zmieniać dyspozycje w tym tygodniu.");
    await load(); setBusy("");
  }

  async function reviewCorrection(id: number, decision: "APPROVE" | "REJECT") {
    setBusy(`correction:${id}`);
    const response = await fetch("/api/admin/workforce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "REVIEW_CORRECTION", weekStart, id, decision }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się rozpatrzyć wniosku."); else setMessage(decision === "APPROVE" ? "Godziny zostały dopisane." : "Wniosek odrzucony.");
    await load(); setBusy("");
  }

  async function saveCalendar(event: FormEvent) {
    event.preventDefault(); setBusy("calendar");
    const response = await fetch("/api/admin/workforce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SAVE_CALENDAR", ...calendarForm }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Nie udało się połączyć kalendarza."); else setMessage(calendarForm.url ? "Kalendarz wydarzeń został połączony." : "Połączenie kalendarza usunięte.");
    await load(); setBusy("");
  }

  return <main className="workforce-admin">
    <AdminSectionHeader eyebrow="Zespół i czas pracy" title="Grafik pracy" links={[{ href: "/admin/waiters", label: "Pracownicy i dostępy" }]}/>
    <section className="workforce-week-nav"><button onClick={() => setWeekStart(addDays(weekStart, -7))}>← Poprzedni</button><div><span>TYDZIEŃ</span><strong>{polishDate.format(new Date(`${weekStart}T12:00:00Z`))} — {polishDate.format(new Date(`${addDays(weekStart, 6)}T12:00:00Z`))}</strong>{data?.schedule && <small>{data.schedule.status === "PUBLISHED" ? `Opublikowany · wersja ${data.schedule.version}` : "Szkic"}{data.schedule.availabilityLocked ? " · dyspozycje zablokowane" : ""}</small>}</div><button onClick={() => setWeekStart(addDays(weekStart, 7))}>Następny →</button></section>
    {(message || error) && <p className={`workforce-status${error ? " is-error" : ""}`}>{error || message}</p>}

    <section className="workforce-panel workforce-planner workforce-planner-grid">
      <header><div><span>PLAN TYGODNIA</span><h2>Dyspozycja · zmiana · faktyczny czas</h2></div><div className="workforce-planner-controls"><span className="workforce-plan-legend"><i className="is-availability"/> dyspozycja <i className="is-plan"/> plan <i className="is-actual"/> odbicia QR</span><button className={`workforce-availability-lock${data?.schedule?.availabilityLocked ? " is-locked" : ""}`} disabled={Boolean(busy)} onClick={() => void toggleAvailabilityLock()}>{data?.schedule?.availabilityLocked ? "Odblokuj dyspozycje" : "BLOKADA DYSPOZYCJI"}</button></div></header>
      {!data?.employees.length && <p className="workforce-empty">Brak pracowników włączonych do planowania. Zmień ustawienie „Bierze udział w grafiku” w panelu Pracownicy.</p>}
      <div className="workforce-schedule-table"><div className="is-head"><b>Pracownik</b>{dates.map((date, index) => <span key={date}>{WEEK_DAYS[index].slice(0, 3)}<small>{date.slice(8)}.{date.slice(5, 7)}</small></span>)}<b>Preferencja</b></div>{data?.employees.map((employee) => { const availability = data.availability.find((row) => row.employeeDotykackaId === employee.dotykackaId); return <div className="workforce-schedule-row" key={employee.dotykackaId}><strong>{employee.name}</strong>{dates.map((date) => { const day = availability?.days.find((item) => item.date === date); const shift = shifts.find((item) => item.employeeDotykackaId === employee.dotykackaId && item.workDate === date); const actual = actualSummary(employee.dotykackaId, date); const selected = selectedCell?.employeeDotykackaId === employee.dotykackaId && selectedCell.date === date; return <button type="button" key={date} title={day?.note ?? ""} className={`workforce-schedule-cell${selected ? " is-selected" : ""}`} onClick={() => setSelectedCell({ employeeDotykackaId: employee.dotykackaId, date })}><span className={day?.available ? "is-available" : "is-unavailable"}><small>DYSPOZYCJA</small><b>{day?.available ? `${day.from || "cały dzień"}${day.from && day.to ? `–${day.to}` : ""}` : availability ? "niedostępny" : "brak zgłoszenia"}</b></span><span className={shift ? "is-assigned" : "is-empty"}><small>PLAN</small><b>{shift ? `${shift.from}–${shift.to}` : "+ wybierz zmianę"}</b></span><span className={actual ? "is-recorded" : "is-empty"}><small>FAKTYCZNIE</small><b>{actual ? actual.range : "brak odbić"}</b>{actual && <em>{actual.duration}</em>}</span></button>})}<b>{availability ? `${availability.minShifts}–${availability.maxShifts} zmian` : "brak"}</b></div>})}</div>
      {selectedCell && selectedEmployee && <aside className="workforce-cell-editor"><header><div><span>WYBRANA KRATKA</span><strong>{selectedEmployee.name} · {polishDate.format(new Date(`${selectedCell.date}T12:00:00Z`))}</strong></div><button type="button" onClick={() => setSelectedCell(null)}>×</button></header><div className="workforce-shift-presets"><button type="button" onClick={() => assignPreset("FIRST")}><b>Zmiana 1</b><span>08:30–15:30</span></button><button type="button" onClick={() => assignPreset("SECOND")}><b>Zmiana 2</b><span>15:30–{presetTimes(selectedCell.date, "SECOND").to}</span></button><button type="button" onClick={() => assignPreset("MIDDLE")}><b>Zmiana 3</b><span>11:00–19:00 · edytowalna</span></button></div>{selectedShift ? <div className="workforce-shift-editor"><label>Od<input type="time" value={selectedShift.from} onChange={(event) => updateSelectedShift({ from: event.target.value })}/></label><label>Do<input type="time" value={selectedShift.to} onChange={(event) => updateSelectedShift({ to: event.target.value })}/></label><label className="is-note">Notatka<input value={selectedShift.note} placeholder="Opcjonalnie" onChange={(event) => updateSelectedShift({ note: event.target.value })}/></label><button type="button" className="is-remove" onClick={removeSelectedShift}>Usuń zmianę</button></div> : <p>Wybierz jeden z trzech wariantów. Godziny będzie można od razu skorygować.</p>}</aside>}
      <footer><button disabled={Boolean(busy)} onClick={() => void savePlan(false)}>Zapisz szkic</button><button className="is-primary" disabled={Boolean(busy) || !shifts.length} onClick={() => void savePlan(true)}>{busy === "publish" ? "Publikuję…" : data?.schedule?.status === "PUBLISHED" ? "Opublikuj aktualizację" : "Opublikuj grafik"}</button></footer>
    </section>

    <section className="workforce-admin-grid workforce-context-grid">
      <article className="workforce-panel workforce-context"><header><div><span>GODZINY KAWIARNI</span><h2>Standard tygodnia i kontekst dnia</h2></div><button type="button" onClick={() => setOpenings(standardOpenings(weekStart))}>Przywróć standard</button></header><div className="workforce-opening-list">{openings.map((opening, index) => <div key={opening.date}><b>{WEEK_DAYS[index]}</b><label><input type="checkbox" checked={opening.closed} onChange={(event) => updateOpening(index, { closed: event.target.checked })}/> zamknięte</label><input type="time" disabled={opening.closed} value={opening.from ?? ""} onChange={(event) => updateOpening(index, { from: event.target.value })}/><span>—</span><input type="time" disabled={opening.closed} value={opening.to ?? ""} onChange={(event) => updateOpening(index, { to: event.target.value })}/></div>)}</div><div className="workforce-events workforce-reservation-context"><h3>Rezerwacje w tym tygodniu</h3>{data?.reservations.map((reservation) => <div key={reservation.id}><time>{polishDate.format(new Date(reservation.startsAt))} · {polishTime.format(new Date(reservation.startsAt))}–{polishTime.format(new Date(reservation.endsAt))}</time><strong>{reservation.guestName || "Rezerwacja bez nazwy"}{reservation.partySize !== null ? ` · ${reservation.partySize} os.` : ""}</strong><span>{[reservation.location, reservation.specialRequest].filter(Boolean).join(" · ") || "Brak dodatkowych informacji"}</span></div>)}{!data?.reservations.length && <p>Brak rezerwacji w tym tygodniu.</p>}</div><div className="workforce-events"><h3>Wydarzenia · tylko dla administratora</h3>{data?.events.map((event) => <div key={event.uid}><time>{polishDate.format(new Date(event.startsAt))}{!event.allDay && ` · ${polishTime.format(new Date(event.startsAt))}`}</time><strong>{event.title}</strong><span>Wymagane minimum 2 osoby na zmianie.</span></div>)}{!data?.events.length && <p>{data?.calendar.connected ? data.calendar.error || "Brak wydarzeń w tym tygodniu." : "Połącz współdzielony kalendarz poniżej."}</p>}</div></article>
      <article className="workforce-panel"><header><div><span>KONTROLA CZASU</span><h2>Miesięczne godziny</h2></div></header><div className="workforce-hours-list">{data?.settlementEmployees.map((employee) => <div key={employee.dotykackaId}><strong>{employee.name}{!employee.includeInSchedule && <small> · poza grafikiem</small>}</strong><b>{durationLabel(monthly.get(employee.dotykackaId) ?? 0)}</b></div>)}</div></article>
    </section>
    <section className="workforce-admin-grid">
      <article className="workforce-panel"><header><div><span>WYMAGA DECYZJI</span><h2>Wnioski o dopisanie godzin</h2></div><b>{data?.corrections.length ?? 0}</b></header><div className="workforce-corrections">{data?.corrections.map((request) => <div key={request.id}><strong>{request.employeeName}</strong><span>{request.workDate} · {polishTime.format(new Date(request.requestedStart))}–{polishTime.format(new Date(request.requestedEnd))}</span><p>{request.reason}</p><footer><button disabled={Boolean(busy)} onClick={() => void reviewCorrection(request.id, "REJECT")}>Odrzuć</button><button disabled={Boolean(busy)} onClick={() => void reviewCorrection(request.id, "APPROVE")}>Zatwierdź i dopisz</button></footer></div>)}{!data?.corrections.length && <p>Brak wniosków oczekujących.</p>}</div></article>
      <article className="workforce-panel workforce-calendar-config"><header><div><span>PLANOWANE WYDARZENIA</span><h2>Współdzielony kalendarz</h2></div></header><p>Wklej prywatny adres subskrypcji iCal/ICS. Adres jest szyfrowany, wydarzenia widzi wyłącznie administrator podczas planowania.</p><form onSubmit={saveCalendar}><label>Nazwa<input value={calendarForm.name} onChange={(event) => setCalendarForm({ ...calendarForm, name: event.target.value })}/></label><label>Adres ICS<input type="url" value={calendarForm.url} placeholder={data?.calendar.connected ? "Połączono — wklej adres tylko, aby go zmienić" : "https://…/calendar.ics"} onChange={(event) => setCalendarForm({ ...calendarForm, url: event.target.value })}/></label><button disabled={Boolean(busy)}>Zapisz połączenie</button></form></article>
    </section>
  </main>;
}
