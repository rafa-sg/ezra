import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { aprobarClip, pedirCambiosClip, rechazarClip } from "@/lib/granjas/clips-almacen";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().uuid();
const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("aprobar"), clipId: id, comprobaciones: z.object({ hechos: z.boolean(), derechos: z.boolean(), marca: z.boolean() }) }),
  z.object({ accion: z.literal("rechazar"), clipId: id, motivo: z.string().max(500) }),
  z.object({ accion: z.literal("cambios"), clipId: id, cambios: z.unknown() }),
]);

/** «Tu revisión» de la granja Clips: aprobar, rechazar con motivo o pedir cambios, clip por clip. */
export async function POST(request: Request) {
  try {
    await administrador("granjas", "escribir");
    const a = await cuerpo(request, accion, 20_000);
    if (a.accion === "aprobar") return Response.json({ clip: aprobarClip(a.clipId, a.comprobaciones) });
    if (a.accion === "rechazar") return Response.json({ clip: rechazarClip(a.clipId, a.motivo) });
    return Response.json({ clip: pedirCambiosClip(a.clipId, a.cambios) });
  } catch (error) {
    return errorApi(error);
  }
}
