import { WorkflowError } from "../workflow";
import type { VideoViral } from "../produccion/modelo";
import { urlVideo } from "../produccion/virales-texto";
import type { Artefacto } from "./almacen";
import type { Ejecucion } from "./ejecucion";
import { leerMedio, type Medio } from "./medios";
import type { Nodo } from "./modelo";
import type { ResultadoLocal } from "./pasos-eventos";

/**
 * Granja «Clips». Reglas que no cambian:
 * - Los videos de la lista «Videos virales» son solo referencia: se guardan enlaces y métricas públicas,
 *   nunca se descargan ni se recortan.
 * - Solo se corta material subido por el propietario con su origen declarado (propio o con permiso del autor).
 */
export const esGranjaClips = (e: Pick<Ejecucion, "instantanea">) => e.instantanea.ajustes?.purpose === "clips";
export const ajustesClips = (e: Pick<Ejecucion, "instantanea">) => ({
  minimo: 3,
  maximo: 8,
  segundosMin: 15,
  segundosMax: 60,
  ...(e.instantanea.ajustes?.clips ?? {}),
});

/* ── 1 · Referencias: qué funciona en el tema (solo métricas y enlaces) ── */
const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const porcentaje = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const VACIAS = new Set(
  "a al ante con de del el en es la las lo los mi mas más me no o para por que qué se si su sus te tu un una uno y ya yo the of to and in is it on for with this that you your vs".split(" "),
);
export type ResumenReferencias = {
  total: number;
  duracion: { mediana: number | null; cortos: number; medios: number; largos: number; sinDato: number };
  vistasDia: { mediana: number | null; maximo: number | null };
  interaccion: { mediana: number | null };
  titulos: { largoMedio: number | null; conNumero: number; conPregunta: number; conMayusculas: number; conEmoji: number; palabras: string[] };
  /** Los 5 con más vistas por día: título, canal, enlace y métricas (nunca el video). */
  destacados: { titulo: string; canal: string; url: string; vistasDia: number; duracion: number | null }[];
  /** Pistas para proponer clips, deducidas de las métricas (no son hechos). */
  pistas: string[];
};
export function resumirReferencias(videos: VideoViral[]): ResumenReferencias {
  const total = videos.length;
  const duraciones = videos.map((v) => v.duracion).filter((d): d is number => d !== null);
  const titulos = videos.map((v) => v.titulo);
  const conteo = new Map<string, number>();
  for (const t of titulos)
    for (const p of new Set(
      t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9ñ]+/)
        .filter((x) => x.length > 2 && !VACIAS.has(x)),
    ))
      conteo.set(p, (conteo.get(p) ?? 0) + 1);
  const palabras = [...conteo]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([p]) => p);
  const resumen: ResumenReferencias = {
    total,
    duracion: {
      mediana: mediana(duraciones),
      cortos: duraciones.filter((d) => d <= 60).length,
      medios: duraciones.filter((d) => d > 60 && d <= 600).length,
      largos: duraciones.filter((d) => d > 600).length,
      sinDato: total - duraciones.length,
    },
    vistasDia: { mediana: mediana(videos.map((v) => v.vistasDia)), maximo: total ? Math.max(...videos.map((v) => v.vistasDia)) : null },
    interaccion: { mediana: mediana(videos.map((v) => v.interaccion).filter((x): x is number => x !== null)) },
    titulos: {
      largoMedio: total ? Math.round(titulos.reduce((s, t) => s + t.length, 0) / total) : null,
      conNumero: porcentaje(titulos.filter((t) => /\d/.test(t)).length, total),
      conPregunta: porcentaje(titulos.filter((t) => /[¿?]/.test(t)).length, total),
      conMayusculas: porcentaje(titulos.filter((t) => /\b[A-ZÁÉÍÓÚÑ]{4,}\b/.test(t)).length, total),
      conEmoji: porcentaje(titulos.filter((t) => /\p{Extended_Pictographic}/u.test(t)).length, total),
      palabras,
    },
    destacados: [...videos]
      .sort((a, b) => b.vistasDia - a.vistasDia)
      .slice(0, 5)
      .map((v) => ({ titulo: v.titulo, canal: v.canal, url: urlVideo(v.id), vistasDia: v.vistasDia, duracion: v.duracion })),
    pistas: [],
  };
  const d = resumen.duracion;
  if (duraciones.length && d.cortos >= duraciones.length / 2) resumen.pistas.push("La mayoría dura un minuto o menos: conviene cerrar cada clip antes de 60 s.");
  if (resumen.titulos.conPregunta >= 30) resumen.pistas.push("Muchos títulos son preguntas: un gancho con pregunta encaja con el tema.");
  if (resumen.titulos.conNumero >= 40) resumen.pistas.push("Muchos títulos llevan cifras: si tu video tiene un dato o una lista, úsalo en el título.");
  if (resumen.titulos.conMayusculas >= 30) resumen.pistas.push("Los títulos destacan una palabra en mayúsculas.");
  if (palabras.length) resumen.pistas.push(`Palabras que se repiten en los títulos: ${palabras.slice(0, 5).join(", ")}.`);
  return resumen;
}

/** Lee el encargo vinculado (la versión fijada al iniciar) y devuelve el resumen. Sin red ni IA. */
export async function referenciasPaso(ejecucion: Ejecucion, nodo: Nodo): Promise<ResultadoLocal> {
  const fijado = ejecucion.instantanea.entradas[nodo.id]?.encargo;
  if (!fijado) return { artefactos: [], detalle: "Vincula un encargo «Videos virales» aprobado en este paso.", bloqueado: true };
  const { leerProduccion } = await import("../produccion/almacen");
  const encargo = (await leerProduccion()).encargos.find((e) => e.id === fijado.id);
  if (!encargo) return { artefactos: [], detalle: "El encargo vinculado ya no existe.", bloqueado: true };
  if (encargo.agente !== "virales") return { artefactos: [], detalle: "El encargo vinculado no es de «Videos virales».", bloqueado: true };
  if (encargo.version !== fijado.version)
    return { artefactos: [], detalle: "El encargo cambió de versión después de iniciar. Vuelve a ejecutar la granja.", bloqueado: true };
  if (encargo.estado !== "aprobado")
    return { artefactos: [], detalle: "Aprueba primero el encargo «Videos virales» en Encargos.", bloqueado: true };
  if (!encargo.videos.length) return { artefactos: [], detalle: "El encargo no tiene videos guardados.", bloqueado: true };
  const resumen = resumirReferencias(encargo.videos);
  return {
    artefactos: [
      {
        tipo: "investigacion",
        contenido: JSON.stringify({ encargo: { id: encargo.id, version: encargo.version, titulo: encargo.titulo }, ...resumen }, null, 2),
      },
    ],
    detalle: `Referencia de ${resumen.total} videos (solo enlaces y métricas públicas).`,
  };
}

/* ── 2 · Material: solo videos subidos con su origen declarado ── */
export const MAX_SEGUNDOS_MATERIAL = 20 * 60;
export function problemasMaterial(medio: Medio): string[] {
  const problemas: string[] = [];
  if (!medio.mime.startsWith("video/")) problemas.push(`«${medio.nombre}» no es un video.`);
  if (medio.procedencia.origen !== "subida") problemas.push(`«${medio.nombre}» no lo subiste tú (origen: ${medio.procedencia.origen}).`);
  if (!medio.permiso) problemas.push(`«${medio.nombre}» no tiene declarado si es tuyo o con permiso del autor. Súbelo otra vez indicándolo.`);
  else if (medio.permiso.tipo === "autorizado" && (!medio.permiso.autor || !medio.permiso.constancia))
    problemas.push(`«${medio.nombre}» dice tener permiso, pero falta el autor o la constancia.`);
  if (medio.duracion !== null && medio.duracion > MAX_SEGUNDOS_MATERIAL)
    problemas.push(`«${medio.nombre}» dura más de ${MAX_SEGUNDOS_MATERIAL / 60} minutos; recórtalo antes de subirlo.`);
  return problemas;
}
/** El único video que la granja corta: el primero válido entre las entradas. */
export function videoDeEntradas(entradas: Artefacto[]): Medio {
  const videos = entradas.filter((a) => a.tipo === "video" && a.medioId).map((a) => leerMedio(a.medioId!));
  const valido = videos.find((m) => !problemasMaterial(m).length && m.procedencia.origen === "subida");
  if (!valido)
    throw new WorkflowError(
      videos.length ? problemasMaterial(videos[0]).join(" ") : "No llegó ningún video tuyo o con permiso del autor.",
      422,
    );
  return valido;
}
