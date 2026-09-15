import { z } from "zod";
import { isAdmin } from "../../../../lib/admin-auth";
import { searchProductCandidates } from "../../../../lib/product-enrichment";

export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(2).max(300);

export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Sesja administratora wygasła. Odśwież panel i zaloguj się ponownie." }, { status: 401 });
  const query = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!query.success) return Response.json({ error: "Wpisz nazwę produktu." }, { status: 400 });
  try {
    const results = await searchProductCandidates(query.data);
    return Response.json({ results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się wyszukać produktu.";
    return Response.json({
      error: /\b429\b/.test(message)
        ? "Bezpłatna wyszukiwarka wykorzystała chwilowy limit. Otwórz wyniki Google poniżej i wklej adres właściwej karty produktu."
        : message,
    }, { status: 502 });
  }
}
