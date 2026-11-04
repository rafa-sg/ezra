import { administrador } from "@/lib/granjas/api";
import { completarOAuth } from "@/lib/granjas/conexiones";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Regreso desde Meta o TikTok. Vive fuera de /api porque llega como navegación
 * de otro sitio; aun así exige la sesión de administración que inició el permiso.
 */
export async function GET(request: Request, { params }: { params: Promise<{ canal: string }> }) {
  const url = new URL(request.url);
  const { canal } = await params;
  const destino = new URL("/azra/produccion", url.origin);
  destino.searchParams.set("seccion", "conexiones");
  try {
    if (!["instagram", "facebook", "tiktok"].includes(canal)) throw new Error("Canal desconocido.");
    const { usuario } = await administrador();
    await completarOAuth(canal as "instagram" | "facebook" | "tiktok", {
      estado: url.searchParams.get("state"),
      codigo: url.searchParams.get("code"),
      error: url.searchParams.get("error"),
      usuario,
    });
    destino.searchParams.set("conexion", `${canal}:ok`);
  } catch {
    // El detalle queda como «último error» en la tarjeta; la URL no lleva datos sensibles.
    destino.searchParams.set("conexion", `${canal}:error`);
  }
  return Response.redirect(destino, 303);
}
