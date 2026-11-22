import { administrador, errorApi } from "@/lib/granjas/api";
import { metricasYoutube } from "@/lib/granjas/youtube-metricas";
import { conexionDe } from "@/lib/granjas/conexiones";
import { WorkflowError } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { equipo } = await administrador("apps");
    const params = new URL(request.url).searchParams;
    const id = params.get("conexion");
    if (!id) throw new WorkflowError("Selecciona un canal de YouTube.", 422);
    // Una cuenta personal ajena responde 404, igual que una que no existe.
    if (conexionDe(id, equipo).canal !== "youtube") throw new WorkflowError("Esa cuenta no es de YouTube.", 422);
    return Response.json(await metricasYoutube(id, params.get("forzar") === "1"), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorApi(error);
  }
}
