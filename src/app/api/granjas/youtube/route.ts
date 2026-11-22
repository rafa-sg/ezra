import { administrador, errorApi } from "@/lib/granjas/api";
import { metricasYoutube } from "@/lib/granjas/youtube-metricas";
import { WorkflowError } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await administrador("apps");
    const params = new URL(request.url).searchParams;
    const canal = params.get("canal");
    if (!canal) throw new WorkflowError("Selecciona un canal de YouTube.", 422);
    return Response.json(await metricasYoutube(canal, params.get("forzar") === "1"), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorApi(error);
  }
}
