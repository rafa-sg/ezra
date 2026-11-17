/**
 * Archiva (no borra) las granjas repetidas «Publicación de evento verificado» y las
 * de prueba («Primera prueba · …») con el backend de la app. Las filas, ejecuciones
 * y resultados se conservan; se ven con «Ver archivadas» y se pueden restaurar.
 * Uso: node --env-file-if-exists=.env.local --import tsx scripts/granjas-archivar-duplicadas.ts [--confirmar]
 */
import { actualizarGranja, listarGranjas } from "../src/lib/granjas/almacen";

const candidatas = listarGranjas().filter(
  (g) => g.estado !== "archivada" && (g.nombre === "Publicación de evento verificado" || g.nombre.startsWith("Primera prueba")),
);
if (!candidatas.length) console.log("No hay granjas duplicadas ni de prueba sin archivar.");
for (const g of candidatas) console.log(`${process.argv.includes("--confirmar") ? "Archivando" : "Se archivaría"}: ${g.id} · ${g.nombre} (${g.estado})`);
if (process.argv.includes("--confirmar"))
  for (const g of candidatas) actualizarGranja(g.id, g.revision, { estado: "archivada" });
else if (candidatas.length) console.log("Sin --confirmar no se cambió nada.");
