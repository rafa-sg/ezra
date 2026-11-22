"use client";
import type { Equipo } from "@/lib/equipo/modelo";
import { EstudioProduccion } from "./produccion/estudio";

/** Las pantallas retiradas se redirigen en el servidor y nunca llegan al cliente. */
export function AzraScreen({
  soloLectura = false,
  equipo = null,
}: {
  soloLectura?: boolean;
  equipo?: Equipo | null;
}) {
  return <EstudioProduccion soloLectura={soloLectura} equipo={equipo} />;
}
