import { administrador, errorApi } from "@/lib/granjas/api";
import { panoramaGranjas } from "@/lib/granjas/panorama";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Panorama de Granjas: tarjetas, mapa de conexiones y flujo de agentes (solo administración). */
export async function GET() {
  try {
    await administrador("inicio");
    return Response.json(panoramaGranjas(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
