export const WARSAW_TIME_ZONE = "Europe/Warsaw";
export const WEEK_DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"] as const;

export type AvailabilityDayInput = { date: string; available: boolean; from?: string | null; to?: string | null; note?: string | null };
export type ShiftInput = { employeeDotykackaId: string; workDate: string; from: string; to: string; note?: string | null };

export function isoDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: WARSAW_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function mondayFor(date = new Date()) {
  const current = isoDate(date);
  const value = new Date(`${current}T12:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - weekday + 1);
  return value.toISOString().slice(0, 10);
}

export function nextAvailabilityWeek(now = new Date()) {
  const threshold = addDays(isoDate(now), 7);
  const monday = mondayFor(new Date(`${threshold}T12:00:00Z`));
  return monday < threshold ? addDays(monday, 7) : monday;
}

export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

export function validTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function weekDates(weekStart: string) {
  if (!validDate(weekStart)) throw new Error("Nieprawidłowy początek tygodnia.");
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function zoneOffsetMilliseconds(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const renderedAsUtc = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second));
  return renderedAsUtc - instant.getTime();
}

export function warsawDateTime(date: string, time: string) {
  if (!validDate(date) || !validTime(time)) throw new Error("Nieprawidłowa data lub godzina.");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(localAsUtc);
  for (let iteration = 0; iteration < 2; iteration += 1) instant = new Date(localAsUtc - zoneOffsetMilliseconds(instant, WARSAW_TIME_ZONE));
  return instant;
}

export function validateAvailability(input: { weekStart: unknown; minShifts: unknown; maxShifts: unknown; days: unknown }, enforceNotice = true) {
  if (!validDate(input.weekStart)) throw new Error("Wybierz prawidłowy tydzień.");
  if (mondayFor(new Date(`${input.weekStart}T12:00:00Z`)) !== input.weekStart) throw new Error("Tydzień musi rozpoczynać się w poniedziałek.");
  if (enforceNotice && input.weekStart < nextAvailabilityWeek()) throw new Error("Dyspozycję trzeba złożyć co najmniej tydzień wcześniej.");
  const minShifts = Number(input.minShifts);
  const maxShifts = Number(input.maxShifts);
  if (!Number.isInteger(minShifts) || !Number.isInteger(maxShifts) || minShifts < 0 || maxShifts > 7 || minShifts > maxShifts) throw new Error("Zakres liczby zmian musi mieścić się od 0 do 7, a minimum nie może przekraczać maksimum.");
  if (!Array.isArray(input.days)) throw new Error("Brakuje dyspozycji dziennych.");
  const allowed = new Set(weekDates(input.weekStart));
  const days = input.days.map((raw) => {
    const day = raw as AvailabilityDayInput;
    if (!validDate(day.date) || !allowed.has(day.date)) throw new Error("Dyspozycja zawiera dzień spoza wybranego tygodnia.");
    const available = day.available === true;
    const from = available && validTime(day.from) ? day.from : null;
    const to = available && validTime(day.to) ? day.to : null;
    if (available && from && to && from >= to) throw new Error(`Godzina zakończenia ${day.date} musi być późniejsza niż rozpoczęcia.`);
    return { date: day.date, available, from, to, note: typeof day.note === "string" ? day.note.trim().slice(0, 300) || null : null };
  });
  return { weekStart: input.weekStart, minShifts, maxShifts, days };
}

export function validateShift(input: ShiftInput, weekStart: string) {
  const allowed = new Set(weekDates(weekStart));
  if (!input.employeeDotykackaId?.trim() || !allowed.has(input.workDate) || !validTime(input.from) || !validTime(input.to)) throw new Error("Zmiana zawiera nieprawidłowe dane.");
  const startsAt = warsawDateTime(input.workDate, input.from);
  let endsAt = warsawDateTime(input.workDate, input.to);
  if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  if ((endsAt.getTime() - startsAt.getTime()) / 3_600_000 > 16) throw new Error("Zmiana nie może trwać dłużej niż 16 godzin.");
  return { ...input, startsAt, endsAt, note: input.note?.trim().slice(0, 300) || null };
}

export function workedMinutes(startedAt: Date, endedAt: Date) {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));
}

export function likelyMissingPunch(input: { startedAt: Date; endedAt: Date | null }[], now = new Date()) {
  return input.some((entry) => !entry.endedAt && now.getTime() - entry.startedAt.getTime() > 12 * 60 * 60 * 1000);
}

function icsEscape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function icsDate(value: Date) { return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }

export function scheduleIcs(input: { employeeId: string; employeeName: string; scheduleVersion: number; shifts: Array<{ id: number; startsAt: Date; endsAt: Date; note: string | null }> }) {
  const now = icsDate(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atelier Cafe//Grafik pracy//PL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(`Grafik — ${input.employeeName}`)}`, "X-WR-TIMEZONE:Europe/Warsaw"];
  for (const shift of input.shifts) lines.push("BEGIN:VEVENT", `UID:atelier-shift-${shift.id}@atelier-cafe`, `DTSTAMP:${now}`, `DTSTART:${icsDate(shift.startsAt)}`, `DTEND:${icsDate(shift.endsAt)}`, `SEQUENCE:${input.scheduleVersion}`, `SUMMARY:${icsEscape("Praca — Atelier Café")}`, `DESCRIPTION:${icsEscape(shift.note || "Zaplanowana zmiana")}`, "END:VEVENT");
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
