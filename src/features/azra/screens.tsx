"use client";
import type { Equipo } from "@/lib/equipo/modelo";
import { EstudioProduccion } from "./produccion/estudio";

/** Las pantallas retiradas se redirigen en el servidor y nunca llegan al cliente. */
export function AzraScreen({
  soloLectura = false,
  equipo = null,
  initialSection = null,
}: {
  soloLectura?: boolean;
  equipo?: Equipo | null;
  initialSection?: string | null;
}) {
  return <EstudioProduccion soloLectura={soloLectura} equipo={equipo} initialSection={initialSection} />;
}
