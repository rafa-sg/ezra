import { z } from "zod";
import { WorkflowError } from "../workflow";
import { leerJson, versionGraph, type Solicitar } from "./adaptadores";
import { guardarAjuste, leerAjuste } from "./ajustes";
import { leerConexion, secretoDe, solicitar as solicitarRed, verificarConexion } from "./conexiones";

/**
 * Métricas reales de la cuenta de Instagram conectada (API de Instagram con inicio de sesión de
 * Instagram, permiso instagram_business_manage_insights). Solo lectura. Caché de 30 minutos en la
 * base para no gastar la cuota de la API; sin conexión o con error, se dice claro y nunca se inventan números.
 */
export const CACHE_MINUTOS = 30;
export const METRICAS_CUENTA = ["reach", "views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "follows_and_unfollows"] as const;
export type MetricaCuenta = (typeof METRICAS_CUENTA)[number];
export type PublicacionIg = {
  id: string;
  tipo: "imagen" | "video" | "carrusel";
  miniatura: string | null;
  enlace: string | null;
  fecha: string | null;
  texto: string;
  meGusta: number | null;
  comentarios: number | null;
};
export type MetricasInstagram = {
  estado: "ok" | "sin_conexion" | "error";
  leido: string;
  cuenta: { usuario: string; nombre: string; foto: string | null; seguidores: number | null; siguiendo: number | null; publicaciones: number | null } | null;
  recientes: PublicacionIg[];
  /** Totales de 7 y 30 días; una métrica que la API no devolvió queda en null. */
  periodos: { dias: 7 | 30; valores: Partial<Record<MetricaCuenta, number | null>> }[];
  avisos: string[];
};

const cacheSchema = z.object({ leido: z.string(), datos: z.unknown() });
const graphIg = () => `https://graph.instagram.com/${versionGraph()}`;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const https = (v: unknown) => (typeof v === "string" && v.startsWith("https://") ? v : null);
const motivo = (e: unknown) => (e instanceof Error ? e.message.slice(0, 200) : "La API de Instagram no respondió.");

type MediaCrudo = { id?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string; caption?: string; like_count?: number; comments_count?: number };
export function publicacionDe(m: MediaCrudo): PublicacionIg {
  const tipo = m.media_type === "VIDEO" ? "video" : m.media_type === "CAROUSEL_ALBUM" ? "carrusel" : "imagen";
  return {
    id: String(m.id ?? ""),
    tipo,
    // En los videos la miniatura es thumbnail_url; en imágenes y carruseles, media_url.
    miniatura: https(tipo === "video" ? (m.thumbnail_url ?? null) : (m.media_url ?? m.thumbnail_url ?? null)),
    enlace: https(m.permalink),
    fecha: typeof m.timestamp === "string" ? m.timestamp : null,
    texto: typeof m.caption === "string" ? m.caption.slice(0, 280) : "",
    meGusta: num(m.like_count),
    comentarios: num(m.comments_count),
  };
}

/** Lee la cuenta, las 12 publicaciones recientes y los totales de 7 y 30 días. */
export async function consultarInstagram(opciones: { solicitar?: Solicitar; ahora?: Date } = {}): Promise<MetricasInstagram> {
  const ahora = opciones.ahora ?? new Date();
  const solicitar = opciones.solicitar ?? solicitarRed;
  const base: MetricasInstagram = { estado: "sin_conexion", leido: ahora.toISOString(), cuenta: null, recientes: [], periodos: [], avisos: [] };
  const conexion = leerConexion("instagram");
  if (conexion.estado !== "conectada_publicacion" && conexion.estado !== "conectada_lectura")
    return { ...base, avisos: [conexion.estado === "vencida" ? "El acceso a Instagram venció: vuelve a conectar la cuenta en Conexiones." : "Instagram no está conectado. Conéctalo en Conexiones."] };
  // Un token que vence en menos de 7 días se renueva antes de leer (la verificación lo guarda).
  if (conexion.expira && Date.parse(conexion.expira) - ahora.getTime() < 7 * 86_400_000) {
    try {
      await verificarConexion("instagram");
    } catch (e) {
      base.avisos.push(`No se pudo renovar el acceso: ${motivo(e)}`);
    }
  }
  const token = encodeURIComponent(secretoDe("instagram").acceso);
  const resultado: MetricasInstagram = { ...base, estado: "ok" };
  try {
    const yo = await leerJson(solicitar, `${graphIg()}/me?fields=user_id,username,name,profile_picture_url,followers_count,follows_count,media_count&access_token=${token}`);
    resultado.cuenta = {
      usuario: typeof yo.username === "string" ? `@${yo.username}` : (conexion.identidad?.nombre ?? ""),
      nombre: typeof yo.name === "string" ? yo.name : "",
      foto: https(yo.profile_picture_url),
      seguidores: num(yo.followers_count),
      siguiendo: num(yo.follows_count),
      publicaciones: num(yo.media_count),
    };
  } catch (e) {
    return { ...base, estado: "error", avisos: [...base.avisos, `No se pudo leer la cuenta: ${motivo(e)}`] };
  }
  try {
    const r = await leerJson(solicitar, `${graphIg()}/me/media?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp,caption,like_count,comments_count&limit=12&access_token=${token}`);
    resultado.recientes = ((r.data as MediaCrudo[] | undefined) ?? []).map(publicacionDe);
  } catch (e) {
    resultado.avisos.push(`No se pudieron leer las publicaciones: ${motivo(e)}`);
  }
  // Totales por periodo (la API admite hasta 30 días por consulta). Una métrica faltante queda en null.
  const hasta = Math.floor(ahora.getTime() / 1000);
  for (const dias of [7, 30] as const) {
    const desde = hasta - dias * 86_400 + 60;
    try {
      const r = await leerJson(solicitar, `${graphIg()}/me/insights?metric=${METRICAS_CUENTA.join(",")}&period=day&metric_type=total_value&since=${desde}&until=${hasta}&access_token=${token}`);
      const valores: Partial<Record<MetricaCuenta, number | null>> = {};
      for (const m of (r.data as { name?: string; total_value?: { value?: unknown } }[] | undefined) ?? [])
        if ((METRICAS_CUENTA as readonly string[]).includes(String(m.name))) valores[m.name as MetricaCuenta] = num(m.total_value?.value);
      resultado.periodos.push({ dias, valores });
    } catch (e) {
      resultado.avisos.push(`Métricas de ${dias} días no disponibles: ${motivo(e)}`);
    }
  }
  return resultado;
}

/** Con caché: si la última lectura tiene menos de 30 minutos (y no se fuerza), se devuelve esa. */
export async function metricasInstagram(opciones: { forzar?: boolean; solicitar?: Solicitar; ahora?: Date } = {}): Promise<MetricasInstagram & { desdeCache: boolean }> {
  const ahora = opciones.ahora ?? new Date();
  const guardado = leerAjuste("instagram_metricas", cacheSchema.nullable(), null);
  if (!opciones.forzar && guardado && ahora.getTime() - Date.parse(guardado.leido) < CACHE_MINUTOS * 60_000) {
    const d = guardado.datos as MetricasInstagram;
    if (d && d.estado === "ok") return { ...d, desdeCache: true };
  }
  // Un token ilegible o revocado no debe esconder la última lectura correcta: se trata como lectura fallida.
  const nuevas: MetricasInstagram = await consultarInstagram({ solicitar: opciones.solicitar, ahora }).catch((e: unknown) => ({
    estado: "error" as const,
    leido: ahora.toISOString(),
    cuenta: null,
    recientes: [],
    periodos: [],
    avisos: [motivo(e)],
  }));
  if (nuevas.estado === "ok") guardarAjuste("instagram_metricas", cacheSchema.nullable(), { leido: nuevas.leido, datos: nuevas });
  // Si falla la lectura nueva pero hay una anterior, se muestra la anterior con el aviso.
  if (nuevas.estado !== "ok" && guardado && (guardado.datos as MetricasInstagram)?.estado === "ok")
    return { ...(guardado.datos as MetricasInstagram), avisos: [...nuevas.avisos, "Se muestran las métricas de la última lectura correcta."], desdeCache: true };
  if (nuevas.estado === "error" && !nuevas.cuenta && nuevas.avisos.length === 0) throw new WorkflowError("Instagram no respondió.", 502);
  return { ...nuevas, desdeCache: false };
}
