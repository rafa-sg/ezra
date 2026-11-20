import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { cambiosSchema, guardarPreferencias, leerPreferencias } from "@/lib/produccion/preferencias";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pedido = z.object({ revision: z.number().int().min(0), cambios: cambiosSchema });
/** Personalización del estudio de la cuenta (solo administración). */
export async function GET() {
  try {
    const { usuario } = await administrador();
    return Response.json({ preferencias: leerPreferencias(usuario) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    const { usuario } = await administrador();
    const p = await cuerpo(request, pedido, 20_000);
    return Response.json({ preferencias: guardarPreferencias(usuario, p.revision, p.cambios) });
  } catch (error) {
    return errorApi(error);
  }
}
