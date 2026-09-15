export type EventDetails = {
  description: string;
  image: string | null;
};

function normalizeDescription(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 10_000);
}

function safeImage(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const candidate = typeof raw === "string" ? raw : raw && typeof raw === "object" && "url" in raw ? String(raw.url) : "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return null;
    if (!["martabanaszek.pl", "www.martabanaszek.pl", "i0.wp.com"].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function productNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(productNodes);
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  return [node, ...productNodes(node["@graph"])];
}

export function parseEventDetails(html: string): EventDetails {
  for (const match of html.matchAll(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const nodes = productNodes(JSON.parse(match[1]));
      const product = nodes.find((node) => node["@type"] === "Product" && typeof node.description === "string");
      if (!product) continue;
      const description = normalizeDescription(String(product.description));
      if (description) return { description, image: safeImage(product.image) };
    } catch {
      // Ignore unrelated or malformed structured-data blocks.
    }
  }
  throw new Error("Nie znaleziono opisu wydarzenia");
}
