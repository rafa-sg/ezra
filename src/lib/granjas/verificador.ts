import { WorkflowError } from "../workflow";
import type { Respuesta } from "./fuentes";
import { dominioPermitido, leerPaginaVerificable } from "./fuentes";
import { esRedireccionBusqueda, resolverRedireccion, type Candidato } from "./cazador";
import { buscarImagenEvento, descargarImagen, permisoPendiente, permisoPendienteRed } from "./imagenes";
import type { CandidatoRed } from "./redes";
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
  agregarFuente,
  aplicarCambios,
  eventoPorUrl,
  guardarConfianza,
  leerEvento,
  type CambioEvento,
  type Evento,
  type OrigenEvento,
  type Referencia,
} from "./eventos";
import { diaValido, sumarDias } from "./tiempo";
import { lugaresCompatibles } from "./confianza";

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
  // «8:00 PM» y «08:00 PM» (las ticketeras suelen escribir la hora con cero inicial).
  const patrones = [`\\b0?${h12}${mi === 0 ? "(?::00)?" : `:${MM}`}\\s*${sufijo}\\b`];
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
  /** Ya estaba: si es de Ezra se suma la URL como fuente nueva (fuenteNueva) en vez de crear otra tarjeta. */
  duplicados: { titulo: string; de: string; id?: string; fuenteNueva?: boolean }[];
  /** Eventos existentes cuya fecha, hora, lugar o precio cambió según su propia fuente. */
  actualizados: { id: string; titulo: string; cambios: Omit<CambioEvento, "fecha" | "url">[] }[];
  descartados: { titulo: string; motivo: string }[];
  spotmi: "consultado" | "no_disponible";
  limite: number;
  /** Eventos nuevos que no entraron porque se alcanzó el máximo del día. */
  omitidosPorLimite: number;
  conImagen: number;
};
export async function verificarCandidatos(
  candidatos: (Candidato | CandidatoRed)[],
  contexto: {
    /** Cómo entran los eventos nuevos (cazador por defecto; importación o redes). */
    origen?: OrigenEvento;
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
  const resultado: ResultadoVerificacion = { revisados: 0, nuevos: [], duplicados: [], actualizados: [], descartados: [], spotmi: "consultado", limite: contexto.restantes, conImagen: 0, omitidosPorLimite: 0 };
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
    resultado.revisados++;
    const titulo = recortar(c.titulo, 160);
    const descartar = (motivo: string) => resultado.descartados.push({ titulo, motivo });
    // Un post leído por la API oficial: su texto es la página (no se abre ni se raspa la red).
    const red = "red" in c ? c.red : null;
    // 1. Fuente: https, dominio permitido y nunca una red social (salvo el enlace del post leído por API).
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
    if (red) {
      const esperado = red.via === "instagram" ? ["instagram.com"] : ["facebook.com"];
      if (!esperado.some((d) => host === d || host.endsWith(`.${d}`))) {
        descartar("El enlace no es el del post leído por la API.");
        continue;
      }
    } else if (prohibido(host)) {
      descartar("Fuente en una red social: no se usa.");
      continue;
    } else if (!dominioPermitido(host, dominios)) {
      descartar(`${host} no está en las fuentes permitidas.`);
      continue;
    }
    // 2. Duplicados antes de leer, con lo que se sabe. Una URL que ya es fuente de un evento es ese evento
    // (aunque haya cambiado la fecha). Los de Spotmi se cuentan y se dejan; los de Ezra suman la fuente.
    const fechaSugerida = c.fecha && diaValido(c.fecha.slice(0, 10)) ? c.fecha.slice(0, 10) : null;
    const porUrl = eventoPorUrl(fuente!);
    const previo: Referencia | null = porUrl ? { id: porUrl, titulo: leerEvento(porUrl).titulo, fecha: null, origen: "Ezra" } : buscarDuplicado({ titulo, fecha: fechaSugerida }, referencias);
    if (previo && !previo.id) {
      resultado.duplicados.push({ titulo, de: `${previo.origen}: ${previo.titulo}` });
      continue;
    }
    // Máximo de eventos nuevos alcanzado: los que ya existen igual suman su fuente; los nuevos esperan a mañana.
    if (!previo && resultado.nuevos.length >= contexto.restantes) {
      resultado.omitidosPorLimite++;
      continue;
    }
    // 3. Lectura de la fuente: solo lo que aparece queda confirmado.
    let pagina: { url: string; texto: string; html: string } | null = null;
    let nota = "";
    if (red) pagina = { url: fuente!, texto: red.texto, html: "" };
    else
      try {
        pagina = await leerPaginaVerificable(fuente!, dominios, { descargar: deps.descargar });
      } catch (error) {
        nota = `No se pudo leer la fuente (${error instanceof WorkflowError ? error.message : "error de red"}). Fecha, hora y precio quedan por confirmar.`;
      }
    if (pagina && !tituloEnTexto(pagina.texto, titulo)) {
      if (previo?.id) resultado.duplicados.push({ titulo, de: `${previo.origen}: ${previo.titulo}`, id: previo.id });
      else descartar("La página fuente no menciona este evento.");
      continue;
    }
    if (previo?.id) {
      await sumarAExistente(previo.id, { c, titulo, red, fuente: pagina?.url ?? fuente!, pagina, fechaSugerida }, resultado, deps);
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
        if (b.protocol === "https:" && !prohibido(b.hostname) && (pagina.html || pagina.texto).includes(b.hostname)) boletos = b.toString();
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
    const lugar = recortar(c.lugar ?? "", 200);
    // Lo que esta fuente confirmó (para la confianza): título, datos que aparecen y el lugar si está escrito.
    const campos = pagina ? ["titulo", ...Object.keys(confirmadoEn), ...(lugar && tituloEnTexto(pagina.texto, lugar) ? ["lugar"] : [])] : [];
    const evento = crearEvento({
      titulo,
      fecha,
      fechaFin,
      hora,
      lugar,
      municipio: recortar(c.municipio ?? "", 120),
      departamento: departamentoNormalizado(c.departamento),
      categoria: categoriaNormalizada(c.categoria),
      precio,
      boletosUrl: boletos,
      fuenteUrl: pagina?.url ?? fuente!,
      confirmadoEn,
      sugerencias,
      descripcion: recortar(c.descripcion ?? "", 300),
      imagenUrl: pagina && !red ? imagenDe(pagina.html) : null,
      notaVerificacion: [red ? `Post de ${red.cuenta} leído con la API oficial de ${red.via === "instagram" ? "Instagram" : "Facebook"}.` : "", nota, recortar(c.nota_verificacion ?? "", 400)]
        .filter(Boolean)
        .join(" "),
      granjaId: contexto.granjaId,
      ejecucionId: contexto.ejecucionId,
      origen: red ? red.via : (contexto.origen ?? "cazador"),
      fuente: {
        via: red ? red.via : "web",
        cuenta: red?.cuenta ?? "",
        publicado: red?.publicado || null,
        campos,
        datos: { fecha: fecha ?? fechaSugerida, hora: hora ?? horaSugerida, lugar: lugar || null, precio: precio ?? (c.precio ? recortar(c.precio, 120) : null) },
        imagenUrl: red?.imagenUrl ?? null,
      },
    });
    referencias.push({ titulo: evento.titulo, fecha: evento.fecha ?? fechaSugerida, origen: "esta búsqueda", id: evento.id });
    // 4. Imagen oficial: de la fuente y, si no hay, de la página de boletos (o la del post leído por API).
    // Queda pendiente de tu confirmación.
    const imagen = red
      ? await (async () => {
          if (!red.imagenUrl) return { medio: null, motivo: "El post no tiene imagen." } as const;
          try {
            const { medio } = await descargarImagen(red.imagenUrl, `Post de ${red.cuenta} · ${evento.titulo}`, deps.descargar, { via: red.via, cuenta: red.cuenta });
            return { medio, url: fuente!, dominio: red.cuenta, red: true } as const;
          } catch {
            return { medio: null, motivo: "imagen del post no válida" } as const;
          }
        })()
      : await buscarImagenEvento(
      { id: evento.id, titulo: evento.titulo, fuenteUrl: evento.fuenteUrl, boletosUrl: evento.boletosUrl },
      { descargar: deps.descargar, htmlFuente: pagina ? { url: pagina.url, html: pagina.html } : null },
    ).catch(() => ({ medio: null, motivo: "error" }) as const);
    if (imagen.medio) {
      ponerImagenFuente(evento.id, imagen.medio.id, imagen.url, red ? permisoPendienteRed(red.via, red.cuenta) : permisoPendiente(imagen.dominio));
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

/**
 * Un evento que ya está en la bandeja vuelve a aparecer: se suma la URL a sus fuentes (o se
 * refresca si ya estaba) y se recalcula la confianza. Si la fuente es la misma página (o el mismo
 * sitio) que su fuente principal y ahora confirma otra fecha, hora, precio o lugar, se actualiza el
 * evento y se anota el antes y el después. Si no tenía imagen y esta fuente trae una, se busca.
 */
async function sumarAExistente(
  id: string,
  d: { c: Candidato | CandidatoRed; titulo: string; red: CandidatoRed["red"] | null; fuente: string; pagina: { url: string; texto: string; html: string } | null; fechaSugerida: string | null },
  resultado: ResultadoVerificacion,
  deps: DepsVerificador,
) {
  const e = leerEvento(id);
  const { c, red, pagina } = d;
  const fecha = pagina && d.fechaSugerida && fechaEnTexto(pagina.texto, d.fechaSugerida, pagina.html) ? d.fechaSugerida : null;
  const horaSugerida = c.hora && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.hora) ? c.hora : null;
  const hora = pagina && horaSugerida && horaEnTexto(pagina.texto, horaSugerida, pagina.html, fecha) ? horaSugerida : null;
  const precio = pagina && c.precio ? precioEnTexto(pagina.texto, c.precio) : null;
  const lugar = recortar(c.lugar ?? "", 200);
  const lugarConfirmado = Boolean(pagina && lugar && tituloEnTexto(pagina.texto, lugar));
  const campos = pagina ? ["titulo", ...(fecha ? ["fecha"] : []), ...(hora ? ["hora"] : []), ...(precio ? ["precio"] : []), ...(lugarConfirmado ? ["lugar"] : [])] : [];
  const nueva = agregarFuente(id, {
    url: d.fuente,
    via: red ? red.via : "web",
    cuenta: red?.cuenta ?? "",
    publicado: red?.publicado || null,
    campos,
    datos: { fecha: fecha ?? d.fechaSugerida, hora: hora ?? horaSugerida, lugar: lugar || null, precio: precio ?? (c.precio ? recortar(c.precio, 120) : null) },
    imagenUrl: red?.imagenUrl ?? null,
  });
  // Solo la propia fuente (misma página o mismo sitio) puede cambiar un dato ya guardado.
  const sitio = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  };
  const propia = d.fuente === e.fuenteUrl || sitio(d.fuente) === sitio(e.fuenteUrl);
  const cambios: Omit<CambioEvento, "fecha">[] = [];
  if (propia) {
    if (fecha && fecha !== e.fecha) cambios.push({ campo: "fecha", antes: e.fecha, despues: fecha, url: d.fuente });
    if (hora && hora !== e.hora) cambios.push({ campo: "hora", antes: e.hora, despues: hora, url: d.fuente });
    if (precio && precio !== e.precio) cambios.push({ campo: "precio", antes: e.precio, despues: precio, url: d.fuente });
    if (lugarConfirmado && (!e.lugar || !lugaresCompatibles(lugar, e.lugar))) cambios.push({ campo: "lugar", antes: e.lugar || null, despues: lugar, url: d.fuente });
  }
  const { aplicados } = cambios.length ? aplicarCambios(id, cambios) : { aplicados: [] };
  if (aplicados.length) resultado.actualizados.push({ id, titulo: e.titulo, cambios: aplicados.map(({ campo, antes, despues }) => ({ campo, antes, despues })) });
  resultado.duplicados.push({ titulo: d.titulo, de: `Ezra: ${e.titulo}`, id, fuenteNueva: nueva });
  // Imagen: si el evento no tenía, se intenta con esta fuente (queda pendiente de tu confirmación).
  if (!e.imagenMedioId) {
    try {
      if (red?.imagenUrl) {
        const { medio } = await descargarImagen(red.imagenUrl, `Post de ${red.cuenta} · ${e.titulo}`, deps.descargar, { via: red.via, cuenta: red.cuenta });
        ponerImagenFuente(id, medio.id, d.fuente, permisoPendienteRed(red.via, red.cuenta));
        resultado.conImagen++;
      } else if (pagina && !red) {
        const r = await buscarImagenEvento({ id, titulo: e.titulo, fuenteUrl: d.fuente, boletosUrl: null }, { descargar: deps.descargar, htmlFuente: pagina });
        if (r.medio) {
          ponerImagenFuente(id, r.medio.id, r.url, permisoPendiente(r.dominio));
          resultado.conImagen++;
        }
      }
    } catch {
      /* sin imagen: el evento sigue igual */
    }
  }
  guardarConfianza(id);
}
