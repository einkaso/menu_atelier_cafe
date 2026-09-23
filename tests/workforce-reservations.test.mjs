import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, server: { middlewareMode: true } });
after(async () => vite.close());
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("requires availability at least a week ahead and accepts a seven-day declaration", async () => {
  const { nextAvailabilityWeek, validateAvailability, weekDates } = await vite.ssrLoadModule("/lib/workforce.ts");
  const now = new Date("2026-09-20T10:00:00Z");
  assert.equal(nextAvailabilityWeek(now), "2026-09-28");
  const weekStart = "2026-09-28";
  const result = validateAvailability({ weekStart, minShifts: 2, maxShifts: 4, days: weekDates(weekStart).map((date) => ({ date, available: true, from: "09:00", to: "18:00" })) }, false);
  assert.equal(result.days.length, 7);
  assert.equal(result.minShifts, 2);
});

test("creates signed employee QR payloads and rejects a modified payload", async () => {
  process.env.ADMIN_SESSION_SECRET = "test-workforce-secret";
  const { employeeQrPayload, parseEmployeeQrPayload } = await vite.ssrLoadModule("/lib/workforce-secrets.ts");
  const payload = employeeQrPayload("42", "EMP-0042");
  assert.deepEqual(parseEmployeeQrPayload(payload), { employeeDotykackaId: "42", barcode: "EMP-0042" });
  assert.equal(parseEmployeeQrPayload(`${payload}x`), null);
});

test("manages employee QR cards in the employee administration screen", async () => {
  const [employeeRoute, employeeClient, barcodeRoute, dotykackaClient, workforceRoute, workforceClient] = await Promise.all([
    read("app/api/admin/waiter/employees/route.ts"),
    read("app/admin/waiters/waiter-admin-client.tsx"),
    read("app/api/admin/waiter/employees/[dotykackaId]/barcode/route.ts"),
    read("lib/dotykacka/client.ts"),
    read("app/api/admin/workforce/route.ts"),
    read("app/admin/workforce/workforce-admin-client.tsx"),
  ]);
  assert.match(employeeRoute, /QRCode\.toDataURL/);
  assert.match(employeeRoute, /employeeQrPayload/);
  assert.match(employeeClient, /Kody QR pracowników/);
  assert.match(employeeClient, /Uruchom skaner QR/);
  assert.match(employeeClient, /Pobierz PNG/);
  assert.match(employeeClient, /Drukuj wszystkie karty QR/);
  assert.match(employeeClient, /Wygeneruj i wyślij do Dotykački/);
  assert.match(barcodeRoute, /randomBytes\(10\)/);
  assert.match(barcodeRoute, /assignEmployeeBarcode/);
  assert.match(dotykackaClient, /method: "PATCH"/);
  assert.match(dotykackaClient, /"If-Match": etag/);
  assert.match(dotykackaClient, /if \(existingBarcode\) return/);
  assert.doesNotMatch(workforceRoute, /QRCode\.toDataURL/);
  assert.doesNotMatch(workforceClient, /Kody QR pracowników/);
});

test("supports overnight shifts and computes worked minutes", async () => {
  const { validateShift, workedMinutes } = await vite.ssrLoadModule("/lib/workforce.ts");
  const shift = validateShift({ employeeDotykackaId: "7", workDate: "2026-09-21", from: "20:00", to: "01:00", note: "zamknięcie" }, "2026-09-21");
  assert.equal(workedMinutes(shift.startsAt, shift.endsAt), 300);
});

test("workforce schema includes planning, punches, corrections and versioned calendar receipts", async () => {
  const [schema, migration] = await Promise.all([read("db/schema.ts"), read("drizzle/0038_workforce_planning.sql")]);
  for (const source of [schema, migration]) for (const table of ["work_availability_weeks", "work_schedules", "work_shifts", "work_schedule_receipts", "work_time_entries", "work_time_events", "work_time_correction_requests"]) assert.match(source, new RegExp(table));
  assert.match(schema, /barcode: text\("barcode"\)/);
});

test("employee profiles control future planning without removing historical settlements", async () => {
  const [schema, migration, profileRoute, employeeClient, adminRoute, adminClient, employeeRoute, employeePlanner] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0042_employee_profile_and_scheduling.sql"),
    read("app/api/admin/waiter/employees/[dotykackaId]/profile/route.ts"),
    read("app/admin/waiters/waiter-admin-client.tsx"),
    read("app/api/admin/workforce/route.ts"),
    read("app/admin/workforce/workforce-admin-client.tsx"),
    read("app/api/waiter/workforce/route.ts"),
    read("app/kelner/grafik/workforce-employee-client.tsx"),
  ]);

  for (const source of [schema, migration]) {
    assert.match(source, /include_in_schedule/);
    assert.match(source, /hourly_rate/);
    assert.match(source, /contact_phone/);
    assert.match(source, /contact_email/);
  }
  assert.match(profileRoute, /includeInSchedule/);
  assert.match(profileRoute, /hourlyRate/);
  assert.match(profileRoute, /contactPhone/);
  assert.match(profileRoute, /contactEmail/);
  assert.match(employeeClient, /Informacje o pracowniku/);
  assert.match(employeeClient, /Stawka za 1 godzinę pracy/);
  assert.match(employeeClient, /Grafik: \{employee\.includeInSchedule \? "TAK" : "NIE"\}/);
  assert.match(adminRoute, /eq\(waiterEmployees\.includeInSchedule, true\)/);
  assert.match(adminRoute, /settlementEmployees: allEmployees/);
  assert.match(adminClient, /data\?\.settlementEmployees\.map/);
  assert.match(employeeRoute, /if \(!employee\.includeInSchedule\)/);
  assert.match(employeePlanner, /Nadal masz dostęp do ewidencji godzin i rozliczeń/);
});

test("kiosk alternates clock-in and clock-out and guards duplicate scans", async () => {
  const route = await read("app/api/workforce/kiosk/scan/route.ts");
  assert.match(route, /CLOCK_IN/); assert.match(route, /CLOCK_OUT/); assert.match(route, /20_000/); assert.match(route, /workedMinutes/);
});

test("reservation workflow tracks two-hour notice and one-hour preparation separately", async () => {
  const [route, reminder, schema] = await Promise.all([read("app/api/waiter/reservations/route.ts"), read("app/kelner/reservation-reminder.tsx"), read("db/schema.ts")]);
  assert.match(route, /2 \* 3_600_000/); assert.match(route, /inOneHour/); assert.match(route, /ACK_2H/); assert.match(route, /TABLE_READY/); assert.match(route, /REQUEST_READY/);
  assert.match(reminder, /Zamknij do następnego logowania/); assert.match(reminder, /Stolik gotowy/); assert.match(reminder, /Potwierdź przygotowanie życzenia/);
  assert.match(schema, /reservation_notifications/); assert.match(schema, /table_ready_at/); assert.match(schema, /special_request_ready_at/); assert.match(schema, /added_by_name/);
});

test("keeps staff navigation visible and ordered in unified black top bars", async () => {
  const [navigation, waiter, reservations, instructions, workforce, inventory, layout, css] = await Promise.all([
    read("app/kelner/staff-navigation.tsx"),
    read("app/kelner/waiter-client.tsx"),
    read("app/kelner/rezerwacje/reservations-employee-client.tsx"),
    read("app/kelner/instrukcje/instruction-catalog-client.tsx"),
    read("app/kelner/grafik/workforce-employee-client.tsx"),
    read("app/kelner/inventory/inventory-worker-client.tsx"),
    read("app/kelner/layout.tsx"),
    read("app/kelner/unified-header.css"),
  ]);
  assert.match(navigation, /"\/kelner\/instrukcje", "\/kelner\/grafik", "\/kelner\/rezerwacje", "\/kelner\/inventory"/);
  assert.match(navigation, /logo-cafe\.png[^]*<Link href="\/kelner">← Menu<\/Link>[^]*<button type="button" onClick=\{logout\}>Wyloguj<\/button>/);
  const mainBrand = waiter.indexOf("waiter-main-brand");
  const mainTools = waiter.indexOf("waiter-main-tools", mainBrand);
  const employeeSummary = waiter.indexOf("waiter-employee-summary", mainTools);
  const mainControls = waiter.indexOf("waiter-main-controls", employeeSummary);
  assert.ok(mainBrand >= 0 && mainBrand < mainTools && mainTools < employeeSummary && employeeSummary < mainControls);
  assert.match(waiter.slice(mainTools, employeeSummary), /WaiterInstructionEntry[^]*Grafik[^]*Rezerwacje[^]*Inwentaryzacja[^]*Rozliczanie/);
  assert.match(waiter.slice(mainControls, mainControls + 700), /Rachunek dla gościa[^]*waiter-main-exit-controls[^]*← Menu[^]*Wyloguj/);
  assert.match(reservations, /<WaiterSectionHeader eyebrow="Goście i stoliki" title="Rezerwacje"/);
  assert.match(instructions, /<WaiterSectionHeader className="waiter-instruction-header" eyebrow="Katalog wiedzy"/);
  assert.match(workforce, /<WaiterSectionHeader eyebrow="Mój czas pracy" title="Grafik i dyspozycje"/);
  assert.match(inventory, /<WaiterSectionHeader eyebrow="Kontrola magazynu" title="Inwentaryzacja"/);
  assert.doesNotMatch(`${reservations}\n${instructions}\n${workforce}\n${inventory}`, /Wróć do zamówień|← Zamówienia/);
  assert.match(layout, /<WaiterStaffDock\/>/);
  assert.match(css, /\.waiter-section-header[^]*background-color: #000 !important;/);
  assert.match(css, /\.waiter-section-header > img[^]*width: 158px/);
  assert.match(css, /\.workforce-employee > header\.waiter-section-header[^]*margin: -28px calc\(-1 \* clamp\(18px, 4vw, 58px\)\) 0/);
  assert.match(css, /@media \(max-width: 760px\)[^]*\.waiter-main-tools[^]*overflow-x: auto/);
});

test("reservation calendar supports secure import and iPhone subscription export", async () => {
  process.env.ADMIN_SESSION_SECRET = "test-reservation-secret";
  const [calendarSource, automaticSync, syncRoute, adminReservations] = await Promise.all([
    read("lib/workforce-calendar.ts"),
    read("lib/reservation-calendar-sync.ts"),
    read("app/api/sync/dotykacka/route.ts"),
    read("app/admin/reservations/reservations-admin-client.tsx"),
  ]);
  assert.match(calendarSource, /replace\(\/\^webcal:\/i, "https:"\)/);
  assert.match(automaticSync, /onConflictDoUpdate/);
  assert.match(syncRoute, /syncReservationCalendar\(\)/);
  assert.match(syncRoute, /reservationCalendar/);
  assert.match(adminReservations, /automatycznie co około 2 minuty/);
  assert.match(adminReservations, /Odśwież rezerwacje teraz/);
  assert.match(adminReservations, /usunięte zdalnie/);
  assert.match(adminReservations, /scrollIntoView/);
  assert.match(adminReservations, /startEditing\(item\)/);
  assert.match(adminReservations, /Zapis do iCloud nie jest połączony/);
  const { importedReservation, reservationCalendarToken, validReservationCalendarToken, reservationsIcs } = await vite.ssrLoadModule("/lib/reservations.ts");
  const token = reservationCalendarToken(); assert.equal(validReservationCalendarToken(token), true); assert.equal(validReservationCalendarToken(`${token}x`), false);
  const ics = reservationsIcs([{ id: 1, guestName: "Anna", guestContact: "+48 123 456 789", partySize: 4, startsAt: new Date("2026-09-21T16:00:00Z"), endsAt: new Date("2026-09-21T18:00:00Z"), location: "Przy oknie", specialRequest: "Krzesełko", updatedAt: new Date("2026-09-20T10:00:00Z") }]);
  assert.match(ics, /BEGIN:VCALENDAR/); assert.match(ics, /Anna/); assert.match(ics, /Przy oknie/); assert.match(ics, /Krzesełko/);
  assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT5M/); assert.match(ics, /X-PUBLISHED-TTL:PT5M/); assert.match(ics, /LAST-MODIFIED:20260920T100000Z/); assert.match(ics, /SEQUENCE:1789898400/);
  const unknown = importedReservation({ uid: "phone-10", title: "Test", description: "Prośba zapisana na iPhonie", location: "", startsAt: "2026-09-21T08:00:00Z", endsAt: "2026-09-21T09:00:00Z" });
  assert.equal(unknown.partySize, null); assert.equal(unknown.guestContact, null); assert.equal(unknown.location, null); assert.equal(unknown.specialRequest, "Prośba zapisana na iPhonie");
  const withoutCount = reservationsIcs([{ id: 2, guestName: "Test", guestContact: null, partySize: null, startsAt: new Date("2026-09-21T08:00:00Z"), endsAt: new Date("2026-09-21T09:00:00Z"), location: null, specialRequest: "Notatka", updatedAt: new Date("2026-09-20T10:00:00Z") }]);
  assert.match(withoutCount, /SUMMARY:Rezerwacja · Test/); assert.doesNotMatch(withoutCount, /1 os\./); assert.doesNotMatch(withoutCount, /LOCATION:/);
  const calendarRoute = await read("app/api/reservations/calendar/[token]/route.ts");
  assert.match(calendarRoute, /createHash\("sha256"\)/); assert.match(calendarRoute, /"if-none-match"/); assert.match(calendarRoute, /status: 304/);
});

test("discovers the existing iCloud calendar for server-side write-back", async () => {
  process.env.ADMIN_SESSION_SECRET = "test-icloud-secret";
  const originalFetch = globalThis.fetch;
  const calls = [];
  const bodies = [
    `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>`,
    `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/principal/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/123/calendars/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>`,
    `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/reservations/</d:href><d:propstat><d:prop><d:displayname>Rezerwacje stoliki CAFE</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype></d:prop></d:propstat></d:response></d:multistatus>`,
  ];
  globalThis.fetch = async (input, init) => { const url = String(input); calls.push({ url, init }); return { url, status: 207, ok: true, text: async () => bodies.shift() }; };
  try {
    const { discoverIcloudCalendar, findIcloudEventUrl } = await vite.ssrLoadModule("/lib/caldav-client.ts");
    const result = await discoverIcloudCalendar("owner@icloud.com", "app-password", "Rezerwacje stoliki CAFE");
    assert.equal(result.calendarUrl, "https://caldav.icloud.com/123/calendars/reservations/");
    assert.equal(result.calendarName, "Rezerwacje stoliki CAFE");
    assert.equal(calls.length, 3);
    assert.match(calls[0].init.headers.authorization, /^Basic /);
    assert.equal(calls[2].init.headers.depth, "1");
    bodies.push(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/reservations/phone-event.ics</d:href><d:propstat><d:prop><c:calendar-data>BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:phone-123\nEND:VEVENT\nEND:VCALENDAR</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`);
    const eventUrl = await findIcloudEventUrl(result.calendarUrl, { username: result.username, password: result.password }, "phone-123");
    assert.equal(eventUrl, "https://caldav.icloud.com/123/calendars/reservations/phone-event.ics");
    assert.equal(calls[3].init.method, "REPORT");
  } finally { globalThis.fetch = originalFetch; }
  const [schema, migration, syncStateMigration, adminRoute, waiterRoute] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0043_icloud_calendar_writeback.sql"),
    read("drizzle/0048_reservation_calendar_sync_state.sql"),
    read("app/api/admin/reservations/route.ts"),
    read("app/api/waiter/reservations/route.ts"),
  ]);
  for (const source of [schema, migration]) for (const column of ["caldav_username_encrypted", "caldav_password_encrypted", "caldav_calendar_url_encrypted"]) assert.match(source, new RegExp(column));
  assert.match(schema, /calendarSyncedAt: timestamp\("calendar_synced_at"/);
  assert.match(syncStateMigration, /SET "calendar_synced_at" = "updated_at"/);
  assert.match(adminRoute, /CONNECT_ICLOUD/);
  assert.match(adminRoute, /syncReservationToIcloud/);
  assert.match(adminRoute, /validateReservation\(body, true\)/);
  assert.match(waiterRoute, /syncReservationToIcloud/);
  const icloudWriteback = await read("lib/icloud-caldav.ts");
  assert.match(icloudWriteback, /Zapis do wspólnego kalendarza iCloud nie jest jeszcze połączony/);
  const calendarSync = await read("lib/reservation-calendar-sync.ts");
  assert.match(calendarSync, /atelier-reservation-\(\\d\+\)@atelier-cafe/);
  assert.match(calendarSync, /db\.update\(reservations\)/);
  assert.match(calendarSync, /CANCELLED_REMOTE/);
  assert.match(calendarSync, /Usunięto w kalendarzu iCloud/);
  assert.match(calendarSync, /remoteUids\.has\(uid\)/);
  assert.match(icloudWriteback, /reservation\.updatedAt <= reservation\.calendarSyncedAt/);
  assert.match(icloudWriteback, /readIcloudReservationEvents/);
});
