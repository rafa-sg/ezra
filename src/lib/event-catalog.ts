import type { Evento } from "./granjas/eventos";

/** Only reviewed, dated events belong in the visitor preview. Never implies publication. */
export function catalogEvents<T extends Pick<Evento, "estado" | "fecha" | "fechaFin">>(events: T[], today: string) {
  return events
    .filter(
      (event) =>
        event.estado === "aprobado" && event.fecha && (event.fechaFin || event.fecha) >= today,
    )
    .sort((a, b) => a.fecha!.localeCompare(b.fecha!));
}

export function eventSource(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

export function eventCover(
  event: Pick<Evento, "imagenMedioId" | "imagenConfirmada" | "imagenPermiso" | "imagenTipo">,
  thumbnail?: 160 | 480,
): string | null {
  return event.imagenMedioId &&
    event.imagenConfirmada &&
    event.imagenPermiso.trim() &&
    event.imagenTipo !== "ia"
    ? `/api/granjas/medios/${encodeURIComponent(event.imagenMedioId)}${thumbnail ? `?thumbnail=${thumbnail}` : ""}`
    : null;
}
