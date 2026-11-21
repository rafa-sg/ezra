import { base, json } from "./db";
import { clasificarFuente } from "./confianza";
import { leerConfianzaDominios } from "./eventos";
import { departamentoCanonico } from "./panorama";
import { diaLocal } from "./tiempo";
import { leerProduccion } from "../produccion/almacen";
import { estadoEditorial, estadoEntrega } from "../produccion/resumen-encargo";

/**
 * Trazabilidad de los datos, solo con vínculos guardados (nunca por títulos parecidos):
 *  - Procedencia: fuente (dominio o cuenta) → registro encontrado (evento_fuentes: URL, vía, lectura) → evento.
 *  - Producción: evento → contenido (post de Instagram por evento_id; encargo por URL exacta de sus fuentes)
 *    → versión → destino (Spotmi por la propuesta del evento; Instagram por el post; entrega del encargo).
 * La ubicación pertenece al evento: si no tiene departamento reconocible queda «sin ubicación confirmada».
 * Un evento con tres fuentes cuenta como un evento y tres relaciones de procedencia.
 */
export type TipoFecha = "evento" | "descubrimiento" | "publicacion";
export type FiltrosTraza = { departamento?: string | null; fuente?: string | null; estado?: string | null; destino?: string | null; desde?: string | null; hasta?: string | null; tipoFecha?: TipoFecha };

const nombresFuente: Record<string, string> = {
  "elsalvador.travel": "MITUR",
  "cultura.gob.sv": "Cultura",
  "istu.gob.sv": "ISTU",
  "smartticket.fun": "Smart Ticket",
  "todoticketsv.com": "Todoticket",
  "funcapital.com": "Fun Capital",
  "elsalvador.com": "El Diario de Hoy",
  "laprensagrafica.com": "La Prensa Gráfica",
  "diarioelsalvador.com": "Diario El Salvador",
};
type Fila = Record<string, string | number | null>;
const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));

export type EstadoDestino = "no_enviado" | "pendiente_subida_manual" | "confirmada_por_usuario" | "envio_sin_confirmar" | "propuesto" | "aceptado" | "descartado" | "duplicado" | "lista_para_descargar";
export type DestinoTraza = { canal: string; estado: EstadoDestino; enlace: string | null; fecha: string | null; realizado: boolean };

export function trazabilidad(filtros: FiltrosTraza = {}, opciones: { encargos?: Awaited<ReturnType<typeof leerProduccion>>["encargos"] } = {}) {
  const db = base();
  const ajustes = leerConfianzaDominios();
  const claveFuente = (url: string, via: string, cuenta: string | null) => {
    if (via === "instagram" || via === "facebook") return { clave: `${via}:${(cuenta ?? "").replace(/^@/, "")}`, etiqueta: cuenta ? `@${cuenta.replace(/^@/, "")}` : via, tipo: "cuenta_red" };
    const c = clasificarFuente({ url, via: "web" }, ajustes);
    return { clave: c.dominio, etiqueta: nombresFuente[c.dominio] ?? c.dominio, tipo: c.tipo as string };
  };

  // Eventos con su ejecución de origen (qué agentes lo procesaron) y su envío a Spotmi.
  const filasEv = db.prepare("select * from eventos").all() as Fila[];
  const filasFu = db.prepare("select evento_id, url, via, cuenta, leido from evento_fuentes").all() as Fila[];
  const fuentesDe = new Map<string, Fila[]>();
  for (const f of filasFu) fuentesDe.set(String(f.evento_id), [...(fuentesDe.get(String(f.evento_id)) ?? []), f]);
  const pasosDe = new Map<string, { agente: string; titulo: string; estado: string }[]>();
  const ejecuciones = db.prepare("select id, granja_id, instantanea from ejecuciones").all() as Fila[];
  const granjaNombre = new Map((db.prepare("select id, nombre from granjas").all() as Fila[]).map((g) => [String(g.id), String(g.nombre)]));
  for (const ej of ejecuciones) {
    const nodos = json<{ grafo?: { nodos?: { id: string; agente?: string; titulo: string }[] } }>(String(ej.instantanea), {}).grafo?.nodos ?? [];
    const pasos = db.prepare("select nodo_id, estado from pasos where ejecucion_id = ?").all(String(ej.id)) as Fila[];
    pasosDe.set(
      String(ej.id),
      nodos.filter((n) => n.agente).map((n) => ({ agente: n.agente!, titulo: n.titulo, estado: String(pasos.find((p) => p.nodo_id === n.id)?.estado ?? "sin_ejecutar") })),
    );
  }
  const eventos = filasEv.map((f) => {
    const id = String(f.id);
    const principal = String(f.fuente_url ?? "");
    // Registros encontrados: la fuente principal y las sumadas, sin repetir la misma URL.
    const registros = [{ url: principal, via: "web", cuenta: null as string | null, leido: txt(f.creado) }, ...(fuentesDe.get(id) ?? []).map((x) => ({ url: String(x.url), via: String(x.via), cuenta: txt(x.cuenta), leido: txt(x.leido) }))]
      .filter((r) => r.url)
      .filter((r, i, a) => a.findIndex((y) => y.url === r.url) === i)
      .map((r) => ({ ...r, ...claveFuente(r.url, r.via, r.cuenta) }));
    const ejecucionId = txt(f.ejecucion_id);
    const spotmiClave = txt(f.spotmi_clave);
    const spotmiEstado = txt(f.spotmi_estado);
    const spotmi: DestinoTraza = spotmiEstado
      ? { canal: "spotmi", estado: spotmiEstado as EstadoDestino, enlace: null, fecha: txt(f.spotmi_consultado), realizado: true }
      : spotmiClave
        ? { canal: "spotmi", estado: "envio_sin_confirmar", enlace: null, fecha: null, realizado: false }
        : { canal: "spotmi", estado: "no_enviado", enlace: null, fecha: null, realizado: false };
    return {
      id,
      titulo: String(f.titulo),
      fecha: txt(f.fecha),
      descubierto: String(f.creado),
      departamento: departamentoCanonico(txt(f.departamento)),
      municipio: txt(f.municipio) ?? "",
      lugar: txt(f.lugar) ?? "",
      estado: String(f.estado),
      registros,
      ejecucion: ejecucionId ? { id: ejecucionId, granja: granjaNombre.get(String(f.granja_id)) ?? null, pasos: pasosDe.get(ejecucionId) ?? [] } : null,
      spotmi,
    };
  });
  const porUrl = new Map<string, string[]>();
  for (const e of eventos) for (const r of e.registros) porUrl.set(r.url, [...(porUrl.get(r.url) ?? []), e.id]);

  // Contenidos: posts de Instagram (uno por evento) y encargos (sus eventos, por URL exacta de las fuentes).
  const posts = (db.prepare("select * from posts_ig").all() as Fila[]).map((p) => {
    const estado = String(p.estado);
    const destino: DestinoTraza =
      estado === "subido"
        ? { canal: "instagram", estado: "confirmada_por_usuario", enlace: txt(p.ig_url), fecha: txt(p.subido), realizado: true }
        : estado === "listo"
          ? { canal: "instagram", estado: "pendiente_subida_manual", enlace: null, fecha: null, realizado: false }
          : { canal: "instagram", estado: "no_enviado", enlace: null, fecha: null, realizado: false };
    return {
      id: `post:${p.id}`,
      tipo: "post_ig" as const,
      titulo: `Post · ${eventos.find((e) => e.id === String(p.evento_id))?.titulo ?? "evento"}`,
      estado,
      creado: String(p.creado),
      publicado: txt(p.subido),
      versiones: Number(p.revision) || 1,
      eventos: [String(p.evento_id)],
      destinos: [destino],
    };
  });
  const encargos = (opciones.encargos ?? []).map((e) => {
    const relacionados = [...new Set(e.fuentes.flatMap((f) => porUrl.get(f.url) ?? []))];
    return {
      id: `encargo:${e.id}`,
      tipo: "encargo" as const,
      titulo: e.titulo,
      estado: estadoEditorial(e),
      creado: e.creado,
      publicado: null as string | null,
      versiones: e.version,
      eventos: relacionados,
      destinos: estadoEntrega(e).map((d) => ({ canal: d.canal, estado: d.estado === "lista_para_descargar" ? ("lista_para_descargar" as const) : ("no_enviado" as const), enlace: null, fecha: null, realizado: false })),
    };
  });
  const contenidos = [...posts, ...encargos];
  const contenidosDe = new Map<string, string[]>();
  for (const c of contenidos) for (const id of c.eventos) contenidosDe.set(id, [...(contenidosDe.get(id) ?? []), c.id]);

  // Filtros compartidos (cada vista dice qué fecha filtra).
  const tipoFecha = filtros.tipoFecha ?? "evento";
  const enRango = (dia: string | null) => (!filtros.desde || (dia !== null && dia.slice(0, 10) >= filtros.desde)) && (!filtros.hasta || (dia !== null && dia.slice(0, 10) <= filtros.hasta));
  const fechaDe = (e: (typeof eventos)[number]) => {
    // Descubrimiento y publicación son instantes (UTC): se comparan por su día en El Salvador.
    if (tipoFecha === "descubrimiento") return diaLocal(new Date(e.descubierto));
    if (tipoFecha === "publicacion") {
      const fechas = (contenidosDe.get(e.id) ?? []).map((id) => contenidos.find((c) => c.id === id)?.publicado).filter((x): x is string => Boolean(x));
      const primera = fechas.sort()[0];
      return primera ? diaLocal(new Date(primera)) : null;
    }
    return e.fecha;
  };
  const filtrados = eventos.filter((e) => {
    if (filtros.departamento === "sin_ubicacion" ? e.departamento !== null : filtros.departamento && e.departamento !== filtros.departamento) return false;
    if (filtros.fuente && !e.registros.some((r) => r.clave === filtros.fuente)) return false;
    if (filtros.estado && e.estado !== filtros.estado) return false;
    if (filtros.destino) {
      const destinos = [e.spotmi, ...(contenidosDe.get(e.id) ?? []).flatMap((id) => contenidos.find((c) => c.id === id)?.destinos ?? [])];
      if (!destinos.some((d) => d.canal === filtros.destino && d.estado !== "no_enviado")) return false;
    }
    return (!filtros.desde && !filtros.hasta) || enRango(fechaDe(e));
  });
  const ids = new Set(filtrados.map((e) => e.id));
  const contenidosVisibles = contenidos.filter((c) => c.eventos.some((id) => ids.has(id)));

  // Fuentes agregadas (sobre los eventos filtrados): eventos únicos y relaciones de procedencia.
  const fuentes = new Map<string, { clave: string; etiqueta: string; tipo: string; eventos: number; relaciones: number; ultimaLectura: string | null }>();
  for (const e of filtrados) {
    const vistos = new Set<string>();
    for (const r of e.registros) {
      const f = fuentes.get(r.clave) ?? { clave: r.clave, etiqueta: r.etiqueta, tipo: r.tipo, eventos: 0, relaciones: 0, ultimaLectura: null };
      f.relaciones++;
      if (!vistos.has(r.clave)) f.eventos++;
      vistos.add(r.clave);
      if (r.leido && (!f.ultimaLectura || r.leido > f.ultimaLectura)) f.ultimaLectura = r.leido;
      fuentes.set(r.clave, f);
    }
  }
  // Geografía: eventos únicos por departamento y contenidos relacionados (un contenido con eventos de
  // varios departamentos cuenta en cada uno: los subtotales no suman el total de contenidos únicos).
  const porDepartamento = new Map<string, { eventos: number; contenidos: Set<string> }>();
  for (const e of filtrados) {
    const clave = e.departamento ?? "sin_ubicacion";
    const d = porDepartamento.get(clave) ?? { eventos: 0, contenidos: new Set<string>() };
    d.eventos++;
    for (const c of contenidosDe.get(e.id) ?? []) d.contenidos.add(c);
    porDepartamento.set(clave, d);
  }
  return {
    filtros: { ...filtros, tipoFecha },
    eventos: filtrados.map((e) => ({ ...e, contenidos: contenidosDe.get(e.id) ?? [] })),
    contenidos: contenidosVisibles,
    fuentes: [...fuentes.values()].sort((a, b) => b.eventos - a.eventos),
    departamentos: [...porDepartamento.entries()].map(([nombre, d]) => ({ nombre, eventos: d.eventos, contenidos: d.contenidos.size })),
    totales: {
      eventos: filtrados.length,
      relacionesProcedencia: filtrados.reduce((s, e) => s + e.registros.length, 0),
      contenidos: contenidosVisibles.length,
      sinUbicacion: filtrados.filter((e) => !e.departamento).length,
      sinProcedencia: filtrados.filter((e) => !e.registros.length).length,
      entregasRealizadas: contenidosVisibles.reduce((s, c) => s + c.destinos.filter((d) => d.realizado).length, 0) + filtrados.filter((e) => e.spotmi.realizado).length,
    },
  };
}
export type Trazabilidad = ReturnType<typeof trazabilidad>;
