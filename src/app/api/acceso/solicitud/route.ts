import { cuerpo, errorApi } from "@/lib/granjas/api";
import { crearSolicitud, solicitudSchema } from "@/lib/equipo/solicitudes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pública (desde el login): deja una solicitud de acceso. No crea cuentas ni da permisos. */
export async function POST(request: Request) {
  try {
    return Response.json(crearSolicitud(await cuerpo(request, solicitudSchema, 4_000)));
  } catch (error) {
    return errorApi(error);
  }
}
