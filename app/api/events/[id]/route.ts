import { parseEventDetails } from "../../../../lib/event-details";
import { translatePolishTexts } from "../../../../lib/translation";
import { parseUpcomingEvents } from "../../../../lib/upcoming-events";

export const dynamic = "force-dynamic";

const CALENDAR_URL = "https://martabanaszek.pl/atelier-cafe/";
const MAX_HTML_SIZE = 3_000_000;
const DETAIL_TTL_MS = 5 * 60_000;

type CachedDetail = {
  descriptionPl: string;
  descriptionEn: string;
  image: string | null;
  fetchedAt: number;
  translationWarning: boolean;
};

const detailCache = new Map<string, CachedDetail>();

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "user-agent": "Atelier-Cafe-Menu/1.0 (+https://menu.martabanaszek.pl)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Źródło wydarzenia zwróciło ${response.status}`);
  const announcedSize = Number(response.headers.get("content-length") ?? 0);
  if (announcedSize > MAX_HTML_SIZE) throw new Error("Strona wydarzenia jest zbyt duża");
  const html = await response.text();
  if (html.length > MAX_HTML_SIZE) throw new Error("Strona wydarzenia jest zbyt duża");
  return html;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-z0-9-]{1,180}$/i.test(id)) return Response.json({ error: "Nieprawidłowe wydarzenie" }, { status: 400 });

  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.fetchedAt < DETAIL_TTL_MS) {
    return Response.json(cached, { headers: { "cache-control": "no-store" } });
  }

  try {
    const events = parseUpcomingEvents(await fetchHtml(CALENDAR_URL));
    const event = events.find((candidate) => candidate.id === id);
    if (!event) return Response.json({ error: "Wydarzenie nie jest już nadchodzące" }, { status: 404 });

    const parsed = parseEventDetails(await fetchHtml(event.sourceUrl));
    let descriptionEn = parsed.description;
    let translationWarning = false;
    try {
      descriptionEn = (await translatePolishTexts([parsed.description]))?.[0] || parsed.description;
      translationWarning = descriptionEn === parsed.description;
    } catch {
      translationWarning = true;
    }

    const detail = {
      descriptionPl: parsed.description,
      descriptionEn,
      image: parsed.image,
      fetchedAt: Date.now(),
      translationWarning,
    };
    detailCache.set(id, detail);
    return Response.json(detail, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (cached) return Response.json(cached, { headers: { "cache-control": "no-store" } });
    return Response.json(
      { error: error instanceof Error ? error.message : "Nie udało się pobrać opisu wydarzenia" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
