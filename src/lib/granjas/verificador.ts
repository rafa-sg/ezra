import { WorkflowError } from "../workflow";
import type { Respuesta } from "./fuentes";
import { dominioPermitido, leerPaginaVerificable } from "./fuentes";
import { esRedireccionBusqueda, resolverRedireccion, type Candidato } from "./cazador";
import { buscarImagenEvento, permisoPendiente } from "./imagenes";
import {
  ponerImagenFuente,
  buscarDuplicado,
  categoriaNormalizada,
  crearEvento,
  departamentoNormalizado,
  dominiosProhibidos,
  palabrasClave,
  recortar,
  sinAcentos,
  type Evento,
  type Referencia,
} from "./eventos";
import { diaValido, sumarDias } from "./tiempo";

/**
 * Verificador sin IA. Lee la página fuente y solo da por confirmados la fecha, la
 * hora y el precio que aparecen en ella; lo demás queda «por confirmar» (null).
 * Descarta duplicados (Ezra y Spotmi), redes sociales y fuentes fuera de la lista.
 */
const mesesEs = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesesEn = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const abreviaturas = [["ene", "jan"], ["feb"], ["mar"], ["abr", "apr"], ["may"], ["jun"], ["jul"], ["ago", "aug"], ["sep", "sept", "set"], ["oct"], ["nov"], ["dic", "dec"]];
/** Minúsculas, sin acentos y con «p. m.» como «pm»: así se compara con la fuente. */
export function normalizarTexto(texto: string) {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/\bp\.?\s?m\.?(?=\s|$|[,;)])/g, "pm")
    .replace(/\ba\.?\s?m\.?(?=\s|$|[,;)])/g, "am")
    .replace(/\s+/g, " ");
}
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function fechaEnTexto(texto: string, fecha: string, html = "") {
  const [a, m, d] = fecha.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const meses = [mesesEs[m - 1], mesesEn[m - 1], ...abreviaturas[m - 1]].map(escapar).join("|");
  const dia = `0?${d}`;
  const patrones = [
    `\\b${dia}\\s*(?:de\\s*)?(?:${meses})\\b`,
    `\\b(?:${meses})\\.?\\s*${dia}\\b`,
    `\\b${dia}\\s*(?:al|y|a|-|–)\\s*\\d{1,2}\\s*(?:de\\s*)?(?:${meses})\\b`,
    `\\b\\d{1,2}\\s*(?:al|y|-|–)\\s*${dia}\\s*(?:de\\s*)?(?:${meses})\\b`,
    `\\b${dia}[/.-]0?${m}(?:[/.-](?:20)?${String(a).slice(2)})?\\b`,
    `\\b${a}-${mm}-${dd}\\b`,
  ];
  const t = normalizarTexto(texto);
  if (patrones.some((p) => new RegExp(p).test(t))) return true;
  // Datos estructurados del sitio (schema.org «startDate»).
  return new RegExp(`"startdate"\\s*:\\s*"${a}-${mm}-${dd}`).test(html.toLowerCase());
}
/**
 * Confirma una hora HH:MM solo si es inequívoca en la fuente: «19:30», «7:30 p. m.»,
 * «7 pm» o «07:30». Un «7:30» sin a. m./p. m. no confirma 07:30 ni 19:30.
 */
export function horaEnTexto(texto: string, hora: string, html = "", fecha: string | null = null) {
  const [h, mi] = hora.split(":").map(Number);
  const HH = String(h).padStart(2, "0");
  const MM = String(mi).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const sufijo = h < 12 ? "am" : "pm";
  const patrones = [`\\b${h12}${mi === 0 ? "(?::00)?" : `:${MM}`}\\s*${sufijo}\\b`];
  if (h >= 13 || h === 0) {
    patrones.push(`\\b0?${h}[:.h]${MM}\\b(?!\\s*(?:am|pm))`);
    if (mi === 0) patrones.push(`\\b0?${h}\\s*(?:h|hrs|horas)\\b`);
  } else if (h < 10) patrones.push(`\\b0${h}:${MM}\\b(?!\\s*(?:am|pm))`);
  const t = normalizarTexto(texto);
  if (patrones.some((p) => new RegExp(p).test(t))) return true;
  return fecha ? new RegExp(`"startdate"\\s*:\\s*"${fecha}t${HH}:${MM}`).test(html.toLowerCase()) : false;
}
const gratis = ["gratis", "entrada libre", "entrada gratuita", "gratuito", "gratuita", "sin costo", "free"];
export function precioEnTexto(texto: string, precio: string): string | null {
  const p = normalizarTexto(precio);
  const t = normalizarTexto(texto);
  if (gratis.some((g) => p.includes(g))) return gratis.some((g) => t.includes(g)) ? "Entrada gratuita" : null;
  const montos = [...p.matchAll(/(\d{1,4})(?:[.,](\d{2}))?/g)].map((m) => ({ entero: m[1], centavos: m[2] ?? "00" }));
  if (!montos.length) return null;
  const aparece = montos.every(({ entero, centavos }) => {
    const n = `${entero}(?:[.,]${centavos})?`;
    const cero = centavos === "00" ? `${entero}(?:[.,]00)?` : n;
    return new RegExp(`(?:\\$|us\\$|usd)\\s?${cero}\\b|\\b${cero}\\s?(?:usd|dolares|\\$)`).test(t);
  });
  return aparece ? recortar(precio, 120) : null;
}
export function tituloEnTexto(texto: string, titulo: string) {
  const t = ` ${normalizarTexto(texto).replace(/[^a-z0-9ñ ]+/g, " ")} `;
  const claves = palabrasClave(titulo);
  if (!claves.length) return false;
  const encontradas = claves.filter((c) => t.includes(` ${c} `)).length;
  return claves.length <= 2 ? encontradas === claves.length : encontradas / claves.length >= 0.5;
}
const prohibido = (host: string) => dominiosProhibidos.some((d) => host === d || host.endsWith(`.${d}`));
const imagenDe = (html: string) => {
  const m = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
  return m && m[1].startsWith("https://") && m[1].length <= 1000 ? m[1] : null;
};

export type DepsVerificador = {
  descargar?: (u: URL, l: number, t: number) => Promise<Respuesta>;
  resolver?: (url: string) => Promise<string | null>;
  catalogoSpotmi?: () => Promise<Referencia[]>;
};
export type ResultadoVerificacion = {
  revisados: number;
  nuevos: { id: string; titulo: string; porConfirmar: string[]; imagen: boolean }[];
  duplicados: { titulo: string; de: string }[];
  descartados: { titulo: string; motivo: string }[];
  spotmi: "consultado" | "no_disponible";
  limite: number;
  conImagen: number;
};
export async function verificarCandidatos(
  candidatos: Candidato[],
  contexto: {
    hoy: string;
    diasAdelante: number;
    dominios: string[];
    restantes: number;
    referencias: Referencia[];
    granjaId: string | null;
    ejecucionId: string | null;
  },
  deps: DepsVerificador = {},
): Promise<ResultadoVerificacion> {
  const resultado: ResultadoVerificacion = { revisados: 0, nuevos: [], duplicados: [], descartados: [], spotmi: "consultado", limite: contexto.restantes, conImagen: 0 };
  let spotmi: Referencia[] = [];
  try {
    spotmi = deps.catalogoSpotmi ? await deps.catalogoSpotmi() : [];
  } catch {
    resultado.spotmi = "no_disponible";
  }
  const referencias = [...contexto.referencias, ...spotmi];
  const dominios = contexto.dominios.filter((d) => !prohibido(d));
  const hasta = sumarDias(contexto.hoy, contexto.diasAdelante);
  const resolver = deps.resolver ?? resolverRedireccion;
  for (const c of candidatos) {
    if (resultado.nuevos.length >= contexto.restantes) break;
    resultado.revisados++;
    const titulo = recortar(c.titulo, 160);
    const descartar = (motivo: string) => resultado.descartados.push({ titulo, motivo });
    // 1. Fuente: https, dominio permitido y nunca una red social.
    let fuente = esRedireccionBusqueda(c.fuente_url) ? await resolver(c.fuente_url) : c.fuente_url;
    let host = "";
    try {
      const u = new URL(fuente ?? "");
      if (u.protocol !== "https:" || u.username || u.password) throw new Error();
      host = u.hostname.toLowerCase();
      fuente = u.toString();
    } catch {
      descartar("La fuente no es un enlace https válido.");
      continue;
    }
    if (prohibido(host)) {
      descartar("Fuente en una red social: no se usa.");
      continue;
    }
    if (!dominioPermitido(host, dominios)) {
      descartar(`${host} no está en las fuentes permitidas.`);
      continue;
    }
    // 2. Duplicados antes de leer, con lo que se sabe.
    const fechaSugerida = c.fecha && diaValido(c.fecha.slice(0, 10)) ? c.fecha.slice(0, 10) : null;
    const previo = buscarDuplicado({ titulo, fecha: fechaSugerida }, referencias);
    if (previo) {
      resultado.duplicados.push({ titulo, de: `${previo.origen}: ${previo.titulo}` });
      continue;
    }
    // 3. Lectura de la fuente: solo lo que aparece queda confirmado.
    let pagina: { url: string; texto: string; html: string } | null = null;
    let nota = "";
    try {
      pagina = await leerPaginaVerificable(fuente!, dominios, { descargar: deps.descargar });
    } catch (error) {
      nota = `No se pudo leer la fuente (${error instanceof WorkflowError ? error.message : "error de red"}). Fecha, hora y precio quedan por confirmar.`;
    }
    if (pagina && !tituloEnTexto(pagina.texto, titulo)) {
      descartar("La página fuente no menciona este evento.");
      continue;
    }
    const fecha = pagina && fechaSugerida && fechaEnTexto(pagina.texto, fechaSugerida, pagina.html) ? fechaSugerida : null;
    const fechaVentana = fecha ?? fechaSugerida;
    // Eventos de varios días: el último día también se confirma en la fuente.
    const finSugerido = c.fecha_fin && diaValido(c.fecha_fin.slice(0, 10)) && (!fechaSugerida || c.fecha_fin.slice(0, 10) >= fechaSugerida) ? c.fecha_fin.slice(0, 10) : null;
    const fechaFin = pagina && finSugerido && fechaEnTexto(pagina.texto, finSugerido, pagina.html) ? finSugerido : null;
    const ultimoDia = fechaFin ?? finSugerido ?? fechaVentana;
    // Ya pasó solo si terminó: unas fiestas del 16 al 25 siguen vigentes el 18.
    if (ultimoDia && ultimoDia < contexto.hoy) {
      descartar(fecha || fechaFin ? "El evento ya pasó." : "Según el cazador ya pasó (sin confirmar).");
      continue;
    }
    if (fechaVentana && fechaVentana > hasta) {
      descartar(`Fuera de los ${contexto.diasAdelante} días${fecha ? "" : " (fecha sin confirmar)"}.`);
      continue;
    }
    const horaSugerida = c.hora && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.hora) ? c.hora : null;
    const hora = pagina && horaSugerida && horaEnTexto(pagina.texto, horaSugerida, pagina.html, fecha) ? horaSugerida : null;
    const precio = pagina && c.precio ? precioEnTexto(pagina.texto, c.precio) : null;
    let boletos: string | null = null;
    if (c.boletos_url && pagina) {
      try {
        const b = new URL(c.boletos_url);
        // El enlace de boletos debe aparecer en la propia fuente.
        if (b.protocol === "https:" && !prohibido(b.hostname) && pagina.html.includes(b.hostname)) boletos = b.toString();
      } catch {
        /* enlace inválido: se omite */
      }
    }
    const sugerencias: Evento["sugerencias"] = {};
    if (fechaSugerida && !fecha) sugerencias.fecha = fechaSugerida;
    if (finSugerido && !fechaFin) sugerencias.fechaFin = finSugerido;
    if (horaSugerida && !hora) sugerencias.hora = horaSugerida;
    if (c.precio && !precio) sugerencias.precio = recortar(c.precio, 120);
    const confirmadoEn: Evento["confirmadoEn"] = {};
    if (fecha) confirmadoEn.fecha = pagina!.url;
    if (fechaFin) confirmadoEn.fechaFin = pagina!.url;
    if (hora) confirmadoEn.hora = pagina!.url;
    if (precio) confirmadoEn.precio = pagina!.url;
    const evento = crearEvento({
      titulo,
      fecha,
      fechaFin,
      hora,
      lugar: recortar(c.lugar ?? "", 200),
      municipio: recortar(c.municipio ?? "", 120),
      departamento: departamentoNormalizado(c.departamento),
      categoria: categoriaNormalizada(c.categoria),
      precio,
      boletosUrl: boletos,
      fuenteUrl: pagina?.url ?? fuente!,
      confirmadoEn,
      sugerencias,
      descripcion: recortar(c.descripcion ?? "", 300),
      imagenUrl: pagina ? imagenDe(pagina.html) : null,
      notaVerificacion: [nota, recortar(c.nota_verificacion ?? "", 400)].filter(Boolean).join(" "),
      granjaId: contexto.granjaId,
      ejecucionId: contexto.ejecucionId,
    });
    referencias.push({ titulo: evento.titulo, fecha: evento.fecha ?? fechaSugerida, origen: "esta búsqueda" });
    // 4. Imagen oficial: de la fuente y, si no hay, de la página de boletos. Queda pendiente de tu confirmación.
    const imagen = await buscarImagenEvento(
      { titulo: evento.titulo, fuenteUrl: evento.fuenteUrl, boletosUrl: evento.boletosUrl },
      { descargar: deps.descargar, htmlFuente: pagina ? { url: pagina.url, html: pagina.html } : null },
    ).catch(() => ({ medio: null, motivo: "error" }) as const);
    if (imagen.medio) {
      ponerImagenFuente(evento.id, imagen.medio.id, imagen.url, permisoPendiente(imagen.dominio));
      resultado.conImagen++;
    }
    resultado.nuevos.push({
      id: evento.id,
      titulo: evento.titulo,
      porConfirmar: (["fecha", "hora", "precio"] as const).filter((k) => !evento[k]),
      imagen: Boolean(imagen.medio),
    });
  }
  return resultado;
}
