/* global process, console */
// Copia coherente de la base de las granjas mientras la app sigue funcionando (VACUUM INTO).
// Uso dentro del contenedor: node scripts/respaldo-sqlite.mjs /tmp/granjas.sqlite
import { DatabaseSync } from "node:sqlite";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const datos = process.env.EZRA_DATA_DIR || path.join(process.cwd(), "data");
const origen = path.join(datos, "granjas", "granjas.sqlite");
const destino = process.argv[2];
if (!destino) throw new Error("Falta la ruta de destino.");
rmSync(destino, { force: true });
if (!existsSync(origen)) {
  console.log("Sin base de granjas todavía; nada que copiar.");
} else {
  const base = new DatabaseSync(origen);
  base.prepare("VACUUM INTO ?").run(destino);
  base.close();
  console.log(`Base copiada en ${destino}`);
}
