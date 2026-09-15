import { parseUpcomingEvents, type UpcomingEvent } from "../../../lib/upcoming-events";
import { translatePolishTexts } from "../../../lib/translation";

export const dynamic = "force-dynamic";

const PAGE_URL = "https://martabanaszek.pl/atelier-cafe/";
const CALENDAR_URL = `${PAGE_URL}#kalendarz`;
const MAX_HTML_SIZE = 3_000_000;

type PublicEvent = Omit<UpcomingEvent, "sourceUrl"> & { titleEn: string; kindEn: string };

let lastGood: { events: PublicEvent[]; fetchedAt: string } | null = null;
const translationCache = new Map<string, string>();

async function addEnglishTranslations(events: UpcomingEvent[]) {
  const sourceTexts = [...new Set(events.flatMap((event) => [event.title, event.kind]).filter(Boolean))];
  const missing = sourceTexts.filter((text) => !translationCache.has(text));
  let translationWarning = false;

  if (missing.length) {
    try {
      const translated = await translatePolishTexts(missing);
      if (translated) missing.forEach((text, index) => translationCache.set(text, translated[index] || text));
      else translationWarning = true;
    } catch {
      // Fresh Polish event data is still preferable to an outdated calendar.
      // Missing translations are retried automatically on the next refresh.
      translationWarning = true;
    }
  }

  return {
    events: events.map(({ sourceUrl: _sourceUrl, ...event }) => ({
      ...event,
      titleEn: translationCache.get(event.title) ?? event.title,
      kindEn: translationCache.get(event.kind) ?? event.kind,
    })),
    translationWarning,
  };
}

export async function GET() {
  try {
    const response = await fetch(PAGE_URL, {
      cache: "no-store",
      headers: { "user-agent": "Atelier-Cafe-Menu/1.0 (+https://menu.martabanaszek.pl)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Strona kalendarza zwróciła ${response.status}`);

    const announcedSize = Number(response.headers.get("content-length") ?? 0);
    if (announcedSize > MAX_HTML_SIZE) throw new Error("Strona kalendarza jest zbyt duża");

    const html = await response.text();
    if (html.length > MAX_HTML_SIZE) throw new Error("Strona kalendarza jest zbyt duża");

    const parsedEvents = parseUpcomingEvents(html);
    if (parsedEvents.length === 0) throw new Error("Brak rozpoznanych nadchodzących wydarzeń");
    const { events, translationWarning } = await addEnglishTranslations(parsedEvents);

    lastGood = { events, fetchedAt: new Date().toISOString() };
    return Response.json(
      { ...lastGood, source: CALENDAR_URL, stale: false, translationWarning },
      { headers: { "cache-control": "no-store, no-cache, must-revalidate", pragma: "no-cache", expires: "0" } },
    );
  } catch (error) {
    if (lastGood) {
      return Response.json(
        { ...lastGood, source: CALENDAR_URL, stale: true, translationWarning: false },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(
      { events: [], source: CALENDAR_URL, error: error instanceof Error ? error.message : "Nie udało się pobrać wydarzeń" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
