import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { lightingBridges, lightingDevices, lightingOutputs, lightingOutputStates, lightingRooms } from "../../../../../db/schema";
import { isAdmin } from "../../../../../lib/admin-auth";
import { lightingOutputConfigurationInput, lightingRoomInput } from "../../../../../lib/lighting/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const [bridges, devices, outputs, rooms] = await Promise.all([
    db.select().from(lightingBridges).orderBy(asc(lightingBridges.id)),
    db.select().from(lightingDevices).orderBy(asc(lightingDevices.name)),
    db.select({
      id: lightingOutputs.id,
      deviceId: lightingOutputs.deviceId,
      channel: lightingOutputs.channel,
      label: lightingOutputs.label,
      roomId: lightingOutputs.roomId,
      capabilities: lightingOutputs.capabilities,
      minBrightness: lightingOutputs.minBrightness,
      maxBrightness: lightingOutputs.maxBrightness,
      preferredPosition: lightingOutputs.preferredPosition,
      active: lightingOutputs.active,
      isOn: lightingOutputStates.isOn,
      brightness: lightingOutputStates.brightness,
      position: lightingOutputStates.position,
      motion: lightingOutputStates.motion,
      calibrated: lightingOutputStates.calibrated,
      observedAt: lightingOutputStates.observedAt,
      quality: lightingOutputStates.quality,
      lastError: lightingOutputStates.lastError,
    }).from(lightingOutputs).leftJoin(lightingOutputStates, eq(lightingOutputStates.outputId, lightingOutputs.id)).orderBy(asc(lightingOutputs.id)),
    db.select().from(lightingRooms).orderBy(asc(lightingRooms.sortOrder), asc(lightingRooms.name)),
  ]);
  return Response.json({ bridges, devices, outputs, rooms });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = lightingOutputConfigurationInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Nieprawidłowa konfiguracja punktu." }, { status: 400 });
  if (input.data.roomId) {
    const [room] = await getDb().select({ id: lightingRooms.id }).from(lightingRooms).where(eq(lightingRooms.id, input.data.roomId)).limit(1);
    if (!room) return Response.json({ error: "Wybrane pomieszczenie nie istnieje." }, { status: 400 });
  }
  const [updated] = await getDb().update(lightingOutputs).set({
    active: input.data.active,
    label: input.data.label,
    roomId: input.data.roomId,
    updatedAt: new Date(),
  }).where(eq(lightingOutputs.id, input.data.outputId)).returning({ id: lightingOutputs.id });
  if (!updated) return Response.json({ error: "Punkt nie istnieje." }, { status: 404 });
  return Response.json({ status: "ok" });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = lightingRoomInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Podaj nazwę pomieszczenia." }, { status: 400 });
  const [room] = await getDb().insert(lightingRooms).values({ name: input.data.name }).returning();
  return Response.json({ room }, { status: 201 });
}
