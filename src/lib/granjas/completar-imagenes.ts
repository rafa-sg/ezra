import { listarGranjas } from "./almacen";
import { clasificarFuente } from "./confianza";
import { agregarFuente, guardarConfianza, leerConfianzaDominios, leerEvento, parecido, ponerBoletos, ponerImagenFuente, type Evento } from "./eventos";
import { dominioPermitido, leerMaterialFuentes, leerPaginaVerificable, type MaterialFuente } from "./fuentes";
import { buscarImagenEvento, descargarImagen, permisoPendiente, permisoPendienteRed, type CachePortadas, type DescargarImagen } from "./imagenes";
import { fechaEnTexto, tituloEnTexto } from "./verificador";

/**
 * «Completar imágenes»: para un evento sin imagen prueba, en orden,
 *   1. su página fuente, la de boletos y las demás fuentes web (og:image, twitter:image…);
 *   2. la ficha del evento en las ticketeras permitidas (comparando título y fecha);
 *   3. la imagen del post de una cuenta oficial leído por la API de Instagram o Facebook.
 * Nunca genera ni retoca imágenes. Toda imagen queda «pendiente de tu confirmación».
 */
export type ResultadoCompletar = {
  id: string;
  titulo: string;
  estado: "oficial" | "ticketera" | "red" | "sin_imagen" | "ya_tenia";
  motivo: string;
  boletos?: string;
};
/** Carteleras de las ticketeras: se leen como listados para encontrar la ficha del evento. */
export const carteleras = [
  { nombre: "Smart Ticket", url: "https://www.smartticket.fun/es" },
  { nombre: "Todoticket", url: "https://todoticketsv.com/" },
  { nombre: "Fun Capital", url: "https://funcapital.com/" },
];
export type ContextoCompletar = {
  descargar?: DescargarImagen;
  /** Dominios permitidos de la granja de eventos (las ticketeras solo cuentan si están ahí). */
  dominios?: string[];
  portadas?: CachePortadas;
  /** Listados ya leídos en este lote (una lectura por cartelera). */
  listados?: Map<string, Promise<MaterialFuente[]>>;
};

/** Dominios y carteleras de las granjas «Eventos de El Salvador» activas. */
export function contextoGranjaEventos() {
  const granjas = listarGranjas().filter((g) => g.ajustes.purpose === "eventos_el_salvador" && g.estado === "activa");
  const dominios = [...new Set(granjas.flatMap((g) => g.politicaFuentes.dominios))];
  const ajustes = leerConfianzaDominios();
  const deGranjas = granjas
    .flatMap((g) => g.grafo.nodos.flatMap((n) => n.fuentes ?? []))
    .filter((f) => clasificarFuente({ url: f.url, via: "web" }, ajustes).tipo === "ticketera")
    .map((f) => ({ nombre: f.nombre, url: f.url }));
  const vistos = new Set<string>();
  const listados = [...deGranjas, ...carteleras].filter((c) => {
    const h = new URL(c.url).hostname.replace(/^www\./, "");
    if (vistos.has(h)) return false;
    vistos.add(h);
    return true;
  });
  return { dominios, listados };
}

/**
 * Busca la ficha del evento en las carteleras de las ticketeras permitidas: un enlace cuyo
 * texto se parece al título y una página que menciona el título (y la fecha, si se conoce).
 */
export async function buscarFichaTicketera(
  evento: Pick<Evento, "titulo" | "fecha">,
  ctx: { dominios: string[]; listados: { nombre: string; url: string }[]; descargar?: DescargarImagen; cache?: Map<string, Promise<MaterialFuente[]>> },
): Promise<{ url: string; html: string; texto: string } | null> {
  const permitidos = ctx.listados.filter((l) => dominioPermitido(new URL(l.url).hostname, ctx.dominios));
  for (const listado of permitidos) {
    const cache: Map<string, Promise<MaterialFuente[]>> = ctx.cache ?? new Map();
    if (!cache.has(listado.url)) cache.set(listado.url, leerMaterialFuentes([listado], ctx.dominios, { descargar: ctx.descargar, maxTexto: 1 }));
    const [material] = await cache.get(listado.url)!;
    if (!material || material.error) continue;
    const opciones = material.enlaces
      .map((e) => {
        // El texto del enlace o, si es corto, las palabras de la ruta («/event/andrea-bocelli-…»).
        const ruta = decodeURIComponent(new URL(e.url).pathname).replace(/[-_/]+/g, " ");
        return { ...e, parecido: Math.max(parecido(evento.titulo, e.texto), parecido(evento.titulo, ruta)) };
      })
      .filter((e) => e.parecido >= 0.6)
      .sort((a, b) => b.parecido - a.parecido)
      .slice(0, 3);
    for (const opcion of opciones) {
      try {
        const p = await leerPaginaVerificable(opcion.url, ctx.dominios, { descargar: ctx.descargar });
        if (!tituloEnTexto(p.texto, evento.titulo)) continue;
        if (evento.fecha && !fechaEnTexto(p.texto, evento.fecha, p.html)) continue;
        return p;
      } catch {
        /* ficha ilegible: se prueba la siguiente */
      }
    }
  }
  return null;
}

export async function completarImagenEvento(id: string, ctx: ContextoCompletar = {}): Promise<ResultadoCompletar> {
  let e = leerEvento(id);
  const base = { id, titulo: e.titulo };
  if (e.imagenMedioId) return { ...base, estado: "ya_tenia", motivo: "" };
  const granja = contextoGranjaEventos();
  const dominios = ctx.dominios ?? granja.dominios;
  const portadas = ctx.portadas ?? new Map();
  const motivos: string[] = [];
  const otrasWeb = e.fuentes.filter((f) => f.via === "web" && f.url !== e.fuenteUrl).map((f) => f.url);

  // 1. Páginas del evento: fuente, boletos y otras fuentes web.
  const r = await buscarImagenEvento({ id, titulo: e.titulo, fuenteUrl: e.fuenteUrl, boletosUrl: e.boletosUrl, otrasPaginas: otrasWeb }, { descargar: ctx.descargar, portadas });
  if (r.medio) {
    ponerImagenFuente(id, r.medio.id, r.url, permisoPendiente(r.dominio));
    return { ...base, estado: "oficial", motivo: r.dominio };
  }
  motivos.push(r.motivo);

  // 2. Ficha en una ticketera permitida (si el evento aún no tiene una).
  const yaEnTicketera = [e.fuenteUrl, e.boletosUrl, ...otrasWeb].some((u) => u && granja.listados.some((l) => new URL(u).hostname === new URL(l.url).hostname));
  if (!yaEnTicketera) {
    const ficha = await buscarFichaTicketera(e, { dominios, listados: granja.listados, descargar: ctx.descargar, cache: ctx.listados });
    if (ficha) {
      agregarFuente(id, { url: ficha.url, via: "web", campos: ["titulo", ...(e.fecha ? ["fecha"] : [])], datos: { fecha: e.fecha } });
      e = ponerBoletos(id, ficha.url);
      guardarConfianza(id);
      const ri = await buscarImagenEvento({ id, titulo: e.titulo, fuenteUrl: ficha.url, boletosUrl: null }, { descargar: ctx.descargar, portadas, htmlFuente: ficha });
      if (ri.medio) {
        ponerImagenFuente(id, ri.medio.id, ri.url, permisoPendiente(ri.dominio));
        return { ...base, estado: "ticketera", motivo: ri.dominio, boletos: ficha.url };
      }
      motivos.push(`ficha en ${new URL(ficha.url).hostname}: ${ri.motivo}`);
    } else if (granja.listados.some((l) => dominioPermitido(new URL(l.url).hostname, dominios))) motivos.push("no aparece en las carteleras de las ticketeras");
  }

  // 3. Imagen de un post de una cuenta oficial leído por la API (Instagram o Facebook).
  for (const f of e.fuentes.filter((x) => (x.via === "instagram" || x.via === "facebook") && x.imagenUrl)) {
    try {
      const red = { via: f.via as "instagram" | "facebook", cuenta: f.cuenta };
      const { medio } = await descargarImagen(f.imagenUrl!, `Post de ${f.cuenta} · ${e.titulo}`, ctx.descargar, red);
      ponerImagenFuente(id, medio.id, f.url, permisoPendienteRed(red.via, red.cuenta));
      return { ...base, estado: "red", motivo: f.cuenta };
    } catch (error) {
      motivos.push(`post de ${f.cuenta}: ${error instanceof Error ? error.message : "imagen no válida"}`);
    }
  }
  return { ...base, estado: "sin_imagen", motivo: [...new Set(motivos.filter(Boolean))].slice(0, 3).join(" · ") || "Sin páginas donde buscar." };
}
