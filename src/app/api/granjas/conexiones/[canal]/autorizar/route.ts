import { administrador, errorApi } from "@/lib/granjas/api";
import { iniciarOAuth } from "@/lib/granjas/conexiones";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Redirige a la pantalla oficial de autorización. El estado queda ligado a esta sesión. */
export async function GET(request: Request, { params }: { params: Promise<{ canal: string }> }) {
  try {
    const { usuario } = await administrador("conexiones", "escribir");
    const { canal } = await params;
    if (!["instagram", "facebook", "tiktok", "youtube"].includes(canal)) throw new WorkflowError("Canal desconocido.", 404);
    const metricas = new URL(request.url).searchParams.get("metricas") === "1";
    return Response.redirect(iniciarOAuth(canal as "instagram" | "facebook" | "tiktok" | "youtube", usuario, metricas), 302);
  } catch (error) {
    return errorApi(error);
  }
}
