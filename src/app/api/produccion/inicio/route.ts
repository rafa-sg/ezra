import { administrador, errorApi } from "@/lib/granjas/api";
import { resumenInicio } from "@/lib/produccion/inicio";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Inicio del estudio: estados y pendientes leídos de los datos guardados. Solo administración. */
export async function GET() {
  try {
    const { equipo } = await administrador("inicio");
    return Response.json(await resumenInicio(new Date(), equipo), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
