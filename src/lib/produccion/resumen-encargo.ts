import type { Agente, Encargo } from "./modelo";
import { siguienteAccion, type SiguienteAccion } from "./modelo";

/**
 * Resumen de un encargo para la lista y el detalle (sin dependencias del servidor). Separa tres estados
 * que no significan lo mismo:
 *  - editorial: borrador, pendiente de revisión, cambios solicitados, aprobado o rechazado;
 *  - ejecución: sin ejecutar, completada o fallida (según el historial; «ejecutándose» lo sabe la interfaz);
 *  - entrega por destino: los encargos no se publican solos: aprobado = listo para descargar o copiar.
 * «Aprobado» nunca significa «publicado».
 */
export type TipoResultado = "eventos" | "post" | "guion" | "video" | "imagen" | "texto" | "informe";
const tipos: Record<Agente, TipoResultado> = {
  cazador: "eventos",
  verificador: "eventos",
  guion: "guion",
  edicion: "video",
  retencion: "informe",
  shorts: "guion",
  miniatura: "imagen",
  comentarios: "texto",
  semana: "texto",
  descripcion: "texto",
  capitulos: "texto",
  auditoria: "informe",
  redactor_ig: "post",
  disenador_post: "imagen",
  imagen_evento: "imagen",
};
export const tipoResultado = (agente: Agente): TipoResultado => tipos[agente] ?? "texto";

export type EstadoEditorial = "borrador" | "pendiente_revision" | "cambios_solicitados" | "aprobado" | "rechazado";
export function estadoEditorial(e: Pick<Encargo, "estado" | "notaCambios">): EstadoEditorial {
  if (e.estado === "rechazado") return "rechazado";
  if (e.estado === "aprobado") return "aprobado";
  if (e.estado === "revision") return "pendiente_revision";
  return e.notaCambios ? "cambios_solicitados" : "borrador";
}

export type EstadoEjecucion = { estado: "sin_ejecutar" | "completada" | "fallida"; fecha: string | null; proveedor: string | null; motivo: string };
/** La última ejecución con IA según el historial: «generado» = completada; «fallo» = fallida. */
export function estadoEjecucion(e: Pick<Encargo, "historial" | "origenResultado">): EstadoEjecucion {
  const ultima = [...(e.historial ?? [])].reverse().find((h) => h.accion === "generado" || h.accion === "fallo");
  if (!ultima) return { estado: "sin_ejecutar", fecha: null, proveedor: null, motivo: "" };
  if (ultima.accion === "fallo") {
    const [proveedor, ...resto] = ultima.nota.split(": ");
    return { estado: "fallida", fecha: ultima.fecha, proveedor: resto.length ? proveedor : null, motivo: resto.length ? resto.join(": ") : ultima.nota };
  }
  return { estado: "completada", fecha: ultima.fecha, proveedor: e.origenResultado === "manual" ? null : e.origenResultado, motivo: "" };
}

export type EstadoEntrega = "no_enviada" | "lista_para_descargar";
/** Entrega por destino: no hay publicación automática de encargos; aprobado = listo para usar a mano. */
export function estadoEntrega(e: Pick<Encargo, "estado" | "canales">): { canal: string; estado: EstadoEntrega }[] {
  return e.canales.map((canal) => ({ canal, estado: e.estado === "aprobado" ? "lista_para_descargar" : "no_enviada" }));
}

/** Qué está pasando (una frase) y la acción principal según el estado. */
export function etapa(e: Pick<Encargo, "estado" | "resultado" | "notaCambios" | "fechaPrevista" | "historial" | "origenResultado">): { etapa: string; accion: SiguienteAccion | "reintentar" } {
  const ej = estadoEjecucion(e);
  const sig = siguienteAccion(e);
  if (ej.estado === "fallida" && !e.resultado.trim() && (e.estado === "pendiente" || e.estado === "preparando")) return { etapa: "fallo", accion: "reintentar" };
  const etapas: Record<SiguienteAccion, string> = {
    ejecutar: "sin_resultado",
    aplicar_cambios: "cambios",
    enviar_revision: "resultado_listo",
    terminar_preparacion: "preparando",
    revisar: "por_revisar",
    planificar: "aprobado_sin_fecha",
    exportar: "aprobado_listo",
    reabrir: "rechazado",
  };
  return { etapa: etapas[sig], accion: sig };
}

/** Eventos y fuentes de un encargo por URL exacta (nunca por parecido del título). */
export const urlsDeFuentes = (e: Pick<Encargo, "fuentes">) => [...new Set(e.fuentes.map((f) => f.url))];
