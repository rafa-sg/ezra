import type { Referencia } from "./eventos";

/** Eventos verificados publicados en Spotmi (lectura pública), para no repetirlos. */
export async function eventosPublicosSpotmi(): Promise<Referencia[]> {
  const { consultarSpotmi } = await import("../produccion/spotmi");
  const { diaLocal } = await import("./tiempo");
  return (await consultarSpotmi()).fichas
    .filter((f) => f.tipo === "evento")
    .map((f) => ({ titulo: f.titulo, fecha: f.fecha ? diaLocal(new Date(f.fecha)) : null, lugar: f.lugar, origen: "Spotmi" }));
}
