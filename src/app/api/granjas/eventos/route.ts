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
  leerConfianzaDominios,
  crearEventoManual,
  enlaceManualSchema,
  referenciasLocales,
} from "@/lib/granjas/eventos";
import { clasificarFuente, confianzaDominiosSchema, dominiosConocidos } from "@/lib/granjas/confianza";
import { guardarAjuste } from "@/lib/granjas/ajustes";
import { candidatosDeRedes, cuentasSeguidasSchema, estadoLecturaRedes, guardarCuentasSeguidas, leerCuentasSeguidas } from "@/lib/granjas/redes";
import { contextoGranjaEventos } from "@/lib/granjas/completar-imagenes";
import { verificarCandidatos } from "@/lib/granjas/verificador";
import { eventosPublicosSpotmi } from "@/lib/granjas/spotmi-publico";
import { listarGranjas } from "@/lib/granjas/almacen";
import { completarImagenEvento } from "@/lib/granjas/completar-imagenes";
import { importarEventos, MAX_IMPORTAR } from "@/lib/granjas/importar";
import { actualizarPropuestasPendientes, consultarEstadoSpotmi, enviarEventoASpotmi, spotmiPuedeProponer } from "@/lib/granjas/spotmi-propuestas";
import { descargarSegura, type MaterialFuente } from "@/lib/granjas/fuentes";
import { guardarMedio } from "@/lib/granjas/medios";
import { diaLocal, diaValido } from "@/lib/granjas/tiempo";
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
  // Desde la interfaz solo valen los dominios permitidos de la granja (sin dominios extra).
  z.object({ accion: z.literal("importar"), eventos: z.array(z.unknown()).min(1).max(MAX_IMPORTAR) }),
  z.object({ accion: z.literal("buscar_imagen"), id }),
  // «Completar imágenes»: la interfaz recorre los eventos sin imagen de a uno y muestra el progreso.
  z.object({ accion: z.literal("completar_imagen"), id }),
  // «Pegar enlace»: un video o post (TikTok, Instagram…) con los datos escritos a mano. Ezra no abre ese enlace.
  z.object({ accion: z.literal("pegar_enlace"), datos: enlaceManualSchema }),
  z.object({ accion: z.literal("cuentas"), cuentas: cuentasSeguidasSchema }),
  z.object({ accion: z.literal("leer_redes") }),
  // Confianza por dominio: tipo y puntos que el propietario fija para cada sitio.
  z.object({ accion: z.literal("confianza_dominios"), dominios: confianzaDominiosSchema }),
  z.object({ accion: z.literal("enviar_spotmi"), id }),
  z.object({ accion: z.literal("consultar_spotmi"), id: id.optional() }),
]);
const dia = z.string().refine(diaValido).nullable();
// Portadas y carteleras leídas durante un lote: se reutilizan 10 minutos para no releerlas por cada evento.
const lote = { creado: 0, portadas: new Map<string, string[]>(), listados: new Map<string, Promise<MaterialFuente[]>>() };
function cacheLote() {
  if (Date.now() - lote.creado > 10 * 60_000) Object.assign(lote, { creado: Date.now(), portadas: new Map(), listados: new Map() });
  return { portadas: lote.portadas, listados: lote.listados };
}

/** Dominios conocidos y los que aparecen en las fuentes, con su tipo y puntos actuales (y si los fijó el propietario). */
function tablaConfianza(lista: ReturnType<typeof listarEventos>) {
  const ajustes = leerConfianzaDominios();
  const vistos = new Map<string, number>();
  for (const e of lista) for (const f of e.fuentes) if (f.via === "web") vistos.set(f.dominio, (vistos.get(f.dominio) ?? 0) + 1);
  const dominios = [...new Set([...Object.keys(dominiosConocidos), ...Object.keys(ajustes), ...vistos.keys()])].filter(Boolean).sort();
  return dominios.map((d) => ({ ...clasificarFuente({ url: `https://${d}/`, via: "web" }, ajustes), dominio: d, propio: d in ajustes, eventos: vistos.get(d) ?? 0 }));
}
export async function GET(request: Request) {
  try {
    await administrador();
    const p = new URL(request.url).searchParams;
    const estado = z.enum(estadosVisibles).nullable().catch(null).parse(p.get("estado"));
    const filtro = { estado, desde: dia.catch(null).parse(p.get("desde")), hasta: dia.catch(null).parse(p.get("hasta")) };
    const todos = listarEventos();
    const hoy = diaLocal(new Date());
    const eventos = listarEventos(filtro);
    const conteo = Object.fromEntries(estadosVisibles.map((e) => [e, todos.filter((x) => x.estadoVisible === e).length]));
    return Response.json(
      {
        eventos: eventos.map((e) => ({ ...e, ficha: fichaTexto(e) })),
        conteo,
        total: todos.length,
        spotmi: spotmiPuedeProponer(),
        // Pendientes de «Completar imágenes»: sin imagen, no descartados y que no han terminado.
        sinImagen: todos.filter((e) => !e.imagenMedioId && e.estado !== "descartado" && (!e.fecha || (e.fechaFin ?? e.fecha) >= hoy)).map((e) => e.id),
        categorias: categoriasEvento,
        departamentos,
        cuentas: leerCuentasSeguidas(),
        confianza: tablaConfianza(todos),
        lectura: estadoLecturaRedes(),
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
    const a = await cuerpo(request, accion, 600_000);
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
    if (a.accion === "importar") {
      const { detalle, ...resumen } = await importarEventos(a.eventos);
      return Response.json({ importacion: { ...resumen, duplicados: detalle.duplicados, descartados: detalle.descartados } });
    }
    if (a.accion === "buscar_imagen") {
      const e = leerEvento(a.id);
      if (e.imagenMedioId) throw new WorkflowError("Este evento ya tiene imagen. Usa «Cambiar imagen» para reemplazarla.", 409);
      const r = await completarImagenEvento(e.id);
      if (r.estado === "sin_imagen") throw new WorkflowError(`No se encontró una imagen oficial válida: ${r.motivo}`, 422);
      return Response.json({ evento: leerEvento(e.id) });
    }
    if (a.accion === "completar_imagen") {
      const resultado = await completarImagenEvento(a.id, cacheLote());
      return Response.json({ resultado, evento: leerEvento(a.id) });
    }
    if (a.accion === "confianza_dominios") {
      guardarAjuste("confianza_dominios", confianzaDominiosSchema, a.dominios);
      return Response.json({ confianza: tablaConfianza(listarEventos()) });
    }
    if (a.accion === "pegar_enlace") return Response.json(crearEventoManual(a.datos));
    if (a.accion === "cuentas") return Response.json({ cuentas: guardarCuentasSeguidas(a.cuentas) });
    if (a.accion === "leer_redes") {
      // Lectura pedida por el propietario: mismas reglas que la búsqueda diaria (API oficial, Gemini con presupuesto, verificador).
      const granja = listarGranjas().find((g) => g.ajustes.purpose === "eventos_el_salvador" && g.estado === "activa");
      const hoy = diaLocal(new Date());
      const diasAdelante = granja?.ajustes.eventos?.diasAdelante ?? 60;
      const conocidos = referenciasLocales()
        .filter((r) => !r.fecha || (r.hasta ?? r.fecha) >= hoy)
        .map((r) => (r.fecha ? `${r.titulo} (${r.fecha})` : r.titulo));
      const { candidatos, resumen } = await candidatosDeRedes({ hoy, diasAdelante, conocidos, gemini: { granjaId: granja?.id ?? null } });
      const verificacion = candidatos.length
        ? await verificarCandidatos(
            candidatos,
            { hoy, diasAdelante, dominios: contextoGranjaEventos().dominios, restantes: 50, referencias: referenciasLocales(), granjaId: granja?.id ?? null, ejecucionId: null },
            { catalogoSpotmi: eventosPublicosSpotmi },
          )
        : null;
      return Response.json({ redes: resumen, verificacion: verificacion && { nuevos: verificacion.nuevos.length, duplicados: verificacion.duplicados.length, descartados: verificacion.descartados.length, conImagen: verificacion.conImagen } });
    }
    if (a.accion === "enviar_spotmi") return Response.json({ evento: await enviarEventoASpotmi(a.id) });
    if (a.id) return Response.json({ evento: await consultarEstadoSpotmi(a.id) });
    const pendientes = listarEventos({ estado: "propuesto" }).map((e) => e.id);
    return Response.json({ resultados: await actualizarPropuestasPendientes(pendientes) });
  } catch (error) {
    return errorApi(error);
  }
}
