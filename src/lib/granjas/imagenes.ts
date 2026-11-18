import { detectMedia } from "../media";
import { WorkflowError } from "../workflow";
import { descargarSegura, leerPaginaVerificable, type Respuesta } from "./fuentes";
import { dominiosProhibidos } from "./eventos";
import { guardarMedio, type Medio } from "./medios";

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
export async function descargarImagen(url: string, nombre: string, descargar?: DescargarImagen): Promise<{ medio: Medio; dominio: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new WorkflowError("La imagen no usa https.", 422);
  if (hostProhibido(u.hostname)) throw new WorkflowError("La imagen viene de una red social: no se usa.", 422);
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
  const dominio = new URL(r.url).hostname.replace(/^www\./, "");
  const medio = await guardarMedio(r.cuerpo, {
    nombre: nombre.slice(0, 200),
    procedencia: { origen: "fuente", nota: `Imagen promocional tomada de ${r.url.slice(0, 300)}.`, fuentes: [r.url.slice(0, 500)] },
    licencia: permisoPendiente(dominio),
    generado: false,
  });
  return { medio, dominio };
}

/**
 * Busca la imagen de un evento: primero en su página fuente y luego en la de boletos,
 * con las candidatas en orden. Devuelve la primera que pasa todas las validaciones.
 */
export async function buscarImagenEvento(
  evento: { titulo: string; fuenteUrl: string; boletosUrl: string | null },
  opciones: { descargar?: DescargarImagen; htmlFuente?: { url: string; html: string } | null } = {},
): Promise<ResultadoImagen> {
  const motivos: string[] = [];
  for (const pagina of [evento.fuenteUrl, evento.boletosUrl].filter((x): x is string => Boolean(x))) {
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
    if (!candidatas.length) motivos.push(`${new URL(html.url).hostname}: la página no tiene imagen del evento`);
    for (const candidata of candidatas.slice(0, 5)) {
      try {
        const { medio, dominio } = await descargarImagen(candidata, `Imagen oficial · ${evento.titulo}`, opciones.descargar);
        return { medio, url: candidata, dominio };
      } catch (error) {
        motivos.push(error instanceof Error ? error.message : "imagen no válida");
      }
    }
  }
  return { medio: null, motivo: [...new Set(motivos)].slice(0, 3).join(" · ") || "Sin fuente para buscar imagen." };
}
