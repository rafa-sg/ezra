import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { estadoN8n, probarN8n } from "@/lib/granjas/n8n";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await administrador();
    return Response.json({ n8n: estadoN8n() });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    await administrador();
    await cuerpo(request, z.object({ accion: z.literal("probar_conexion") }).strict(), 1000);
    return Response.json({ n8n: await probarN8n() });
  } catch (error) {
    return errorApi(error);
  }
}
