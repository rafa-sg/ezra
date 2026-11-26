import { sumarDias } from "./granjas/tiempo";

type DatedEvent = { fecha: string | null; fechaFin?: string | null };

/** Se ocultan al cumplir dos días de calendario desde el cierre, sin archivar ni borrar. */
export function expiredInInbox(event: DatedEvent, today: string): boolean {
  const end = event.fechaFin ?? event.fecha;
  return Boolean(end && end <= sumarDias(today, -2));
}

export function inboxEvents<T extends DatedEvent>(
  events: T[],
  options: { today: string; includeExpired?: boolean; search?: string; from?: string; until?: string },
): T[] {
  const historical = options.includeExpired || options.search?.trim() || options.from || options.until;
  return historical ? events : events.filter((event) => !expiredInInbox(event, options.today));
}
