import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { lightingBridges } from "../../db/schema";
import { hashBridgeToken } from "./bridge-auth";

export async function currentLightingBridge(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+([a-zA-Z0-9_-]{40,})$/i.exec(authorization);
  if (!match) return null;
  const [bridge] = await getDb().select({ id: lightingBridges.id, name: lightingBridges.name })
    .from(lightingBridges)
    .where(and(eq(lightingBridges.tokenHash, hashBridgeToken(match[1])), eq(lightingBridges.active, true)))
    .limit(1);
  return bridge ?? null;
}
