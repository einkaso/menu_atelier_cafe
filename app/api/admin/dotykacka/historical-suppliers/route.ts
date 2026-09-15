import { isAdmin } from "../../../../../lib/admin-auth";
import { importHistoricalSuppliers } from "../../../../../lib/dotykacka/historical-suppliers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const receipts = form.get("receipts");
    const movements = form.get("movements");
    const apply = form.get("mode") === "apply";
    if (!(receipts instanceof File) || !(movements instanceof File)) return Response.json({ error: "Wybierz oba pliki z Dotykački." }, { status: 400 });
    if (receipts.size > MAX_FILE_SIZE || movements.size > MAX_FILE_SIZE) return Response.json({ error: "Każdy plik może mieć maksymalnie 10 MB." }, { status: 413 });
    if (!receipts.name.toLowerCase().endsWith(".xlsx") || !movements.name.toLowerCase().endsWith(".xlsx")) return Response.json({ error: "Wymagane są dwa pliki Excel w formacie XLSX." }, { status: 400 });
    const result = await importHistoricalSuppliers(new Uint8Array(await receipts.arrayBuffer()), new Uint8Array(await movements.arrayBuffer()), apply);
    return Response.json({ status: "ok", ...result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się przeanalizować historii dostaw." }, { status: 400 });
  }
}
