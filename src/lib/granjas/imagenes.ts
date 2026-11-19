import { detectMedia } from "../media";
import { WorkflowError } from "../workflow";
import { descargarSegura, leerPaginaVerificable, type Respuesta } from "./fuentes";
import { dominiosProhibidos } from "./eventos";
import { guardarMedio, type Medio } from "./medios";
import { base } from "./db";

/**
 * Imagen oficial de un evento: se toma de su página fuente (y, si no hay, de la de
 * boletos), se valida por contenido y se guarda en data/granjas/medios. Queda
 * «pendiente de tu confirmación»: el post solo la usa cuando el propietario la confirma.
 */
export const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;
export const MIN_LADO_IMAGEN = 600;
/** Redes sociales y sus CDN: nunca son origen de una imagen. */
const cdnSociales = ["cdninstagram.com", "fbcdn.net", "fbsbx.com", "twimg.com", "tiktokcdn.com", "tiktokcdn-us.com"];
export const hostProhibido = (host: string) => {
  const h = host.toLowerCase().replace(/\.$/, "");
  return [...dominiosProhibidos, ...cdnSociales].some((d) => h === d || h.endsWith(`.${d}`));
};
export const permisoPendiente = (dominio: string) => `Imagen promocional de la fuente oficial: ${dominio} · pendiente de tu confirmación`;
/** Imagen de un post leído por la API oficial de Instagram o Facebook (nunca raspado). */
export const permisoPendienteRed = (red: "instagram" | "facebook", cuenta: string) =>
  `Imagen del post de ${cuenta} en ${red === "instagram" ? "Instagram" : "Facebook"} (API oficial) · pendiente de tu confirmación`;
/** CDN de Meta: solo se aceptan para medios que llegaron por la API oficial. */
const cdnMeta = ["cdninstagram.com", "fbcdn.net"];

/* ── Imágenes genéricas: logos, la imagen de portada del sitio o una que ya usan varios eventos ── */
const nombreGenerico = /(^|[/_.-])(logo|logos|logotipo|favicon|sprite|placeholder|avatar|default|og-default|share|brand)([/_.-]|$)/i;
/** Ruta que delata una imagen genérica del sitio (no del evento). */
export const rutaGenerica = (url: string) => {
  try {
    const ruta = new URL(url).pathname;
    return nombreGenerico.test(ruta) || (/\/og\//i.test(ruta) && /(^|\/)(home|index|default|inicio)\.[a-z]+$/i.test(ruta));
  } catch {
    return true;
  }
};
/** Cuántos otros eventos usan ya esta imagen (por URL o por archivo). */
export function usosImagen(datos: { url?: string; medioId?: string }, excepto: string | null = null) {
  const f = base()
    .prepare("select count(*) as n from eventos where ((? is not null and imagen_url = ?) or (? is not null and imagen_medio_id = ?)) and (? is null or id <> ?)")
    .get(datos.url ?? null, datos.url ?? null, datos.medioId ?? null, datos.medioId ?? null, excepto, excepto) as { n: number };
  return Number(f.n);
}
export const MAX_USOS_IMAGEN = 2;

const atributo = (etiqueta: string, nombre: string) => new RegExp(`\\b${nombre}\\s*=\\s*["']([^"']*)["']`, "i").exec(etiqueta)?.[1] ?? "";
/** Candidatas en orden: og:image, twitter:image, imagen del evento (schema.org) e imagen principal. */
export function candidatasImagen(html: string, base: string): string[] {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (claves: string[]) =>
    metas.filter((m) => claves.includes((atributo(m, "property") || atributo(m, "name")).toLowerCase())).map((m) => atributo(m, "content"));
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap((m) => {
    try {
      const datos = JSON.parse(m[1]);
      const lista = (Array.isArray(datos) ? datos : [datos, ...(Array.isArray(datos?.["@graph"]) ? datos["@graph"] : [])]) as Record<string, unknown>[];
      return lista
        .filter((x) => /Event/i.test(String(x?.["@type"] ?? "")))
        .flatMap((x) => {
          const imagen = x.image as unknown;
          if (typeof imagen === "string") return [imagen];
          if (Array.isArray(imagen)) return imagen.map((i) => (typeof i === "string" ? i : String((i as { url?: string })?.url ?? "")));
          return imagen && typeof imagen === "object" ? [String((imagen as { url?: string }).url ?? "")] : [];
        });
    } catch {
      return [];
    }
  });
  // Imagen principal: la primera <img> dentro de <main> o <article> (si no hay, del cuerpo).
  const zona = /<(main|article)\b[\s\S]*?<\/\1>/i.exec(html)?.[0] ?? html;
  const principal = [...zona.matchAll(/<img\b[^>]*>/gi)]
    .map((m) => atributo(m[0], "src") || atributo(m[0], "data-src"))
    .filter((src) => src && !/logo|icon|avatar|sprite|placeholder|\.svg(\?|$)/i.test(src))
    .slice(0, 3);
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const crudo of [...meta(["og:image", "og:image:url", "og:image:secure_url"]), ...meta(["twitter:image", "twitter:image:src"]), ...jsonLd, ...principal]) {
    try {
      const u = new URL(crudo.trim().replace(/&amp;/g, "&"), base);
      if (u.protocol !== "https:" || u.username || u.password || vistos.has(u.toString())) continue;
      vistos.add(u.toString());
      resultado.push(u.toString());
    } catch {
      /* URL inválida */
    }
  }
  return resultado;
}

/** Ancho y alto desde la cabecera del archivo (PNG, JPEG o WebP), sin herramientas externas. */
export function medidasImagen(b: Buffer): { ancho: number; alto: number } | null {
  if (b.length >= 24 && b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marca = b[i + 1];
      if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
        i += 2;
        continue;
      }
      const largo = b.readUInt16BE(i + 2);
      // SOF0–SOF15, salvo DHT (C4), JPG (C8) y DAC (CC).
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
      i += 2 + largo;
    }
    return null;
  }
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const tipo = b.toString("ascii", 12, 16);
    if (tipo === "VP8X") return { ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3) };
    if (tipo === "VP8 ") return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
    if (tipo === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

export type DescargarImagen = (u: URL, l: number, t: number) => Promise<Respuesta>;
export type ResultadoImagen = { medio: Medio; url: string; dominio: string } | { medio: null; motivo: string };
/** Descarga y valida una imagen concreta: https, sin redes sociales, JPG/PNG/WebP, ≤ 8 MB, lado menor ≥ 600 px. */
export async function descargarImagen(
  url: string,
  nombre: string,
  descargar?: DescargarImagen,
  /** Solo para el medio de un post leído por la API oficial: permite el CDN de Meta. */
  red?: { via: "instagram" | "facebook"; cuenta: string },
  /** Dominio de la página donde apareció (la ficha oficial), si la imagen vive en otro servidor (CDN). */
  paginaDominio?: string,
): Promise<{ medio: Medio; dominio: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new WorkflowError("La imagen no usa https.", 422);
  const host = u.hostname.toLowerCase();
  const cdnPermitido = Boolean(red) && cdnMeta.some((d) => host === d || host.endsWith(`.${d}`));
  if (hostProhibido(host) && !cdnPermitido) throw new WorkflowError("La imagen viene de una red social: no se usa.", 422);
  const r = await descargarSegura(u.toString(), [u.hostname], { limite: MAX_BYTES_IMAGEN, descargar });
  if (r.estado >= 400) throw new WorkflowError(`La imagen respondió ${r.estado}.`, 502);
  let mime: string;
  try {
    mime = detectMedia(r.cuerpo).mime;
  } catch {
    throw new WorkflowError("El archivo no es una imagen JPG, PNG o WebP.", 422);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new WorkflowError("El archivo no es una imagen JPG, PNG o WebP.", 422);
  const medidas = medidasImagen(r.cuerpo);
  if (!medidas) throw new WorkflowError("No se pudieron leer las medidas de la imagen.", 422);
  if (Math.min(medidas.ancho, medidas.alto) < MIN_LADO_IMAGEN)
    throw new WorkflowError(`La imagen es muy pequeña (${medidas.ancho}×${medidas.alto}; se piden al menos ${MIN_LADO_IMAGEN} px de lado menor).`, 422);
  const dominio = paginaDominio ?? new URL(r.url).hostname.replace(/^www\./, "");
  const medio = await guardarMedio(r.cuerpo, {
    nombre: nombre.slice(0, 200),
    procedencia: red
      ? { origen: "fuente", nota: `Imagen del post de ${red.cuenta} leída con la API oficial de ${red.via}.`, fuentes: [r.url.slice(0, 500)] }
      : { origen: "fuente", nota: `Imagen promocional tomada de ${r.url.slice(0, 300)}.`, fuentes: [r.url.slice(0, 500)] },
    licencia: red ? permisoPendienteRed(red.via, red.cuenta) : permisoPendiente(dominio),
    generado: false,
  });
  return { medio, dominio };
}

/** og:image de la portada de cada dominio: si un evento la trae, es la imagen genérica del sitio. */
export type CachePortadas = Map<string, string[]>;
async function portadaDe(origen: string, cache: CachePortadas, descargar?: DescargarImagen) {
  if (!cache.has(origen)) {
    try {
      const host = new URL(origen).hostname;
      const p = await leerPaginaVerificable(`${origen}/`, [host], { descargar });
      cache.set(origen, candidatasImagen(p.html, p.url).slice(0, 2));
    } catch {
      cache.set(origen, []);
    }
  }
  return cache.get(origen)!;
}

/**
 * Busca la imagen de un evento en sus páginas (fuente, boletos y las demás fuentes web),
 * con las candidatas en orden. Descarta logos, la portada del sitio y las imágenes que ya
 * usan varios eventos. Devuelve la primera que pasa todas las validaciones.
 */
export async function buscarImagenEvento(
  evento: { id?: string; titulo: string; fuenteUrl: string; boletosUrl: string | null; otrasPaginas?: string[] },
  opciones: { descargar?: DescargarImagen; htmlFuente?: { url: string; html: string } | null; portadas?: CachePortadas } = {},
): Promise<ResultadoImagen> {
  const motivos: string[] = [];
  const portadas = opciones.portadas ?? new Map();
  const paginas = [...new Set([evento.fuenteUrl, evento.boletosUrl, ...(evento.otrasPaginas ?? [])].filter((x): x is string => Boolean(x)))];
  for (const pagina of paginas) {
    let html: { url: string; html: string };
    try {
      const host = new URL(pagina).hostname;
      if (hostProhibido(host)) continue;
      html = opciones.htmlFuente && pagina === evento.fuenteUrl ? opciones.htmlFuente : await leerPaginaVerificable(pagina, [host], { descargar: opciones.descargar });
    } catch (error) {
      motivos.push(`${new URL(pagina).hostname}: ${error instanceof Error ? error.message : "no se pudo leer"}`);
      continue;
    }
    const candidatas = candidatasImagen(html.html, html.url);
    const dominioPagina = new URL(html.url).hostname.replace(/^www\./, "");
    if (!candidatas.length) motivos.push(`${dominioPagina}: la página no tiene imagen del evento`);
    const portada = candidatas.length ? await portadaDe(new URL(html.url).origin, portadas, opciones.descargar) : [];
    for (const candidata of candidatas.slice(0, 5)) {
      if (rutaGenerica(candidata) || portada.includes(candidata)) {
        motivos.push(`${dominioPagina}: solo tiene una imagen genérica del sitio (logo o portada)`);
        continue;
      }
      if (usosImagen({ url: candidata }, evento.id ?? null) >= MAX_USOS_IMAGEN) {
        motivos.push(`${dominioPagina}: la imagen se repite en varios eventos (genérica)`);
        continue;
      }
      try {
        const { medio, dominio } = await descargarImagen(candidata, `Imagen oficial · ${evento.titulo}`, opciones.descargar, undefined, dominioPagina);
        if (usosImagen({ medioId: medio.id }, evento.id ?? null) >= MAX_USOS_IMAGEN) {
          motivos.push(`${dominioPagina}: la imagen se repite en varios eventos (genérica)`);
          continue;
        }
        return { medio, url: candidata, dominio };
      } catch (error) {
        motivos.push(error instanceof Error ? error.message : "imagen no válida");
      }
    }
  }
  return { medio: null, motivo: [...new Set(motivos)].slice(0, 3).join(" · ") || "Sin fuente para buscar imagen." };
}
