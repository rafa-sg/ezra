import { z } from "zod";
import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json, transaccion } from "./db";
import { leerAjuste } from "./ajustes";
import { calcularConfianza, clasificarFuente, confianzaDominiosSchema, esRedSocial, type Confianza, type ConfianzaDominios, type FuenteEvaluada, type TipoFuente } from "./confianza";
import { diaLocal, diaValido, instanteLocal, sumarDias } from "./tiempo";
import { precioDesde, type PrecioDesde } from "./precio";

/**
 * Bandeja de eventos de El Salvador. Un dato que no aparece en la fuente queda en
 * null («por confirmar»): nunca se completa con lo que diga un modelo. Lo que el
 * cazador indicó sin confirmar se guarda aparte, como sugerencia visible.
 */
export const categoriasEvento = ["musica", "feria", "cultura", "deporte", "gastronomia", "religioso", "otro"] as const;
export type CategoriaEvento = (typeof categoriasEvento)[number];
export const departamentos = [
  "Ahuachapán",
  "Cabañas",
  "Chalatenango",
  "Cuscatlán",
  "La Libertad",
  "La Paz",
  "La Unión",
  "Morazán",
  "San Miguel",
  "San Salvador",
  "San Vicente",
  "Santa Ana",
  "Sonsonate",
  "Usulután",
] as const;
/** Redes sociales: nunca son fuente de un dato (no se leen ni se raspan). */
export const dominiosProhibidos = ["instagram.com", "facebook.com", "fb.com", "fb.me", "tiktok.com", "x.com", "twitter.com", "threads.net"];
export const estadosEvento = ["nuevo", "aprobado", "descartado"] as const;
/** Estado que ve el propietario: combina su decisión con lo que pasó en Spotmi e Instagram. */
export const estadosVisibles = ["nuevo", "aprobado", "descartado", "propuesto", "aceptado", "subido_ig"] as const;
export type EstadoVisible = (typeof estadosVisibles)[number];

export const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
export function departamentoNormalizado(valor: string | null | undefined): string {
  if (!valor) return "";
  const limpio = sinAcentos(valor).toLowerCase().replace(/^departamento de\s+/, "").trim();
  return departamentos.find((d) => sinAcentos(d).toLowerCase() === limpio) ?? "";
}
const alias: Record<string, CategoriaEvento> = {
  concierto: "musica",
  conciertos: "musica",
  musica: "musica",
  festival: "cultura",
  festivales: "cultura",
  cultura: "cultura",
  arte: "cultura",
  teatro: "cultura",
  feria: "feria",
  ferias: "feria",
  "fiesta patronal": "religioso",
  "fiestas patronales": "religioso",
  patronal: "religioso",
  religioso: "religioso",
  deporte: "deporte",
  deportes: "deporte",
  gastronomia: "gastronomia",
  gastronomico: "gastronomia",
  comida: "gastronomia",
};
export function categoriaNormalizada(valor: string | null | undefined): CategoriaEvento {
  const limpio = sinAcentos(valor ?? "").toLowerCase().trim();
  return (categoriasEvento as readonly string[]).includes(limpio) ? (limpio as CategoriaEvento) : (alias[limpio] ?? "otro");
}
export function recortar(texto: string, maximo: number) {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= maximo) return t;
  const corte = t.slice(0, maximo - 1);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), maximo - 40)).trim()}…`;
}

/* ── Huella y duplicados ── */
const vacias = new Set(
  "de del la el los las en y a al con por para un una 2025 2026 2027 edicion evento san sv el salvador".split(" "),
);
export function palabrasClave(titulo: string): string[] {
  return [
    ...new Set(
      sinAcentos(titulo)
        .toLowerCase()
        .replace(/[^a-z0-9ñ ]+/g, " ")
        .split(/\s+/)
        .filter((p) => p.length > 1 && !vacias.has(p)),
    ),
  ];
}
export const huellaTitulo = (titulo: string) => palabrasClave(titulo).sort().join(" ");
/** Palabras que dicen qué tipo de evento es, no cuál: «Fiestas patronales de Apopa» y «… de Armenia» son distintos. */
const genericas = new Set(
  "fiesta fiestas patronal patronales festival festivales feria ferias concierto conciertos tour gira celebracion aniversario campeonato torneo encuentro expo exposicion noche gran nacional internacional cumbre congreso summit show presentacion temporada".split(
    " ",
  ),
);
/** Nombres de departamento: dicen dónde, no qué evento es («Festival del café – Chalatenango»). */
const lugares = new Set("ahuachapan cabanas chalatenango cuscatlan libertad paz union morazan miguel vicente ana sonsonate usulutan".split(" "));
/**
 * Parecido entre dos títulos. Solo cuentan las palabras distintivas (sin genéricas como
 * «fiestas patronales» ni departamentos, si queda algo más). Que un título contenga al otro
 * vale solo si le sobran pocas palabras: un evento repetido en la bandeja se descarta con
 * un clic; uno que se pierde por error no se ve.
 */
export function parecido(a: string, b: string) {
  const distintivas = (t: string) => palabrasClave(t).filter((p) => !genericas.has(p));
  const nucleo = (xs: string[]) => xs.filter((p) => !lugares.has(p));
  let x = distintivas(a);
  let y = distintivas(b);
  if (!x.length || !y.length) [x, y] = [palabrasClave(a), palabrasClave(b)];
  else if (nucleo(x).length && nucleo(y).length) [x, y] = [nucleo(x), nucleo(y)];
  const sx = new Set(x);
  const sy = new Set(y);
  if (!sx.size || !sy.size) return 0;
  const comunes = [...sx].filter((p) => sy.has(p)).length;
  const jaccard = comunes / new Set([...sx, ...sy]).size;
  const menor = Math.min(sx.size, sy.size);
  const mayor = Math.max(sx.size, sy.size);
  // «Festival del Maíz» ⊂ «Festival del Maíz de Suchitoto»: contenido y con pocas palabras de más.
  if (comunes === menor && (menor >= 2 || mayor <= 2) && mayor - menor <= 2) return Math.max(jaccard, 0.85);
  return jaccard;
}
export type Referencia = { titulo: string; fecha: string | null; hasta?: string | null; lugar?: string | null; origen: string; id?: string };
const distanciaDias = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
/** Mismo evento si el título se parece y la fecha coincide (±1 día), o mucho parecido si falta una fecha. */
export function buscarDuplicado(candidato: { titulo: string; fecha: string | null }, referencias: Referencia[]): Referencia | null {
  for (const r of referencias) {
    const p = parecido(candidato.titulo, r.titulo);
    if (candidato.fecha && r.fecha) {
      if (distanciaDias(candidato.fecha, r.fecha.slice(0, 10)) <= 1 && p >= 0.6) return r;
    } else if (p >= 0.8) return r;
  }
  return null;
}

/* ── Almacén ── */
export type Evento = {
  id: string;
  titulo: string;
  fecha: string | null;
  /** Último día de un evento de varios días (fiestas patronales, villas navideñas). */
  fechaFin: string | null;
  hora: string | null;
  lugar: string;
  municipio: string;
  departamento: string;
  categoria: CategoriaEvento;
  precio: string | null;
  boletosUrl: string | null;
  fuenteUrl: string;
  confirmadoEn: Partial<Record<"fecha" | "fechaFin" | "hora" | "precio", string>>;
  sugerencias: Partial<Record<"fecha" | "fechaFin" | "hora" | "precio", string>>;
  descripcion: string;
  imagenUrl: string | null;
  imagenMedioId: string | null;
  imagenPermiso: string;
  /** El post solo usa la imagen cuando el propietario la confirmó. */
  imagenConfirmada: boolean;
  estado: (typeof estadosEvento)[number];
  motivoDescarte: string;
  spotmiEstado: "propuesto" | "aceptado" | "descartado" | "duplicado" | null;
  spotmiPropuestaId: string | null;
  spotmiClave: string | null;
  spotmiConsultado: string | null;
  igEstado: "post_listo" | "subido" | null;
  huella: string;
  notaVerificacion: string;
  granjaId: string | null;
  ejecucionId: string | null;
  revision: number;
  creado: string;
  actualizado: string;
  estadoVisible: EstadoVisible;
  /** Cómo entró: cazador (web y Google), cuentas de Instagram o Facebook por API, importación o enlace manual. */
  origen: OrigenEvento;
  /** Todas las URL donde apareció, con su tipo y lo que confirmó cada una. */
  fuentes: EventoFuente[];
  confianza: Confianza;
  /** Cambios de fecha, hora, lugar o precio que trajo una fuente después de crearse. */
  cambios: CambioEvento[];
  /** afiche oficial › post de cuenta oficial › foto de prensa › referencia IA (null: sin imagen). */
  imagenTipo: TipoImagen | null;
  /** Imagen oficial de 300–599 px de lado menor. */
  imagenBaja: boolean;
  precioDesde: PrecioDesde;
  /** Todas las imágenes que tuvo el evento (la IA queda aquí si llega un afiche). */
  imagenes: ImagenHistorial[];
  /** De dónde salió la imagen: web oficial, publicación original, captura, fotograma, prensa o IA. */
  imagenOrigen: OrigenImagen | null;
  /** Publicación de origen (Instagram/Facebook) y su cuenta; «verificada» si la confirmó la API. */
  imagenPublicacion: { url: string; plataforma: string; cuenta: string; verificada: boolean; recuperada: string | null } | null;
};
export const origenesImagen = ["web", "original", "captura", "fotograma", "prensa", "ia"] as const;
export type OrigenImagen = (typeof origenesImagen)[number];
export const tiposImagen = ["afiche", "red", "prensa", "ia"] as const;
export type TipoImagen = (typeof tiposImagen)[number];
export const prioridadImagen: Record<TipoImagen, number> = { afiche: 4, red: 3, prensa: 2, ia: 1 };
export type DatosIA = { prompt: string; negativo: string; version: string; modelo: string };
export type ImagenHistorial = {
  id: string;
  medioId: string | null;
  tipo: TipoImagen;
  url: string | null;
  permiso: string;
  ia: DatosIA | null;
  nota: string;
  creado: string;
  origen: OrigenImagen | null;
  plataforma: string | null;
  cuenta: string | null;
  publicacionUrl: string | null;
};
export const origenesEvento = ["cazador", "instagram", "facebook", "importacion", "manual", "desconocido"] as const;
export type OrigenEvento = (typeof origenesEvento)[number];
export type EventoFuente = FuenteEvaluada & { id: string; imagenUrl: string | null; tipo: TipoFuente; puntos: number; dominio: string };
export type CambioEvento = { campo: "fecha" | "fechaFin" | "hora" | "lugar" | "precio"; antes: string | null; despues: string | null; url: string; fecha: string };
export type NuevaFuente = {
  url: string;
  via: FuenteEvaluada["via"];
  cuenta?: string;
  publicado?: string | null;
  campos?: string[];
  datos?: FuenteEvaluada["datos"];
  imagenUrl?: string | null;
};
export const leerConfianzaDominios = (): ConfianzaDominios => leerAjuste("confianza_dominios", confianzaDominiosSchema, {});
type FilaFuente = { id: string; evento_id: string; url: string; via: string; cuenta: string; publicado: string | null; leido: string; campos: string; datos: string; imagen_url: string | null };
function aFuente(f: FilaFuente, ajustes: ConfianzaDominios): EventoFuente {
  const crudo = {
    id: f.id,
    url: f.url,
    via: f.via as FuenteEvaluada["via"],
    cuenta: f.cuenta,
    publicado: f.publicado,
    leido: f.leido,
    campos: json<string[]>(f.campos, []),
    datos: json<FuenteEvaluada["datos"]>(f.datos, {}),
    imagenUrl: f.imagen_url,
  };
  return { ...crudo, ...clasificarFuente(crudo, ajustes) };
}
function fuentesPorEvento(ids: string[] | null, ajustes: ConfianzaDominios) {
  const filas = (
    ids === null
      ? base().prepare("select * from evento_fuentes order by leido").all()
      : ids.length === 1
        ? base().prepare("select * from evento_fuentes where evento_id = ? order by leido").all(ids[0])
        : []
  ) as FilaFuente[];
  const mapa = new Map<string, EventoFuente[]>();
  for (const f of filas) mapa.set(f.evento_id, [...(mapa.get(f.evento_id) ?? []), aFuente(f, ajustes)]);
  return mapa;
}
type Fila = Record<string, string | number | null>;
type FilaImagen = {
  id: string;
  evento_id: string;
  medio_id: string | null;
  tipo: TipoImagen;
  url: string | null;
  permiso: string;
  ia: string | null;
  nota: string;
  creado: string;
  origen: string | null;
  plataforma: string | null;
  cuenta: string | null;
  publicacion_url: string | null;
};
const comoOrigen = (v: unknown): OrigenImagen | null => ((origenesImagen as readonly string[]).includes(String(v)) ? (String(v) as OrigenImagen) : null);
function imagenesPorEvento(id: string | null) {
  const filas = (id ? base().prepare("select * from evento_imagenes where evento_id = ? order by creado").all(id) : base().prepare("select * from evento_imagenes order by creado").all()) as FilaImagen[];
  const mapa = new Map<string, ImagenHistorial[]>();
  for (const f of filas)
    mapa.set(f.evento_id, [
      ...(mapa.get(f.evento_id) ?? []),
      {
        id: f.id,
        medioId: f.medio_id,
        tipo: f.tipo,
        url: f.url,
        permiso: f.permiso,
        ia: f.ia ? json<DatosIA | null>(f.ia, null) : null,
        nota: f.nota,
        creado: f.creado,
        origen: comoOrigen(f.origen),
        plataforma: f.plataforma,
        cuenta: f.cuenta,
        publicacionUrl: f.publicacion_url,
      },
    ]);
  return mapa;
}
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
export function estadoVisible(e: Pick<Evento, "estado" | "spotmiEstado" | "igEstado">): EstadoVisible {
  if (e.igEstado === "subido") return "subido_ig";
  if (e.spotmiEstado === "aceptado") return "aceptado";
  if (e.spotmiEstado === "propuesto") return "propuesto";
  return e.estado;
}
/** Proyecto de Supabase al que apunta Ezra ahora (p. ej. «bvmzrmvrdbfpkdhwazgv.supabase.co»). */
export function destinoSpotmi(): string | null {
  try {
    return new URL(process.env.SPOTMI_SUPABASE_URL?.trim() || "").host || null;
  } catch {
    return null;
  }
}
/** Un envío hecho a otro proyecto (desarrollo) no cuenta como enviado al destino actual. */
const deOtroDestino = (f: Fila) => {
  const destino = s(f.spotmi_destino);
  const actual = destinoSpotmi();
  return Boolean(destino && actual && destino !== actual);
};
function aEvento(f: Fila, fuentes: EventoFuente[], ajustes: ConfianzaDominios, hoy: string, imagenes: ImagenHistorial[] = []): Evento {
  const otroDestino = deOtroDestino(f);
  const e = {
    id: String(f.id),
    titulo: String(f.titulo),
    fecha: s(f.fecha),
    fechaFin: s(f.fecha_fin),
    hora: s(f.hora),
    lugar: String(f.lugar ?? ""),
    municipio: String(f.municipio ?? ""),
    departamento: String(f.departamento ?? ""),
    categoria: categoriaNormalizada(String(f.categoria)),
    precio: s(f.precio),
    boletosUrl: s(f.boletos_url),
    fuenteUrl: String(f.fuente_url),
    confirmadoEn: json(String(f.confirmado_en), {}),
    sugerencias: json(String(f.sugerencias), {}),
    descripcion: String(f.descripcion ?? ""),
    imagenUrl: s(f.imagen_url),
    imagenMedioId: s(f.imagen_medio_id),
    imagenPermiso: String(f.imagen_permiso ?? ""),
    imagenConfirmada: Boolean(f.imagen_confirmada) && Boolean(f.imagen_medio_id),
    estado: f.estado as Evento["estado"],
    motivoDescarte: String(f.motivo_descarte ?? ""),
    spotmiEstado: (otroDestino ? null : s(f.spotmi_estado)) as Evento["spotmiEstado"],
    spotmiPropuestaId: otroDestino ? null : s(f.spotmi_propuesta_id),
    spotmiClave: otroDestino ? null : s(f.spotmi_clave),
    spotmiConsultado: s(f.spotmi_consultado),
    igEstado: s(f.ig_estado) as Evento["igEstado"],
    huella: String(f.huella),
    notaVerificacion: String(f.nota_verificacion ?? ""),
    granjaId: s(f.granja_id),
    ejecucionId: s(f.ejecucion_id),
    revision: Number(f.revision),
    creado: String(f.creado),
    actualizado: String(f.actualizado),
    origen: (origenesEvento as readonly string[]).includes(String(f.origen)) ? (String(f.origen) as OrigenEvento) : "desconocido",
    fuentes,
    cambios: json<CambioEvento[]>(s(f.cambios), []),
    imagenTipo: f.imagen_medio_id ? ((tiposImagen as readonly string[]).includes(String(f.imagen_tipo)) ? (String(f.imagen_tipo) as TipoImagen) : "afiche") : null,
    imagenBaja: Boolean(f.imagen_baja) && Boolean(f.imagen_medio_id),
    precioDesde: precioDesde(s(f.precio)),
    imagenes,
    imagenOrigen: f.imagen_medio_id ? comoOrigen(f.imagen_origen) : null,
    imagenPublicacion:
      f.imagen_medio_id && f.imagen_publicacion_url
        ? { url: String(f.imagen_publicacion_url), plataforma: String(f.imagen_plataforma ?? ""), cuenta: String(f.imagen_cuenta ?? ""), verificada: Boolean(f.imagen_cuenta_verificada), recuperada: s(f.imagen_recuperada) }
        : null,
  };
  // Se recalcula al leer: la antigüedad de la fuente y los ajustes del propietario cambian con el tiempo.
  return { ...e, estadoVisible: estadoVisible(e), confianza: calcularConfianza(e, fuentes, { hoy, ajustes }) };
}
export function leerEvento(id: string): Evento {
  const f = base().prepare("select * from eventos where id = ?").get(id) as Fila | undefined;
  if (!f) throw new WorkflowError("Evento no encontrado.", 404);
  const ajustes = leerConfianzaDominios();
  return aEvento(f, fuentesPorEvento([id], ajustes).get(id) ?? [], ajustes, diaLocal(new Date()), imagenesPorEvento(id).get(id) ?? []);
}
export function listarEventos(filtro: { estado?: EstadoVisible | null; desde?: string | null; hasta?: string | null; creadoEl?: string | null } = {}) {
  const ajustes = leerConfianzaDominios();
  const fuentes = fuentesPorEvento(null, ajustes);
  const hoy = diaLocal(new Date());
  const imagenes = imagenesPorEvento(null);
  const filas = (base().prepare("select * from eventos order by coalesce(fecha, '9999-12-31'), creado desc limit 2000").all() as Fila[]).map((f) =>
    aEvento(f, fuentes.get(String(f.id)) ?? [], ajustes, hoy, imagenes.get(String(f.id)) ?? []),
  );
  return filtrarEventos(filas, filtro);
}
/** Permite derivar conteos y lista de una misma lectura consistente. */
export function filtrarEventos(filas: Evento[], filtro: { estado?: EstadoVisible | null; desde?: string | null; hasta?: string | null; creadoEl?: string | null } = {}) {
  return filas.filter(
    (e) =>
      (!filtro.estado || e.estadoVisible === filtro.estado) &&
      (!filtro.desde || (e.fecha !== null && (e.fechaFin ?? e.fecha) >= filtro.desde)) &&
      (!filtro.hasta || (e.fecha !== null && e.fecha <= filtro.hasta)) &&
      (!filtro.creadoEl || diaLocal(new Date(e.creado)) === filtro.creadoEl),
  );
}
export function referenciasLocales(): Referencia[] {
  return (base().prepare("select id, titulo, fecha, fecha_fin as hasta, lugar from eventos").all() as { id: string; titulo: string; fecha: string | null; hasta: string | null; lugar: string }[]).map((r) => ({
    ...r,
    origen: "Ezra",
  }));
}
/** Evento al que ya pertenece una URL (su fuente principal o cualquiera de sus fuentes). */
export function eventoPorUrl(url: string): string | null {
  const f = base().prepare("select evento_id as id from evento_fuentes where url = ? union select id from eventos where fuente_url = ? limit 1").get(url, url) as { id: string } | undefined;
  return f?.id ?? null;
}
/** Eventos que trajo hoy una ejecución de la granja (las importaciones no cuentan para su máximo diario). */
export function eventosCreadosHoy(granjaId: string | null, ahora = new Date()) {
  const hoy = diaLocal(ahora);
  const fila = base()
    .prepare("select count(*) as n from eventos where ejecucion_id is not null and creado >= ? and creado < ? and (? is null or granja_id = ?)")
    .get(instanteLocal(hoy).toISOString(), instanteLocal(sumarDias(hoy, 1)).toISOString(), granjaId, granjaId) as { n: number };
  return Number(fila.n);
}

export type NuevoEvento = Omit<
  Evento,
  | "id"
  | "estado"
  | "motivoDescarte"
  | "spotmiEstado"
  | "spotmiPropuestaId"
  | "spotmiClave"
  | "spotmiConsultado"
  | "igEstado"
  | "huella"
  | "revision"
  | "creado"
  | "actualizado"
  | "estadoVisible"
  | "imagenMedioId"
  | "imagenPermiso"
  | "imagenConfirmada"
  | "fechaFin"
  | "origen"
  | "fuentes"
  | "confianza"
  | "cambios"
  | "imagenTipo"
  | "imagenBaja"
  | "precioDesde"
  | "imagenes"
  | "imagenOrigen"
  | "imagenPublicacion"
> & { fechaFin?: string | null; origen?: OrigenEvento; fuente?: Omit<NuevaFuente, "url"> };
export function crearEvento(datos: NuevoEvento): Evento {
  const id = crypto.randomUUID();
  const ahora = ahoraIso();
  transaccion(() => {
  base()
    .prepare(
      `insert into eventos (id, titulo, fecha, fecha_fin, hora, lugar, municipio, departamento, categoria, precio, boletos_url, fuente_url,
       confirmado_en, sugerencias, descripcion, imagen_url, estado, huella, nota_verificacion, granja_id, ejecucion_id, creado, actualizado, origen)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      datos.titulo,
      datos.fecha,
      datos.fechaFin ?? null,
      datos.hora,
      datos.lugar,
      datos.municipio,
      datos.departamento,
      datos.categoria,
      datos.precio,
      datos.boletosUrl,
      datos.fuenteUrl,
      JSON.stringify(datos.confirmadoEn),
      JSON.stringify(datos.sugerencias),
      datos.descripcion,
      datos.imagenUrl,
      huellaTitulo(datos.titulo),
      datos.notaVerificacion,
      datos.granjaId,
      datos.ejecucionId,
      ahora,
      ahora,
      datos.origen ?? "desconocido",
    );
  // La fuente principal es la primera de la lista; lo que confirmó sale de confirmadoEn.
  agregarFuente(id, {
    via: "web",
    campos: Object.entries(datos.confirmadoEn)
      .filter(([, v]) => v && v !== "propietario")
      .map(([k]) => k),
    datos: { fecha: datos.fecha ?? datos.sugerencias.fecha ?? null, hora: datos.hora ?? datos.sugerencias.hora ?? null, lugar: datos.lugar || null, precio: datos.precio ?? null },
    imagenUrl: datos.imagenUrl,
    ...datos.fuente,
    url: datos.fuenteUrl,
  });
  });
  return guardarConfianza(id);
}

/* ── Fuentes de cada evento ── */
/**
 * Suma una URL a las fuentes de un evento. Si ya estaba, actualiza la fecha de lectura,
 * une lo que confirmó y conserva lo último que decía. Devuelve true si la URL era nueva.
 */
export function agregarFuente(eventoId: string, f: NuevaFuente): boolean {
  return transaccion((db) => {
    const previa = db.prepare("select * from evento_fuentes where evento_id = ? and url = ?").get(eventoId, f.url) as FilaFuente | undefined;
    const ahora = ahoraIso();
    if (previa) {
      const campos = [...new Set([...json<string[]>(previa.campos, []), ...(f.campos ?? [])])];
      const datos = { ...json<object>(previa.datos, {}), ...Object.fromEntries(Object.entries(f.datos ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "")) };
      db.prepare("update evento_fuentes set leido = ?, campos = ?, datos = ?, imagen_url = coalesce(?, imagen_url), publicado = coalesce(?, publicado) where id = ?").run(
        ahora,
        JSON.stringify(campos),
        JSON.stringify(datos),
        f.imagenUrl ?? null,
        f.publicado ?? null,
        previa.id,
      );
      return false;
    }
    db.prepare(
      "insert into evento_fuentes (id, evento_id, url, via, cuenta, publicado, leido, campos, datos, imagen_url) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      crypto.randomUUID(),
      eventoId,
      f.url.slice(0, 1000),
      f.via,
      (f.cuenta ?? "").slice(0, 120),
      f.publicado ?? null,
      ahora,
      JSON.stringify([...new Set(f.campos ?? [])]),
      JSON.stringify(f.datos ?? {}),
      f.imagenUrl?.slice(0, 2000) ?? null,
    );
    return true;
  });
}
/** Guarda la confianza calculada (instantánea para exportar y para el resumen); la vista la recalcula al leer. */
export function guardarConfianza(id: string): Evento {
  const e = leerEvento(id);
  base()
    .prepare("update eventos set confianza = ?, confianza_desglose = ?, precio_desde = ? where id = ?")
    .run(e.confianza.puntos, JSON.stringify(e.confianza.desglose), e.precioDesde?.tipo === "desde" ? e.precioDesde.valor : e.precioDesde ? 0 : null, id);
  return e;
}
/**
 * Aplica cambios que trajo una fuente (fecha, hora, lugar o precio) y los anota con
 * el antes y el después. Un dato escrito por el propietario no se toca. Un evento
 * aprobado vuelve a «nuevo» (cambió un hecho); uno ya enviado a Spotmi no se cambia:
 * el cambio queda anotado como pendiente en la nota de verificación.
 */
export function aplicarCambios(id: string, cambios: Omit<CambioEvento, "fecha">[]): { evento: Evento; aplicados: CambioEvento[] } {
  return transaccion(() => {
    const e = leerEvento(id);
    const ahora = ahoraIso();
    const validos = cambios.filter((c) => c.antes !== c.despues && !(c.campo !== "lugar" && e.confirmadoEn[c.campo] === "propietario"));
    if (!validos.length) return { evento: e, aplicados: [] };
    const aplicados = validos.map((c) => ({ ...c, fecha: ahora }));
    const enSpotmi = e.spotmiEstado === "propuesto" || e.spotmiEstado === "aceptado";
    const historial = JSON.stringify([...e.cambios, ...aplicados].slice(-30));
    if (enSpotmi || (e.spotmiClave && !e.spotmiPropuestaId)) {
      const nota = aplicados.map((c) => `${c.campo}: ${c.antes ?? "—"} → ${c.despues ?? "—"} (${c.url})`).join("; ");
      auditar("evento.cambio_pendiente", id, { campos: aplicados.map((c) => c.campo) });
      return {
        evento: actualizar(id, { cambios: historial, nota_verificacion: `${e.notaVerificacion} Cambio detectado sin aplicar (ya está en Spotmi): ${nota}.`.trim().slice(0, 1500) }),
        aplicados: [],
      };
    }
    const columnas: Record<CambioEvento["campo"], string> = { fecha: "fecha", fechaFin: "fecha_fin", hora: "hora", lugar: "lugar", precio: "precio" };
    const confirmadoEn = { ...e.confirmadoEn };
    const set: Record<string, string | number | null> = {};
    for (const c of aplicados) {
      set[columnas[c.campo]] = c.campo === "lugar" ? (c.despues ?? "") : c.despues;
      if (c.campo !== "lugar") {
        if (c.despues) confirmadoEn[c.campo] = c.url;
        else delete confirmadoEn[c.campo];
      }
    }
    auditar("evento.actualizado", id, { campos: aplicados.map((c) => c.campo) });
    const evento = actualizar(id, { ...set, confirmado_en: JSON.stringify(confirmadoEn), cambios: historial, estado: e.estado === "aprobado" ? "nuevo" : e.estado });
    return { evento, aplicados };
  });
}

/* ── Acciones del propietario ── */
const urlHttps = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  }, "Usa un enlace https sin credenciales.");
export const edicionEventoSchema = z.object({
  titulo: z.string().trim().min(3).max(160),
  fecha: z.string().refine(diaValido, "Fecha AAAA-MM-DD.").nullable(),
  fechaFin: z.string().refine(diaValido, "Fecha AAAA-MM-DD.").nullable().default(null),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM.").nullable(),
  lugar: z.string().trim().max(200),
  municipio: z.string().trim().max(120),
  departamento: z.union([z.literal(""), z.enum(departamentos)]),
  categoria: z.enum(categoriasEvento),
  precio: z.string().trim().min(1).max(120).nullable(),
  boletosUrl: urlHttps.nullable(),
  fuenteUrl: urlHttps,
  descripcion: z.string().trim().max(300),
});
export type EdicionEvento = z.infer<typeof edicionEventoSchema>;
function exigir(evento: Evento, revision: number) {
  if (evento.revision !== revision) throw new WorkflowError("El evento cambió en otra ventana. Recarga la bandeja.", 409);
}
function actualizar(id: string, cambios: Record<string, string | number | null>) {
  const claves = Object.keys(cambios);
  const current = leerEvento(id);
  if (current.spotmiClave?.startsWith("ezra-publicar-") && !current.spotmiPropuestaId && claves.some((k) => !k.startsWith("spotmi_")))
    throw new WorkflowError("Hay una publicación a Spotmi sin confirmar. Reintenta «Publicar en Spotmi» antes de modificar el evento.", 409);
  // El permiso y el archivo forman parte de la versión editorial aprobada.
  if (current.estado === "aprobado" && claves.some((k) => k.startsWith("imagen_") && !["imagen_recuperada"].includes(k)))
    cambios.estado = "nuevo";
  const columnas = Object.keys(cambios);
  base()
    .prepare(`update eventos set ${columnas.map((k) => `${k} = ?`).join(", ")}, revision = revision + 1, actualizado = ? where id = ?`)
    .run(...columnas.map((k) => cambios[k]), ahoraIso(), id);
  return leerEvento(id);
}
export function aprobarEvento(id: string, revision: number) {
  return transaccion(() => {
    const e = leerEvento(id);
    exigir(e, revision);
    if (e.estado === "aprobado") return e;
    auditar("evento.aprobar", id);
    return actualizar(id, { estado: "aprobado", motivo_descarte: "" });
  });
}
export function descartarEvento(id: string, revision: number, motivo: string) {
  const limpio = motivo.trim();
  if (limpio.length < 3) throw new WorkflowError("Escribe el motivo del descarte.", 422);
  return transaccion(() => {
    const e = leerEvento(id);
    exigir(e, revision);
    if (e.spotmiEstado === "propuesto" || e.spotmiEstado === "aceptado")
      throw new WorkflowError("Este evento ya se envió a Spotmi. Descártalo también en la bandeja de Spotmi si hace falta.", 409);
    auditar("evento.descartar", id, { motivo: limpio.slice(0, 120) });
    return actualizar(id, { estado: "descartado", motivo_descarte: limpio.slice(0, 300) });
  });
}
/** Editar cambia hechos: un evento aprobado vuelve a «nuevo» y necesita aprobarse otra vez. */
export function editarEvento(id: string, revision: number, datos: unknown) {
  const d = edicionEventoSchema.parse(datos);
  return transaccion(() => {
    const e = leerEvento(id);
    exigir(e, revision);
    // Un evento pegado a mano desde una red puede conservar ese enlace como fuente; ningún otro.
    for (const url of [d.fuenteUrl, d.boletosUrl])
      if (url && esRedSocial(new URL(url).hostname.toLowerCase()) && !(url === d.fuenteUrl && e.origen === "manual" && url === e.fuenteUrl))
        throw new WorkflowError("Las redes sociales no sirven como fuente ni enlace de boletos. Usa el sitio oficial o la ticketera.", 422);
    // Si la red falló durante un envío, primero se reintenta con la misma clave: así no se duplica en Spotmi.
    if (e.spotmiClave && !e.spotmiPropuestaId)
      throw new WorkflowError("Hay un envío a Spotmi sin confirmar. Vuelve a pulsar «Enviar a Spotmi» antes de editar.", 409);
    const confirmadoEn = { ...e.confirmadoEn };
    // Un dato escrito a mano queda confirmado por el propietario, no por la fuente.
    if (d.fechaFin && (!d.fecha || d.fechaFin < d.fecha)) throw new WorkflowError("La fecha final debe ser igual o posterior a la de inicio.", 422);
    for (const campo of ["fecha", "fechaFin", "hora", "precio"] as const) {
      if (d[campo] !== e[campo]) {
        if (d[campo]) confirmadoEn[campo] = "propietario";
        else delete confirmadoEn[campo];
      }
    }
    auditar("evento.editar", id);
    actualizar(id, {
      titulo: d.titulo,
      fecha: d.fecha,
      fecha_fin: d.fechaFin,
      hora: d.hora,
      lugar: d.lugar,
      municipio: d.municipio,
      departamento: d.departamento,
      categoria: d.categoria,
      precio: d.precio,
      boletos_url: d.boletosUrl,
      fuente_url: d.fuenteUrl,
      descripcion: d.descripcion,
      confirmado_en: JSON.stringify(confirmadoEn),
      huella: huellaTitulo(d.titulo),
      estado: e.estado === "descartado" ? "descartado" : "nuevo",
    });
    if (d.fuenteUrl !== e.fuenteUrl) agregarFuente(id, { url: d.fuenteUrl, via: esRedSocial(new URL(d.fuenteUrl).hostname.toLowerCase()) ? "manual" : "web" });
    return guardarConfianza(id);
  });
}

/* ── «Pegar enlace»: evento escrito a mano desde un video o post de una red ── */
export const enlaceManualSchema = edicionEventoSchema.omit({ fuenteUrl: true }).extend({ url: urlHttps });
/**
 * El propietario pega la URL (por ejemplo, un video de TikTok) y escribe los datos.
 * Ezra no abre ni lee esa página. Si el evento ya existe, la URL se suma a sus fuentes.
 */
export function crearEventoManual(datos: unknown): { evento: Evento; duplicado: boolean } {
  const d = enlaceManualSchema.parse(datos);
  if (d.fechaFin && (!d.fecha || d.fechaFin < d.fecha)) throw new WorkflowError("La fecha final debe ser igual o posterior a la de inicio.", 422);
  const host = new URL(d.url).hostname.toLowerCase();
  const via = esRedSocial(host) ? ("manual" as const) : ("web" as const);
  const datosFuente = { fecha: d.fecha, hora: d.hora, lugar: d.lugar || null, precio: d.precio };
  const previo = buscarDuplicado({ titulo: d.titulo, fecha: d.fecha }, referenciasLocales());
  if (previo?.id) {
    agregarFuente(previo.id, { url: d.url, via, campos: ["titulo"], datos: datosFuente });
    auditar("evento.fuente_manual", previo.id, { dominio: host });
    return { evento: guardarConfianza(previo.id), duplicado: true };
  }
  const confirmadoEn: Evento["confirmadoEn"] = {};
  for (const campo of ["fecha", "fechaFin", "hora", "precio"] as const) if (d[campo]) confirmadoEn[campo] = "propietario";
  const evento = crearEvento({
    ...d,
    fuenteUrl: d.url,
    confirmadoEn,
    sugerencias: {},
    imagenUrl: null,
    notaVerificacion: `Datos escritos a mano desde ${host}; Ezra no lee esa página.`,
    granjaId: null,
    ejecucionId: null,
    origen: "manual",
    fuente: { via, campos: ["titulo"], datos: datosFuente },
  });
  auditar("evento.manual", evento.id, { dominio: host });
  return { evento, duplicado: false };
}
export function autorizarImagen(id: string, revision: number, medioId: string | null, permiso: string) {
  return transaccion(() => {
    const e = leerEvento(id);
    exigir(e, revision);
    if (medioId && permiso.trim().length < 3) throw new WorkflowError("Anota de dónde viene el permiso para usar la imagen.", 422);
    auditar("evento.imagen", id, { medioId });
    if (medioId) registrarImagen(id, { medioId, tipo: "afiche", url: null, permiso: permiso.trim().slice(0, 500), nota: "Elegida por el propietario.", origen: "web" });
    if (e.imagenMedioId !== medioId) invalidarPostsPorImagen(id);
    // Una imagen que el propietario elige y cuyo permiso anota queda confirmada (cuenta como afiche oficial).
    return actualizar(id, {
      imagen_medio_id: medioId,
      imagen_permiso: medioId ? permiso.trim().slice(0, 500) : "",
      imagen_confirmada: medioId ? 1 : 0,
      imagen_tipo: medioId ? "afiche" : null,
      imagen_baja: 0,
      imagen_origen: medioId ? "web" : null,
      imagen_publicacion_url: null,
      imagen_plataforma: null,
      imagen_cuenta: null,
      imagen_cuenta_verificada: 0,
      imagen_recuperada: null,
    });
  });
}
export type PublicacionOrigen = { url: string; plataforma: "instagram" | "facebook"; cuenta: string; verificada: boolean };
function registrarImagen(
  id: string,
  d: { medioId: string; tipo: TipoImagen; url: string | null; permiso: string; ia?: DatosIA | null; nota?: string; origen?: OrigenImagen | null; publicacion?: PublicacionOrigen | null },
) {
  base()
    .prepare(
      "insert into evento_imagenes (id, evento_id, medio_id, tipo, url, permiso, ia, nota, creado, origen, plataforma, cuenta, publicacion_url) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      crypto.randomUUID(),
      id,
      d.medioId,
      d.tipo,
      d.url?.slice(0, 1000) ?? null,
      d.permiso.slice(0, 500),
      d.ia ? JSON.stringify(d.ia) : null,
      (d.nota ?? "").slice(0, 300),
      ahoraIso(),
      d.origen ?? null,
      d.publicacion?.plataforma ?? null,
      d.publicacion?.cuenta.slice(0, 120) ?? null,
      d.publicacion?.url.slice(0, 1000) ?? null,
    );
}
/**
 * Un post de Instagram preparado con la imagen anterior deja de valer: vuelve a borrador con una nota.
 * (Los subidos no se tocan: ya están publicados a mano.)
 */
function invalidarPostsPorImagen(id: string) {
  const r = base()
    .prepare("update posts_ig set estado = 'borrador', nota = ?, revision = revision + 1, actualizado = ? where evento_id = ? and estado <> 'subido' and (estado <> 'borrador' or medio_id is not null)")
    .run("La imagen del evento cambió: rehaz la imagen del post antes de usarlo.", ahoraIso(), id);
  if (Number(r.changes)) auditar("post.invalidado_por_imagen", id);
}
/**
 * Imagen hallada (afiche, post, prensa) o generada (IA): queda pendiente de la confirmación del
 * propietario y entra al historial. Nunca reemplaza una imagen de tipo más alto ni una confirmada.
 */
export function ponerImagenFuente(
  id: string,
  medioId: string,
  url: string,
  permiso: string,
  opciones: {
    tipo?: TipoImagen;
    baja?: boolean;
    ia?: DatosIA | null;
    nota?: string;
    reemplazarIgual?: boolean;
    /** El propietario eligió esta imagen a mano: reemplaza la que haya (queda en el historial). */
    eleccionPropietario?: boolean;
    origen?: OrigenImagen;
    publicacion?: PublicacionOrigen | null;
  } = {},
) {
  const tipo = opciones.tipo ?? "afiche";
  const origen: OrigenImagen = opciones.origen ?? (tipo === "ia" ? "ia" : tipo === "prensa" ? "prensa" : tipo === "red" ? "original" : "web");
  return transaccion(() => {
    const e = leerEvento(id);
    const peor = e.imagenTipo ? prioridadImagen[e.imagenTipo] < prioridadImagen[tipo] || (opciones.reemplazarIgual && e.imagenTipo === tipo) : true;
    if (!opciones.eleccionPropietario && e.imagenTipo && (e.imagenConfirmada || !peor) && e.imagenMedioId !== medioId)
      throw new WorkflowError("El evento ya tiene una imagen igual o mejor.", 409);
    auditar("evento.imagen.fuente", id, { medioId, tipo, origen });
    registrarImagen(id, { medioId, tipo, url, permiso, ia: opciones.ia, nota: opciones.nota, origen, publicacion: opciones.publicacion });
    if (e.imagenMedioId && e.imagenMedioId !== medioId) invalidarPostsPorImagen(id);
    return actualizar(id, {
      imagen_medio_id: medioId,
      imagen_url: tipo === "ia" ? e.imagenUrl : url.slice(0, 1000),
      imagen_permiso: permiso.slice(0, 500),
      imagen_confirmada: 0,
      imagen_tipo: tipo,
      imagen_baja: opciones.baja ? 1 : 0,
      imagen_origen: origen,
      imagen_publicacion_url: opciones.publicacion?.url.slice(0, 1000) ?? null,
      imagen_plataforma: opciones.publicacion?.plataforma ?? null,
      imagen_cuenta: opciones.publicacion?.cuenta.slice(0, 120) ?? null,
      imagen_cuenta_verificada: opciones.publicacion?.verificada ? 1 : 0,
      imagen_recuperada: opciones.publicacion ? ahoraIso() : null,
    });
  });
}
/** Ficha encontrada en una ticketera permitida: pasa a ser el enlace de boletos si no había uno. */
export function ponerBoletos(id: string, url: string) {
  return transaccion(() => {
    const e = leerEvento(id);
    if (e.boletosUrl || (e.spotmiClave && !e.spotmiPropuestaId) || e.spotmiEstado === "propuesto" || e.spotmiEstado === "aceptado") return e;
    auditar("evento.boletos", id, { url: url.slice(0, 200) });
    // Un dato nuevo en un evento aprobado vuelve a revisión.
    return actualizar(id, { boletos_url: url.slice(0, 1000), estado: e.estado === "aprobado" ? "nuevo" : e.estado });
  });
}
/** «Usar imagen de la fuente»: un clic del propietario confirma el permiso. Nunca es automático. */
export function confirmarImagen(id: string, revision: number) {
  return transaccion(() => {
    const e = leerEvento(id);
    exigir(e, revision);
    if (!e.imagenMedioId) throw new WorkflowError("Este evento no tiene imagen que confirmar.", 409);
    // La referencia IA nunca pasa a imagen oficial: no se confirma ni llega al post ni a Spotmi.
    if (e.imagenTipo === "ia") throw new WorkflowError("La imagen de referencia generada con IA no se confirma como oficial.", 409);
    if (e.imagenConfirmada) return e;
    const hoy = new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeZone: "America/El_Salvador" }).format(new Date());
    const permiso = e.imagenPermiso.replace(/ · pendiente de tu confirmación$/, "") + ` · confirmada por ti el ${hoy}`;
    auditar("evento.imagen.confirmar", id, { medioId: e.imagenMedioId });
    return actualizar(id, { imagen_confirmada: 1, imagen_permiso: permiso.slice(0, 500) });
  });
}
export function marcarSpotmi(id: string, cambios: { estado?: Evento["spotmiEstado"]; propuestaId?: string | null; clave?: string | null }) {
  return actualizar(id, {
    ...(cambios.estado !== undefined ? { spotmi_estado: cambios.estado } : {}),
    ...(cambios.propuestaId !== undefined ? { spotmi_propuesta_id: cambios.propuestaId } : {}),
    ...(cambios.clave !== undefined ? { spotmi_clave: cambios.clave } : {}),
    ...(cambios.clave || cambios.propuestaId ? { spotmi_destino: destinoSpotmi() } : {}),
    spotmi_consultado: ahoraIso(),
  });
}
/**
 * Antes de enviar a un proyecto distinto del anterior, el envío anterior pasa a la auditoría (no se pierde)
 * y el evento queda libre para el destino actual. No cambia la revisión autorizada del evento.
 */
export function archivarEnvioDeOtroDestino(id: string) {
  const f = base().prepare("select * from eventos where id = ?").get(id) as Fila | undefined;
  if (!f || !deOtroDestino(f)) return false;
  auditar("evento.spotmi.envio_otro_destino", id, {
    destino: s(f.spotmi_destino),
    estado: s(f.spotmi_estado),
    propuesta: s(f.spotmi_propuesta_id),
    clave: s(f.spotmi_clave),
    nuevoDestino: destinoSpotmi(),
  });
  base()
    .prepare("update eventos set spotmi_estado = null, spotmi_propuesta_id = null, spotmi_clave = null, spotmi_destino = null where id = ?")
    .run(id);
  return true;
}
export function marcarInstagram(id: string, estado: Evento["igEstado"]) {
  return actualizar(id, { ig_estado: estado });
}

/* ── Respaldo sin Spotmi: ficha de texto, CSV y JSON ── */
const nombresCategoria: Record<CategoriaEvento, string> = {
  musica: "Música y conciertos",
  feria: "Feria",
  cultura: "Cultura y festivales",
  deporte: "Deporte",
  gastronomia: "Gastronomía",
  religioso: "Fiesta patronal o religiosa",
  otro: "Otro",
};
export const nombreCategoria = (c: CategoriaEvento) => nombresCategoria[c];
const porConfirmar = "por confirmar";
export function fichaTexto(e: Evento) {
  return [
    e.titulo,
    `Fecha: ${e.fecha ?? porConfirmar}${e.fechaFin ? ` al ${e.fechaFin}` : ""}`,
    `Hora: ${e.hora ?? porConfirmar}`,
    `Lugar: ${[e.lugar, e.municipio, e.departamento].filter(Boolean).join(", ") || porConfirmar}`,
    `Categoría: ${nombreCategoria(e.categoria)}`,
    `Precio: ${e.precio ?? porConfirmar}`,
    ...(e.boletosUrl ? [`Boletos: ${e.boletosUrl}`] : []),
    `Fuente: ${e.fuenteUrl}`,
    "",
    e.descripcion,
  ].join("\n");
}
const columnas = ["titulo", "fecha", "fecha_fin", "hora", "lugar", "municipio", "departamento", "categoria", "precio", "boletos", "fuente", "descripcion", "estado", "propuesta_spotmi"];
const celda = (v: string | null) => {
  const t = v ?? "";
  // Evita que una hoja de cálculo interprete fórmulas.
  const seguro = /^[=+\-@]/.test(t) ? `'${t}` : t;
  return /[",\n\r;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};
export function eventosCsv(lista: Evento[]) {
  const filas = lista.map((e) =>
    [e.titulo, e.fecha ?? porConfirmar, e.fechaFin, e.hora ?? porConfirmar, e.lugar, e.municipio, e.departamento, nombreCategoria(e.categoria), e.precio ?? porConfirmar, e.boletosUrl, e.fuenteUrl, e.descripcion, e.estadoVisible, e.spotmiPropuestaId]
      .map(celda)
      .join(","),
  );
  return `\uFEFF${[columnas.join(","), ...filas].join("\r\n")}\r\n`;
}
export function eventosJson(lista: Evento[]) {
  return lista.map((e) => ({
    titulo: e.titulo,
    fecha: e.fecha,
    fechaFin: e.fechaFin,
    hora: e.hora,
    lugar: e.lugar,
    municipio: e.municipio,
    departamento: e.departamento,
    categoria: e.categoria,
    precio: e.precio,
    boletos: e.boletosUrl,
    fuente: e.fuenteUrl,
    descripcion: e.descripcion,
    estado: e.estadoVisible,
    propuestaSpotmi: e.spotmiPropuestaId,
    // Solo una portada con permiso de reutilización confirmado sale en la exportación pública.
    portada: e.imagenMedioId && e.imagenConfirmada && e.imagenTipo !== "ia" ? { medio: e.imagenMedioId, permiso: e.imagenPermiso } : null,
    porConfirmar: (["fecha", "hora", "precio"] as const).filter((c) => !e[c]),
  }));
}
