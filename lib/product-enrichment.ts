import "server-only";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { WineSourceProposal } from "../db/schema";
import { manualProductSearchUrl, productSearchTitle } from "./manual-product-search";
import { detectSparklingType } from "./wine-characteristics";

export type ProductKind = "wine" | "whisky" | "beer" | "product";

export type DiscoveryInput = {
  name: string;
  kind: ProductKind;
  supplierName?: string | null;
  supplierWebsite?: string | null;
  supplierProductCode?: string | null;
  eanCodes?: string[];
  catalogCode?: string | null;
};

type CandidatePage = {
  url: string;
  html: string;
  text: string;
  title: string;
  snippet: string;
  tier: "supplier" | "web";
};

export type ProductSearchCandidate = {
  url: string;
  title: string;
  description: string;
  imageUrl?: string;
};

export type ProductDiscoveryResult = {
  proposal: WineSourceProposal;
  sourceUrls: string[];
  sourceKind: "SUPPLIER_WEBSITE" | "OPEN_FOOD_FACTS" | "WEB_SEARCH" | "MULTIPLE_SOURCES" | "MANUAL_URL" | "MANUAL_TEXT";
  fingerprint: string;
  manualSearchUrl: string;
  webSearchConfigured: boolean;
  warnings: string[];
};

const MAX_PAGE_BYTES = 1_500_000;
const USER_AGENT = "BanaszekCafeMenu/1.0 (https://menu.martabanaszek.pl)";
const SEARCH_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36";
const SEARCH_CACHE_TTL_MS = 30 * 60_000;
const indexedCandidateCache = new Map<string, { candidate: ProductSearchCandidate; storedAt: number }>();
const countries = [
  "Polska", "Portugalia", "Hiszpania", "Francja", "Włochy", "Niemcy", "Austria", "Gruzja",
  "Chile", "Argentyna", "Australia", "Nowa Zelandia", "RPA", "Republika Południowej Afryki",
  "USA", "Stany Zjednoczone", "Szkocja", "Irlandia", "Anglia", "Wielka Brytania", "Grecja", "Bułgaria",
  "Urugwaj", "Węgry", "Czechy", "Słowacja", "Słowenia", "Chorwacja",
];
const countryAliases: Record<string, string[]> = {
  Polska: ["polskie", "polski", "polska", "polish"],
  Portugalia: ["portugalskie", "portugalski", "portuguese", "portugal"],
  Hiszpania: ["hiszpanskie", "hiszpanski", "spanish", "spain", "espana"],
  Francja: ["francuskie", "francuski", "french", "france"],
  Włochy: ["wloskie", "wloski", "wloska", "italian", "italy", "italia"],
  Niemcy: ["niemieckie", "niemiecki", "german", "germany", "deutschland"],
  Austria: ["austriackie", "austriacki", "austrian"],
  Gruzja: ["gruzinskie", "gruzinski", "georgian", "georgia"],
  Chile: ["chilijskie", "chilijski", "chilean"],
  Argentyna: ["argentynskie", "argentynski", "argentinian", "argentina"],
  Australia: ["australijskie", "australijski", "australian"],
  "Nowa Zelandia": ["nowozelandzkie", "nowozelandzki", "new zealand"],
  "Republika Południowej Afryki": ["poludniowoafrykanskie", "poludniowoafrykanski", "south african", "south africa"],
  USA: ["amerykanskie", "amerykanski", "american", "united states"],
  Szkocja: ["szkockie", "szkocki", "scotch", "scotland", "scottish"],
  Irlandia: ["irlandzkie", "irlandzki", "irish", "ireland"],
  Anglia: ["angielskie", "angielski", "english", "england"],
  "Wielka Brytania": ["brytyjskie", "brytyjski", "united kingdom", "great britain", "uk"],
  Grecja: ["greckie", "grecki", "greek", "greece"],
  Bułgaria: ["bulgarskie", "bulgarski", "bulgarian", "bulgaria"],
  Urugwaj: ["urugwajskie", "urugwajski", "uruguayan", "uruguay"],
  Węgry: ["wegierskie", "wegierski", "hungarian", "hungary"],
};
const grapes = [
  "Albariño", "Alvarinho", "Arinto", "Cabernet Franc", "Cabernet Sauvignon", "Chardonnay", "Chenin Blanc",
  "Gewürztraminer", "Glera", "Grenache", "Garnacha", "Malbec", "Merlot", "Moscatel", "Moscato", "Muscat",
  "Nebbiolo", "Nero d'Avola", "Pinot Blanc", "Pinot Grigio", "Pinot Gris", "Pinot Noir", "Pinotage",
  "Primitivo", "Riesling", "Sangiovese", "Sauvignon Blanc", "Shiraz", "Syrah", "Tempranillo", "Teroldego",
  "Touriga Nacional", "Verdejo", "Viognier", "Weissburgunder", "Zinfandel",
];

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    }
    return named[entity.toLowerCase()] ?? " ";
  });
}

function plainText(html: string) {
  const text = decodeHtml(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|td|th|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " "));
  return text.split(/\r?\n/).map(compact).filter(Boolean).join("\n");
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLocaleLowerCase("pl");
}

function productTokens(value: string) {
  const ignored = new Set(["wino", "wine", "piwo", "beer", "whisky", "whiskey", "brandy", "koniak", "cognac", "kieliszek", "szklanka", "butelka", "ml", "vol", "the", "and", "oraz"]);
  return normalized(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !ignored.has(token));
}

function isPrivateAddress(address: string) {
  const value = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  if (value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

async function publicUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("Nieprawidłowy publiczny adres strony.");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("Adres lokalny nie jest dozwolony.");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Adres prowadzi do sieci prywatnej.");
  return url;
}

async function fetchPublicText(rawUrl: string) {
  let url = await publicUrl(rawUrl);
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml;q=0.9" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Nieprawidłowe przekierowanie.");
      url = await publicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      if (response.headers.get("cf-mitigated") === "challenge" || response.status === 403 && response.headers.has("cf-ray")) {
        throw new Error("Ta strona chroni treść przed automatycznym odczytem, a jej zindeksowana kopia nie była dostępna. Użyj pola „Wklejona treść strony” w panelu.");
      }
      throw new Error(`Strona zwróciła kod ${response.status}.`);
    }
    const announced = Number(response.headers.get("content-length") ?? 0);
    if (announced > MAX_PAGE_BYTES) throw new Error("Strona jest zbyt duża do bezpiecznej analizy.");
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_PAGE_BYTES) throw new Error("Strona jest zbyt duża do bezpiecznej analizy.");
    if (/\b(?:__cf_chl_opt|cf-chl-|just a moment)\b/i.test(body)) {
      throw new Error("Ta strona chroni treść przed automatycznym odczytem, a jej zindeksowana kopia nie była dostępna. Użyj pola „Wklejona treść strony” w panelu.");
    }
    return { url: url.toString(), body };
  }
  throw new Error("Zbyt wiele przekierowań.");
}

function attribute(html: string, name: string, value: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
    if (key?.toLowerCase() !== value.toLowerCase()) continue;
    return decodeHtml(tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").trim();
  }
  return "";
}

function pageFromHtml(url: string, html: string, tier: CandidatePage["tier"], fallbackSnippet = ""): CandidatePage {
  const title = compact(decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
  const snippet = attribute(html, "property", "og:description") || attribute(html, "name", "description") || fallbackSnippet;
  return { url, html, text: plainText(html), title, snippet: compact(snippet), tier };
}

function pageFromText(url: string, sourceText: string): CandidatePage {
  const text = sourceText.split(/\r?\n/)
    .map((line) => compact(line.replace(/^\s*(?:#{1,6}|[-*•])\s*/, "")))
    .filter(Boolean)
    .join("\n");
  return { url, html: "", text, title: text.split("\n")[0]?.slice(0, 180) ?? "", snippet: "", tier: "web" };
}

function decodeJavaScriptString(value: string) {
  try { return JSON.parse(`"${value}"`) as string; } catch { return value; }
}

function canonicalProductUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    return `${url.hostname.replace(/^www\./i, "")}${url.pathname.replace(/\/$/, "")}`.toLocaleLowerCase("pl");
  } catch { return rawUrl.toLocaleLowerCase("pl"); }
}

export function extractBraveSearchCandidates(html: string): ProductSearchCandidate[] {
  const candidates: ProductSearchCandidate[] = [];
  const recordPattern = /\{title:"((?:\\.|[^"\\])*)",url:"((?:\\.|[^"\\])*)",full_title:(?:"(?:\\.|[^"\\])*"|void 0),description:(?:"((?:\\.|[^"\\])*)"|void 0),page_age:/g;
  for (const match of html.matchAll(recordPattern)) {
    const url = decodeJavaScriptString(match[2]);
    if (!/^https?:\/\//i.test(url)) continue;
    const title = compact(plainText(decodeJavaScriptString(match[1])));
    const description = compact(plainText(decodeJavaScriptString(match[3] ?? "")));
    const following = html.slice(match.index ?? 0, (match.index ?? 0) + 8_000);
    const thumbnail = following.match(/thumbnail:\{src:"(?:\\.|[^"\\])*",original:"((?:\\.|[^"\\])*)"/)?.[1];
    const candidate = { url, title, description, ...(thumbnail ? { imageUrl: decodeJavaScriptString(thumbnail) } : {}) };
    if (!candidates.some((item) => canonicalProductUrl(item.url) === canonicalProductUrl(url))) candidates.push(candidate);
    if (candidates.length >= 8) break;
  }
  return candidates;
}

function decodeBingResultUrl(rawUrl: string) {
  const decoded = decodeHtml(rawUrl);
  try {
    const url = new URL(decoded, "https://www.bing.com");
    const encodedTarget = url.searchParams.get("u");
    if (url.hostname.endsWith("bing.com") && encodedTarget?.startsWith("a1")) {
      return Buffer.from(encodedTarget.slice(2), "base64url").toString("utf8");
    }
    return url.toString();
  } catch { return decoded; }
}

export function extractBingSearchCandidates(html: string): ProductSearchCandidate[] {
  const candidates: ProductSearchCandidate[] = [];
  for (const match of html.matchAll(/<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const record = match[1];
    const heading = record.match(/<h2\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
    if (!heading) continue;
    const url = decodeBingResultUrl(heading[1]);
    if (!/^https?:\/\//i.test(url) || /(^|\.)bing\.com$/i.test(new URL(url).hostname)) continue;
    const title = compact(plainText(heading[2]));
    const description = compact(plainText(record.match(/<div\b[^>]*class=["'][^"']*\bb_caption\b[^"']*["'][^>]*>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? ""));
    if (!title) continue;
    const candidate = { url, title, description };
    if (!candidates.some((item) => canonicalProductUrl(item.url) === canonicalProductUrl(url))) candidates.push(candidate);
    if (candidates.length >= 8) break;
  }
  return candidates;
}

function polishSourceScore(candidate: { url: string; title?: string; description?: string }) {
  let score = 0;
  try {
    const url = new URL(candidate.url);
    if (url.hostname.toLocaleLowerCase("pl").endsWith(".pl")) score += 100;
    if (/^\/pl(?:\/|$)/i.test(url.pathname)) score += 16;
  } catch { /* A malformed result will simply receive no regional preference. */ }
  const text = normalized(`${candidate.title ?? ""} ${candidate.description ?? ""}`);
  for (const marker of ["wino", "sklep", "szczep", "wytrawne", "polwytrawne", "slodkie", "region", "kraj", "alkohol", "dostawa", "cena"]) {
    if (new RegExp(`(?:^|[^a-z0-9])${marker}(?=$|[^a-z0-9])`).test(text)) score += 2;
  }
  return score;
}

export function preferPolishSearchCandidates<T extends { url: string; title?: string; description?: string }>(candidates: T[]): T[] {
  return candidates.map((candidate, order) => ({ candidate, order, score: polishSourceScore(candidate) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ candidate }) => candidate);
}

export function productSearchPageEndpoints(query: string, page = 0) {
  const safePage = Number.isInteger(page) ? Math.max(0, Math.min(page, 9)) : 0;
  const brave = new URL("https://search.brave.com/search");
  brave.searchParams.set("q", query);
  brave.searchParams.set("source", "web");
  brave.searchParams.set("country", "pl");
  brave.searchParams.set("search_lang", "pl");
  brave.searchParams.set("ui_lang", "pl-PL");
  if (safePage > 0) brave.searchParams.set("offset", String(safePage));

  const bing = new URL("https://www.bing.com/search");
  bing.searchParams.set("q", query);
  bing.searchParams.set("cc", "pl");
  bing.searchParams.set("setlang", "pl-PL");
  if (safePage > 0) bing.searchParams.set("first", String(safePage * 8 + 1));
  return { brave, bing };
}

export async function searchProductCandidates(query: string, page = 0): Promise<ProductSearchCandidate[]> {
  const endpoints = productSearchPageEndpoints(query, page);
  const providers = [
    {
      name: "Brave",
      endpoint: () => endpoints.brave,
      extract: extractBraveSearchCandidates,
    },
    {
      name: "Bing",
      endpoint: () => endpoints.bing,
      extract: extractBingSearchCandidates,
    },
  ];
  const failures: string[] = [];
  let candidates: ProductSearchCandidate[] = [];
  for (const provider of providers) {
    try {
      const response = await fetch(provider.endpoint(), {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: { accept: "text/html,application/xhtml+xml", "accept-language": "pl-PL,pl;q=0.9", "user-agent": SEARCH_USER_AGENT },
      });
      if (!response.ok) throw new Error(`kod ${response.status}`);
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_PAGE_BYTES) throw new Error("wyniki są zbyt duże");
      candidates = preferPolishSearchCandidates(provider.extract(body));
      if (candidates.length) break;
      failures.push(`${provider.name}: brak wyników`);
    } catch (error) {
      failures.push(`${provider.name}: ${error instanceof Error ? error.message : "nieznany błąd"}`);
    }
  }
  if (!candidates.length) throw new Error(`Wyszukiwanie nie zwróciło wyników. ${failures.join("; ")}`);
  const now = Date.now();
  for (const [key, cached] of indexedCandidateCache) if (now - cached.storedAt > SEARCH_CACHE_TTL_MS) indexedCandidateCache.delete(key);
  for (const candidate of candidates) indexedCandidateCache.set(canonicalProductUrl(candidate.url), { candidate, storedAt: now });
  return candidates;
}

export async function indexedPageForProtectedUrl(input: DiscoveryInput, sourceUrl: string) {
  const hostname = new URL(sourceUrl).hostname.replace(/^www\./i, "");
  const requested = canonicalProductUrl(sourceUrl);
  const cached = indexedCandidateCache.get(requested);
  const candidates = cached && Date.now() - cached.storedAt <= SEARCH_CACHE_TTL_MS
    ? [cached.candidate]
    : await searchProductCandidates(`site:${hostname} "${productSearchTitle(input.name)}"`);
  const candidate = candidates.find((item) => canonicalProductUrl(item.url) === requested)
    ?? candidates.sort((a, b) => relevance(`${b.title} ${b.description}`, input) - relevance(`${a.title} ${a.description}`, input))[0];
  if (!candidate || relevance(`${candidate.title} ${candidate.description}`, input) <= 0) return null;
  return {
    url: sourceUrl,
    html: "",
    text: [candidate.title, candidate.description, candidate.imageUrl].filter(Boolean).join("\n"),
    title: candidate.title,
    snippet: candidate.description,
    tier: "web" as const,
  };
}

function relevance(value: string, input: DiscoveryInput) {
  const haystack = normalized(value);
  let score = productTokens(input.name).reduce((sum, token) => sum + (haystack.includes(token) ? 3 : 0), 0);
  for (const identifier of [...(input.eanCodes ?? []), input.supplierProductCode ?? "", input.catalogCode ?? ""]) {
    if (identifier && haystack.includes(normalized(identifier))) score += 12;
  }
  return score;
}

function sameOriginLinks(pageUrl: string, html: string, input: DiscoveryInput) {
  const origin = new URL(pageUrl).origin;
  const candidates = Array.from(html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    .map((match) => {
      try {
        const url = new URL(decodeHtml(match[1]), pageUrl);
        return url.origin === origin && ["http:", "https:"].includes(url.protocol)
          ? { url: url.toString(), score: relevance(`${url.pathname} ${plainText(match[2])}`, input) }
          : null;
      } catch { return null; }
    })
    .filter((item): item is { url: string; score: number } => Boolean(item?.score))
    .sort((a, b) => b.score - a.score);
  return Array.from(new Map(candidates.map((item) => [item.url, item])).values()).slice(0, 5).map((item) => item.url);
}

async function supplierPages(input: DiscoveryInput, warnings: string[]) {
  if (!input.supplierWebsite) return [];
  try {
    const home = await fetchPublicText(input.supplierWebsite);
    const pages = [pageFromHtml(home.url, home.body, "supplier")];
    let links = sameOriginLinks(home.url, home.body, input);
    if (!links.length) {
      try {
        const sitemap = await fetchPublicText(new URL("/sitemap.xml", home.url).toString());
        links = Array.from(sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/gi))
          .map((match) => decodeHtml(match[1]).trim())
          .map((url) => ({ url, score: relevance(url, input) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((item) => item.url);
      } catch { /* A sitemap is helpful but optional. */ }
    }
    for (const link of links) {
      try {
        const fetched = await fetchPublicText(link);
        pages.push(pageFromHtml(fetched.url, fetched.body, "supplier"));
      } catch { /* Skip a single inaccessible catalogue page. */ }
    }
    return pages.sort((a, b) => relevance(`${b.title} ${b.text}`, input) - relevance(`${a.title} ${a.text}`, input)).slice(0, 5);
  } catch (error) {
    warnings.push(`Nie udało się odczytać strony dostawcy: ${error instanceof Error ? error.message : "nieznany błąd"}`);
    return [];
  }
}

type OpenFoodFactsProduct = {
  product_name?: string;
  product_name_pl?: string;
  generic_name?: string;
  generic_name_pl?: string;
  brands?: string;
  categories?: string;
  categories_tags?: string[];
  countries?: string;
  countries_tags?: string[];
  origins?: string;
  origins_tags?: string[];
  labels?: string;
  labels_tags?: string[];
  quantity?: string;
  image_url?: string;
  image_front_url?: string;
  selected_images?: {
    front?: {
      display?: Record<string, string>;
      small?: Record<string, string>;
    };
  };
  nutriments?: { alcohol_100g?: string | number };
};

function openFoodFactsProposal(product: OpenFoodFactsProduct, ean: string, input: DiscoveryInput) {
  const sourceUrl = `https://world.openfoodfacts.org/product/${encodeURIComponent(ean)}`;
  const descriptionParts = [
    product.generic_name_pl,
    product.generic_name,
    product.categories,
    product.origins,
  ].filter((value): value is string => Boolean(value?.trim()));
  const searchable = [
    product.product_name_pl,
    product.product_name,
    product.brands,
    product.categories,
    ...(product.categories_tags ?? []),
    product.countries,
    ...(product.countries_tags ?? []),
    product.origins,
    ...(product.origins_tags ?? []),
    product.labels,
    ...(product.labels_tags ?? []),
  ].filter(Boolean).join(" ");
  const imageUrls = Array.from(new Set([
    product.image_front_url,
    product.image_url,
    ...Object.values(product.selected_images?.front?.display ?? {}),
    ...Object.values(product.selected_images?.front?.small ?? {}),
  ].filter((value): value is string => Boolean(value))));
  const imageCandidates = imageUrls.slice(0, 8).map((url) => ({
    url,
    sourceUrl,
    label: "Open Food Facts",
  }));
  const alcoholValue = product.nutriments?.alcohol_100g;
  const alcoholPercentage = typeof alcoholValue === "number" || (typeof alcoholValue === "string" && alcoholValue.trim())
    ? `${String(alcoholValue).replace(".", ",")}%`
    : detectedAlcohol(searchable);
  const volume = detectedVolume(product.quantity ?? searchable);
  const proposal: WineSourceProposal = {
    descriptionPl: cleanDescription(descriptionParts.join(" · ")),
    imageSourceUrl: imageCandidates[0]?.url ?? null,
    imageCandidates,
    sourceUrls: [sourceUrl],
    attributes: {},
  };
  if (input.kind === "wine") {
    proposal.country = detectedCountry(`${product.origins ?? ""} ${product.countries ?? ""} ${searchable}`);
    proposal.grapes = detectedGrapes(searchable);
    proposal.wineColor = detectedWineColor(searchable);
    proposal.sparklingType = detectSparklingType(searchable);
    proposal.sweetness = detectedSweetness(searchable);
    proposal.veganStatus = /(?:^|[-_\s])(vegan|wegansk)/i.test(searchable) ? "YES" : "UNKNOWN";
    proposal.attributes = { ...(alcoholPercentage ? { alcoholPercentage } : {}), ...(volume ? { volume } : {}) };
  } else if (input.kind === "whisky") {
    proposal.attributes = {
      ...(detectedSpiritType(searchable) ? { spiritType: detectedSpiritType(searchable)! } : {}),
      ...(detectedSpiritStyle(searchable) ? { spiritStyle: detectedSpiritStyle(searchable)! } : {}),
      ...(detectedCountry(`${product.origins ?? ""} ${product.countries ?? ""} ${searchable}`) ? { origin: detectedCountry(`${product.origins ?? ""} ${product.countries ?? ""} ${searchable}`)! } : {}),
      ...(detectedAgeStatement(searchable) ? { ageStatement: detectedAgeStatement(searchable)! } : {}),
      ...(alcoholPercentage ? { alcoholPercentage } : {}),
      ...(detectedTasteProfile(searchable) ? { tasteProfile: detectedTasteProfile(searchable)! } : {}),
      ...(volume ? { volume } : {}),
    };
  } else if (input.kind === "beer") {
    const beerStyle = detectedBeerStyle(searchable);
    const origin = detectedCountry(`${product.origins ?? ""} ${product.countries ?? ""} ${searchable}`);
    proposal.attributes = {
      ...(alcoholPercentage ? { alcoholPercentage } : {}),
      ...(beerStyle ? { beerStyle } : {}),
      ...(origin ? { origin } : {}),
      ...(volume ? { volume } : {}),
    };
  }
  return { proposal, sourceUrl };
}

async function openFoodFactsProducts(input: DiscoveryInput, warnings: string[]) {
  const eans = Array.from(new Set((input.eanCodes ?? [])
    .map((value) => value.replace(/\D/g, ""))
    .filter((value) => value.length >= 8 && value.length <= 14))).slice(0, 2);
  const results: Array<{ proposal: WineSourceProposal; sourceUrl: string }> = [];
  for (const ean of eans) {
    try {
      const endpoint = new URL(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(ean)}`);
      endpoint.searchParams.set("fields", [
        "product_name", "product_name_pl", "generic_name", "generic_name_pl", "brands", "categories", "categories_tags",
        "countries", "countries_tags", "origins", "origins_tags", "labels", "labels_tags", "quantity", "image_url",
        "image_front_url", "selected_images", "nutriments",
      ].join(","));
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(12_000),
        headers: { accept: "application/json", "user-agent": USER_AGENT },
      });
      if (response.status === 404) continue;
      if (!response.ok) throw new Error(`katalog zwrócił kod ${response.status}`);
      const body = await response.json() as { status?: string; product?: OpenFoodFactsProduct };
      if (!body.product || (body.status && body.status !== "success")) continue;
      const result = openFoodFactsProposal(body.product, ean, input);
      if (proposalHasContent(result.proposal)) results.push(result);
    } catch (error) {
      warnings.push(`Nie udało się sprawdzić Open Food Facts dla EAN ${ean}: ${error instanceof Error ? error.message : "nieznany błąd"}`);
    }
  }
  return results;
}

function searchQuery(input: DiscoveryInput) {
  const identifier = input.eanCodes?.find((value) => /^\d{8,14}$/.test(value.replace(/\s/g, ""))) || input.supplierProductCode || input.catalogCode;
  const kind = input.kind === "wine" ? "wino" : input.kind === "whisky" ? "whisky koniak brandy" : input.kind === "beer" ? "piwo" : "produkt";
  return [identifier ? `"${identifier}"` : `"${input.name}"`, input.supplierName, kind].filter(Boolean).join(" ");
}

async function webPages(input: DiscoveryInput, warnings: string[]) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  try {
    let results: Array<{ url: string; title?: string; description?: string; extra_snippets?: string[] }>;
    if (key) {
      const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
      endpoint.searchParams.set("q", searchQuery(input));
      endpoint.searchParams.set("count", "6");
      endpoint.searchParams.set("country", "PL");
      endpoint.searchParams.set("search_lang", "pl");
      endpoint.searchParams.set("extra_snippets", "true");
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(12_000),
        headers: { accept: "application/json", "x-subscription-token": key },
      });
      if (!response.ok) throw new Error(`usługa wyszukiwania zwróciła kod ${response.status}`);
      const body = await response.json() as { web?: { results?: Array<{ url?: string; title?: string; description?: string; extra_snippets?: string[] }> } };
      results = preferPolishSearchCandidates((body.web?.results ?? [])
        .filter((item): item is { url: string; title?: string; description?: string; extra_snippets?: string[] } => Boolean(item.url)))
        .slice(0, 5);
    } else {
      results = (await searchProductCandidates(searchQuery(input))).slice(0, 5);
    }
    const pages: CandidatePage[] = [];
    for (const result of results) {
      const snippet = compact([result.description, ...(result.extra_snippets ?? [])].filter(Boolean).join(" "));
      try {
        const fetched = await fetchPublicText(result.url);
        pages.push(pageFromHtml(fetched.url, fetched.body, "web", snippet));
      } catch {
        pages.push({ url: result.url, html: "", text: snippet, title: result.title ?? "", snippet, tier: "web" });
      }
    }
    return pages;
  } catch (error) {
    warnings.push(`Nie udało się przeszukać internetu: ${error instanceof Error ? error.message : "nieznany błąd"}`);
    return [];
  }
}

function jsonLdProducts(html: string) {
  const found: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
    if (types.some((type) => typeof type === "string" && ["product", "individualproduct"].includes(type.toLowerCase()))) found.push(record);
    Object.values(record).forEach(visit);
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Ignore malformed structured data. */ }
  }
  return found;
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") return compact(value);
  if (Array.isArray(value)) return firstString(value[0]);
  if (value && typeof value === "object") return firstString((value as Record<string, unknown>).url ?? (value as Record<string, unknown>).contentUrl);
  return null;
}

function imageStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(imageStrings);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return imageStrings(record.url ?? record.contentUrl ?? record.thumbnailUrl);
  }
  return [];
}

function labelled(text: string, labels: string[]) {
  const pattern = new RegExp(`\\b(?:${labels.join("|")})\\s*[:–—-]\\s*([^\\n|•]{2,100})`, "i");
  return compact(text.match(pattern)?.[1] ?? "").replace(/[.;,]+$/, "") || null;
}

function tableFacts(html: string) {
  const facts = new Map<string, string>();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((cell) => compact(plainText(cell[1])));
    if (cells.length < 2) continue;
    const value = cells.slice(1).join(" · ").trim();
    addFact(facts, cells[0], value);
  }
  return facts;
}

function addFact(facts: Map<string, string>, rawKey: string, rawValue: string) {
  const key = normalized(rawKey).replace(/\s*[%:–—-]+\s*$/, "");
  const value = compact(rawValue);
  if (key && key.length <= 80 && value && value.length <= 500 && !facts.has(key)) facts.set(key, value);
}

function definitionFacts(html: string) {
  const facts = new Map<string, string>();
  for (const pair of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
    addFact(facts, plainText(pair[1]), plainText(pair[2]));
  }
  return facts;
}

const copiedFactLabels = [
  "zawartość alkoholu %", "zawartość alkoholu", "poziom wytrawności", "poziom słodyczy",
  "kraj pochodzenia", "kraj wina", "region winiarski", "region wina", "rodzaj wina", "wino wegańskie", "profil smakowy",
  "szczep / szczepy", "szczep winorośli", "nuty smakowe", "nota degustacyjna", "apelacja", "pochodzenie",
  "pojemność", "objętość", "szczepy", "szczep", "grona", "region", "kraj", "kolor",
  "charakter", "typ", "styl", "smak", "alkohol", "aromaty",
];

function copiedTextFacts(text: string) {
  const facts = new Map<string, string>();
  const lines = text.split(/\r?\n/).map((line) => compact(line.replace(/^\s*(?:#{1,6}|[-*•])\s*/, ""))).filter(Boolean);
  const labels = copiedFactLabels.map((label) => ({ raw: label, normalized: normalized(label).replace(/\s*%\s*$/, "") }))
    .sort((a, b) => b.normalized.length - a.normalized.length);
  const labelSet = new Set(labels.map((label) => label.normalized));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = normalized(line).replace(/\s*%\s*$/, "").replace(/\s*[:–—-]\s*$/, "");
    if (labelSet.has(normalizedLine)) {
      const value = lines[index + 1];
      if (value && !labelSet.has(normalized(value).replace(/\s*%\s*$/, "").replace(/\s*[:–—-]\s*$/, ""))) addFact(facts, normalizedLine, value);
      continue;
    }
    for (const label of labels) {
      const match = normalizedLine.match(new RegExp(`^${label.normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:–—-]\\s*(.{1,300})$`, "i"));
      if (match?.[1]) {
        addFact(facts, label.normalized, line.slice(Math.max(0, line.length - match[1].length)));
        break;
      }
    }
  }
  return facts;
}

function copiedTextSection(text: string, starts: string[], stops: string[]) {
  const lines = text.split(/\r?\n/).map(compact).filter(Boolean);
  const startSet = new Set(starts.map(normalized));
  const stopSet = new Set(stops.map(normalized));
  const start = lines.findIndex((line) => startSet.has(normalized(line.replace(/^#+\s*/, ""))));
  if (start < 0) return null;
  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const clean = line.replace(/^#+\s*/, "");
    if (stopSet.has(normalized(clean))) break;
    collected.push(clean);
  }
  const value = compact(collected.join(" "));
  return value.length >= 20 ? value : null;
}

function embeddedProductRecords(html: string) {
  const records: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/\bdata-product\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[2]));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) records.push(parsed as Record<string, unknown>);
    } catch { /* Ignore an unrelated or malformed data attribute. */ }
  }
  return records;
}

function embeddedFeatureFacts(record: Record<string, unknown> | undefined) {
  const facts = new Map<string, string>();
  if (!record || !Array.isArray(record.features)) return facts;
  for (const feature of record.features) {
    if (!feature || typeof feature !== "object") continue;
    const row = feature as Record<string, unknown>;
    if (typeof row.name !== "string") continue;
    const value = firstString(row.value);
    if (value) addFact(facts, row.name, value);
  }
  return facts;
}

function structuredPropertyFacts(record: Record<string, unknown> | undefined) {
  const facts = new Map<string, string>();
  if (!record || !Array.isArray(record.additionalProperty)) return facts;
  for (const property of record.additionalProperty) {
    if (!property || typeof property !== "object") continue;
    const row = property as Record<string, unknown>;
    if (typeof row.name !== "string") continue;
    const value = firstString(row.value);
    if (!value) continue;
    const label = row.name.replace(/^pa_/i, "").replaceAll("_", " ");
    addFact(facts, label, value);
  }
  return facts;
}

function mergeFacts(...sources: Map<string, string>[]) {
  const facts = new Map<string, string>();
  for (const source of sources) {
    for (const [key, value] of source) if (!facts.has(key)) facts.set(key, value);
  }
  return facts;
}

function elementBlocks(html: string, predicate: (attributes: string) => boolean) {
  const blocks: string[] = [];
  for (const opening of html.matchAll(/<(div|section|article|p)\b([^>]*)>/gi)) {
    if (!predicate(opening[2])) continue;
    const tag = opening[1].toLocaleLowerCase("en");
    const contentStart = (opening.index ?? 0) + opening[0].length;
    const boundary = new RegExp(`<${tag}\\b[^>]*>|<\\/${tag}\\s*>`, "gi");
    boundary.lastIndex = contentStart;
    let depth = 1;
    for (let token = boundary.exec(html); token; token = boundary.exec(html)) {
      if (/^<\//.test(token[0])) depth -= 1;
      else depth += 1;
      if (depth !== 0) continue;
      blocks.push(html.slice(contentStart, token.index));
      break;
    }
  }
  return blocks;
}

function classTokens(attributes: string) {
  const value = attributes.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  return value.split(/\s+/).filter(Boolean);
}

function productDescriptions(html: string) {
  const shortBlocks = elementBlocks(html, (attributes) => /\bid\s*=\s*["']product-description-short(?:-[^"']*)?["']/i.test(attributes)
    || classTokens(attributes).includes("woocommerce-product-details__short-description"));
  const fullBlocks = elementBlocks(html, (attributes) => classTokens(attributes).includes("product-description")
    || classTokens(attributes).includes("woocommerce-Tabs-panel--description")
    || /\bid\s*=\s*["']tab-description["']/i.test(attributes));
  const itempropBlocks = elementBlocks(html, (attributes) => /\bitemprop\s*=\s*["']description["']/i.test(attributes));
  return {
    short: [...shortBlocks, ...itempropBlocks].map(plainText).find((value) => value.length >= 25) ?? null,
    fullHtml: fullBlocks.find((value) => plainText(value).length >= 25) ?? null,
    full: fullBlocks.map(plainText).find((value) => value.length >= 25) ?? null,
  };
}

function textAfterHeading(html: string | null, expected: RegExp) {
  if (!html) return null;
  for (const section of html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]*?)(?=<h[1-6]\b|$)/gi)) {
    if (!expected.test(normalized(plainText(section[1])))) continue;
    const value = plainText(section[2]);
    if (value.length >= 20) return value;
  }
  return null;
}

function nestedImageUrls(value: unknown, depth = 0): string[] {
  if (depth > 7 || value == null) return [];
  if (typeof value === "string") return /(?:\.avif|\.gif|\.jpe?g|\.png|\.webp)(?:[?#]|$)/i.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => nestedImageUrls(item, depth + 1));
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap((item) => nestedImageUrls(item, depth + 1));
  return [];
}

function imageQuality(url: string) {
  const value = url.toLocaleLowerCase("en");
  if (/(?:large|zoom|original|1200|1000|900)/.test(value)) return 60;
  if (/(?:medium|home|800|700|600|500)/.test(value)) return 40;
  if (/(?:small|thumb|side|cart|125|100|98|70)/.test(value)) return 10;
  return 30;
}

function imageIdentity(url: URL) {
  return `${url.origin}${url.pathname.replace(/\/(\d+)(?:-(?:side|small|cart|home|medium|large)_default)?\//i, "/$1-{asset}/")}`;
}

function bestImageUrls(rawImages: string[], pageUrl: string) {
  const images = new Map<string, { url: string; quality: number; order: number }>();
  rawImages.forEach((image, order) => {
    try {
      const url = new URL(image, pageUrl);
      if (!["http:", "https:"].includes(url.protocol)) return;
      const candidate = { url: url.toString(), quality: imageQuality(url.toString()), order };
      const key = imageIdentity(url);
      const current = images.get(key);
      if (!current || candidate.quality > current.quality) images.set(key, candidate);
    } catch { /* Ignore malformed image addresses. */ }
  });
  return [...images.values()].sort((a, b) => a.order - b.order).map((item) => item.url);
}

function fact(facts: Map<string, string>, labels: string[]) {
  for (const label of labels.map(normalized)) {
    const exact = facts.get(label);
    if (exact) return exact;
  }
  return null;
}

function detectedAlcohol(text: string) {
  const patterns = [
    /(?:alkohol|alcohol|alc\.?|abv)[^\d]{0,20}(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i,
    /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:alkohol|alcohol|alc\.?|abv)/i,
  ];
  const value = patterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);
  return value ? `${value.replace(".", ",")}%` : null;
}

function normalizedAlcoholValue(value: string | null) {
  if (!value) return null;
  const direct = value.match(/\d{1,2}(?:[.,]\d{1,2})?/i)?.[0];
  return direct ? `${direct.replace(".", ",")}%` : value;
}

function detectedVolume(text: string) {
  const match = text.match(/\b(\d{1,4}(?:[.,]\d{1,2})?)\s*(ml|cl|l)\b/i);
  return match ? `${match[1]} ${match[2].toLowerCase()}` : null;
}

function detectedWineColor(text: string) {
  const value = normalized(text);
  if (/\b(rose|roze|rozowe|rosado|rosato)\b/.test(value)) return "Różowe";
  if (/\b(orange wine|pomaranczowe)\b/.test(value)) return "Pomarańczowe";
  if (/\b(red wine|czerwone|tinto|rosso|rouge)\b/.test(value)) return "Czerwone";
  if (/\b(white wine|biale|branco|blanco|bianco|blanc)\b/.test(value)) return "Białe";
  if (/\b(dessert wine|deserowe)\b/.test(value)) return "Deserowe";
  return null;
}

function detectedSweetness(text: string) {
  const value = normalized(text);
  if (/\b(polslodkie|medium sweet|semi sweet)\b/.test(value)) return "Półsłodkie";
  if (/\b(polwytrawne|off dry|semi dry)\b/.test(value)) return "Półwytrawne";
  if (/\b(wytrawne|wytrwane|dry|secco|brut)\b/.test(value)) return "Wytrawne";
  if (/\b(slodkie|sweet|dolce|doux)\b/.test(value)) return "Słodkie";
  return null;
}

function detectedWineRegion(text: string) {
  const match = text.match(/\b(?:region(?:u|ie)?|apelacj(?:a|i))\s+([A-ZĄĆĘŁŃÓŚŹŻ][^.,;\n]{2,80})/u);
  if (!match) return null;
  return compact(match[1])
    .split(/\s+(?:opatrzon\w*|położon\w*|polozon\w*|produkowan\w*|pochodząc\w*|pochodzac\w*|który\w*|ktory\w*|gdzie|oraz)\b/i)[0]
    .replace(/\s+(?:w|we|na|z)$/i, "") || null;
}

function detectedBeerStyle(text: string) {
  const styles = ["Imperial IPA", "New England IPA", "Session IPA", "IPA", "APA", "Pilsner", "Pils", "Lager", "Stout", "Porter", "Witbier", "Hefeweizen", "Weizen", "Saison", "Lambic", "Gose", "Ale"];
  return styles.find((style) => new RegExp(`\\b${style.replace(/\s+/g, "\\s+")}\\b`, "i").test(text)) ?? null;
}

function detectedSpiritType(text: string) {
  const value = normalized(text);
  if (/\b(cognac|koniak)\b/.test(value)) return "Koniak";
  if (/\b(brandy|metaxa|pliska)\b/.test(value)) return "Brandy";
  if (/\b(irish whiskey|irlandzk\w* whiskey)\b/.test(value)) return "Irlandzka whiskey";
  if (/\b(scotch|scottish|szkock\w* whisk)\w*\b/.test(value)) return "Szkocka whisky";
  if (/\b(bourbon|kentucky straight)\b/.test(value)) return "Bourbon";
  if (/\bwhisk(?:y|ey)\b/.test(value)) return "Whisky";
  return null;
}

function detectedSpiritStyle(text: string) {
  const value = normalized(text);
  if (/\bblended malt\b/.test(value)) return "Blended malt";
  if (/\bsingle malt\b|\bjednoslodow\w*\b/.test(value)) return "Single malt";
  if (/\bblended\b|\bkupazowan\w*\b|\bblend\b/.test(value)) return "Blended";
  return null;
}

function detectedAgeStatement(text: string) {
  const value = normalized(text);
  const years = value.match(/\b(\d{1,2})\s*(?:yo|y\.?o\.?|yr|yrs|year(?:s)?(?: old)?|lat(?:a)?|letn\w*|roku|roky|anos?)\b/);
  if (years) return `${years[1]} lat`;
  if (/\bxo\b/.test(value)) return "XO";
  if (/\bvsop\b/.test(value)) return "VSOP";
  if (/\b(?:v\.?s\.?|very special)\b/.test(value)) return "VS";
  return null;
}

function detectedTasteProfile(text: string) {
  const value = normalized(text);
  const profiles: Array<[string, RegExp]> = [
    ["Dymny i torfowy", /\b(dym\w*|smok\w*|torf\w*|peat\w*)\b/],
    ["Waniliowo-karmelowy", /\b(wanili\w*|vanill\w*|karmel\w*|caramel\w*|toffee|fudge)\b/],
    ["Owocowy", /\b(owoc\w*|fruit\w*|jablk\w*|gruszk\w*|morel\w*|brzoskwin\w*|raisin\w*)\b/],
    ["Korzenny", /\b(korzenn\w*|spic\w*|cynamon\w*|cinnamon|pieprz\w*|pepper|nutmeg)\b/],
    ["Łagodny i miodowy", /\b(lagod\w*|smooth|miod\w*|honey\w*)\b/],
  ];
  return profiles.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

function detectedCountry(text: string) {
  const value = normalized(text);
  const containsWholePhrase = (candidate: string) => {
    const phrase = normalized(candidate).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(?:^|[^a-z0-9])${phrase}(?=$|[^a-z0-9])`, "i").test(value);
  };
  const country = countries.find(containsWholePhrase);
  if (country) return country;
  for (const [candidate, aliases] of Object.entries(countryAliases)) {
    if (aliases.some(containsWholePhrase)) return candidate;
  }
  return null;
}

function detectedGrapes(text: string) {
  const explicit = labelled(text, ["szczep(?:y)?", "grape(?:s)?", "odmiana"]);
  if (explicit) return explicit;
  const value = normalized(text);
  const found = grapes.filter((grape) => value.includes(normalized(grape)));
  return found.length ? found.slice(0, 4).join(" · ") : null;
}

function detectedTastingNotes(description: string | null) {
  if (!description) return null;
  const sentences = compact(plainText(description)).match(/[^.!?]+[.!?]?/g) ?? [];
  const relevant = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: normalized(sentence).match(/\b(?:aromat|bukiet|nut|podniebien|finisz|smak|kwasow|owoc|kwiat|mineral)\w*/g)?.length ?? 0,
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).sort((a, b) => a.index - b.index);
  const value = relevant.map((item) => item.sentence).join(" ").trim();
  if (!value) return null;
  return value.length <= 600 ? value : `${value.slice(0, 597).replace(/\s+\S*$/, "")}…`;
}

function cleanDescription(value: string | null, maxLength = 700) {
  if (!value) return null;
  const text = compact(plainText(value));
  if (text.length < 25) return null;
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, maxLength);
  const minimumSentence = Math.floor(maxLength / 2);
  const sentenceEnd = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf("! "), shortened.lastIndexOf("? "));
  return `${(sentenceEnd >= minimumSentence ? shortened.slice(0, sentenceEnd + 1) : shortened.replace(/\s+\S*$/, "")).trim()}…`;
}

function extractPage(page: CandidatePage, input: DiscoveryInput): WineSourceProposal {
  const structured = jsonLdProducts(page.html).sort((a, b) => relevance(JSON.stringify(b), input) - relevance(JSON.stringify(a), input))[0];
  const embedded = embeddedProductRecords(page.html).sort((a, b) => relevance(JSON.stringify(b), input) - relevance(JSON.stringify(a), input))[0];
  const descriptions = productDescriptions(page.html);
  const embeddedShortDescription = firstString(embedded?.description_short);
  const embeddedFullDescription = firstString(embedded?.description);
  const copiedDescription = copiedTextSection(page.text, ["opis produktu", "opis"], [
    "szczep i region", "profil sensoryczny", "opis smakowy", "nota degustacyjna", "cechy produktu",
    "najczęściej zadawane pytania", "oceny i recenzje", "pasuje do", "serwowanie",
  ]);
  const copiedTastingSection = copiedTextSection(page.text, ["profil sensoryczny", "opis smakowy", "nota degustacyjna", "noty degustacyjne"], [
    "redakcja", "cechy produktu", "najczęściej zadawane pytania", "oceny i recenzje", "pasuje do", "serwowanie",
  ]);
  const tastingSection = textAfterHeading(descriptions.fullHtml || embeddedFullDescription, /\b(opis smakowy|nota degustacyjna|noty degustacyjne|degustacja|tasting notes?)\b/) || copiedTastingSection;
  const rawDescription = input.kind === "product"
    ? descriptions.full || embeddedFullDescription || firstString(structured?.description) || descriptions.short || copiedDescription || page.snippet
    : firstString(structured?.description) || embeddedShortDescription || descriptions.short || copiedDescription || tastingSection || embeddedFullDescription || descriptions.full || page.snippet;
  const facts = mergeFacts(
    structuredPropertyFacts(structured),
    embeddedFeatureFacts(embedded),
    definitionFacts(page.html),
    tableFacts(page.html),
    // Full HTML contains navigation and recommendation labels that look like
    // product facts. Line-based extraction is intentionally limited to the
    // explicit pasted-text fallback, where every line comes from the admin.
    page.html ? new Map<string, string>() : copiedTextFacts(page.text),
  );
  const imageRelevanceThreshold = Math.min(2, Math.max(1, productTokens(input.name).length)) * 3;
  const embeddedImages = [...nestedImageUrls(embedded?.cover), ...nestedImageUrls(embedded?.images)];
  const rawImages = [
    ...imageStrings(structured?.image),
    ...embeddedImages,
    attribute(page.html, "property", "og:image"),
    attribute(page.html, "name", "twitter:image"),
    ...Array.from(page.text.matchAll(/https?:\/\/[^\s<>"']+\.(?:avif|gif|jpe?g|png|webp)(?:\?[^\s<>"']*)?/gi)).map((match) => match[0]),
    ...(embeddedImages.length ? [] : Array.from(page.html.matchAll(/<img\b[^>]*>/gi)).flatMap((match) => {
      const tag = match[0];
      const source = tag.match(/\b(?:src|data-src)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
      const alt = decodeHtml(tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "");
      const classes = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
      if (/\b(?:logo|icon|avatar|manufacturer)\b/i.test(`${source} ${classes}`)) return [];
      return source && relevance(`${source} ${alt}`, input) >= imageRelevanceThreshold ? [source] : [];
    })),
  ].filter((value): value is string => Boolean(value));
  const imageCandidates = bestImageUrls(rawImages, page.url).slice(0, 8).map((url) => ({ url, sourceUrl: page.url, label: page.title || undefined }));
  const imageSourceUrl = imageCandidates[0]?.url ?? null;
  const text = `${page.title}\n${page.text}\n${page.snippet}`;
  const productText = [
    page.title,
    rawDescription,
    fact(facts, ["rodzaj wina", "rodzaj", "typ", "kategoria"]),
    fact(facts, ["kolor"]),
    fact(facts, ["smak", "poziom slodyczy", "poziom wytrawnosci"]),
    fact(facts, ["grona", "szczep", "szczepy", "szczep / szczepy"]),
    fact(facts, ["region", "apelacja"]),
  ].filter(Boolean).join("\n");
  const alcoholPercentage = normalizedAlcoholValue(fact(facts, ["zawartosc alkoholu", "alkohol", "alcohol", "abv"])) || detectedAlcohol(productText) || detectedAlcohol(text);
  const volume = fact(facts, ["pojemnosc", "objetosc", "volume", "capacity"]) || detectedVolume(productText) || detectedVolume(text);
  const proposal: WineSourceProposal = {
    descriptionPl: cleanDescription(rawDescription, input.kind === "product" ? 4_000 : 700),
    imageSourceUrl,
    imageCandidates,
    sourceUrls: [page.url],
    attributes: {},
  };
  if (input.kind === "wine") {
    const explicitCountry = fact(facts, ["kraj wina", "kraj", "kraj pochodzenia", "country", "pochodzenie", "origin"]);
    proposal.country = explicitCountry ? detectedCountry(explicitCountry) || explicitCountry : detectedCountry(rawDescription || "") || labelled(text, ["kraj wina", "kraj", "country", "pochodzenie", "origin"]);
    proposal.region = fact(facts, ["region wina", "region", "region winiarski", "apelacja", "appellation"]) || labelled(text, ["region wina", "region", "apelacja", "appellation"]) || detectedWineRegion(rawDescription || "");
    proposal.grapes = fact(facts, ["grona", "szczep winorosli", "szczep", "szczepy", "szczep / szczepy", "grape", "grapes", "odmiana", "odmiany"]) || detectedGrapes(productText);
    proposal.wineColor = detectedWineColor(fact(facts, ["rodzaj wina", "kolor", "wine colour", "wine color"]) || productText);
    proposal.sparklingType = detectSparklingType(productText);
    proposal.sweetness = detectedSweetness(fact(facts, ["smak", "poziom slodyczy", "poziom wytrawnosci", "sweetness"]) || productText);
    proposal.wineStyle = fact(facts, ["styl", "style", "charakter"]) || fact(facts, ["rodzaj", "typ"]);
    proposal.tastingNotes = fact(facts, ["aromaty", "nuty smakowe", "tasting notes", "nota degustacyjna"]) || cleanDescription(tastingSection) || detectedTastingNotes(embeddedFullDescription || descriptions.full || rawDescription);
    proposal.veganStatus = /\b(vegan|wegansk)\w*\b/i.test(normalized(productText)) ? "YES" : "UNKNOWN";
    proposal.attributes = { ...(alcoholPercentage ? { alcoholPercentage } : {}), ...(volume ? { volume } : {}) };
  } else if (input.kind === "whisky") {
    const spiritText = `${productText}\n${text}`;
    const rawOrigin = fact(facts, ["kraj", "kraj pochodzenia", "country", "pochodzenie", "origin"]);
    const rawSpiritType = fact(facts, ["rodzaj trunku", "typ produktu", "kategoria", "category"]);
    const rawSpiritStyle = fact(facts, ["styl whisky", "styl", "klasyfikacja", "style", "type"]);
    const rawAgeStatement = fact(facts, ["wiek", "leżakowanie", "lezakowanie", "dojrzewanie", "aged", "age"]);
    const rawTasteProfile = fact(facts, ["profil smakowy", "smak", "taste"]);
    const origin = detectedCountry(rawOrigin || "") || rawOrigin || detectedCountry(spiritText);
    const spiritType = detectedSpiritType(rawSpiritType || "") || detectedSpiritType(spiritText) || rawSpiritType;
    const spiritStyle = detectedSpiritStyle(rawSpiritStyle || "") || detectedSpiritStyle(spiritText) || rawSpiritStyle;
    const ageStatement = detectedAgeStatement(rawAgeStatement || "") || rawAgeStatement || detectedAgeStatement(spiritText);
    const tasteProfile = detectedTasteProfile(rawTasteProfile || "") || rawTasteProfile || detectedTasteProfile(rawDescription || tastingSection || spiritText);
    const caskType = fact(facts, ["beczka", "beczki", "rodzaj beczki", "cask", "casks"]);
    proposal.tastingNotes = fact(facts, ["aromaty", "nuty smakowe", "tasting notes", "nota degustacyjna"]) || cleanDescription(tastingSection) || detectedTastingNotes(embeddedFullDescription || descriptions.full || rawDescription);
    proposal.attributes = {
      ...(spiritType ? { spiritType } : {}),
      ...(spiritStyle ? { spiritStyle } : {}),
      ...(origin ? { origin } : {}),
      ...(ageStatement ? { ageStatement } : {}),
      ...(alcoholPercentage ? { alcoholPercentage } : {}),
      ...(tasteProfile ? { tasteProfile } : {}),
      ...(caskType ? { caskType } : {}),
      ...(volume ? { volume } : {}),
    };
  } else if (input.kind === "beer") {
    const beerStyle = labelled(text, ["styl", "style", "rodzaj"]) || detectedBeerStyle(text);
    const origin = labelled(text, ["kraj", "country", "pochodzenie", "origin"]) || detectedCountry(text);
    proposal.attributes = {
      ...(alcoholPercentage ? { alcoholPercentage } : {}),
      ...(beerStyle ? { beerStyle } : {}),
      ...(origin ? { origin } : {}),
      ...(volume ? { volume } : {}),
    };
  }
  return proposal;
}

export function extractProductPageProposal(html: string, sourceUrl: string, input: DiscoveryInput) {
  return extractPage(pageFromHtml(sourceUrl, html, "web"), input);
}

function hasValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0 && value.trim().toUpperCase() !== "UNKNOWN";
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.values(value).some(hasValue);
  return value === true;
}

function mergeProposal(target: WineSourceProposal, source: WineSourceProposal) {
  let changed = false;
  const currentImages = target.imageCandidates ?? [];
  const imageCandidates = [...currentImages];
  for (const candidate of source.imageCandidates ?? []) {
    if (!imageCandidates.some((item) => item.url === candidate.url)) {
      imageCandidates.push(candidate);
      changed = true;
    }
  }
  target.imageCandidates = imageCandidates.slice(0, 12);
  for (const key of ["descriptionPl", "imageSourceUrl", "country", "region", "grapes", "wineStyle", "wineColor", "sparklingType", "sweetness", "veganStatus", "tastingNotes"] as const) {
    if (!hasValue(target[key]) && hasValue(source[key])) {
      (target as Record<string, unknown>)[key] = source[key];
      changed = true;
    }
  }
  const attributes = { ...(target.attributes ?? {}) };
  for (const [key, value] of Object.entries(source.attributes ?? {})) {
    if (!hasValue(attributes[key]) && hasValue(value)) { attributes[key] = value; changed = true; }
  }
  target.attributes = attributes;
  return changed;
}

function enough(proposal: WineSourceProposal, kind: ProductKind) {
  const attributes = proposal.attributes ?? {};
  return kind === "wine"
    ? Boolean(proposal.descriptionPl && proposal.imageSourceUrl && proposal.wineColor && attributes.alcoholPercentage)
    : kind === "whisky"
      ? Boolean(proposal.descriptionPl && proposal.imageSourceUrl && attributes.spiritType && attributes.alcoholPercentage)
    : kind === "beer"
      ? Boolean(proposal.descriptionPl && proposal.imageSourceUrl && attributes.alcoholPercentage && attributes.beerStyle)
      : Boolean(proposal.descriptionPl && proposal.imageSourceUrl);
}

function strongProductMatch(value: string, input: DiscoveryInput) {
  const haystack = normalized(value);
  const identifiers = [...(input.eanCodes ?? []).filter((candidate) => /^\d{8,14}$/.test(candidate.replace(/\s/g, ""))), input.supplierProductCode ?? "", input.catalogCode ?? ""].filter(Boolean);
  if (identifiers.some((identifier) => haystack.includes(normalized(identifier)))) return true;
  const tokens = Array.from(new Set(productTokens(input.name)));
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  return matched >= Math.max(2, Math.ceil(tokens.length * 0.6));
}

export async function findAlternativeProductImageUrls(input: DiscoveryInput, excludedUrl?: string) {
  const results = await searchProductCandidates(searchQuery(input));
  const found: Array<{ url: string; sourceUrl: string }> = [];
  const add = (url: string | null | undefined, sourceUrl: string) => {
    if (!url || url === excludedUrl || found.some((item) => item.url === url)) return;
    found.push({ url, sourceUrl });
  };
  for (const result of results.slice(0, 6)) {
    if (!strongProductMatch(`${result.title} ${result.description} ${result.url}`, input)) continue;
    add(result.imageUrl, result.url);
    try {
      const fetched = await fetchPublicText(result.url);
      const proposal = extractPage(pageFromHtml(fetched.url, fetched.body, "web", result.description), input);
      for (const candidate of proposal.imageCandidates ?? []) add(candidate.url, result.url);
    } catch { /* A search snippet can still be useful when one result blocks automated access. */ }
    if (found.length >= 8) break;
  }
  return found.slice(0, 8);
}

export async function discoverProductInformation(input: DiscoveryInput): Promise<ProductDiscoveryResult> {
  const warnings: string[] = [];
  const manualSearchUrl = manualProductSearchUrl(input.name, input.kind);
  const proposal: WineSourceProposal = { attributes: {}, sourceUrls: [] };
  const usedSources: string[] = [];

  const supplier = await supplierPages(input, warnings);
  let supplierUsed = false;
  for (const page of supplier) {
    if (relevance(`${page.title} ${page.text}`, input) <= 0) continue;
    if (mergeProposal(proposal, extractPage(page, input))) {
      usedSources.push(page.url);
      supplierUsed = true;
    }
    if (enough(proposal, input.kind)) break;
  }

  let catalogueUsed = false;
  if (!enough(proposal, input.kind) && (input.eanCodes?.length ?? 0) > 0) {
    const catalogue = await openFoodFactsProducts(input, warnings);
    for (const result of catalogue) {
      if (mergeProposal(proposal, result.proposal)) {
        usedSources.push(result.sourceUrl);
        catalogueUsed = true;
      }
      if (enough(proposal, input.kind)) break;
    }
  }

  let web: CandidatePage[] = [];
  let webUsed = false;
  if (!enough(proposal, input.kind)) {
    web = await webPages(input, warnings);
    for (const page of web) {
      if (mergeProposal(proposal, extractPage(page, input))) {
        usedSources.push(page.url);
        webUsed = true;
      }
      if (enough(proposal, input.kind)) break;
    }
  }

  proposal.sourceUrls = Array.from(new Set(usedSources));
  const usedKinds = [supplierUsed, catalogueUsed, webUsed].filter(Boolean).length;
  const sourceKind: ProductDiscoveryResult["sourceKind"] = usedKinds > 1
    ? "MULTIPLE_SOURCES"
    : catalogueUsed
      ? "OPEN_FOOD_FACTS"
      : supplierUsed
        ? "SUPPLIER_WEBSITE"
        : "WEB_SEARCH";
  const fingerprint = createHash("sha256").update(JSON.stringify({ input, proposal, sourceKind })).digest("hex");
  return {
    proposal,
    sourceUrls: proposal.sourceUrls,
    sourceKind,
    fingerprint,
    manualSearchUrl,
    webSearchConfigured: Boolean(process.env.BRAVE_SEARCH_API_KEY),
    warnings,
  };
}

export async function discoverProductInformationFromUrl(input: DiscoveryInput, sourceUrl: string): Promise<ProductDiscoveryResult> {
  const warnings: string[] = [];
  const manualSearchUrl = manualProductSearchUrl(input.name, input.kind);
  let page: CandidatePage;
  try {
    const fetched = await fetchPublicText(sourceUrl);
    page = pageFromHtml(fetched.url, fetched.body, "web");
  } catch (error) {
    let indexed: CandidatePage | null = null;
    let indexedError: unknown = null;
    try { indexed = await indexedPageForProtectedUrl(input, sourceUrl); } catch (fallbackError) { indexedError = fallbackError; }
    if (!indexed) {
      const directMessage = error instanceof Error ? error.message : "Nie udało się odczytać strony.";
      const fallbackMessage = indexedError instanceof Error ? ` Wyszukiwanie zastępcze: ${indexedError.message}` : "";
      throw new Error(`${directMessage}${fallbackMessage}`);
    }
    page = indexed;
    warnings.push("Sklep zablokował bezpośredni odczyt, dlatego propozycję utworzono automatycznie z publicznie zindeksowanych danych tej samej strony.");
  }
  const proposal = extractPage(page, input);
  proposal.sourceUrls = [page.url];
  if (relevance(`${page.title} ${page.text}`, input) <= 0) {
    warnings.push("Wskazana strona ma niewiele wspólnych danych z nazwą lub kodem produktu — sprawdź propozycję szczególnie uważnie.");
  }
  const sourceKind: ProductDiscoveryResult["sourceKind"] = "MANUAL_URL";
  const fingerprint = createHash("sha256").update(JSON.stringify({ input, proposal, sourceKind })).digest("hex");
  return {
    proposal,
    sourceUrls: [page.url],
    sourceKind,
    fingerprint,
    manualSearchUrl,
    webSearchConfigured: Boolean(process.env.BRAVE_SEARCH_API_KEY),
    warnings,
  };
}

export function discoverProductInformationFromText(input: DiscoveryInput, sourceText: string, sourceUrl?: string): ProductDiscoveryResult {
  const manualSearchUrl = manualProductSearchUrl(input.name, input.kind);
  const pageUrl = sourceUrl || manualSearchUrl;
  const page = pageFromText(pageUrl, sourceText);
  const proposal = extractPage(page, input);
  const sourceUrls = sourceUrl ? [sourceUrl] : [];
  proposal.sourceUrls = sourceUrls;
  const warnings: string[] = [];
  if (relevance(page.text, input) <= 0) {
    warnings.push("Wklejona treść ma niewiele wspólnych danych z nazwą lub kodem produktu — sprawdź propozycję szczególnie uważnie.");
  }
  const sourceKind: ProductDiscoveryResult["sourceKind"] = "MANUAL_TEXT";
  const fingerprint = createHash("sha256").update(JSON.stringify({ input, proposal, sourceKind })).digest("hex");
  return {
    proposal,
    sourceUrls,
    sourceKind,
    fingerprint,
    manualSearchUrl,
    webSearchConfigured: Boolean(process.env.BRAVE_SEARCH_API_KEY),
    warnings,
  };
}

export function proposalHasContent(proposal: WineSourceProposal) {
  return Object.entries(proposal).some(([key, value]) => key !== "sourceUrls" && key !== "attributes" && hasValue(value))
    || hasValue(proposal.attributes);
}
