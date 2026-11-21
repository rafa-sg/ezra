import { z } from "zod";
import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json, transaccion } from "./db";
import { encolar } from "./cola";
import { sha256 } from "./huella";
import { invalidarPieza, leerArtefacto, type Artefacto } from "./almacen";
import { actualizarPaso, avanzar, leerEjecucion, pasosDe, type Ejecucion } from "./ejecucion";
import { leerMedio, type Medio } from "./medios";
import { contenidoPiezaSchema, type ContenidoPieza } from "./pieza";
import { aprobarPieza, guardarPiezaNueva, leerPieza } from "./publicacion";
import type { ResultadoLocal } from "./pasos-eventos";
import {
  ajustesClips,
  momentosDeEntradas,
  subtitulosDeClip,
  videoDeEntradas,
  type ClipPropuesto,
  type Momentos,
  type Subtitulo,
} from "./clips";

/** Estado de cada clip: lo decide el propietario en «Tu revisión»; «cambios» vuelve a renderizar. */
export const estadosClip = ["renderizando", "por_revisar", "aprobado", "rechazado", "cambios", "fallido"] as const;
export type EstadoClip = (typeof estadosClip)[number];
export type Clip = {
  id: string;
  granjaId: string;
  ejecucionId: string;
  pasoId: string;
  origenMedioId: string;
  numero: number;
  version: number;
  inicio: number;
  fin: number;
  titulo: string;
  gancho: string;
  subtitulos: Subtitulo[];
  medioId: string | null;
  piezaId: string | null;
  estado: EstadoClip;
  motivo: string;
  error: string;
  creado: string;
  actualizado: string;
};
type FilaClip = {
  id: string;
  granja_id: string;
  ejecucion_id: string;
  paso_id: string;
  origen_medio_id: string;
  numero: number;
  version: number;
  inicio: number;
  fin: number;
  titulo: string;
  gancho: string;
  subtitulos: string;
  medio_id: string | null;
  pieza_id: string | null;
  estado: EstadoClip;
  motivo: string;
  error: string;
  creado: string;
  actualizado: string;
};
const aClip = (f: FilaClip): Clip => ({
  id: f.id,
  granjaId: f.granja_id,
  ejecucionId: f.ejecucion_id,
  pasoId: f.paso_id,
  origenMedioId: f.origen_medio_id,
  numero: f.numero,
  version: f.version,
  inicio: f.inicio,
  fin: f.fin,
  titulo: f.titulo,
  gancho: f.gancho,
  subtitulos: json<Subtitulo[]>(f.subtitulos, []),
  medioId: f.medio_id,
  piezaId: f.pieza_id,
  estado: f.estado,
  motivo: f.motivo,
  error: f.error,
  creado: f.creado,
  actualizado: f.actualizado,
});
export function leerClip(id: string): Clip {
  const f = base().prepare("select * from clips where id = ?").get(id) as FilaClip | undefined;
  if (!f) throw new WorkflowError("Clip no encontrado.", 404);
  return aClip(f);
}
export const clipsDeEjecucion = (ejecucionId: string) =>
  (base().prepare("select * from clips where ejecucion_id = ? order by numero").all(ejecucionId) as FilaClip[]).map(aClip);

const columnas: Record<string, string> = {
  version: "version",
  inicio: "inicio",
  fin: "fin",
  titulo: "titulo",
  gancho: "gancho",
  subtitulos: "subtitulos",
  medioId: "medio_id",
  piezaId: "pieza_id",
  estado: "estado",
  motivo: "motivo",
  error: "error",
};
export function actualizarClip(id: string, cambios: Partial<Omit<Clip, "id">>) {
  const pares = Object.entries(cambios).filter(([k]) => columnas[k]);
  const valores = pares.map(([, v]) => (Array.isArray(v) ? JSON.stringify(v) : (v as string | number | null)));
  base()
    .prepare(`update clips set ${pares.map(([k]) => `${columnas[k]} = ?`).join(", ")}${pares.length ? ", " : ""}actualizado = ? where id = ?`)
    .run(...valores, ahoraIso(), id);
  return leerClip(id);
}

function crearClip(ejecucion: Ejecucion, pasoId: string, video: Medio, numero: number, c: ClipPropuesto): Clip {
  const id = crypto.randomUUID();
  const ahora = ahoraIso();
  base()
    .prepare(
      `insert into clips (id, granja_id, ejecucion_id, paso_id, origen_medio_id, numero, version, inicio, fin, titulo, gancho, subtitulos, estado, creado, actualizado)
       values (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'renderizando', ?, ?)`,
    )
    .run(id, ejecucion.granjaId, ejecucion.id, pasoId, video.id, numero, c.inicio, c.fin, c.titulo, c.gancho, JSON.stringify(c.subtitulos), ahora, ahora);
  return leerClip(id);
}

/** Lo que queda del clip para el texto y el registro del artefacto. */
export const datosArtefactoClip = (c: Clip) =>
  JSON.stringify({ clipId: c.id, numero: c.numero, version: c.version, inicio: c.inicio, fin: c.fin, titulo: c.titulo, gancho: c.gancho });

export type RenderizarClip = (video: Medio, clip: ClipPropuesto, numero: number) => Promise<Medio>;
/**
 * Paso «Render de clips»: un clip vertical por momento propuesto. Si uno falla, los demás siguen;
 * si fallan todos, el paso falla. Volver a renderizar reemplaza los clips sin decisión del propietario.
 */
export async function renderClipsPaso(
  ejecucion: Ejecucion,
  pasoId: string,
  entradas: Artefacto[],
  renderizar: RenderizarClip,
  sigue: () => boolean,
): Promise<ResultadoLocal & { clips: { id: string; medio: Medio }[] }> {
  const video = videoDeEntradas(entradas);
  const momentos = momentosDeEntradas(entradas, video, ajustesClips(ejecucion));
  // Un render anterior de este mismo paso: se reemplaza; lo ya convertido en pieza se invalida.
  for (const viejo of clipsDeEjecucion(ejecucion.id).filter((c) => c.pasoId === pasoId)) {
    if (viejo.piezaId) invalidarPieza(viejo.piezaId, "El clip se volvió a renderizar.");
    base().prepare("delete from clips where id = ?").run(viejo.id);
  }
  const hechos: { id: string; medio: Medio }[] = [];
  const fallos: string[] = [];
  for (const [i, propuesta] of momentos.clips.entries()) {
    if (!sigue()) break;
    const clip = crearClip(ejecucion, pasoId, video, i + 1, propuesta);
    try {
      const medio = await renderizar(video, propuesta, clip.numero);
      actualizarClip(clip.id, { medioId: medio.id, estado: "por_revisar", error: "" });
      hechos.push({ id: clip.id, medio });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "Error al renderizar.";
      actualizarClip(clip.id, { estado: "fallido", error: mensaje.slice(0, 500) });
      fallos.push(`Clip ${clip.numero}: ${mensaje}`);
    }
  }
  if (!hechos.length) throw new WorkflowError(`No se pudo renderizar ningún clip. ${fallos.join(" ")}`.slice(0, 900), 502);
  auditar("clips.render", pasoId, { clips: hechos.length, fallidos: fallos.length });
  return {
    clips: hechos,
    artefactos: hechos.map(({ id, medio }) => ({ tipo: "video" as const, contenido: datosArtefactoClip(leerClip(id)), medioId: medio.id, medioSha: medio.sha256 })),
    detalle: `${hechos.length} clip(s) renderizados en 1080×1920 con subtítulos.${fallos.length ? ` ${fallos.length} fallaron: ${fallos.join(" ")}` : ""}`.slice(0, 900),
  };
}

/* ── 5 · Tu revisión, clip por clip ── */
type Comprobaciones = { hechos: boolean; derechos: boolean; marca: boolean };
function pasoRevisionDe(ejecucionId: string) {
  const e = leerEjecucion(ejecucionId);
  const nodo = e.instantanea.grafo.nodos.find((n) => n.tipo === "revision");
  const paso = nodo ? pasosDe(ejecucionId).find((p) => p.nodoId === nodo.id) : undefined;
  return { ejecucion: e, paso };
}
function exigirRevisionAbierta(clip: Clip) {
  const { ejecucion, paso } = pasoRevisionDe(clip.ejecucionId);
  if (ejecucion.estado === "cancelada") throw new WorkflowError("La ejecución está cancelada.", 422);
  if (!paso || paso.estado !== "en_revision") throw new WorkflowError("«Tu revisión» no está esperando decisiones ahora.", 422);
  return { ejecucion, paso };
}
/** Texto del clip para cada red: título, gancho y, si el video es de otra persona, su crédito. */
export function textoClip(clip: Pick<Clip, "titulo" | "gancho">, permiso: Medio["permiso"]) {
  const partes = [clip.titulo.trim()];
  if (clip.gancho.trim() && clip.gancho.trim() !== clip.titulo.trim()) partes.push(clip.gancho.trim());
  if (permiso?.tipo === "autorizado") partes.push(`Video: ${permiso.autor} (con permiso).`);
  return partes.join("\n\n");
}
function piezaDeClip(ejecucion: Ejecucion, revisionPasoId: string, clip: Clip) {
  const medio = leerMedio(clip.medioId!);
  const destinos = ejecucion.instantanea.grafo.nodos.find((n) => n.tipo === "publicacion")?.canales ?? [];
  const canales = (destinos.length ? destinos : ["youtube", "tiktok", "instagram"]).filter((c) =>
    ["youtube", "tiktok", "instagram"].includes(c),
  ) as ContenidoPieza["canales"];
  const texto = textoClip(clip, medio.permiso);
  const contenido = contenidoPiezaSchema.parse({
    titulo: `Clip ${clip.numero} · ${clip.titulo}`.slice(0, 160),
    textos: { spotmi: "", instagram: texto.slice(0, 2200), facebook: "", tiktok: texto.slice(0, 2200) },
    medios: [{ id: medio.id, sha256: medio.sha256, mime: medio.mime, generado: medio.generado, licencia: medio.licencia }],
    enlaces: [],
    canales,
    programacion: { tipo: "ahora" },
    divulgaciones: { creditos: medio.licencia.slice(0, 500), imagenGenerada: medio.generado },
    spotmi: { titulo: "", fecha: "", lugar: "", departamento: "", fuente: "" },
    // Sin fuentes de terceros: el clip sale de material propio o con permiso.
    fuentes: [],
  });
  return guardarPiezaNueva(ejecucion.granjaId, ejecucion.id, revisionPasoId, contenido);
}

/** Aprobar un clip: crea su vista previa por destino y aprueba esa versión exacta (su huella). */
export function aprobarClip(clipId: string, comprobaciones: Comprobaciones) {
  return transaccion(() => {
    const clip = leerClip(clipId);
    const { ejecucion, paso } = exigirRevisionAbierta(clip);
    if (clip.estado !== "por_revisar" || !clip.medioId) throw new WorkflowError("Este clip no está listo para revisar.", 422);
    if (!Object.values(comprobaciones).every(Boolean)) throw new WorkflowError("Confirma hechos, derechos y marca antes de aprobar.", 422);
    const pieza = piezaDeClip(ejecucion, paso.id, clip);
    aprobarPieza(pieza.id, pieza.hash, comprobaciones);
    actualizarClip(clip.id, { estado: "aprobado", piezaId: pieza.id, motivo: "" });
    auditar("clip.aprobar", clip.id, { version: clip.version, pieza: pieza.id, hash: pieza.hash });
    cerrarRevisionSiCompleta(ejecucion.id);
    return leerClip(clip.id);
  });
}
export function rechazarClip(clipId: string, motivo: string) {
  return transaccion(() => {
    const clip = leerClip(clipId);
    const { ejecucion } = exigirRevisionAbierta(clip);
    if (!["por_revisar", "fallido"].includes(clip.estado)) throw new WorkflowError("Solo puedes rechazar un clip pendiente de revisión.", 422);
    if (motivo.trim().length < 3) throw new WorkflowError("Escribe el motivo del rechazo.", 422);
    actualizarClip(clip.id, { estado: "rechazado", motivo: motivo.trim().slice(0, 500) });
    auditar("clip.rechazar", clip.id, { version: clip.version });
    cerrarRevisionSiCompleta(ejecucion.id);
    return leerClip(clip.id);
  });
}

export const cambiosClipSchema = z.object({
  motivo: z.string().trim().min(3, "Escribe qué quieres cambiar.").max(500),
  inicio: z.number().min(0).optional(),
  fin: z.number().min(0).optional(),
  titulo: z.string().trim().min(1).max(90).optional(),
  gancho: z.string().trim().max(120).optional(),
});
/** La transcripción guardada por «Momentos» (para rehacer los subtítulos si cambian los tiempos). */
function transcripcionDe(ejecucion: Ejecucion): Momentos["transcripcion"] {
  const nodo = ejecucion.instantanea.grafo.nodos.find((n) => n.tipo === "agente" && n.agente === "shorts");
  const paso = nodo ? pasosDe(ejecucion.id).find((p) => p.nodoId === nodo.id) : undefined;
  for (const id of [...(paso?.salidas ?? [])].reverse()) {
    try {
      const datos = JSON.parse(leerArtefacto(id).contenido) as Partial<Momentos>;
      if (Array.isArray(datos.transcripcion)) return datos.transcripcion;
    } catch {
      /* no es el JSON de momentos */
    }
  }
  return [];
}
/** Pedir cambios: ajusta tiempos o textos y vuelve a renderizar solo ese clip; después vuelve a tu revisión. */
export function pedirCambiosClip(clipId: string, crudo: unknown) {
  const cambios = cambiosClipSchema.parse(crudo);
  return transaccion(() => {
    const clip = leerClip(clipId);
    const { ejecucion } = exigirRevisionAbierta(clip);
    if (clip.estado !== "por_revisar") throw new WorkflowError("Solo puedes pedir cambios a un clip pendiente de revisión.", 422);
    const video = leerMedio(clip.origenMedioId);
    const a = ajustesClips(ejecucion);
    const inicio = cambios.inicio ?? clip.inicio;
    const fin = Math.min(cambios.fin ?? clip.fin, video.duracion ?? Infinity);
    if (fin - inicio < a.segundosMin - 1 || fin - inicio > a.segundosMax + 1)
      throw new WorkflowError(`El clip debe durar de ${a.segundosMin} a ${a.segundosMax} s.`, 422);
    const tiempos = inicio !== clip.inicio || fin !== clip.fin;
    actualizarClip(clip.id, {
      estado: "cambios",
      motivo: cambios.motivo,
      inicio,
      fin,
      titulo: cambios.titulo ?? clip.titulo,
      gancho: cambios.gancho ?? clip.gancho,
      ...(tiempos ? { subtitulos: subtitulosDeClip(transcripcionDe(ejecucion), inicio, fin) } : {}),
      error: "",
    });
    encolar("clip", { clipId: clip.id }, { ejecucionId: ejecucion.id, clave: `clip:${clip.id}:${clip.version + 1}` });
    auditar("clip.cambios", clip.id, { version: clip.version, motivo: cambios.motivo });
    return leerClip(clip.id);
  });
}
/** Trabajo de la cola: rehace un clip con los cambios pedidos y crea una versión nueva. */
export async function rehacerClip(clipId: string, renderizar: RenderizarClip) {
  const clip = leerClip(clipId);
  if (clip.estado !== "cambios") return;
  const video = leerMedio(clip.origenMedioId);
  try {
    const medio = await renderizar(video, { inicio: clip.inicio, fin: clip.fin, titulo: clip.titulo, gancho: clip.gancho, motivo: "", subtitulos: clip.subtitulos }, clip.numero);
    if (leerClip(clipId).estado !== "cambios") return;
    actualizarClip(clipId, { medioId: medio.id, version: clip.version + 1, estado: "por_revisar", error: "" });
    auditar("clip.rehacer", clipId, { version: clip.version + 1, medio: medio.id });
  } catch (error) {
    actualizarClip(clipId, { estado: "fallido", error: (error instanceof Error ? error.message : "Error al renderizar.").slice(0, 500) });
  }
}

/** Cuando ya decidiste todos los clips: con al menos uno aprobado, la revisión se aprueba y pasa a Destinos. */
export function cerrarRevisionSiCompleta(ejecucionId: string) {
  const { paso } = pasoRevisionDe(ejecucionId);
  if (!paso || paso.estado !== "en_revision") return;
  const lista = clipsDeEjecucion(ejecucionId);
  if (!lista.length || lista.some((c) => ["renderizando", "por_revisar", "cambios"].includes(c.estado))) return;
  const aprobados = lista.filter((c) => c.estado === "aprobado" && c.piezaId);
  if (!aprobados.length) {
    actualizarPaso(paso.id, { estado: "bloqueado", detalle: "Rechazaste todos los clips. Ajusta los momentos o sube otro video.", fin: ahoraIso() });
    avanzar(ejecucionId);
    return;
  }
  const hash = sha256(aprobados.map((c) => leerPieza(c.piezaId!).hash).sort().join("\n"));
  base()
    .prepare("insert into aprobaciones (id, objeto, objeto_id, hash, comprobaciones, estado, creado) values (?, 'paso', ?, ?, ?, 'vigente', ?)")
    .run(crypto.randomUUID(), paso.id, hash, JSON.stringify({ hechos: true, derechos: true, marca: true }), ahoraIso());
  actualizarPaso(paso.id, {
    estado: "aprobado",
    salidas: paso.entradas,
    detalle: `${aprobados.length} de ${lista.length} clips aprobados.`,
    fin: ahoraIso(),
  });
  auditar("paso.aprobar", paso.id, { hash, clips: aprobados.length });
  avanzar(ejecucionId);
}
