const secret = process.env.SYNC_SECRET?.trim();
if (!secret) throw new Error("SYNC_SECRET is not configured");

const response = await fetch("http://127.0.0.1:8080/api/sync/dotykacka", {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
  cache: "no-store",
  signal: AbortSignal.timeout(240_000),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(body.error ?? `Automatic synchronization failed (${response.status})`);

console.log(JSON.stringify({
  status: body.status,
  productsImported: body.productsImported,
  translationStatus: body.translationStatus,
  productsTranslated: body.productsTranslated,
  coffeeAddonsTranslated: body.coffeeAddonsTranslated,
  translationWarning: body.translationWarning,
  reservationCalendarStatus: body.reservationCalendar?.status,
  reservationsImported: body.reservationCalendar?.imported,
  reservationCalendarError: body.reservationCalendar?.error,
}));
