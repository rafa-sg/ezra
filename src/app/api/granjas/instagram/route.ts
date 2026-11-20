import { administrador, errorApi } from "@/lib/granjas/api";
import { metricasInstagram } from "@/lib/granjas/instagram-metricas";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Métricas reales de la cuenta de Instagram conectada (solo lectura; caché de 30 min, ?forzar=1 la salta). */
export async function GET(request: Request) {
  try {
    await administrador();
    const forzar = new URL(request.url).searchParams.get("forzar") === "1";
    return Response.json(await metricasInstagram({ forzar }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
