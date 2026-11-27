import type { Evento } from "./granjas/eventos";

/** La lista no transporta historiales, prompts ni datos editoriales de la ficha. */
export type EventSummary = Pick<
  Evento,
  | "id"
  | "titulo"
  | "fecha"
  | "fechaFin"
  | "hora"
  | "lugar"
  | "municipio"
  | "departamento"
  | "categoria"
  | "precioDesde"
  | "fuenteUrl"
  | "estado"
  | "estadoVisible"
  | "revision"
  | "imagenMedioId"
  | "imagenConfirmada"
  | "imagenPermiso"
  | "imagenTipo"
  | "imagenBaja"
  | "confianza"
  | "spotmiPropuestaId"
  | "descripcion"
> & { sourceAccount: string; changesCount: number };

export function summarizeEvent(event: Evento): EventSummary {
  const source = event.fuentes.find((f) => f.url === event.fuenteUrl) ?? event.fuentes[0];
  return {
    id: event.id,
    titulo: event.titulo,
    fecha: event.fecha,
    fechaFin: event.fechaFin,
    hora: event.hora,
    lugar: event.lugar,
    municipio: event.municipio,
    departamento: event.departamento,
    categoria: event.categoria,
    precioDesde: event.precioDesde,
    fuenteUrl: event.fuenteUrl,
    estado: event.estado,
    estadoVisible: event.estadoVisible,
    revision: event.revision,
    imagenMedioId: event.imagenMedioId,
    imagenConfirmada: event.imagenConfirmada,
    imagenPermiso: event.imagenPermiso,
    imagenTipo: event.imagenTipo,
    imagenBaja: event.imagenBaja,
    confianza: event.confianza,
    spotmiPropuestaId: event.spotmiPropuestaId,
    descripcion: event.descripcion,
    sourceAccount: source?.cuenta ?? "",
    changesCount: event.cambios.length,
  };
}
