import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { leerEvento } from "@/lib/granjas/eventos";
import { editarTextoPost, leerPost, listarPosts, marcarSubido } from "@/lib/granjas/instagram";
import { disenarPost } from "@/lib/granjas/pasos-instagram";
import { iaDisenoWeb, proveedoresDiseno } from "@/lib/granjas/director-web";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Claude o Astra pueden tardar hasta dos intentos de ~1 a 2 minutos.
export const maxDuration = 300;

const id = z.string().uuid();
const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("subido"), id, revision: z.number().int().positive(), url: z.string().trim().max(500) }),
  z.object({ accion: z.literal("texto"), id, revision: z.number().int().positive(), texto: z.string().max(2200) }),
  z.object({ accion: z.literal("redisenar"), id, proveedor: z.enum(proveedoresDiseno).default("local") }),
]);
/** Posts listos para subir a mano. Ezra no publica en Instagram. */
export async function GET() {
  try {
    await administrador();
    const posts = listarPosts().map((p) => {
      const e = leerEvento(p.eventoId);
      return { ...p, evento: { id: e.id, titulo: e.titulo, fecha: e.fecha, hora: e.hora, lugar: e.lugar, imagenAutorizada: Boolean(e.imagenMedioId) } };
    });
    return Response.json({ posts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    await administrador();
    const a = await cuerpo(request, accion, 10_000);
    if (a.accion === "subido") return Response.json({ post: marcarSubido(a.id, a.revision, a.url) });
    if (a.accion === "texto") return Response.json({ post: editarTextoPost(a.id, a.revision, a.texto) });
    if (leerPost(a.id).estado === "subido") return Response.json({ post: leerPost(a.id) });
    return Response.json({ post: (await disenarPost(a.id, await iaDisenoWeb(a.proveedor, a.id))).post });
  } catch (error) {
    return errorApi(error);
  }
}
