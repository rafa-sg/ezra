import { cuerpo, errorApi, propietario } from "@/lib/granjas/api";
import {
  cambiarSolicitud,
  cambioSolicitudSchema,
  listarSolicitudes,
} from "@/lib/equipo/solicitudes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solicitudes de acceso: solo el propietario las ve y decide (invitar o descartar). */
export async function GET() {
  try {
    await propietario();
    return Response.json({ solicitudes: listarSolicitudes() });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    await propietario();
    return Response.json({
      solicitudes: cambiarSolicitud(await cuerpo(request, cambioSolicitudSchema, 2_000)),
    });
  } catch (error) {
    return errorApi(error);
  }
}
