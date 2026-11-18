/**
 * Crea (una sola vez) las granjas «Eventos de El Salvador» y «Post para Instagram» con el
 * backend de la app. Quedan sin horario activo: no se ejecutan ni gastan tokens hasta que
 * el propietario las programe en Granjas › Horario.
 * Uso: node --env-file-if-exists=.env.local --import tsx scripts/granjas-crear-diarias.ts [--confirmar]
 */
import { crearDesdeReceta, listarGranjas } from "../src/lib/granjas/almacen";

for (const clave of ["eventos_el_salvador", "post_instagram_eventos"] as const) {
  const existente = listarGranjas().find((g) => g.ajustes.purpose === clave && g.estado !== "archivada");
  if (existente) console.log(`Ya existe: ${existente.id} · ${existente.nombre}`);
  else if (process.argv.includes("--confirmar")) {
    const g = crearDesdeReceta(clave);
    console.log(`Creada: ${g.id} · ${g.nombre} (sin horario activo)`);
  } else console.log(`Se crearía: ${clave} (agrega --confirmar)`);
}
