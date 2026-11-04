"use client";
import { EstudioProduccion } from "./produccion/estudio";

/** Las pantallas retiradas se redirigen en el servidor y nunca llegan al cliente. */
export function AzraScreen({ soloLectura = false }: { soloLectura?: boolean }) {
  return <EstudioProduccion soloLectura={soloLectura} />;
}
