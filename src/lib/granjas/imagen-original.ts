import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { WorkflowError } from "../workflow";
import { graphFb, leerJson, versionGraph, type Solicitar } from "./adaptadores";
import { leerConexion, secretoDe, solicitar as solicitarRed } from "./conexiones";
import { agregarFuente, leerEvento, ponerImagenFuente, type PublicacionOrigen } from "./eventos";
import { descargarSegura } from "./fuentes";
import { descargarImagen, type DescargarImagen } from "./imagenes";
import { guardarMedio, herramientasVideo, leerMedio } from "./medios";
import { cuentaInstagramDePagina, estadoLecturaRedes } from "./redes";

/**
 * «Buscar imagen original»: recupera el afiche de la publicación de Instagram o Facebook donde se
 * anunció el evento, solo por vías autorizadas y comprobadas (documentación de Meta, nov 2026):
 *  - Instagram, cuenta propia (conexión de Instagram): GET graph.instagram.com/me/media → media_url de
 *    imagen, de cada foto del carrusel y, en video, el archivo (para elegir un fotograma) o su miniatura.
 *    Meta omite media_url en videos con audio protegido.
 *  - Instagram, cuenta profesional de terceros: Business Discovery (conexión de Facebook con permisos de
 *    lectura). Solo cuentas de empresa o creador; las publicaciones más recientes.
 *  - Facebook de terceros: exige Page Public Content Access (no aprobado): no se intenta.
 * Si no hay acceso, se explica el motivo y queda la captura manual con recorte. Nunca se raspa HTML de
 * redes ni se eluden inicios de sesión. Cada búsqueda la inicia el propietario; no hay rastreo.
 */
export type Publicacion = { plataforma: "instagram" | "facebook"; url: string; codigo: string | null; cuentaEnUrl: string | null };
/** Valida y normaliza el enlace de una publicación (sin parámetros de seguimiento). */
export function parsearPublicacion(entrada: string): Publicacion {
  let u: URL;
  try {
    u = new URL(entrada.trim());
  } catch {
    throw new WorkflowError("El enlace no es válido.", 422);
  }
  if (u.protocol !== "https:" || u.username || u.password) throw new WorkflowError("Usa un enlace https de Instagram o Facebook.", 422);
  const host = u.hostname.toLowerCase().replace(/^(www|m|web)\./, "");
  const partes = u.pathname.split("/").filter(Boolean);
  if (host === "instagram.com") {
    // /p/CODIGO, /reel/CODIGO, /tv/CODIGO y /usuario/p/CODIGO
    const i = partes.findIndex((p) => p === "p" || p === "reel" || p === "reels" || p === "tv");
    const codigo = i >= 0 ? partes[i + 1] : undefined;
    if (!codigo || !/^[A-Za-z0-9_-]{5,40}$/.test(codigo)) throw new WorkflowError("No es el enlace de una publicación de Instagram (debe tener /p/, /reel/ o /tv/).", 422);
    const cuenta = i === 1 && /^[a-z0-9._]{1,30}$/i.test(partes[0]) ? partes[0].toLowerCase() : null;
    return { plataforma: "instagram", url: `https://www.instagram.com/${partes[i] === "reels" ? "reel" : partes[i]}/${codigo}/`, codigo, cuentaEnUrl: cuenta };
  }
  if (host === "facebook.com" || host === "fb.watch") {
    if (!partes.length) throw new WorkflowError("No es el enlace de una publicación de Facebook.", 422);
    const cuenta = host === "facebook.com" && !["share", "photo", "photo.php", "permalink.php", "watch", "story.php", "reel"].includes(partes[0]) ? partes[0] : null;
    return { plataforma: "facebook", url: `https://${host === "fb.watch" ? "fb.watch" : "www.facebook.com"}${u.pathname}${u.search && /fbid|story_fbid|v=/.test(u.search) ? u.search : ""}`, codigo: null, cuentaEnUrl: cuenta };
  }
  throw new WorkflowError("Solo enlaces de Instagram o Facebook.", 422);
}

export type MedioPublicacion = { indice: number; tipo: "imagen" | "video"; url: string | null; miniatura: string | null };
export type Busqueda =
  | { accesible: true; via: "instagram_propia" | "business_discovery"; cuenta: string; publicado: string | null; texto: string; medios: MedioPublicacion[]; publicacion: Publicacion }
  | { accesible: false; motivo: string; publicacion: Publicacion };

type MediaIg = { id?: string; permalink?: string; media_type?: string; media_url?: string; thumbnail_url?: string; timestamp?: string; caption?: string; username?: string; children?: { data?: MediaIg[] } };
const codigoDe = (permalink: string | undefined) => /\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(permalink ?? "")?.[1] ?? null;
function mediosDe(m: MediaIg): MedioPublicacion[] {
  const piezas = m.media_type === "CAROUSEL_ALBUM" ? (m.children?.data ?? []) : [m];
  return piezas.map((p, i) => ({
    indice: i,
    tipo: p.media_type === "VIDEO" ? ("video" as const) : ("imagen" as const),
    url: typeof p.media_url === "string" && p.media_url.startsWith("https://") ? p.media_url : null,
    miniatura: typeof p.thumbnail_url === "string" && p.thumbnail_url.startsWith("https://") ? p.thumbnail_url : null,
  }));
}
const campos = "id,permalink,media_type,media_url,thumbnail_url,timestamp,caption,children{media_type,media_url,thumbnail_url}";
const conectada = (estado: string) => estado === "conectada_publicacion" || estado === "conectada_lectura";

/** Busca la publicación entre las de la cuenta propia (hasta 200 recientes). */
async function enCuentaPropia(codigo: string, solicitar: Solicitar) {
  const c = leerConexion("instagram");
  if (!conectada(c.estado)) return { encontrada: null, cuenta: null, disponible: false };
  const secreto = secretoDe("instagram");
  let url: string | null = `https://graph.instagram.com/${versionGraph()}/me/media?fields=${encodeURIComponent(campos)}&limit=50&access_token=${encodeURIComponent(secreto.acceso)}`;
  for (let pagina = 0; url && pagina < 4; pagina++) {
    const r = await leerJson(solicitar, url);
    const lista = (r.data as MediaIg[] | undefined) ?? [];
    const m = lista.find((x) => codigoDe(x.permalink) === codigo);
    if (m) return { encontrada: m, cuenta: c.identidad?.nombre ?? "", disponible: true };
    url = typeof (r.paging as { next?: string } | undefined)?.next === "string" ? (r.paging as { next: string }).next : null;
  }
  return { encontrada: null, cuenta: c.identidad?.nombre ?? "", disponible: true };
}
/** Business Discovery: publicaciones recientes de una cuenta profesional de terceros (hasta 150). */
async function enCuentaTercera(usuario: string, codigo: string, solicitar: Solicitar) {
  const secreto = secretoDe("facebook");
  const igUserId = await cuentaInstagramDePagina(secreto, solicitar);
  let despues = "";
  for (let pagina = 0; pagina < 3; pagina++) {
    const consulta = `business_discovery.username(${usuario}){username,media${despues ? `.after(${despues})` : ""}.limit(50){${campos}}}`;
    const r = await leerJson(solicitar, `${graphFb()}/${igUserId}?fields=${encodeURIComponent(consulta)}&access_token=${encodeURIComponent(secreto.acceso)}`);
    const media = (r.business_discovery as { media?: { data?: MediaIg[]; paging?: { cursors?: { after?: string } } } } | undefined)?.media;
    const m = (media?.data ?? []).find((x) => codigoDe(x.permalink) === codigo);
    if (m) return m;
    despues = media?.paging?.cursors?.after ?? "";
    if (!despues) break;
  }
  return null;
}

export async function buscarMediosPublicacion(entrada: string, opciones: { cuenta?: string; solicitar?: Solicitar } = {}): Promise<Busqueda> {
  const publicacion = parsearPublicacion(entrada);
  const solicitar = opciones.solicitar ?? solicitarRed;
  if (publicacion.plataforma === "facebook") {
    const fb = estadoLecturaRedes().facebook;
    return {
      accesible: false,
      publicacion,
      motivo: fb.listo
        ? "Ezra todavía no lee publicaciones sueltas de Facebook. Usa «Abrir publicación» y sube una captura."
        : "Las publicaciones de Páginas de terceros en Facebook solo se pueden leer con «Page Public Content Access», que Meta no ha aprobado para esta app. Abre la publicación y sube una captura.",
    };
  }
  const codigo = publicacion.codigo!;
  const motivos: string[] = [];
  // 1. Cuenta propia (conexión de Instagram).
  try {
    const propia = await enCuentaPropia(codigo, solicitar);
    if (propia.encontrada)
      return {
        accesible: true,
        via: "instagram_propia",
        cuenta: propia.cuenta ? `@${propia.cuenta.replace(/^@/, "")}` : "tu cuenta",
        publicado: propia.encontrada.timestamp ?? null,
        texto: (propia.encontrada.caption ?? "").slice(0, 2200),
        medios: mediosDe(propia.encontrada),
        publicacion,
      };
    motivos.push(propia.disponible ? "No está entre las publicaciones recientes de tu cuenta de Instagram: es de otra cuenta." : "Tu cuenta de Instagram no está conectada.");
  } catch (error) {
    motivos.push(`No se pudo consultar tu cuenta de Instagram (${error instanceof Error ? error.message.slice(0, 120) : "error"}).`);
  }
  // 2. Cuenta profesional de terceros (Business Discovery).
  const usuario = (opciones.cuenta ?? publicacion.cuentaEnUrl ?? "").replace(/^@/, "").toLowerCase();
  const bd = estadoLecturaRedes().instagram;
  if (!bd.listo) motivos.push(`Para leer publicaciones de cuentas de terceros hace falta Business Discovery: ${bd.motivo}`);
  else if (!/^[a-z0-9._]{1,30}$/.test(usuario)) motivos.push("Escribe el @usuario de la cuenta que publicó para buscarla con Business Discovery.");
  else
    try {
      const m = await enCuentaTercera(usuario, codigo, solicitar);
      if (m) return { accesible: true, via: "business_discovery", cuenta: `@${usuario}`, publicado: m.timestamp ?? null, texto: (m.caption ?? "").slice(0, 2200), medios: mediosDe(m), publicacion };
      motivos.push(`No aparece entre las 150 publicaciones más recientes de @${usuario}, o la cuenta no es profesional.`);
    } catch (error) {
      motivos.push(`Business Discovery no respondió para @${usuario} (${error instanceof Error ? error.message.slice(0, 120) : "error"}). Las cuentas personales o con restricción de edad no devuelven datos.`);
    }
  return { accesible: false, motivo: motivos.join(" "), publicacion };
}

/* ── Fotograma de un video (solo con acceso autorizado al archivo) ── */
const ejecutar = promisify(execFile);
export async function fotogramaDeVideo(videoUrl: string, segundo: number, nombre: string) {
  const u = new URL(videoUrl);
  if (u.protocol !== "https:") throw new WorkflowError("El video no usa https.", 422);
  const { ffmpeg } = await herramientasVideo();
  if (!ffmpeg) throw new WorkflowError("Falta ffmpeg en esta Mac para extraer un fotograma.", 503);
  const r = await descargarSegura(u.toString(), [u.hostname], { limite: 80 * 1024 * 1024 });
  if (r.estado >= 400) throw new WorkflowError(`El video respondió ${r.estado}.`, 502);
  const carpeta = await mkdtemp(path.join(tmpdir(), "ezra-fotograma-"));
  try {
    const entrada = path.join(carpeta, "video.mp4");
    const salida = path.join(carpeta, "fotograma.jpg");
    await writeFile(entrada, r.cuerpo);
    await ejecutar(ffmpeg, ["-v", "error", "-y", "-ss", String(Math.max(0, Math.min(600, segundo))), "-i", entrada, "-frames:v", "1", "-q:v", "2", salida], { timeout: 60_000 });
    // Un medio suelto (sin evento): se revisa antes de guardarlo como referencia.
    return guardarMedio(await readFile(salida), {
      nombre: nombre.slice(0, 200),
      procedencia: { origen: "fuente", nota: `Fotograma del segundo ${segundo} de ${u.toString().slice(0, 200)}.`, herramienta: "ffmpeg" },
      licencia: "Fotograma de la publicación original · referencia interna, permiso pendiente",
      generado: false,
    });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

/* ── Guardar la referencia elegida ── */
export const comprobacionesSchema = z.object({ titulo: z.literal(true), fecha: z.literal(true), lugar: z.literal(true), organizador: z.literal(true) });
export const guardarOriginalSchema = z
  .object({
    url: z.string().min(10).max(2000),
    origen: z.enum(["original", "captura", "fotograma"]),
    cuenta: z.string().trim().max(60).default(""),
    /** Medio de la publicación (CDN de Meta, recuperado por API) o un medio ya guardado (captura o fotograma). */
    medioUrl: z.string().url().max(2000).optional(),
    medioId: z.string().uuid().optional(),
    comprobaciones: comprobacionesSchema,
  })
  .refine((d) => Boolean(d.medioUrl) !== Boolean(d.medioId), "Elige una imagen de la publicación o sube una captura.");
/**
 * Vincula la publicación al evento (como fuente, sin duplicarla) y guarda la imagen como
 * «Referencia interna» con permiso de reutilización pendiente. Exige haber comprobado título,
 * fecha y año, lugar y organizador. Reemplaza la imagen actual (queda en el historial) e invalida
 * los posts preparados con la anterior.
 */
export async function guardarImagenOriginal(eventoId: string, crudo: unknown, opciones: { descargar?: DescargarImagen; solicitar?: Solicitar } = {}) {
  const leido = guardarOriginalSchema.safeParse(crudo);
  if (!leido.success) {
    const enComprobaciones = leido.error.issues.some((i) => i.path[0] === "comprobaciones");
    throw new WorkflowError(enComprobaciones ? "Antes de guardar, confirma que coinciden el título, la fecha y el año, el lugar y el organizador." : (leido.error.issues[0]?.message ?? "Datos inválidos."), 422);
  }
  const d = leido.data;
  const publicacion = parsearPublicacion(d.url);
  const e = leerEvento(eventoId);
  let cuenta = d.cuenta.replace(/^@/, "") || publicacion.cuentaEnUrl || "";
  let verificada = false;
  if (d.medioUrl) {
    // El servidor vuelve a consultar la publicación por la API: la imagen debe ser de ella y la cuenta sale de Meta.
    const b = await buscarMediosPublicacion(d.url, { cuenta: d.cuenta || undefined, solicitar: opciones.solicitar });
    if (!b.accesible || !b.medios.some((m) => m.url === d.medioUrl || m.miniatura === d.medioUrl))
      throw new WorkflowError("Esa imagen ya no aparece en la publicación. Vuelve a buscarla.", 409);
    cuenta = b.cuenta.replace(/^@/, "");
    verificada = true;
  }
  const etiquetaCuenta = cuenta ? `@${cuenta}` : "cuenta sin verificar";
  const origen: PublicacionOrigen = { url: publicacion.url, plataforma: publicacion.plataforma, cuenta: etiquetaCuenta, verificada };
  const red = publicacion.plataforma === "instagram" ? "Instagram" : "Facebook";
  const permiso = `${d.origen === "captura" ? "Captura" : d.origen === "fotograma" ? "Fotograma" : "Imagen original"} de la publicación de ${etiquetaCuenta} en ${red} · referencia interna, permiso de reutilización pendiente`;
  let medioId: string;
  let baja = false;
  if (d.medioUrl) {
    const r = await descargarImagen(d.medioUrl, `${d.origen === "fotograma" ? "Miniatura" : "Imagen original"} · ${e.titulo}`, opciones.descargar, { via: publicacion.plataforma, cuenta: etiquetaCuenta }, undefined, { aceptarBaja: true });
    medioId = r.medio.id;
    baja = r.baja;
  } else {
    const m = leerMedio(d.medioId!);
    if (!m.mime.startsWith("image/")) throw new WorkflowError("La captura debe ser una imagen.", 422);
    if (m.generado) throw new WorkflowError("Una imagen generada con IA no es una captura de la publicación.", 422);
    medioId = m.id;
    baja = Math.min(m.ancho ?? 0, m.alto ?? 0) < 600;
  }
  agregarFuente(eventoId, { url: publicacion.url, via: origen.verificada ? publicacion.plataforma : "manual", cuenta: origen.verificada ? etiquetaCuenta : "", campos: ["titulo"] });
  return ponerImagenFuente(eventoId, medioId, publicacion.url, permiso, {
    tipo: "red",
    baja,
    origen: d.origen,
    publicacion: origen,
    eleccionPropietario: true,
    nota: "Comprobados por el propietario: título, fecha y año, lugar y organizador.",
  });
}
/** Vincular solo el enlace (sin imagen todavía): queda como fuente del evento, sin duplicarlo. */
export function vincularPublicacion(eventoId: string, entrada: string) {
  const p = parsearPublicacion(entrada);
  leerEvento(eventoId);
  const nueva = agregarFuente(eventoId, { url: p.url, via: "manual", cuenta: p.cuentaEnUrl ? `@${p.cuentaEnUrl}` : "", campos: [] });
  return { publicacion: p, nueva };
}

/**
 * «Leer datos del afiche» (opcional, a pedido): Gemini lee el texto visible de la imagen y devuelve
 * sugerencias. Nunca se aplican solas: el propietario las compara y edita el evento si corresponde.
 */
export type DatosAfiche = { titulo: string | null; fecha: string | null; anio: string | null; hora: string | null; lugar: string | null; organizador: string | null; precio: string | null };
export async function leerDatosAfiche(medioId: string, contexto: { granjaId?: string | null } = {}): Promise<DatosAfiche> {
  const { geminiProduccionHabilitado, llamarGemini, modeloGemini } = await import("../ia/gemini");
  if (!geminiProduccionHabilitado()) throw new WorkflowError("Gemini está apagado: compara los datos del afiche a mano.", 503);
  const { leerBytesMedio } = await import("./medios");
  const m = leerMedio(medioId);
  if (!m.mime.startsWith("image/")) throw new WorkflowError("Solo se leen imágenes.", 422);
  const r = await llamarGemini<{ text?: string; usageMetadata?: Record<string, number> }>(
    { origen: "granja", paso: "Leer datos del afiche", granjaId: contexto.granjaId ?? null },
    {
      model: modeloGemini(),
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: m.mime, data: (await leerBytesMedio(m)).toString("base64") } },
            {
              text: 'Copia del afiche, tal como aparece, el nombre del evento, la fecha (AAAA-MM-DD si se puede), el año, la hora, el lugar, el organizador y el precio. Si un dato no aparece, null. No deduzcas. Responde solo JSON: {"titulo":…, "fecha":…, "anio":…, "hora":…, "lugar":…, "organizador":…, "precio":…}',
            },
          ],
        },
      ],
      config: { responseMimeType: "application/json", maxOutputTokens: 400 },
    },
  );
  const t = String(r.text ?? "");
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  } catch {
    throw new WorkflowError("Gemini no devolvió datos legibles del afiche.", 502);
  }
  const v = (k: string) => (typeof j[k] === "string" && (j[k] as string).trim() ? (j[k] as string).trim().slice(0, 200) : null);
  return { titulo: v("titulo"), fecha: v("fecha"), anio: v("anio") ?? (typeof j.anio === "number" ? String(j.anio) : null), hora: v("hora"), lugar: v("lugar"), organizador: v("organizador"), precio: v("precio") };
}
