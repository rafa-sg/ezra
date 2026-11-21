import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json } from "./db";
import { invalidarPieza, type Artefacto } from "./almacen";
import type { Ejecucion } from "./ejecucion";
import type { Medio } from "./medios";
import type { ResultadoLocal } from "./pasos-eventos";
import { ajustesClips, momentosDeEntradas, videoDeEntradas, type ClipPropuesto, type Subtitulo } from "./clips";

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
