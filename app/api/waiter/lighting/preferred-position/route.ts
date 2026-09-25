import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { lightingDevices, lightingOutputs, lightingOutputStates } from "../../../../../db/schema";
import { currentWaiter } from "../../../../../lib/waiter-auth";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const employee = await currentWaiter(request);
  if (!employee) return Response.json({ error: "Sesja pracownika wygasła." }, { status: 401 });
  if (!employee.canControlLighting) return Response.json({ error: "Nie masz uprawnienia do sterowania oświetleniem." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { outputId?: unknown };
  const outputId = Number(body.outputId);
  if (!Number.isInteger(outputId) || outputId < 1) return Response.json({ error: "Nieprawidłowy ekran." }, { status: 400 });

  const [target] = await getDb().select({
    position: lightingOutputStates.position,
    motion: lightingOutputStates.motion,
    channel: lightingOutputs.channel,
    capabilities: lightingOutputs.capabilities,
    adapter: lightingDevices.apiType,
  }).from(lightingOutputs)
    .innerJoin(lightingDevices, eq(lightingDevices.id, lightingOutputs.deviceId))
    .leftJoin(lightingOutputStates, eq(lightingOutputStates.outputId, lightingOutputs.id))
    .where(and(eq(lightingOutputs.id, outputId), eq(lightingOutputs.active, true), eq(lightingDevices.active, true))).limit(1);
  if (!target || target.adapter !== "shutter" || target.channel !== "shutter:0" || target.capabilities.shutter !== true) return Response.json({ error: "Ekran nie istnieje albo nie został zatwierdzony." }, { status: 404 });
  if (target.motion !== "STOPPED") return Response.json({ error: "Najpierw zatrzymaj ekran, a następnie zapisz jego pozycję." }, { status: 409 });
  if (target.position === null || target.position < 0 || target.position > 100) return Response.json({ error: "Brak aktualnego odczytu pozycji ekranu." }, { status: 409 });

  await getDb().update(lightingOutputs).set({ preferredPosition: target.position, updatedAt: new Date() }).where(eq(lightingOutputs.id, outputId));
  return Response.json({ status: "ok", preferredPosition: target.position });
}
