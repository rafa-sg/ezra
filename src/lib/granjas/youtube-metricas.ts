import { z } from "zod";
import { WorkflowError } from "../workflow";
import {
  ErrorProveedor,
  leerJson,
  permisoYoutubeAnalytics,
  renovarYoutube,
  youtubeApi,
  type Secreto,
  type Solicitar,
} from "./adaptadores";
import {
  guardarSecretoRenovado,
  leerConexionId,
  secretoDe,
  solicitar as solicitarRed,
} from "./conexiones";

const metadatos = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  customUrl: z.string().optional(),
  publishedAt: z.iso.datetime().optional(),
  thumbnails: z.record(z.string(), z.object({ url: z.url({ protocol: /^https$/ }) })).optional(),
});
const estadisticas = z.record(z.string(), z.unknown()).default({});
const idVideo = z.string().regex(/^[\w-]{11}$/);
const peticionCanales = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      snippet: metadatos,
      statistics: estadisticas,
      contentDetails: z
        .object({ relatedPlaylists: z.object({ uploads: z.string().optional() }).optional() })
        .optional(),
    }),
  ),
});
const peticionLista = z.object({
  items: z.array(z.object({ contentDetails: z.object({ videoId: idVideo }).optional() })),
  nextPageToken: z.string().optional(),
});
const peticionVideos = z.object({
  items: z.array(
    z.object({
      id: idVideo,
      snippet: metadatos.extend({ channelId: z.string() }),
      status: z.object({ privacyStatus: z.string() }),
      statistics: estadisticas,
    }),
  ),
});

const metricas = [
  "views",
  "estimatedMinutesWatched",
  "subscribersGained",
  "subscribersLost",
] as const;
export type DiaYoutube = {
  fecha: string;
  vistas: number | null;
  minutos: number | null;
  ganados: number | null;
  perdidos: number | null;
};
const fechaYoutube = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const fechaRelativaYoutube = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const numero = (valor: unknown) => {
  const n = typeof valor === "string" && /^\d+$/.test(valor) ? Number(valor) : valor;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};
const foto = (m: z.infer<typeof metadatos>) =>
  m.thumbnails?.high?.url ?? m.thumbnails?.medium?.url ?? m.thumbnails?.default?.url ?? null;

const estadoAnalitica = (error: unknown): "api" | "permiso" | "error" => {
  if (error instanceof ErrorProveedor && error.tipo === "permiso") {
    if (/disabled|has not been used|accessnotconfigured|service_disabled/i.test(error.message))
      return "api";
    if (/insufficient|scope|permission/i.test(error.message)) return "permiso";
  }
  return "error";
};

async function leerAnalitica(
  leer: (url: string) => Promise<Record<string, unknown>>,
  id: string,
  tienePermiso: boolean,
  ahora: Date,
) {
  if (!tienePermiso) return { estado: "permiso", dias: [] as DiaYoutube[] } as const;
  const fin = fechaRelativaYoutube(fechaYoutube.format(ahora), -1);
  const params = new URLSearchParams({
    ids: `channel==${id}`,
    startDate: fechaRelativaYoutube(fin, -96),
    endDate: fin,
    metrics: metricas.join(","),
    dimensions: "day",
    sort: "day",
  });
  try {
    const informe = z
      .object({
        columnHeaders: z.array(z.object({ name: z.string() })),
        rows: z.array(z.array(z.unknown())).optional(),
      })
      .parse(await leer(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`));
    const indice = (nombre: string) => informe.columnHeaders.findIndex((c) => c.name === nombre);
    const [v, m, g, p] = metricas.map(indice);
    const d = indice("day");
    const dias = (informe.rows ?? [])
      .flatMap((fila) => {
        const fecha = z.iso.date().safeParse(fila[d]);
        return fecha.success
          ? [
              {
                fecha: fecha.data,
                vistas: numero(fila[v]),
                minutos: numero(fila[m]),
                ganados: numero(fila[g]),
                perdidos: numero(fila[p]),
              },
            ]
          : [];
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { estado: "ok", dias } as const;
  } catch (error) {
    return { estado: estadoAnalitica(error), dias: [] as DiaYoutube[] } as const;
  }
}

async function leerVideos(
  leer: (url: string) => Promise<Record<string, unknown>>,
  playlist: string,
  canal: string,
  cantidad: number | null,
) {
  const videos: {
    id: string;
    titulo: string;
    fecha: string | null;
    foto: string | null;
    vistas: number | null;
    meGusta: number | null;
    comentarios: number | null;
  }[] = [];
  let siguiente: string | undefined;
  const objetivo = Math.min(cantidad ?? 12, 12);
  for (let paginaActual = 0; paginaActual < 3 && videos.length < objetivo; paginaActual++) {
    const lista = new URLSearchParams({
      part: "contentDetails",
      maxResults: "50",
      playlistId: playlist,
    });
    if (siguiente) lista.set("pageToken", siguiente);
    const pagina = peticionLista.parse(await leer(`${youtubeApi}/playlistItems?${lista}`));
    const ids = pagina.items.flatMap((item) => item.contentDetails?.videoId ?? []);
    if (ids.length) {
      const params = new URLSearchParams({ part: "snippet,statistics,status", id: ids.join(",") });
      const items = peticionVideos.parse(await leer(`${youtubeApi}/videos?${params}`)).items;
      for (const item of items) {
        if (item.status.privacyStatus !== "public" || item.snippet.channelId !== canal) continue;
        videos.push({
          id: item.id,
          titulo: item.snippet.title || item.id,
          fecha: item.snippet.publishedAt ?? null,
          foto: foto(item.snippet),
          vistas: numero(item.statistics.viewCount),
          meGusta: numero(item.statistics.likeCount),
          comentarios: numero(item.statistics.commentCount),
        });
      }
    }
    if (!pagina.nextPageToken || siguiente === pagina.nextPageToken) break;
    siguiente = pagina.nextPageToken;
  }
  if (cantidad && !videos.length) return null;
  return videos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "")).slice(0, 12);
}

/** Lee el canal autorizado y su actividad, sin exponer tokens en la URL ni en la respuesta. */
export async function consultarYoutube(
  id: string,
  secreto: Secreto,
  solicitar: Solicitar,
  ahora = new Date(),
) {
  const leer = (url: string) =>
    leerJson(solicitar, url, { headers: { Authorization: `Bearer ${secreto.acceso}` } });
  const params = new URLSearchParams({ part: "snippet,statistics,contentDetails", mine: "true" });
  const canal = peticionCanales
    .parse(await leer(`${youtubeApi}/channels?${params}`))
    .items.find((c) => c.id === id);
  if (!canal)
    throw new WorkflowError(
      "La autorización de YouTube no corresponde a este canal. Vuelve a conectar la cuenta.",
      409,
    );
  const videos = numero(canal.statistics.videoCount);
  const uploads = canal.contentDetails?.relatedPlaylists?.uploads;
  const [recientes, analitica] = await Promise.all([
    uploads ? leerVideos(leer, uploads, id, videos).catch(() => null) : videos === 0 ? [] : null,
    leerAnalitica(
      leer,
      id,
      (secreto.usuario ?? "").split(/\s+/).includes(permisoYoutubeAnalytics),
      ahora,
    ),
  ]);
  return {
    leido: ahora.toISOString(),
    canal: {
      id,
      nombre: canal.snippet.title || "YouTube",
      usuario: canal.snippet.customUrl ?? null,
      descripcion: canal.snippet.description ?? "",
      foto: foto(canal.snippet),
      suscriptores:
        canal.statistics.hiddenSubscriberCount === true
          ? null
          : numero(canal.statistics.subscriberCount),
      vistas: numero(canal.statistics.viewCount),
      videos,
    },
    recientes,
    analitica,
  };
}
export type MetricasYoutube = Awaited<ReturnType<typeof consultarYoutube>>;

/** Caché por conexión (id de Ezra), solo en memoria. */
const cache = new Map<string, { revision: string | null; datos: MetricasYoutube }>();
/** Al desconectar YouTube no queda nada del canal en memoria (sin id: se olvidan todos). */
export function olvidarMetricasYoutube(conexionId?: string) {
  if (conexionId) cache.delete(conexionId);
  else cache.clear();
}
/** Métricas de una conexión de YouTube concreta. El acceso de la sesión se comprueba antes, en la ruta. */
export async function metricasYoutube(conexionId: string, forzar: boolean) {
  const conexion = leerConexionId(conexionId);
  if (conexion.canal !== "youtube" || !conexion.identidad?.id)
    throw new WorkflowError("Este canal de YouTube ya no está conectado.", 404);
  const id = conexion.identidad.id;
  const original = secretoDe(conexionId);
  const guardada = cache.get(conexionId);
  if (
    !forzar &&
    guardada?.datos.canal.id === id &&
    guardada.revision === conexion.verificado &&
    Date.now() - Date.parse(guardada.datos.leido) < 15 * 60_000
  )
    return { ...guardada.datos, desdeCache: true };
  const actual = await renovarYoutube(original, solicitarRed);
  if (actual !== original && secretoDe(conexionId).acceso === original.acceso)
    guardarSecretoRenovado(conexionId, actual);
  const datos = await consultarYoutube(id, actual, solicitarRed);
  // La cuenta puede cambiar mientras se esperan respuestas de Google.
  const vigente = leerConexionId(conexionId);
  if (vigente.identidad?.id !== id || vigente.verificado !== conexion.verificado)
    throw new WorkflowError("La conexión de YouTube cambió. Recarga la página.", 409);
  cache.set(conexionId, { revision: conexion.verificado, datos });
  return { ...datos, desdeCache: false };
}
