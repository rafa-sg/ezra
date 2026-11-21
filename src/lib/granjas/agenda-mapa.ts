/**
 * Agenda del mapa de Inicio: eventos confirmados (fecha conocida, no descartados) y vigentes
 * (terminan hoy o después, en hora de El Salvador), sin duplicados y ordenados por fecha.
 * El marcador de cada departamento y su listado salen de esta misma función.
 */
export const SIN_UBICACION = "sin_ubicacion";

export type EventoMapa = {
  id: string;
  titulo: string;
  fecha: string | null;
  fechaFin?: string | null;
  hora?: string | null;
  lugar: string;
  municipio: string;
  departamento: string | null;
  estado: string;
  fuenteUrl?: string | null;
};

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Clave de duplicado: mismo título (sin acentos ni signos), mismo día y mismo departamento. */
export const claveDuplicado = (e: EventoMapa) => `${normal(e.titulo)}|${e.fecha ?? ""}|${e.departamento ?? ""}`;

export function agendaVigente<T extends EventoMapa>(eventos: T[], hoy: string): Map<string, T[]> {
  const elegidos = new Map<string, T>();
  for (const e of eventos) {
    if (e.estado === "descartado" || !e.fecha) continue;
    if ((e.fechaFin ?? e.fecha).slice(0, 10) < hoy) continue;
    const k = claveDuplicado(e);
    const previo = elegidos.get(k);
    // Entre duplicados se queda el aprobado (o el que trae hora confirmada).
    if (!previo || (previo.estado !== "aprobado" && (e.estado === "aprobado" || (!previo.hora && e.hora)))) elegidos.set(k, e);
  }
  const orden = (a: T, b: T) =>
    (a.fecha ?? "").localeCompare(b.fecha ?? "") ||
    (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99") ||
    a.titulo.localeCompare(b.titulo, "es");
  const por = new Map<string, T[]>();
  for (const e of [...elegidos.values()].sort(orden)) {
    const d = e.departamento || SIN_UBICACION;
    por.set(d, [...(por.get(d) ?? []), e]);
  }
  return por;
}
