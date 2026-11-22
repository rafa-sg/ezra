import { administrador, errorApi } from "@/lib/granjas/api";
import { iniciarOAuth } from "@/lib/granjas/conexiones";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Redirige a la pantalla oficial de autorización. El estado queda ligado a esta sesión y al nivel
 * elegido: `?alcance=compartida` (solo el propietario) o `?alcance=personal` (la cuenta será solo tuya).
 */
export async function GET(request: Request, { params }: { params: Promise<{ canal: string }> }) {
  try {
    const { usuario, equipo } = await administrador("conexiones", "escribir");
    const { canal } = await params;
    if (!["instagram", "facebook", "tiktok", "youtube"].includes(canal)) throw new WorkflowError("Canal desconocido.", 404);
    const busqueda = new URL(request.url).searchParams;
    const alcance = busqueda.get("alcance") === "compartida" ? "compartida" : "personal";
    if (alcance === "compartida" && equipo.rol !== "propietario")
      throw new WorkflowError("Solo el propietario conecta cuentas compartidas de Spotmi.", 403);
    const metricas = busqueda.get("metricas") === "1";
    return Response.redirect(
      iniciarOAuth(canal as "instagram" | "facebook" | "tiktok" | "youtube", usuario, metricas, {
        alcance,
        miembroId: alcance === "personal" ? equipo.miembroId : null,
      }),
      302,
    );
  } catch (error) {
    return errorApi(error);
  }
}
