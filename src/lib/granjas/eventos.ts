import { z } from "zod";
import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json, transaccion } from "./db";
import { diaLocal, diaValido, instanteLocal, sumarDias } from "./tiempo";

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
export function parecido(a: string, b: string) {
  const x = new Set(palabrasClave(a));
  const y = new Set(palabrasClave(b));
  if (!x.size || !y.size) return 0;
  const comunes = [...x].filter((p) => y.has(p)).length;
  const jaccard = comunes / new Set([...x, ...y]).size;
  // «Festival del Maíz» y «Festival del Maíz de Suchitoto 2026»: uno contiene al otro.
  const contenido = comunes / Math.min(x.size, y.size);
  return Math.max(jaccard, Math.min(x.size, y.size) >= 2 ? contenido * 0.9 : 0);
}
export type Referencia = { titulo: string; fecha: string | null; lugar?: string | null; origen: string };
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
  hora: string | null;
  lugar: string;
  municipio: string;
  departamento: string;
  categoria: CategoriaEvento;
  precio: string | null;
  boletosUrl: string | null;
  fuenteUrl: string;
  confirmadoEn: Partial<Record<"fecha" | "hora" | "precio", string>>;
  sugerencias: Partial<Record<"fecha" | "hora" | "precio", string>>;
  descripcion: string;
  imagenUrl: string | null;
  imagenMedioId: string | null;
  imagenPermiso: string;
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
};
type Fila = Record<string, string | number | null>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
export function estadoVisible(e: Pick<Evento, "estado" | "spotmiEstado" | "igEstado">): EstadoVisible {
  if (e.igEstado === "subido") return "subido_ig";
  if (e.spotmiEstado === "aceptado") return "aceptado";
  if (e.spotmiEstado === "propuesto") return "propuesto";
  return e.estado;
}
function aEvento(f: Fila): Evento {
  const e = {
    id: String(f.id),
    titulo: String(f.titulo),
    fecha: s(f.fecha),
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
    estado: f.estado as Evento["estado"],
    motivoDescarte: String(f.motivo_descarte ?? ""),
    spotmiEstado: s(f.spotmi_estado) as Evento["spotmiEstado"],
    spotmiPropuestaId: s(f.spotmi_propuesta_id),
    spotmiClave: s(f.spotmi_clave),
    spotmiConsultado: s(f.spotmi_consultado),
    igEstado: s(f.ig_estado) as Evento["igEstado"],
    huella: String(f.huella),
    notaVerificacion: String(f.nota_verificacion ?? ""),
    granjaId: s(f.granja_id),
    ejecucionId: s(f.ejecucion_id),
    revision: Number(f.revision),
    creado: String(f.creado),
    actualizado: String(f.actualizado),
  };
  return { ...e, estadoVisible: estadoVisible(e) };
}
export function leerEvento(id: string): Evento {
  const f = base().prepare("select * from eventos where id = ?").get(id) as Fila | undefined;
  if (!f) throw new WorkflowError("Evento no encontrado.", 404);
  return aEvento(f);
}
export function listarEventos(filtro: { estado?: EstadoVisible | null; desde?: string | null; hasta?: string | null; creadoEl?: string | null } = {}) {
  const filas = (base().prepare("select * from eventos order by coalesce(fecha, '9999-12-31'), creado desc limit 2000").all() as Fila[]).map(aEvento);
  return filas.filter(
    (e) =>
      (!filtro.estado || e.estadoVisible === filtro.estado) &&
      (!filtro.desde || (e.fecha !== null && e.fecha >= filtro.desde)) &&
      (!filtro.hasta || (e.fecha !== null && e.fecha <= filtro.hasta)) &&
      (!filtro.creadoEl || diaLocal(new Date(e.creado)) === filtro.creadoEl),
  );
}
export function referenciasLocales(): Referencia[] {
  return (base().prepare("select titulo, fecha, lugar from eventos").all() as { titulo: string; fecha: string | null; lugar: string }[]).map((r) => ({
    ...r,
    origen: "Ezra",
  }));
}
export function eventosCreadosHoy(granjaId: string | null, ahora = new Date()) {
  const hoy = diaLocal(ahora);
  const fila = base()
    .prepare("select count(*) as n from eventos where creado >= ? and creado < ? and (? is null or granja_id = ?)")
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
>;
export function crearEvento(datos: NuevoEvento): Evento {
  const id = crypto.randomUUID();
  const ahora = ahoraIso();
  base()
    .prepare(
      `insert into eventos (id, titulo, fecha, hora, lugar, municipio, departamento, categoria, precio, boletos_url, fuente_url,
       confirmado_en, sugerencias, descripcion, imagen_url, estado, huella, nota_verificacion, granja_id, ejecucion_id, creado, actualizado)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      datos.titulo,
      datos.fecha,
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
    );
  return leerEvento(id);
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
  base()
    .prepare(`update eventos set ${claves.map((k) => `${k} = ?`).join(", ")}, revision = revision + 1, actualizado = ? where id = ?`)
    .run(...claves.map((k) => cambios[k]), ahoraIso(), id);
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
  for (const url of [d.fuenteUrl, d.boletosUrl])
    if (url && dominiosProhibidos.some((p) => new URL(url).hostname === p || new URL(url).hostname.endsWith(`.${p}`)))
      throw new WorkflowError("Las redes sociales no sirven como fuente ni enlace de boletos. Usa el sitio oficial o la ticketera.", 422);
  return transaccion(() => {
    const e = leerEvento(id);
    exigir(e, revision);
    // Si la red falló durante un envío, primero se reintenta con la misma clave: así no se duplica en Spotmi.
    if (e.spotmiClave && !e.spotmiPropuestaId)
      throw new WorkflowError("Hay un envío a Spotmi sin confirmar. Vuelve a pulsar «Enviar a Spotmi» antes de editar.", 409);
    const confirmadoEn = { ...e.confirmadoEn };
    // Un dato escrito a mano queda confirmado por el propietario, no por la fuente.
    for (const campo of ["fecha", "hora", "precio"] as const) {
      if (d[campo] !== e[campo]) {
        if (d[campo]) confirmadoEn[campo] = "propietario";
        else delete confirmadoEn[campo];
      }
    }
    auditar("evento.editar", id);
    return actualizar(id, {
      titulo: d.titulo,
      fecha: d.fecha,
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
  });
}
export function autorizarImagen(id: string, revision: number, medioId: string | null, permiso: string) {
  return transaccion(() => {
    const e = leerEvento(id);
    exigir(e, revision);
    if (medioId && permiso.trim().length < 3) throw new WorkflowError("Anota de dónde viene el permiso para usar la imagen.", 422);
    auditar("evento.imagen", id, { medioId });
    return actualizar(id, { imagen_medio_id: medioId, imagen_permiso: medioId ? permiso.trim().slice(0, 500) : "" });
  });
}
export function marcarSpotmi(id: string, cambios: { estado?: Evento["spotmiEstado"]; propuestaId?: string | null; clave?: string | null }) {
  return actualizar(id, {
    ...(cambios.estado !== undefined ? { spotmi_estado: cambios.estado } : {}),
    ...(cambios.propuestaId !== undefined ? { spotmi_propuesta_id: cambios.propuestaId } : {}),
    ...(cambios.clave !== undefined ? { spotmi_clave: cambios.clave } : {}),
    spotmi_consultado: ahoraIso(),
  });
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
    `Fecha: ${e.fecha ?? porConfirmar}`,
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
const columnas = ["titulo", "fecha", "hora", "lugar", "municipio", "departamento", "categoria", "precio", "boletos", "fuente", "descripcion", "estado", "propuesta_spotmi"];
const celda = (v: string | null) => {
  const t = v ?? "";
  // Evita que una hoja de cálculo interprete fórmulas.
  const seguro = /^[=+\-@]/.test(t) ? `'${t}` : t;
  return /[",\n\r;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};
export function eventosCsv(lista: Evento[]) {
  const filas = lista.map((e) =>
    [e.titulo, e.fecha ?? porConfirmar, e.hora ?? porConfirmar, e.lugar, e.municipio, e.departamento, nombreCategoria(e.categoria), e.precio ?? porConfirmar, e.boletosUrl, e.fuenteUrl, e.descripcion, e.estadoVisible, e.spotmiPropuestaId]
      .map(celda)
      .join(","),
  );
  return `\uFEFF${[columnas.join(","), ...filas].join("\r\n")}\r\n`;
}
export function eventosJson(lista: Evento[]) {
  return lista.map((e) => ({
    titulo: e.titulo,
    fecha: e.fecha,
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
    porConfirmar: (["fecha", "hora", "precio"] as const).filter((c) => !e[c]),
  }));
}
