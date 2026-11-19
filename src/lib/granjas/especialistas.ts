import { z } from "zod";
import { agentes, type Agente } from "../produccion/modelo";
import { guardarAjuste, leerAjuste } from "./ajustes";

/**
 * Especialistas que se ofrecen al elegir en granjas y encargos. Ocultar uno no
 * borra nada: los pasos y encargos que ya lo usan siguen funcionando y se
 * puede volver a mostrar desde Granjas › Especialistas.
 */
export const especialistasPorDefecto: Agente[] = ["cazador", "verificador", "imagen_evento", "redactor_ig", "disenador_post"];
const esquema = z.object({
  visibles: z
    .array(z.enum(agentes))
    .min(1, "Deja al menos un especialista visible.")
    .refine((v) => new Set(v).size === v.length),
});
export const especialistasVisibles = (): Agente[] =>
  leerAjuste("especialistas", esquema, { visibles: especialistasPorDefecto }).visibles;
export function guardarEspecialistas(visibles: unknown) {
  // Se guardan en el orden del catálogo para que la lista no cambie de lugar.
  const lista = z.array(z.enum(agentes)).parse(visibles);
  return guardarAjuste("especialistas", esquema, { visibles: agentes.filter((a) => lista.includes(a)) }).visibles;
}
