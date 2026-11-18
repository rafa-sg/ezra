import { request } from "node:https";
import { lookup } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { WorkflowError } from "../workflow";
import { sha256 } from "./huella";

/** Una red privada o local nunca es una fuente pública, aunque el DNS diga lo contrario. */
export function direccionPrivada(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return direccionPrivada(v6.slice(7));
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}
export function dominioPermitido(host: string, dominios: string[]) {
  const h = host.toLowerCase().replace(/\.$/, "");
  return dominios.some((d) => h === d || h.endsWith(`.${d}`));
}
// La comprobación ocurre al conectar, así un cambio de DNS entre consultas no burla el filtro.
const buscarSeguro: LookupFunction = (host, opciones, responder) => {
  lookup(host, { ...opciones, all: true }, (error, direcciones) => {
    if (error) return responder(error, "", 4);
    const lista = direcciones as unknown as { address: string; family: number }[];
    const publica = lista.find((d) => !direccionPrivada(d.address));
    if (!publica || lista.some((d) => direccionPrivada(d.address)))
      return responder(new Error("direccion-privada"), "", 4);
    if ((opciones as { all?: boolean }).all) (responder as unknown as (e: null, d: typeof lista) => void)(null, [publica]);
    else responder(null, publica.address, publica.family);
  });
};

export type Respuesta = { estado: number; tipo: string; cuerpo: Buffer; url: string };
export type Descargar = (url: string, limite: number) => Promise<Respuesta>;

function descargarUna(url: URL, limite: number, tiempo: number): Promise<Respuesta> {
  return new Promise((resolve, reject) => {
    const peticion = request(
      url,
      {
        method: "GET",
        lookup: buscarSeguro,
        timeout: tiempo,
        headers: {
          "User-Agent": "EzraSpotmi/1.0 (+https://spotmi.com.sv; lectura de fuentes autorizadas)",
          Accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml,text/plain;q=0.8",
        },
      },
      (respuesta) => {
        const partes: Buffer[] = [];
        let bytes = 0;
        respuesta.on("data", (trozo: Buffer) => {
          bytes += trozo.length;
          if (bytes > limite) {
            peticion.destroy(new Error("demasiado-grande"));
            return;
          }
          partes.push(trozo);
        });
        respuesta.on("end", () =>
          resolve({
            estado: respuesta.statusCode || 0,
            tipo: String(respuesta.headers["content-type"] || ""),
            cuerpo: Buffer.concat(partes),
            url: respuesta.headers.location ? new URL(respuesta.headers.location, url).toString() : url.toString(),
          }),
        );
        respuesta.on("error", reject);
      },
    );
    peticion.on("timeout", () => peticion.destroy(new Error("tiempo")));
    peticion.on("error", reject);
    peticion.end();
  });
}

/** HTTPS, dominios permitidos, redirecciones revisadas una a una, tamaño y tiempo limitados. */
export async function descargarSegura(
  direccion: string,
  dominios: string[],
  opciones: { limite?: number; tiempo?: number; descargar?: (u: URL, l: number, t: number) => Promise<Respuesta> } = {},
): Promise<Respuesta> {
  const limite = opciones.limite ?? 1_500_000;
  const tiempo = opciones.tiempo ?? 12000;
  const descargar = opciones.descargar ?? descargarUna;
  let url = new URL(direccion);
  for (let salto = 0; salto < 4; salto++) {
    if (url.protocol !== "https:" || url.username || url.password)
      throw new WorkflowError(`La fuente ${url.hostname} no usa un enlace https permitido.`, 422);
    if (isIP(url.hostname)) throw new WorkflowError("Las fuentes deben usar un dominio, no una dirección IP.", 422);
    if (!dominioPermitido(url.hostname, dominios))
      throw new WorkflowError(`${url.hostname} no está en la lista de dominios permitidos de esta granja.`, 422);
    let respuesta: Respuesta;
    try {
      respuesta = await descargar(url, limite, tiempo);
    } catch (error) {
      const motivo = (error as Error).message;
      throw new WorkflowError(
        motivo === "direccion-privada"
          ? `${url.hostname} apunta a una red privada y se bloqueó.`
          : motivo === "demasiado-grande"
            ? `La respuesta de ${url.hostname} superó el tamaño permitido.`
            : motivo === "tiempo"
              ? `${url.hostname} tardó demasiado en responder.`
              : `No se pudo leer ${url.hostname}.`,
        502,
      );
    }
    if ([301, 302, 303, 307, 308].includes(respuesta.estado)) {
      url = new URL(respuesta.url);
      continue;
    }
    return { ...respuesta, url: url.toString() };
  }
  throw new WorkflowError("La fuente redirige demasiadas veces.", 502);
}

/** robots.txt sencillo: respeta los Disallow del grupo general. */
export function permitidoPorRobots(robots: string, ruta: string) {
  let aplica = false;
  const prohibidas: string[] = [];
  for (const linea of robots.split(/\r?\n/)) {
    const [clave, ...resto] = linea.split("#")[0].split(":");
    const valor = resto.join(":").trim();
    if (/^user-agent$/i.test(clave.trim())) aplica = valor === "*";
    else if (aplica && /^disallow$/i.test(clave.trim()) && valor) prohibidas.push(valor);
  }
  return !prohibidas.some((p) => ruta.startsWith(p));
}

const entidades: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodificar = (texto: string) =>
  texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => entidades[n.toLowerCase()] ?? m);
const limpiar = (texto: string) =>
  decodificar(
    texto
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

export type Evidencia = {
  nombre: string;
  url: string;
  consultado: string;
  estado: number;
  sha256: string;
  titulo: string;
  extracto: string;
  fechas: string[];
  publicado: string;
  entradas: { titulo: string; enlace: string; fecha: string }[];
  error: string;
};
const meses = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
/** Fechas escritas en español dentro del texto principal, tal como aparecen. */
export const fechasEnTexto = (texto: string) =>
  [...new Set([...texto.matchAll(new RegExp(`\\b\\d{1,2} de (?:${meses})(?: de \\d{4})?`, "gi"))].map((m) => m[0]))].slice(0, 8);
/** Guarda título, enlace, fecha y un extracto breve; nunca el texto completo ni imágenes ajenas. */
export function extraerEvidencia(nombre: string, respuesta: Respuesta, consultado: string): Evidencia {
  const texto = respuesta.cuerpo.toString("utf8");
  const entradas = [...texto.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 15).map((m) => ({
    titulo: limpiar(/<title>([\s\S]*?)<\/title>/i.exec(m[0])?.[1] ?? "").slice(0, 200),
    enlace: limpiar(/<link>([\s\S]*?)<\/link>/i.exec(m[0])?.[1] ?? "").slice(0, 500),
    fecha: limpiar(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(m[0])?.[1] ?? "").slice(0, 80),
  }));
  const titulo = limpiar(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(texto)?.[1] ?? "").slice(0, 200);
  const descripcion = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(texto)?.[1] ?? "";
  const publicado = /"datePublished"\s*:\s*"([^"]{10,40})"/.exec(texto)?.[1] ?? "";
  // Menús, cabeceras y pies se descartan: el extracto empieza en el título principal de la página.
  const cuerpo = limpiar(
    (/<body[\s\S]*<\/body>/i.exec(texto)?.[0] ?? texto).replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " "),
  );
  const h1 = limpiar(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(texto)?.[1] ?? "");
  const desde = h1 ? Math.max(0, cuerpo.indexOf(h1)) : 0;
  const principal = cuerpo.slice(desde);
  const extracto = entradas.length ? "" : `${limpiar(descripcion)} ${principal}`.trim().slice(0, 1500);
  return {
    nombre,
    url: respuesta.url,
    consultado,
    estado: respuesta.estado,
    sha256: sha256(respuesta.cuerpo),
    titulo,
    extracto,
    fechas: fechasEnTexto(principal.slice(0, 4000)),
    publicado,
    entradas,
    error: respuesta.estado >= 400 ? `La fuente respondió ${respuesta.estado}.` : "",
  };
}

export async function recolectarFuentes(
  fuentes: { nombre: string; url: string }[],
  dominios: string[],
  opciones: { maximo?: number; descargar?: (u: URL, l: number, t: number) => Promise<Respuesta>; ahora?: () => string } = {},
): Promise<Evidencia[]> {
  const ahora = opciones.ahora ?? (() => new Date().toISOString());
  const resultado: Evidencia[] = [];
  for (const fuente of fuentes.slice(0, opciones.maximo ?? 5)) {
    const consultado = ahora();
    try {
      const url = new URL(fuente.url);
      const robots = await descargarSegura(`${url.origin}/robots.txt`, dominios, {
        limite: 100_000,
        descargar: opciones.descargar,
      }).catch(() => null);
      if (robots && robots.estado < 400 && !permitidoPorRobots(robots.cuerpo.toString("utf8"), url.pathname)) {
        resultado.push({ nombre: fuente.nombre, url: fuente.url, consultado, estado: 0, sha256: "", titulo: "", extracto: "", fechas: [], publicado: "", entradas: [], error: "robots.txt no permite leer esta ruta." });
        continue;
      }
      resultado.push(extraerEvidencia(fuente.nombre, await descargarSegura(fuente.url, dominios, { descargar: opciones.descargar }), consultado));
    } catch (error) {
      resultado.push({
        nombre: fuente.nombre,
        url: fuente.url,
        consultado,
        estado: 0,
        sha256: "",
        titulo: "",
        extracto: "",
        fechas: [],
        publicado: "",
        entradas: [],
        error: error instanceof WorkflowError ? error.message : "No se pudo leer la fuente.",
      });
    }
  }
  return resultado;
}

/**
 * Lee una página permitida para verificar datos: respeta robots.txt, dominios,
 * https y límites. Devuelve el texto limpio solo para comparar en memoria; no se
 * guarda completo (al evento solo pasan los datos confirmados y la URL).
 */
export async function leerPaginaVerificable(
  direccion: string,
  dominios: string[],
  opciones: { descargar?: (u: URL, l: number, t: number) => Promise<Respuesta> } = {},
): Promise<{ url: string; texto: string; html: string }> {
  const url = new URL(direccion);
  const robots = await descargarSegura(`${url.origin}/robots.txt`, dominios, { limite: 100_000, descargar: opciones.descargar }).catch(() => null);
  if (robots && robots.estado < 400 && !permitidoPorRobots(robots.cuerpo.toString("utf8"), url.pathname))
    throw new WorkflowError("robots.txt no permite leer esta página.", 403);
  const respuesta = await descargarSegura(direccion, dominios, { descargar: opciones.descargar });
  if (respuesta.estado >= 400) throw new WorkflowError(`La fuente respondió ${respuesta.estado}.`, 502);
  const html = respuesta.cuerpo.toString("utf8");
  return { url: respuesta.url, html, texto: limpiar(html).slice(0, 80_000) };
}
