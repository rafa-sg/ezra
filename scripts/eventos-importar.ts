/**
 * Importa eventos (formato del cazador) con el mismo verificador de la granja.
 * Uso: npm run eventos:importar -- archivo.json [--dominios=elsalvador.com,otro.sv]
 * --dominios agrega fuentes permitidas solo para esta importación (por ejemplo, notas de prensa).
 */
import { readFile } from "node:fs/promises";
import { importarEventos } from "../src/lib/granjas/importar";

async function main() {
  const archivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!archivo) throw new Error("Indica el archivo: npm run eventos:importar -- archivo.json [--dominios=a.com,b.sv]");
  const dominiosExtra = (process.argv.find((a) => a.startsWith("--dominios="))?.slice(11) ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  const r = await importarEventos(JSON.parse(await readFile(archivo, "utf8")), { dominiosExtra });
  console.log(`Recibidos: ${r.recibidos} · inválidos: ${r.invalidos.length} · nuevos: ${r.nuevos} · duplicados: ${r.duplicados} · descartados: ${r.descartados} · con imagen: ${r.conImagen} · con datos por confirmar: ${r.conDatosPorConfirmar} · Spotmi: ${r.spotmi}`);
  for (const n of r.detalle.nuevos) console.log(`  NUEVO  ${n.titulo}${n.imagen ? " · imagen" : ""}${n.porConfirmar.length ? ` · por confirmar: ${n.porConfirmar.join(", ")}` : ""}`);
  for (const d of r.detalle.duplicados) console.log(`  DUPLICADO  ${d.titulo} → ${d.de}`);
  for (const d of r.detalle.descartados) console.log(`  DESCARTADO  ${d.titulo} → ${d.motivo}`);
  for (const i of r.invalidos) console.log(`  INVÁLIDO  #${i.posicion}: ${i.motivo}`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
