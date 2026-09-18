import { z } from "zod";
import { isAdmin } from "../../../../lib/admin-auth";
import { searchProductCandidates } from "../../../../lib/product-enrichment";

export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(2).max(300);
const pageSchema = z.coerce.number().int().min(0).max(9);

export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Sesja administratora wygasła. Odśwież panel i zaloguj się ponownie." }, { status: 401 });
  const url = new URL(request.url);
  const query = querySchema.safeParse(url.searchParams.get("q"));
  const page = pageSchema.safeParse(url.searchParams.get("page") ?? "0");
  if (!query.success) return Response.json({ error: "Wpisz nazwę produktu." }, { status: 400 });
  if (!page.success) return Response.json({ error: "Nieprawidłowy numer strony wyników." }, { status: 400 });
  try {
    const results = await searchProductCandidates(query.data, page.data);
    return Response.json({ results, page: page.data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się wyszukać produktu.";
    return Response.json({
      error: /\b429\b/.test(message)
        ? "Bezpłatna wyszukiwarka wykorzystała chwilowy limit. Otwórz wyniki Google poniżej i wklej adres właściwej karty produktu."
        : message,
    }, { status: 502 });
  }
}
