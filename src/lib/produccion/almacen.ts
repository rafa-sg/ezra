import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { dataDirectory, enqueueWrite, writeJsonAtomic } from "../store";
import { WorkflowError } from "../workflow";
import { produccionSchema, produccionVacia, type Produccion } from "./modelo";
const archivo = path.join(dataDirectory, "produccion-spotmi.json");
export async function leerProduccion(): Promise<Produccion> {
  try {
    return produccionSchema.parse(JSON.parse(await readFile(archivo, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return produccionVacia();
    throw new WorkflowError("No se pudo leer el estudio. El archivo se conservó intacto.", 500);
  }
}
export function guardarProduccion(revision: number, cambio: (actual: Produccion) => Produccion) {
  return enqueueWrite(async () => {
    const actual = await leerProduccion();
    if (revision !== actual.revision)
      throw new WorkflowError(
        "Hay cambios de otra ventana. Recarga el estudio antes de guardar.",
        409,
      );
    const siguiente = produccionSchema.parse({ ...cambio(actual), revision: actual.revision + 1 });
    await mkdir(dataDirectory, { recursive: true });
    await writeJsonAtomic(archivo, siguiente);
    return siguiente;
  });
}
