import type { z } from "zod";
import { ahoraIso, auditar, base, json } from "./db";

/**
 * Ajustes del estudio que no forman parte de una granja: presupuesto, tarifas y
 * especialistas visibles. Un valor guardado que ya no cumple el esquema se
 * ignora (se usa el valor por defecto) y se conserva en la base sin tocarlo.
 */
export function leerAjuste<T extends z.ZodType>(clave: string, esquema: T, defecto: z.infer<T>): z.infer<T> {
  const fila = base().prepare("select valor from ajustes_estudio where clave = ?").get(clave) as { valor: string } | undefined;
  if (!fila) return defecto;
  const leido = esquema.safeParse(json(fila.valor, null));
  return leido.success ? leido.data : defecto;
}
export function guardarAjuste<T extends z.ZodType>(clave: string, esquema: T, valor: unknown): z.infer<T> {
  const limpio = esquema.parse(valor);
  base()
    .prepare(
      `insert into ajustes_estudio (clave, valor, actualizado) values (?, ?, ?)
       on conflict (clave) do update set valor = excluded.valor, actualizado = excluded.actualizado`,
    )
    .run(clave, JSON.stringify(limpio), ahoraIso());
  auditar("ajuste.guardar", clave);
  return limpio;
}
