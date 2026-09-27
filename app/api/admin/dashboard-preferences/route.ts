import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adminDashboardPreferences } from "../../../../db/schema";
import { currentAdmin } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

const tileIds = new Set([
  "products", "eventOs", "reservations", "settlements", "connection", "lighting", "rooms", "employees",
  "stock", "instructions", "inventory", "workforce", "categories", "offers",
]);

type TilePreference = { id: string; visible: boolean; background: string; foreground: string };

function administratorKey(administrator: Awaited<ReturnType<typeof currentAdmin>>) {
  return administrator ? `${administrator.kind}:${administrator.username}` : "";
}

function validBackground(value: unknown) {
  return value === "paper" || (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value));
}

function validForeground(value: unknown) {
  return value === undefined || value === "auto" || (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value));
}

function validateTiles(value: unknown): TilePreference[] | null {
  if (!Array.isArray(value) || value.length !== tileIds.size) return null;
  const seen = new Set<string>();
  const tiles: TilePreference[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !tileIds.has(candidate.id) || seen.has(candidate.id) || typeof candidate.visible !== "boolean" || !validBackground(candidate.background) || !validForeground(candidate.foreground)) return null;
    seen.add(candidate.id);
    tiles.push({ id: candidate.id, visible: candidate.visible, background: String(candidate.background).toLowerCase(), foreground: candidate.foreground === undefined ? "auto" : String(candidate.foreground).toLowerCase() });
  }
  return tiles.some((item) => item.visible) ? tiles : null;
}

export async function GET() {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [saved] = await getDb().select({ tiles: adminDashboardPreferences.tiles, updatedAt: adminDashboardPreferences.updatedAt })
    .from(adminDashboardPreferences).where(eq(adminDashboardPreferences.administratorKey, administratorKey(administrator))).limit(1);
  return Response.json({ tiles: saved?.tiles ?? null, updatedAt: saved?.updatedAt ?? null });
}

export async function PUT(request: Request) {
  const administrator = await currentAdmin();
  if (!administrator) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { tiles?: unknown };
  const tiles = validateTiles(body.tiles);
  if (!tiles) return Response.json({ error: "Nieprawidłowy układ pulpitu. Pozostaw co najmniej jeden widoczny kafel." }, { status: 400 });
  const now = new Date();
  const key = administratorKey(administrator);
  await getDb().insert(adminDashboardPreferences).values({ administratorKey: key, tiles, updatedBy: administrator.username, updatedAt: now })
    .onConflictDoUpdate({ target: adminDashboardPreferences.administratorKey, set: { tiles, updatedBy: administrator.username, updatedAt: now } });
  return Response.json({ status: "ok", tiles, updatedAt: now });
}
