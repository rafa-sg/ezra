/**
 * «Completar imágenes» desde la terminal: lo mismo que el botón de la bandeja de Eventos.
 * Busca la imagen oficial de cada evento sin imagen (no descartado y que no ha terminado):
 * su página, la de boletos, sus otras fuentes, la ficha en las ticketeras permitidas y el post
 * de una cuenta oficial leído por API. Nunca genera imágenes. Todo queda pendiente de tu confirmación.
 * Uso: npm run eventos:imagenes
 */
import { completarImagenEvento } from "../src/lib/granjas/completar-imagenes";
import { listarEventos } from "../src/lib/granjas/eventos";
import { diaLocal } from "../src/lib/granjas/tiempo";

async function main() {
  const hoy = diaLocal(new Date());
  const pendientes = listarEventos().filter((e) => !e.imagenMedioId && e.estado !== "descartado" && (!e.fecha || (e.fechaFin ?? e.fecha) >= hoy));
  console.log(`Eventos sin imagen: ${pendientes.length}`);
  const ctx = { portadas: new Map<string, string[]>(), listados: new Map() };
  const conteo: Record<string, number> = {};
  for (const [i, e] of pendientes.entries()) {
    const r = await completarImagenEvento(e.id, ctx);
    conteo[r.estado] = (conteo[r.estado] ?? 0) + 1;
    console.log(`  ${String(i + 1).padStart(3)}/${pendientes.length}  ${r.estado.toUpperCase().padEnd(10)} ${e.titulo}${r.motivo ? ` → ${r.motivo}` : ""}${r.boletos ? ` · boletos: ${r.boletos}` : ""}`);
  }
  console.log(`Resultado: ${JSON.stringify(conteo)}`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
