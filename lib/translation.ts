import "server-only";
import { createHash } from "node:crypto";

import type { WineSourceProposal } from "../db/schema";

export type MenuTranslationSource = {
  id: number;
  name: string;
  description?: string | null;
  country?: string | null;
  region?: string | null;
  wineStyle?: string | null;
  tastingNotes?: string | null;
  preserveName?: boolean;
};

const ATTRIBUTE_EN_PREFIX = "__en__";
const ATTRIBUTE_SOURCE_HASH = "__en_source_hash";

export function productAttributesPl(attributes?: Record<string, string> | null) {
  return Object.fromEntries(Object.entries(attributes ?? {})
    .filter(([key, value]) => !key.startsWith("__") && Boolean(value?.trim()))
    .map(([key, value]) => [key, value.trim()]));
}

function productAttributeSourceHash(attributes: Record<string, string>) {
  return createHash("sha256").update(JSON.stringify(Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right)))).digest("hex");
}

export function productAttributesEn(attributes?: Record<string, string> | null) {
  const polish = productAttributesPl(attributes);
  return Object.fromEntries(Object.entries(polish).map(([key, value]) => [key, attributes?.[`${ATTRIBUTE_EN_PREFIX}${key}`]?.trim() || value]));
}

export function productAttributesNeedTranslation(source?: Record<string, string> | null, stored?: Record<string, string> | null) {
  const polish = productAttributesPl(source);
  if (!Object.keys(polish).length) return false;
  return stored?.[ATTRIBUTE_SOURCE_HASH] !== productAttributeSourceHash(polish)
    || Object.keys(polish).some((key) => !stored?.[`${ATTRIBUTE_EN_PREFIX}${key}`]?.trim());
}

export function preserveProductAttributeTranslations(source?: Record<string, string> | null, stored?: Record<string, string> | null) {
  const polish = productAttributesPl(source);
  const result = { ...polish };
  for (const key of Object.keys(polish)) {
    const translated = stored?.[`${ATTRIBUTE_EN_PREFIX}${key}`]?.trim();
    if (translated) result[`${ATTRIBUTE_EN_PREFIX}${key}`] = translated;
  }
  if (stored?.[ATTRIBUTE_SOURCE_HASH]) result[ATTRIBUTE_SOURCE_HASH] = stored[ATTRIBUTE_SOURCE_HASH];
  return result;
}

export async function translateProductAttributes(source?: Record<string, string> | null) {
  const polish = productAttributesPl(source);
  const entries = Object.entries(polish);
  if (!entries.length) return polish;
  const translated = await translatePolishTexts(entries.map(([, value]) => value));
  if (!translated) return null;
  return {
    ...polish,
    ...Object.fromEntries(entries.map(([key], index) => [`${ATTRIBUTE_EN_PREFIX}${key}`, translated[index] || polish[key]])),
    [ATTRIBUTE_SOURCE_HASH]: productAttributeSourceHash(polish),
  };
}

export type MenuTranslation = {
  id: number;
  nameEn: string;
  descriptionEn: string | null;
  countryEn: string | null;
  regionEn: string | null;
  wineStyleEn: string | null;
  tastingNotesEn: string | null;
  sourceHash: string;
};

type Field = Exclude<keyof MenuTranslation, "id" | "sourceHash">;
type TranslationJob = { id: number; field: Field; text: string };

export function translationSourceHash(source: MenuTranslationSource) {
  return createHash("sha256").update(JSON.stringify({
    name: source.name,
    description: source.description ?? "",
    country: source.country ?? "",
    region: source.region ?? "",
    wineStyle: source.wineStyle ?? "",
    tastingNotes: source.tastingNotes ?? "",
    preserveName: Boolean(source.preserveName),
  })).digest("hex");
}

function endpoint() {
  const configured = process.env.DEEPL_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return process.env.DEEPL_API_KEY?.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

export function translationConfigured() {
  return Boolean(process.env.DEEPL_API_KEY?.trim());
}

async function translateBatch(jobs: TranslationJob[], apiKey: string) {
  const response = await fetch(`${endpoint()}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "MartaBanaszekCafeMenu/1.0",
    },
    body: JSON.stringify({ text: jobs.map((job) => job.text), source_lang: "PL", target_lang: "EN-GB", preserve_formatting: true }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`DeepL translation failed (${response.status})`);
  const body = await response.json() as { translations?: Array<{ text?: string }> };
  if (!body.translations || body.translations.length !== jobs.length) throw new Error("DeepL returned an incomplete translation");
  return body.translations.map((item) => item.text?.trim() ?? "");
}

async function translateBatchToPolish(texts: string[], apiKey: string) {
  const response = await fetch(`${endpoint()}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "MartaBanaszekCafeMenu/1.0",
    },
    body: JSON.stringify({ text: texts, target_lang: "PL", preserve_formatting: true }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`DeepL translation failed (${response.status})`);
  const body = await response.json() as { translations?: Array<{ text?: string }> };
  if (!body.translations || body.translations.length !== texts.length) throw new Error("DeepL returned an incomplete translation");
  return body.translations.map((item) => item.text?.trim() ?? "");
}

const englishProposalWords = /\b(?:the|and|with|from|this|wine|beer|aromas?|notes?|palate|finish|dry|sweet|medium|full|light|bodied|body|red|white|sparkling|country|region|grapes?|produced|fresh|fruity|fruit|cherry|apple|citrus|oak|acidity|tannins?|pairs?|aged)\b/gi;

export function proposalNeedsPolishTranslation(proposal: WineSourceProposal) {
  const searchable = [
    proposal.descriptionPl,
    proposal.region,
    proposal.wineStyle,
    proposal.tastingNotes,
    proposal.attributes?.beerStyle,
    proposal.attributes?.origin,
    proposal.attributes?.spiritType,
    proposal.attributes?.spiritStyle,
    proposal.attributes?.ageStatement,
    proposal.attributes?.tasteProfile,
    proposal.attributes?.caskType,
  ].filter((value): value is string => Boolean(value?.trim())).join(" ");
  const matches = searchable.match(englishProposalWords) ?? [];
  return matches.length >= 2 || /\b(?:full-bodied|medium-bodied|light-bodied|tasting notes|on the palate)\b/i.test(searchable);
}

export async function translateProductProposalToPolish(proposal: WineSourceProposal): Promise<WineSourceProposal | null> {
  if (!proposalNeedsPolishTranslation(proposal)) return proposal;
  const apiKey = process.env.DEEPL_API_KEY?.trim();
  if (!apiKey) return null;

  const fields = ["descriptionPl", "country", "region", "wineStyle", "tastingNotes"] as const;
  const jobs: Array<{ kind: "field" | "attribute"; key: string; text: string }> = [];
  for (const field of fields) {
    const text = proposal[field];
    if (typeof text === "string" && text.trim()) jobs.push({ kind: "field", key: field, text: text.trim() });
  }
  for (const key of ["beerStyle", "origin", "spiritType", "spiritStyle", "ageStatement", "tasteProfile", "caskType"] as const) {
    const text = proposal.attributes?.[key];
    if (text?.trim()) jobs.push({ kind: "attribute", key, text: text.trim() });
  }
  if (!jobs.length) return proposal;

  const translated: string[] = [];
  for (let start = 0; start < jobs.length; start += 40) {
    translated.push(...await translateBatchToPolish(jobs.slice(start, start + 40).map((job) => job.text), apiKey));
  }
  const result: WineSourceProposal = { ...proposal, attributes: { ...(proposal.attributes ?? {}) } };
  jobs.forEach((job, index) => {
    const value = translated[index] || job.text;
    if (job.kind === "attribute") result.attributes![job.key] = value;
    else (result as Record<string, unknown>)[job.key] = value;
  });
  return result;
}

export async function translatePolishTexts(texts: string[]): Promise<string[] | null> {
  const apiKey = process.env.DEEPL_API_KEY?.trim();
  if (!apiKey || !texts.length) return texts.length ? null : [];

  const translated: string[] = [];
  for (let start = 0; start < texts.length; start += 40) {
    const batch = texts.slice(start, start + 40).map((text, index) => ({
      id: start + index,
      field: "nameEn" as const,
      text,
    }));
    translated.push(...await translateBatch(batch, apiKey));
  }
  return translated;
}

export async function translateMenuContent(sources: MenuTranslationSource[]): Promise<MenuTranslation[] | null> {
  const apiKey = process.env.DEEPL_API_KEY?.trim();
  if (!apiKey || !sources.length) return null;

  const results = new Map<number, MenuTranslation>();
  const jobs: TranslationJob[] = [];
  for (const source of sources) {
    results.set(source.id, {
      id: source.id,
      nameEn: source.name,
      descriptionEn: null,
      countryEn: null,
      regionEn: null,
      wineStyleEn: null,
      tastingNotesEn: null,
      sourceHash: translationSourceHash(source),
    });
    if (!source.preserveName) jobs.push({ id: source.id, field: "nameEn", text: source.name });
    for (const [field, text] of [
      ["descriptionEn", source.description],
      ["countryEn", source.country],
      ["regionEn", source.region],
      ["wineStyleEn", source.wineStyle],
      ["tastingNotesEn", source.tastingNotes],
    ] as const) if (text?.trim()) jobs.push({ id: source.id, field, text: text.trim() });
  }

  for (let start = 0; start < jobs.length; start += 40) {
    const batch = jobs.slice(start, start + 40);
    const translations = await translateBatch(batch, apiKey);
    batch.forEach((job, index) => {
      const target = results.get(job.id);
      if (target) target[job.field] = translations[index];
    });
  }
  return Array.from(results.values());
}
