import type { Artefacto } from "./almacen";
import type { Ejecucion } from "./ejecucion";
import { leerEvento } from "./eventos";
import { convertirAPng, leerBytesMedio, leerMedio, guardarMedio } from "./medios";
import {
  crearPost,
  eventosParaPost,
  leerPost,
  partesFecha,
  horaLegible,
  ponerImagen,
  postsCreadosHoy,
  promptRedactor,
  textoPlantilla,
  validarTextoIG,
  type PostIG,
} from "./instagram";
import { renderizarPost } from "./diseno";
import type { ResultadoLocal } from "./pasos-eventos";

/**
 * Granja «Post para Instagram»: el redactor escribe un texto por evento aprobado
 * (Gemini o plantilla sin IA) y el diseñador arma su PNG 1080×1350 en local.
 */
export const esGranjaInstagram = (e: Ejecucion) => e.instantanea.ajustes?.purpose === "post_instagram_eventos";
export type GenerarTexto = (prompt: string) => Promise<string>;
const limpiarRespuesta = (t: string) =>
  t
    .replace(/^```(?:\w+)?\s*|```\s*$/g, "")
    .replace(/^["«“]|["»”]$/g, "")
    .replace(/\n\nFuentes de búsqueda pendientes de verificación:[\s\S]*$/, "")
    .trim();

export async function redactarPaso(ejecucion: Ejecucion, generar: GenerarTexto | null, ahora = new Date()): Promise<ResultadoLocal> {
  const ajustes = ejecucion.instantanea.ajustes?.instagram;
  const cuenta = ajustes?.cuenta ?? "@spotmi.sv";
  const porDia = ajustes?.postsPorDia ?? 3;
  const limite = Math.max(0, Math.min(porDia, ejecucion.instantanea.limites?.posts ?? porDia) - postsCreadosHoy(ejecucion.granjaId, ahora));
  const eventos = eventosParaPost(ahora).slice(0, limite);
  if (!eventos.length)
    return {
      artefactos: [{ tipo: "texto", contenido: JSON.stringify({ posts: [] }, null, 2) }],
      detalle: limite ? "No hay eventos aprobados con fecha confirmada y sin post." : "Ya se alcanzó el máximo de posts de hoy.",
    };
  const posts: { id: string; eventoId: string; titulo: string; origen: string; nota: string }[] = [];
  for (const e of eventos) {
    let texto = "";
    let origen = "plantilla";
    let nota = generar ? "" : "Texto de plantilla, sin IA.";
    if (generar) {
      try {
        let problemas: string[] = [];
        for (let intento = 0; intento < 2; intento++) {
          const propuesta = limpiarRespuesta(await generar(promptRedactor(e, cuenta, problemas)));
          problemas = validarTextoIG(propuesta, e);
          if (!problemas.length) {
            texto = propuesta;
            origen = "ia";
            break;
          }
        }
        if (!texto) nota = `La IA no cumplió las reglas (${problemas.join(" ")}); se usó la plantilla sin IA.`;
      } catch (error) {
        nota = `No se pudo redactar con IA (${error instanceof Error ? error.message.slice(0, 160) : "error"}); se usó la plantilla sin IA.`;
      }
    }
    if (!texto) texto = textoPlantilla(e);
    const post = crearPost({ eventoId: e.id, granjaId: ejecucion.granjaId, ejecucionId: ejecucion.id, cuenta, texto, textoOrigen: origen, nota });
    posts.push({ id: post.id, eventoId: e.id, titulo: e.titulo, origen, nota });
  }
  const conIA = posts.filter((p) => p.origen === "ia").length;
  return {
    artefactos: [{ tipo: "texto", contenido: JSON.stringify({ posts }, null, 2) }],
    detalle: `${posts.length} texto(s) listo(s)${generar ? ` · ${conIA} con IA, ${posts.length - conIA} con plantilla` : ""}.`,
  };
}

/** Datos de la plantilla: solo fecha y hora confirmadas; fondo solo si confirmaste el permiso de la imagen. */
export async function datosDePost(post: PostIG) {
  const e = leerEvento(post.eventoId);
  if (!e.fecha) throw new Error("El evento perdió su fecha confirmada.");
  const p = partesFecha(e.fecha);
  let fondo: { bytes: Buffer; mime: string } | null = null;
  if (e.imagenMedioId && e.imagenConfirmada && e.imagenTipo !== "ia") {
    const medio = leerMedio(e.imagenMedioId);
    const bytes = await leerBytesMedio(medio);
    if (medio.mime === "image/webp") {
      // La plantilla acepta PNG y JPG: WebP se convierte en local (sin ffmpeg, fondo azul).
      const png = await convertirAPng(bytes);
      fondo = png ? { bytes: png, mime: "image/png" } : null;
    } else fondo = { bytes, mime: medio.mime };
  }
  return {
    evento: e,
    datos: {
      dia: p.dia,
      mes: p.mes,
      semana: p.semana,
      titulo: e.titulo,
      lugar: [e.lugar, e.municipio || e.departamento].filter(Boolean).join(", "),
      hora: e.hora ? horaLegible(e.hora) : null,
      fondo,
    },
  };
}
export async function disenarPost(postId: string) {
  const post = leerPost(postId);
  const { evento, datos } = await datosDePost(post);
  const png = await renderizarPost(datos);
  const medio = await guardarMedio(png, {
    nombre: `Post IG · ${evento.titulo}`.slice(0, 200),
    procedencia: {
      origen: "render",
      herramienta: "next/og",
      nota: `Plantilla Spotmi 1080×1350 renderizada en local, sin IA${datos.fondo ? ", con la imagen oficial autorizada" : ""}.`,
      fuentes: datos.fondo && evento.imagenMedioId ? [leerMedio(evento.imagenMedioId).sha256] : [],
    },
    licencia: datos.fondo ? `Fondo: ${evento.imagenPermiso}` : "Diseño propio de Spotmi (plantilla local).",
    generado: false,
  });
  return { post: ponerImagen(postId, medio.id), medio };
}
export async function disenarPaso(ejecucion: Ejecucion, entradas: Artefacto[]): Promise<ResultadoLocal> {
  const ids = new Set<string>();
  for (const a of entradas)
    try {
      for (const p of (JSON.parse(a.contenido) as { posts?: { id: string }[] }).posts ?? []) ids.add(p.id);
    } catch {
      /* entrada que no es la lista del redactor */
    }
  if (!ids.size)
    return { artefactos: [{ tipo: "texto", contenido: JSON.stringify({ imagenes: [] }) }], detalle: "No llegaron posts para diseñar." };
  const artefactos: ResultadoLocal["artefactos"] = [];
  const errores: string[] = [];
  for (const id of ids) {
    try {
      const { post, medio } = await disenarPost(id);
      artefactos.push({ tipo: "imagen", contenido: JSON.stringify({ postId: post.id, eventoId: post.eventoId }), medioId: medio.id, medioSha: medio.sha256 });
    } catch (error) {
      errores.push(error instanceof Error ? error.message.slice(0, 160) : "error");
    }
  }
  return {
    artefactos: artefactos.length ? artefactos : [{ tipo: "texto", contenido: JSON.stringify({ errores }) }],
    detalle: `${artefactos.length} imagen(es) 1080×1350 lista(s)${errores.length ? ` · ${errores.length} con error: ${errores[0]}` : ""}.`,
    bloqueado: !artefactos.length,
  };
}
