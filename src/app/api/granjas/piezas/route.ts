import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { aprobarPieza, autorizarPublicacion, editarPieza, resolverDesconocido, simular, vistaPieza } from "@/lib/granjas/publicacion";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const destinos = z.array(z.enum(["instagram", "facebook", "tiktok", "spotmi"])).min(1).max(4);
const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("editar"), piezaId: id, version: z.number().int(), contenido: z.unknown() }),
  z.object({ accion: z.literal("aprobar"), piezaId: id, hash, comprobaciones: z.object({ hechos: z.boolean(), derechos: z.boolean(), marca: z.boolean() }) }),
  z.object({ accion: z.literal("simular"), piezaId: id, destinos }),
  z.object({ accion: z.literal("autorizar"), piezaId: id, hash, destinos, confirmacion: z.string().max(20) }),
  z.object({ accion: z.literal("resolver"), reciboId: id, resultado: z.enum(["no_publicado", "publicado"]), enlace: z.string().max(500) }),
]);

export async function GET(request: Request) {
  try {
    await administrador();
    const piezaId = new URL(request.url).searchParams.get("id");
    if (!piezaId) throw new WorkflowError("Falta la vista previa.", 400);
    return Response.json(vistaPieza(piezaId));
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    const { usuario } = await administrador();
    const a = await cuerpo(request, accion, 120_000);
    if (a.accion === "editar") return Response.json(vistaPieza(editarPieza(a.piezaId, a.version, a.contenido).id));
    if (a.accion === "aprobar") return Response.json(vistaPieza(aprobarPieza(a.piezaId, a.hash, a.comprobaciones).id));
    if (a.accion === "simular") return Response.json(simular(a.piezaId, a.destinos));
    if (a.accion === "autorizar") return Response.json({ ...autorizarPublicacion({ ...a, usuario }), vista: vistaPieza(a.piezaId) });
    resolverDesconocido(a.reciboId, a.resultado, a.enlace);
    return Response.json({ ok: true });
  } catch (error) {
    return errorApi(error);
  }
}
