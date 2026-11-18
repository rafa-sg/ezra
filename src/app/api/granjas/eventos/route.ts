import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { WorkflowError } from "@/lib/workflow";
import {
  aprobarEvento,
  autorizarImagen,
  descartarEvento,
  edicionEventoSchema,
  editarEvento,
  estadosVisibles,
  fichaTexto,
  listarEventos,
  categoriasEvento,
  confirmarImagen,
  departamentos,
  leerEvento,
  ponerImagenFuente,
} from "@/lib/granjas/eventos";
import { buscarImagenEvento, permisoPendiente } from "@/lib/granjas/imagenes";
import { actualizarPropuestasPendientes, consultarEstadoSpotmi, enviarEventoASpotmi, spotmiPuedeProponer } from "@/lib/granjas/spotmi-propuestas";
import { descargarSegura } from "@/lib/granjas/fuentes";
import { guardarMedio } from "@/lib/granjas/medios";
import { diaValido } from "@/lib/granjas/tiempo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().uuid();
const revision = z.number().int().positive();
const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("aprobar"), id, revision }),
  z.object({ accion: z.literal("descartar"), id, revision, motivo: z.string().trim().min(3).max(300) }),
  z.object({ accion: z.literal("editar"), id, revision, datos: edicionEventoSchema }),
  z.object({
    accion: z.literal("imagen"),
    id,
    revision,
    url: z.string().url().max(1000).optional(),
    medioId: id.nullable().optional(),
    permiso: z.string().trim().max(500),
  }),
  z.object({ accion: z.literal("confirmar_imagen"), id, revision }),
  z.object({ accion: z.literal("buscar_imagen"), id }),
  z.object({ accion: z.literal("enviar_spotmi"), id }),
  z.object({ accion: z.literal("consultar_spotmi"), id: id.optional() }),
]);
const dia = z.string().refine(diaValido).nullable();

export async function GET(request: Request) {
  try {
    await administrador();
    const p = new URL(request.url).searchParams;
    const estado = z.enum(estadosVisibles).nullable().catch(null).parse(p.get("estado"));
    const filtro = { estado, desde: dia.catch(null).parse(p.get("desde")), hasta: dia.catch(null).parse(p.get("hasta")) };
    const todos = listarEventos();
    const eventos = listarEventos(filtro);
    const conteo = Object.fromEntries(estadosVisibles.map((e) => [e, todos.filter((x) => x.estadoVisible === e).length]));
    return Response.json(
      {
        eventos: eventos.map((e) => ({ ...e, ficha: fichaTexto(e) })),
        conteo,
        total: todos.length,
        spotmi: spotmiPuedeProponer(),
        categorias: categoriasEvento,
        departamentos,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    await administrador();
    const a = await cuerpo(request, accion, 20_000);
    if (a.accion === "aprobar") return Response.json({ evento: aprobarEvento(a.id, a.revision) });
    if (a.accion === "descartar") return Response.json({ evento: descartarEvento(a.id, a.revision, a.motivo) });
    if (a.accion === "editar") return Response.json({ evento: editarEvento(a.id, a.revision, a.datos) });
    if (a.accion === "imagen") {
      if (!a.url) return Response.json({ evento: autorizarImagen(a.id, a.revision, a.medioId ?? null, a.permiso) });
      const url = new URL(a.url);
      // Imagen oficial elegida por el propietario: https, sin redes privadas y como máximo 12 MB.
      const respuesta = await descargarSegura(url.toString(), [url.hostname], { limite: 12 * 1024 * 1024 });
      if (respuesta.estado >= 400) throw new WorkflowError(`La imagen respondió ${respuesta.estado}.`, 502);
      const medio = await guardarMedio(respuesta.cuerpo, {
        nombre: `Imagen oficial · ${url.hostname}`,
        procedencia: { origen: "subida", nota: `Descargada de ${url.toString().slice(0, 300)} con permiso anotado por el propietario.` },
        licencia: a.permiso,
        generado: false,
      });
      if (!medio.mime.startsWith("image/")) throw new WorkflowError("El enlace no es una imagen PNG, JPG o WebP.", 422);
      return Response.json({ evento: autorizarImagen(a.id, a.revision, medio.id, a.permiso) });
    }
    if (a.accion === "confirmar_imagen") return Response.json({ evento: confirmarImagen(a.id, a.revision) });
    if (a.accion === "buscar_imagen") {
      const e = leerEvento(a.id);
      if (e.imagenMedioId) throw new WorkflowError("Este evento ya tiene imagen. Usa «Cambiar imagen» para reemplazarla.", 409);
      const r = await buscarImagenEvento({ titulo: e.titulo, fuenteUrl: e.fuenteUrl, boletosUrl: e.boletosUrl });
      if (!r.medio) throw new WorkflowError(`No se encontró una imagen válida en la fuente: ${r.motivo}`, 422);
      return Response.json({ evento: ponerImagenFuente(e.id, r.medio.id, r.url, permisoPendiente(r.dominio)) });
    }
    if (a.accion === "enviar_spotmi") return Response.json({ evento: await enviarEventoASpotmi(a.id) });
    if (a.id) return Response.json({ evento: await consultarEstadoSpotmi(a.id) });
    const pendientes = listarEventos({ estado: "propuesto" }).map((e) => e.id);
    return Response.json({ resultados: await actualizarPropuestasPendientes(pendientes) });
  } catch (error) {
    return errorApi(error);
  }
}
