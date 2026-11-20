import { WorkflowError } from "../workflow";
import { leerAjuste, guardarAjuste } from "../granjas/ajustes";
import { preferenciasSchema, widgetsPorDefecto, type Preferencias } from "./preferencias-modelo";
export * from "./preferencias-modelo";

/**
 * Personalización del estudio por usuario: widgets del Pulso (orden, tamaño, visibilidad y título),
 * tema por sección, nombre y rol visibles de cada agente y color por granja. Los números del tablero
 * nunca se guardan aquí: siempre salen de los datos.
 */
const clave = (usuario: string) => `preferencias:${usuario}`;

/** Completa la lista de widgets: los que falten (por ejemplo, uno nuevo de una versión posterior) van al final, ocultos. */
function completar(p: Preferencias): Preferencias {
  const base = p.widgets.length ? p.widgets : widgetsPorDefecto;
  const faltan = widgetsPorDefecto.filter((w) => !base.some((x) => x.id === w.id)).map((w) => ({ ...w, visible: !p.widgets.length }));
  return { ...p, widgets: [...base, ...faltan] };
}
export function leerPreferencias(usuario: string): Preferencias {
  return completar(leerAjuste(clave(usuario), preferenciasSchema, preferenciasSchema.parse({})));
}
/** Guarda con revisión optimista: si otra pestaña guardó antes, 409. */
export function guardarPreferencias(usuario: string, revision: number, cambios: unknown): Preferencias {
  const actual = leerPreferencias(usuario);
  if (actual.revision !== revision) throw new WorkflowError("Tus preferencias cambiaron en otra ventana. Recarga.", 409);
  const limpios = Object.fromEntries(Object.entries(cambios as Record<string, unknown>).filter(([, v]) => v !== undefined));
  const nuevo = preferenciasSchema.parse({ ...actual, ...limpios, revision: actual.revision + 1 });
  return completar(guardarAjuste(clave(usuario), preferenciasSchema, nuevo));
}
