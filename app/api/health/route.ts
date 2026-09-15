export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", service: "Marta Banaszek Café Menu", time: new Date().toISOString() });
}
