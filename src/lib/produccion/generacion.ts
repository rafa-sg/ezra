import { guardarProduccion, leerProduccion } from "./almacen";
import { anotar, crearEncargo, editarEncargo, type Encargo } from "./modelo";
import { WorkflowError } from "../workflow";
import type { EntregaIA } from "./proveedores";

export function mesEnElSalvador(fecha: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(fecha));
}
async function usosGranjas(ahora: string) {
  const { usosGranjasDelMes } = await import("../granjas/pasos");
  return usosGranjasDelMes(ahora);
}
export async function reservarGeneracion(
  id: string,
  revision: number,
  ahora = new Date().toISOString(),
) {
  let encargo: Encargo | undefined;
  // El límite de 30 intentos es compartido con las granjas.
  const deGranjas = await usosGranjas(ahora);
  await guardarProduccion(revision, (actual) => {
    encargo = actual.encargos.find((e) => e.id === id);
    if (!encargo) throw new WorkflowError("Encargo no encontrado.", 404);
    if (!encargo.encargo.trim() || !encargo.fuentes.length)
      throw new WorkflowError("Agrega instrucciones y al menos una fuente antes de generar.", 422);
    // Gemini se controla con el presupuesto de tokens (Consumo); los 30 intentos son de Astra y Claude.
    if (encargo.proveedor === "gemini") return actual;
    if (actual.usos.filter((u) => mesEnElSalvador(u.fecha) === mesEnElSalvador(ahora)).length + deGranjas >= 30)
      throw new WorkflowError(
        "Se alcanzó el límite de 30 intentos mensuales de IA de este estudio.",
        429,
      );
    return { ...actual, usos: [...actual.usos, { fecha: ahora, encargoId: id }].slice(-10000) };
  });
  return encargo!;
}
/** Una edición concurrente conserva el resultado separado y nunca pisa la versión nueva. */
export async function guardarEntrega(encargo: Encargo, entrega: EntregaIA) {
  for (let intento = 0; intento < 4; intento++) {
    const actual = await leerProduccion();
    let encargoId = "";
    try {
      const produccion = await guardarProduccion(actual.revision, (estado) => {
        const vigente = estado.encargos.find((e) => e.id === encargo.id);
        const mismaVersion = vigente?.version === encargo.version;
        const siguiente = mismaVersion
          ? editarEncargo(vigente, { ...vigente, resultado: entrega.texto })
          : crearEncargo({
              ...encargo,
              titulo: `${encargo.titulo.slice(0, 155)} · resultado IA`,
              resultado: entrega.texto,
            });
        siguiente.estado = "revision";
        siguiente.comprobaciones = { hechos: false, derechos: false, marca: false };
        siguiente.origenResultado = encargo.proveedor;
        siguiente.busquedaHtml = entrega.busquedaHtml;
        const anotado = anotar(siguiente, "generado", { nota: `Entrega de ${encargo.proveedor}.`, resultado: entrega.texto });
        Object.assign(siguiente, { historial: anotado.historial });
        encargoId = siguiente.id;
        return {
          ...estado,
          encargos: mismaVersion
            ? estado.encargos.map((e) => (e.id === siguiente.id ? siguiente : e))
            : [siguiente, ...estado.encargos],
        };
      });
      return { produccion, encargoId };
    } catch (error) {
      if (!(error instanceof WorkflowError && error.status === 409) || intento === 3) throw error;
    }
  }
  throw new WorkflowError("No se pudo guardar la entrega. Vuelve a cargar el estudio.", 409);
}

/**
 * Fallo de una ejecución ya reservada: queda en el historial con el motivo (sin claves ni respuestas
 * crudas). No cambia el estado, la versión ni el resultado anterior: reintentar sigue sobre el mismo
 * encargo, sin duplicarlo.
 */
export async function registrarFallo(id: string, motivo: string, proveedor: string) {
  for (let intento = 0; intento < 4; intento++) {
    const actual = await leerProduccion();
    try {
      return await guardarProduccion(actual.revision, (estado) => ({
        ...estado,
        encargos: estado.encargos.map((e) => (e.id === id ? anotar(e, "fallo", { nota: `${proveedor}: ${motivo}`.slice(0, 2000) }) : e)),
      }));
    } catch (error) {
      if (!(error instanceof WorkflowError && error.status === 409) || intento === 3) throw error;
    }
  }
}
