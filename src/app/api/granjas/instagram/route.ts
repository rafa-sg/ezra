import { administrador, errorApi } from "@/lib/granjas/api";
import { metricasInstagram } from "@/lib/granjas/instagram-metricas";
import { conexionDe, leerConexion } from "@/lib/granjas/conexiones";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Métricas reales de la cuenta de Instagram conectada (solo lectura; caché de 30 min, ?forzar=1 la salta). */
export async function GET(request: Request) {
  try {
    const { equipo } = await administrador("apps");
    const params = new URL(request.url).searchParams;
    const forzar = params.get("forzar") === "1";
    // La cuenta elegida en Apps; sin ella, la compartida principal (si esta sesión puede verla).
    const id = params.get("conexion") ?? leerConexion("instagram").id;
    if (!id) return Response.json(await metricasInstagram({ forzar }), { headers: { "Cache-Control": "no-store" } });
    if (conexionDe(id, equipo).canal !== "instagram") throw new WorkflowError("Esa cuenta no es de Instagram.", 422);
    return Response.json(await metricasInstagram({ forzar, conexionId: id }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
