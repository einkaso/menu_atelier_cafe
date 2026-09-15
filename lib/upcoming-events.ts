export type UpcomingEvent = {
  id: string;
  title: string;
  kind: string;
  day: string;
  month: string;
  time: string;
  sourceUrl: string;
};

const MAX_EVENTS = 30;

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function cleanText(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textByClass(block: string, classPart: string) {
  const pattern = new RegExp(`<div\\s+class=["'][^"']*${escapeRegExp(classPart)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, "i");
  return cleanText(block.match(pattern)?.[1] ?? "");
}

function textListByClass(block: string, classPart: string) {
  const pattern = new RegExp(`<div\\s+class=["'][^"']*${escapeRegExp(classPart)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, "gi");
  return [...block.matchAll(pattern)].map((match) => cleanText(match[1]));
}

function safeTicketUrl(rawUrl: string) {
  try {
    const url = new URL(decodeEntities(rawUrl));
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "martabanaszek.pl" && url.hostname !== "www.martabanaszek.pl") return null;
    if (!url.pathname.startsWith("/sklep/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseUpcomingEvents(html: string): UpcomingEvent[] {
  const upcomingMarker = html.search(/>\s*Nadchodzące\s*<\/div>/i);
  if (upcomingMarker < 0) throw new Error("Nie znaleziono sekcji Nadchodzące");

  const afterUpcoming = html.slice(upcomingMarker);
  const pastOffset = afterUpcoming.search(/>\s*Minione\s*<\/div>/i);
  if (pastOffset < 0) throw new Error("Nie znaleziono końca sekcji Nadchodzące");

  const section = afterUpcoming.slice(0, pastOffset);
  const cardStarts = [...section.matchAll(/<div\s+class=["'][^"']*self-stretch p-4 md:p-2[^"']*["'][^>]*>/gi)];
  const events: UpcomingEvent[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < cardStarts.length && events.length < MAX_EVENTS; index += 1) {
    const start = cardStarts[index].index ?? 0;
    const end = cardStarts[index + 1]?.index ?? section.length;
    const card = section.slice(start, end);
    const link = card.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?kup bilet[\s\S]*?<\/a>/i);
    const url = link ? safeTicketUrl(link[1]) : null;
    if (!url || seen.has(url)) continue;

    const dateParts = textListByClass(card, "text-xs lg:text-xl");
    const event = {
      id: new URL(url).pathname.replace(/\/$/, "").split("/").pop() ?? url,
      title: textByClass(card, "text-gray-200 text-xl lg:text-2xl"),
      kind: textByClass(card, "text-orange-300"),
      day: textByClass(card, "text-3xl lg:text-6xl"),
      month: dateParts[0] ?? "",
      time: dateParts[1] ?? "",
      sourceUrl: url,
    };

    if (!event.title || !event.day || !event.month) continue;
    seen.add(url);
    events.push(event);
  }

  return events;
}
