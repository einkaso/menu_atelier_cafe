import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../../db";
import { lightingDevices, lightingOutputs, lightingRooms, lightingSceneActions, lightingScenes } from "../../../../../db/schema";
import { isAdmin } from "../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

const sceneActionInput = z.object({
  outputId: z.number().int().positive(),
  command: z.enum(["ON", "OFF", "BRIGHTNESS"]),
  brightness: z.number().int().min(0).max(100).nullable().optional(),
  fadeDurationSeconds: z.number().int().min(0).max(300).default(0),
});

const sceneInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(60),
  roomId: z.number().int().positive().nullable().default(null),
  actions: z.array(sceneActionInput).min(1).max(100),
}).superRefine((value, context) => {
  if (new Set(value.actions.map((action) => action.outputId)).size !== value.actions.length) context.addIssue({ code: "custom", message: "Każdy punkt może wystąpić w scenie tylko raz.", path: ["actions"] });
  value.actions.forEach((action, index) => {
    if (action.command === "BRIGHTNESS" && action.brightness == null) context.addIssue({ code: "custom", message: "Podaj jasność.", path: ["actions", index, "brightness"] });
    if (action.command !== "BRIGHTNESS" && action.fadeDurationSeconds > 0) context.addIssue({ code: "custom", message: "Czas przejścia dotyczy wyłącznie ściemniaczy.", path: ["actions", index, "fadeDurationSeconds"] });
  });
});

async function validateTargets(actions: z.infer<typeof sceneActionInput>[], roomId: number | null) {
  const ids = actions.map((action) => action.outputId);
  if (roomId !== null) {
    const [room] = await getDb().select({ id: lightingRooms.id }).from(lightingRooms)
      .where(and(eq(lightingRooms.id, roomId), eq(lightingRooms.active, true))).limit(1);
    if (!room) return "Wybrane pomieszczenie nie istnieje albo jest nieaktywne.";
  }
  const targets = await getDb().select({
    id: lightingOutputs.id,
    roomId: lightingOutputs.roomId,
    channel: lightingOutputs.channel,
    active: lightingOutputs.active,
    capabilities: lightingOutputs.capabilities,
    minBrightness: lightingOutputs.minBrightness,
    maxBrightness: lightingOutputs.maxBrightness,
    adapter: lightingDevices.apiType,
  }).from(lightingOutputs).innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId)).where(inArray(lightingOutputs.id, ids));
  const byId = new Map(targets.map((target) => [target.id, target]));
  for (const action of actions) {
    const target = byId.get(action.outputId);
    if (!target || !target.active) return "Scena zawiera punkt, który nie istnieje albo nie został zatwierdzony.";
    if (roomId !== null && target.roomId !== roomId) return "Scena pomieszczenia może sterować tylko punktami przypisanymi do tego pomieszczenia.";
    if (action.command === "BRIGHTNESS") {
      if (target.adapter !== "dimmer" || target.channel !== "dimmer:0" || !target.capabilities.dimming) return "Regulację jasności można zapisać tylko dla ściemniacza.";
      const brightness = action.brightness ?? -1;
      if (brightness !== 0 && (brightness < target.minBrightness || brightness > target.maxBrightness)) return `Dostępny zakres jasności punktu to ${target.minBrightness}–${target.maxBrightness}%.`;
    } else if (!target.channel.startsWith("relay:") || !target.capabilities.onOff) return "Polecenie włącz/wyłącz można zapisać tylko dla zwykłego punktu światła.";
  }
  return null;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const [scenes, actions] = await Promise.all([
    db.select({
      id: lightingScenes.id,
      name: lightingScenes.name,
      roomId: lightingScenes.roomId,
      roomName: lightingRooms.name,
      sortOrder: lightingScenes.sortOrder,
      active: lightingScenes.active,
    }).from(lightingScenes)
      .leftJoin(lightingRooms, eq(lightingRooms.id, lightingScenes.roomId))
      .orderBy(asc(lightingScenes.sortOrder), asc(lightingScenes.id)),
    db.select({
      id: lightingSceneActions.id,
      sceneId: lightingSceneActions.sceneId,
      outputId: lightingSceneActions.outputId,
      outputLabel: lightingOutputs.label,
      roomName: lightingRooms.name,
      command: lightingSceneActions.command,
      brightness: lightingSceneActions.brightness,
      fadeDurationMs: lightingSceneActions.fadeDurationMs,
    }).from(lightingSceneActions)
      .innerJoin(lightingOutputs, eq(lightingOutputs.id, lightingSceneActions.outputId))
      .leftJoin(lightingRooms, eq(lightingRooms.id, lightingOutputs.roomId))
      .orderBy(asc(lightingSceneActions.id)),
  ]);
  return Response.json({ scenes: scenes.map((scene) => ({ ...scene, actions: actions.filter((action) => action.sceneId === scene.id) })) });
}

async function saveScene(request: Request, updating: boolean) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = sceneInput.safeParse(await request.json().catch(() => null));
  if (!input.success || (updating && !input.data.id)) return Response.json({ error: "Uzupełnij nazwę sceny i co najmniej jedno ustawienie lampy." }, { status: 400 });
  const targetError = await validateTargets(input.data.actions, input.data.roomId);
  if (targetError) return Response.json({ error: targetError }, { status: 409 });
  const scene = await getDb().transaction(async (tx) => {
    let sceneId = input.data.id;
    if (updating) {
      const [updated] = await tx.update(lightingScenes).set({ name: input.data.name, roomId: input.data.roomId }).where(eq(lightingScenes.id, sceneId!)).returning({ id: lightingScenes.id });
      if (!updated) return null;
      await tx.delete(lightingSceneActions).where(eq(lightingSceneActions.sceneId, sceneId!));
    } else {
      const [created] = await tx.insert(lightingScenes).values({ name: input.data.name, roomId: input.data.roomId, active: true }).returning({ id: lightingScenes.id });
      sceneId = created.id;
    }
    await tx.insert(lightingSceneActions).values(input.data.actions.map((action) => ({
      sceneId: sceneId!,
      outputId: action.outputId,
      command: action.command,
      brightness: action.command === "BRIGHTNESS" ? action.brightness : null,
      fadeDurationMs: action.command === "BRIGHTNESS" ? action.fadeDurationSeconds * 1000 : 0,
    })));
    return { id: sceneId!, name: input.data.name, roomId: input.data.roomId };
  });
  if (!scene) return Response.json({ error: "Scena nie istnieje." }, { status: 404 });
  return Response.json({ scene }, { status: updating ? 200 : 201 });
}

export function POST(request: Request) { return saveScene(request, false); }
export function PATCH(request: Request) { return saveScene(request, true); }

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { id?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Nieprawidłowa scena." }, { status: 400 });
  const [deleted] = await getDb().delete(lightingScenes).where(eq(lightingScenes.id, id)).returning({ id: lightingScenes.id });
  if (!deleted) return Response.json({ error: "Scena nie istnieje." }, { status: 404 });
  return Response.json({ status: "ok" });
}
