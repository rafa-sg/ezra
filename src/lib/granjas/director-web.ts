import { WorkflowError } from "../workflow";
import { encargoMinimo, reservarIntentoWeb, type Dependencias } from "./pasos";
import type { IADiseno } from "./pasos-instagram";

export const proveedoresDiseno = ["local", "claude", "astra", "gemini"] as const;
export type ProveedorDiseno = (typeof proveedoresDiseno)[number];
/**
 * Director de arte desde la web («Rediseñar con Claude/Astra/Gemini»): mismo límite de 30 intentos
 * al mes para Astra y Claude, y el presupuesto de tokens para Gemini, que en las granjas.
 */
export async function iaDisenoWeb(proveedor: ProveedorDiseno, postId: string, deps?: Dependencias): Promise<IADiseno> {
  if (proveedor === "local") return null;
  if (proveedor === "gemini" && process.env.EZRA_PRODUCCION_IA !== "1")
    throw new WorkflowError("Gemini está deshabilitado en el estudio (EZRA_PRODUCCION_IA).", 503);
  const d = deps ?? (await (await import("./trabajador")).dependenciasReales());
  const encargo = encargoMinimo({
    id: postId,
    titulo: "Director de arte de Instagram",
    agente: "disenador_post",
    proveedor,
    canales: ["instagram"],
    instrucciones: "Diseño del post como JSON.",
    fuentes: [],
  });
  return {
    proveedor,
    generar: async (prompt) => {
      await reservarIntentoWeb(`post:${postId}`, proveedor, d);
      const r = await d.generar(encargo, prompt, { origen: "granja", paso: "Director de arte (Posts)" }, { maxTokens: 1500, ...(proveedor === "gemini" ? { busqueda: false } : {}) });
      return r.texto;
    },
  };
}
