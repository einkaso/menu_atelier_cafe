import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { drinkVessels } from "../../../../db/schema";
import { isAdmin } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const vessels = await getDb().select({
    id: drinkVessels.id,
    key: drinkVessels.key,
    name: drinkVessels.name,
    capacityMl: drinkVessels.capacityMl,
    iconPath: drinkVessels.iconPath,
  }).from(drinkVessels)
    .where(eq(drinkVessels.active, true))
    .orderBy(sql`coalesce(${drinkVessels.sortOrder}, 2147483647)`, asc(drinkVessels.capacityMl), asc(drinkVessels.name));
  return Response.json({ vessels });
}
