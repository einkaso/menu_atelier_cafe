import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { menuCategories, menuOfferSettings, menuProducts, productContent } from "../../../../db/schema";
import { isAdmin } from "../../../../lib/admin-auth";
import { translatePolishTexts, translationConfigured } from "../../../../lib/translation";
import { hasTag as hasMenuTag } from "../../../../lib/menu-tags";

export const dynamic = "force-dynamic";

const seasons = ["LATO", "JESIEŃ", "ZIMA", "WIOSNA"] as const;
type Season = typeof seasons[number];

function hasTag(tags: string[], expected: string) {
  return tags.some((tag) => tag.trim().toLocaleUpperCase("pl") === expected);
}

async function readOfferState() {
  const db = getDb();
  const [saved, products] = await Promise.all([
    db.select().from(menuOfferSettings).where(eq(menuOfferSettings.key, "main")).limit(1),
    db.select({
      display: menuProducts.display,
      deleted: menuProducts.deleted,
      stockDeduct: menuProducts.stockDeduct,
      stockOverdraft: menuProducts.stockOverdraft,
      stockQuantity: menuProducts.stockQuantity,
      menuTagged: menuProducts.menuTagged,
      tags: menuProducts.tags,
      categoryDisplay: menuCategories.display,
      manualHidden: productContent.manualHidden,
    }).from(menuProducts)
      .leftJoin(menuCategories, eq(menuProducts.dotykackaCategoryId, menuCategories.dotykackaId))
      .leftJoin(productContent, eq(menuProducts.id, productContent.productId)),
  ]);
  const visible = products.filter((product) => product.menuTagged && hasMenuTag(product.tags, "MENU") && product.display && !product.deleted
    && product.categoryDisplay !== false && !product.manualHidden
    && !(product.stockDeduct && product.stockOverdraft === "DISABLE" && Number(product.stockQuantity ?? 0) <= 0));
  const setting = saved[0];
  return {
    season: seasons.includes(setting?.season as Season) ? setting?.season as Season : "",
    specialEnabled: setting?.specialEnabled ?? false,
    specialNamePl: setting?.specialNamePl ?? "",
    specialNameEn: setting?.specialNameEn ?? "",
    seasonCounts: Object.fromEntries(seasons.map((season) => [season, visible.filter((product) => hasTag(product.tags, season)).length])),
    specialCount: visible.filter((product) => hasTag(product.tags, "SPECJAL")).length,
  };
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await readOfferState(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się odczytać ustawień ofert." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { season?: unknown; specialEnabled?: unknown; specialNamePl?: unknown };
    const season = body.season === "" || body.season == null ? null : String(body.season).toLocaleUpperCase("pl");
    if (season && !seasons.includes(season as Season)) return Response.json({ error: "Wybierz prawidłowy sezon." }, { status: 400 });
    if (typeof body.specialEnabled !== "boolean") return Response.json({ error: "Nieprawidłowe ustawienie oferty specjalnej." }, { status: 400 });
    const specialNamePl = String(body.specialNamePl ?? "").trim();
    if (specialNamePl.length > 80) return Response.json({ error: "Nazwa oferty może mieć najwyżej 80 znaków." }, { status: 400 });
    if (body.specialEnabled && !specialNamePl) return Response.json({ error: "Podaj nazwę oferty specjalnej." }, { status: 400 });

    const db = getDb();
    const current = (await db.select().from(menuOfferSettings).where(eq(menuOfferSettings.key, "main")).limit(1))[0];
    let specialNameEn = specialNamePl ? (current?.specialNamePl === specialNamePl ? current.specialNameEn : null) : null;
    let warning: string | undefined;
    if (specialNamePl && !specialNameEn) {
      try {
        specialNameEn = (await translatePolishTexts([specialNamePl]))?.[0] || specialNamePl;
        if (!translationConfigured()) warning = "DeepL nie jest skonfigurowany — tymczasowo użyto polskiej nazwy także w wersji EN.";
      } catch {
        specialNameEn = specialNamePl;
        warning = "Nie udało się teraz przetłumaczyć nazwy — użyto polskiej nazwy także w wersji EN.";
      }
    }
    await db.insert(menuOfferSettings).values({
      key: "main", season, specialEnabled: body.specialEnabled, specialNamePl: specialNamePl || null,
      specialNameEn, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: menuOfferSettings.key,
      set: { season, specialEnabled: body.specialEnabled, specialNamePl: specialNamePl || null, specialNameEn, updatedAt: new Date() },
    });
    return Response.json({ ...(await readOfferState()), warning });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać ustawień ofert." }, { status: 503 });
  }
}
