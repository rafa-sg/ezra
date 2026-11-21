import { z } from "zod";
import { WorkflowError } from "../workflow";
import { leerJson, renovarYoutube, youtubeApi, type Secreto, type Solicitar } from "../granjas/adaptadores";
import type { VideoViral } from "./modelo";
import { cifra, duracionTexto, urlVideo, type PeriodoViral } from "./virales-texto";
export { leerPedidoViral, textoPedidoViral, periodosVirales, type PeriodoViral } from "./virales-texto";

/**
 * Encargo «Videos virales»: busca videos públicos de YouTube sobre un tema y los ordena por sus
 * métricas públicas (vistas, vistas por día e interacción). No usa IA ni intentos del mes: consume
 * unas 101 unidades de la cuota gratuita diaria de la API de YouTube (10.000). Solo guarda enlaces y
 * datos públicos; nunca descarga videos (son de sus autores).
 */
export const MAX_VIRALES = 25;



const numero = (v: unknown) => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};
/** ISO 8601 de YouTube (PT1H2M3S) → segundos. */
export function segundosDuracion(iso: string | undefined) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso ?? "");
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return ((d * 24 + h) * 60 + mi) * 60 + s;
}
const miniatura = z.object({ url: z.string() });
const respuestaBusqueda = z.object({
  items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }).optional() })).default([]),
});
const respuestaVideos = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({
          title: z.string().default(""),
          channelTitle: z.string().default(""),
          channelId: z.string().default(""),
          publishedAt: z.string(),
          liveBroadcastContent: z.string().optional(),
          thumbnails: z.record(z.string(), miniatura).optional(),
        }),
        statistics: z.record(z.string(), z.unknown()).default({}),
        contentDetails: z.object({ duration: z.string().optional() }).optional(),
      }),
    )
    .default([]),
});

export async function buscarVirales(
  pedido: { tema: string; dias: PeriodoViral },
  secreto: Secreto,
  solicitar: Solicitar,
  ahora = new Date(),
): Promise<VideoViral[]> {
  if (pedido.tema.length < 2) throw new WorkflowError("Escribe el tema que quieres buscar (por ejemplo «GTA 6»).", 422);
  const leer = (url: string) => leerJson(solicitar, url, { headers: { Authorization: `Bearer ${secreto.acceso}` } });
  const busqueda = new URLSearchParams({ part: "id", type: "video", q: pedido.tema, order: "viewCount", maxResults: "50" });
  if (pedido.dias) busqueda.set("publishedAfter", new Date(ahora.getTime() - pedido.dias * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z"));
  const ids = [
    ...new Set(
      respuestaBusqueda
        .parse(await leer(`${youtubeApi}/search?${busqueda}`))
        .items.flatMap((i) => (i.id?.videoId && /^[\w-]{11}$/.test(i.id.videoId) ? [i.id.videoId] : [])),
    ),
  ];
  if (!ids.length) return [];
  const detalle = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.join(",") });
  const videos: VideoViral[] = [];
  for (const v of respuestaVideos.parse(await leer(`${youtubeApi}/videos?${detalle}`)).items) {
    // En vivo o programados no tienen métricas comparables.
    if (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none") continue;
    const vistas = numero(v.statistics.viewCount);
    const publicado = Date.parse(v.snippet.publishedAt);
    if (vistas === null || !Number.isFinite(publicado) || !/^[\w-]{11}$/.test(v.id)) continue;
    const meGusta = numero(v.statistics.likeCount);
    const comentarios = numero(v.statistics.commentCount);
    const dias = Math.max(1, (ahora.getTime() - publicado) / 86_400_000);
    const t = v.snippet.thumbnails;
    const foto = t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? "";
    videos.push({
      id: v.id,
      titulo: v.snippet.title.slice(0, 300) || v.id,
      canal: v.snippet.channelTitle.slice(0, 200),
      canalId: v.snippet.channelId.slice(0, 64),
      publicado: new Date(publicado).toISOString(),
      miniatura: foto.startsWith("https://") ? foto : "",
      duracion: segundosDuracion(v.contentDetails?.duration),
      vistas,
      meGusta,
      comentarios,
      vistasDia: Math.round(vistas / dias),
      // Me gusta y comentarios por vista; null si YouTube oculta ambos.
      interaccion: vistas > 0 && (meGusta !== null || comentarios !== null) ? ((meGusta ?? 0) + (comentarios ?? 0)) / vistas : null,
    });
  }
  return videos.sort((a, b) => b.vistas - a.vistas).slice(0, MAX_VIRALES);
}

const fechaCorta = (iso: string) => iso.slice(0, 10);

/** Texto legible para copiar o descargar, y las fuentes (enlaces) del encargo. */
export function entregaVirales(pedido: { tema: string; dias: PeriodoViral }, videos: VideoViral[], ahora = new Date()) {
  const periodo = pedido.dias ? `últimos ${pedido.dias} días` : "sin límite de fecha";
  const cabecera = `Videos más vistos de YouTube sobre «${pedido.tema}» · ${periodo}\nConsulta: ${ahora.toISOString().slice(0, 16).replace("T", " ")} UTC · ${videos.length} videos · métricas públicas de YouTube`;
  const filas = videos.map(
    (v, i) =>
      `${i + 1}. ${v.titulo} — ${v.canal}\n   ${urlVideo(v.id)}\n   ${cifra(v.vistas)} vistas · ${cifra(v.vistasDia)} vistas/día · ${v.interaccion === null ? "interacción oculta" : `${(v.interaccion * 100).toFixed(1)} % interacción`} · ${fechaCorta(v.publicado)}${v.duracion !== null ? ` · ${duracionTexto(v.duracion)}` : ""}`,
  );
  const texto = videos.length
    ? `${cabecera}\n\n${filas.join("\n\n")}\n\nLos videos son de sus autores: esta lista sirve como referencia de tendencias. Para usar fragmentos necesitas permiso del autor.`
    : `${cabecera}\n\nYouTube no devolvió videos para este tema y período. Prueba con otras palabras o un período más largo.`;
  const fuentes = videos.slice(0, 20).map((v) => ({
    nombre: `${v.titulo} · ${v.canal}`.slice(0, 180),
    url: urlVideo(v.id),
    imagen: v.miniatura,
    nota: `${cifra(v.vistas)} vistas · ${cifra(v.vistasDia)} vistas/día`,
  }));
  return { texto: texto.slice(0, 24000), fuentes };
}

/** Renueva el token si hace falta (y lo guarda) y busca con la cuenta de YouTube conectada. */
export async function buscarViralesConectado(pedido: { tema: string; dias: PeriodoViral }) {
  const { leerConexion, secretoDe, guardarSecretoRenovado, solicitar } = await import("../granjas/conexiones");
  const conexion = leerConexion("youtube");
  if (!conexion.identidad?.id)
    throw new WorkflowError("Conecta YouTube en Conexiones para buscar videos virales.", 409);
  const original = secretoDe("youtube");
  const actual = await renovarYoutube(original, solicitar);
  if (actual !== original && secretoDe("youtube").acceso === original.acceso) guardarSecretoRenovado("youtube", actual);
  return buscarVirales(pedido, actual, solicitar);
}
