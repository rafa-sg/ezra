import { leerProduccion, guardarProduccion } from "./almacen";
import type { Encargo } from "./modelo";
import { caducidadVirales, DIAS_DATOS_YOUTUBE, fechaConsultaVirales } from "./virales-texto";
export { caducidadVirales, DIAS_DATOS_YOUTUBE, fechaConsultaVirales };

/**
 * YouTube API Services Developer Policies, III.E.4: los datos que no son del canal autorizado
 * (resultados de «Videos virales»: títulos, canales, miniaturas y estadísticas de videos ajenos)
 * se guardan como máximo 30 días; después se borran o se vuelven a consultar.
 * Ezra los borra al cumplirse el plazo; para tenerlos de nuevo, se vuelve a ejecutar la búsqueda.
 */
export const AVISO_VIRALES_CADUCADOS =
  "Los resultados de esta búsqueda se borraron al cumplirse 30 días (políticas de la API de YouTube). Vuelve a ejecutar el encargo para consultarlos otra vez.";
const esEnlaceYoutube = (url: string) => /^https:\/\/(www\.)?youtube\.com\/watch\?v=/.test(url) || /^https:\/\/youtu\.be\//.test(url);

/** ¿Guarda todavía datos de YouTube de terceros? */
export function tieneDatosYoutube(e: Encargo) {
  return (
    e.agente === "virales" &&
    (e.videos.length > 0 ||
      e.fuentes.some((f) => esEnlaceYoutube(f.url)) ||
      (e.origenResultado === "youtube" && e.resultado.trim() !== "" && e.resultado !== AVISO_VIRALES_CADUCADOS) ||
      e.historial.some((h) => h.resultado && h.resultado !== AVISO_VIRALES_CADUCADOS))
  );
}
/** Devuelve el encargo sin los datos de YouTube si ya pasó el plazo; si no, el mismo objeto. */
export function caducarEncargoViral(e: Encargo, ahora = new Date()): Encargo {
  if (!tieneDatosYoutube(e) || Date.parse(caducidadVirales(e)) > ahora.getTime()) return e;
  return {
    ...e,
    videos: [],
    videosConsultados: null,
    fuentes: e.fuentes.filter((f) => !esEnlaceYoutube(f.url)),
    resultado: e.origenResultado === "youtube" || e.resultado.trim() ? AVISO_VIRALES_CADUCADOS : e.resultado,
    // El historial guarda copias del texto de cada versión: también se borran.
    historial: e.historial.map((h) => (h.resultado ? { ...h, resultado: AVISO_VIRALES_CADUCADOS } : h)),
  };
}
/** Borra del estudio los resultados de «Videos virales» vencidos. Devuelve cuántos encargos cambió. */
export async function purgarViralesVencidos(ahora = new Date()): Promise<number> {
  const actual = await leerProduccion();
  const vencidos = actual.encargos.filter((e) => caducarEncargoViral(e, ahora) !== e).map((e) => e.id);
  if (!vencidos.length) return 0;
  await guardarProduccion(actual.revision, (p) => ({
    ...p,
    encargos: p.encargos.map((e) => (vencidos.includes(e.id) ? caducarEncargoViral(e, ahora) : e)),
  }));
  return vencidos.length;
}
