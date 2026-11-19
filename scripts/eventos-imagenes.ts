/**
 * «Completar imágenes» desde la terminal: lo mismo que el botón de la bandeja de Eventos.
 * Para cada evento sin imagen oficial (no descartado y que no ha terminado), en orden: afiche oficial
 * (su página, boletos, otras fuentes y la ficha en las ticketeras), post de cuenta oficial por API y
 * foto de prensa. Con --ia, si no hay nada, genera la imagen de referencia IA (límite diario y
 * presupuesto de Consumo). Todo queda pendiente de tu confirmación; la de IA nunca es oficial.
 * Uso: npm run eventos:imagenes [-- --ia] [-- --solo=idA,idB]  (los id pueden ir abreviados)
 */
import { completarImagenEvento } from "../src/lib/granjas/completar-imagenes";
import { generarReferencia } from "../src/lib/granjas/imagen-ia";
import { listarEventos } from "../src/lib/granjas/eventos";
import { diaLocal } from "../src/lib/granjas/tiempo";

async function main() {
  const hoy = diaLocal(new Date());
  const conIA = process.argv.includes("--ia");
  const solo = (process.argv.find((a) => a.startsWith("--solo="))?.slice(7) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const pendientes = listarEventos().filter(
    (e) =>
      (!solo.length || solo.some((p) => e.id.startsWith(p))) &&
      !e.imagenConfirmada &&
      (e.imagenTipo === null || e.imagenTipo === "prensa" || e.imagenTipo === "ia") &&
      e.estado !== "descartado" &&
      (!e.fecha || (e.fechaFin ?? e.fecha) >= hoy),
  );
  console.log(`Eventos sin imagen oficial: ${pendientes.length}${conIA ? " · con referencia IA" : ""}`);
  const ctx = { portadas: new Map<string, string[]>(), listados: new Map() };
  let iaDisponible = conIA;
  const referenciaIA = async (id: string) => {
    const r = await generarReferencia(id);
    if (!r.ok && (("facturacion" in r && r.facturacion) || /límite|cupo/.test(r.motivo))) iaDisponible = false;
    if (r.ok) console.log(`         prompt: ${r.prompt}`);
    return r.ok ? { ok: true as const, motivo: r.motivo } : { ok: false as const, motivo: r.motivo };
  };
  const conteo: Record<string, number> = {};
  for (const [i, e] of pendientes.entries()) {
    const r = await completarImagenEvento(e.id, { ...ctx, referenciaIA: iaDisponible ? referenciaIA : null });
    conteo[r.estado] = (conteo[r.estado] ?? 0) + 1;
    console.log(`  ${String(i + 1).padStart(3)}/${pendientes.length}  ${r.estado.toUpperCase().padEnd(10)} ${e.titulo}${r.motivo ? ` → ${r.motivo}` : ""}${r.boletos ? ` · boletos: ${r.boletos}` : ""}`);
  }
  console.log(`Resultado: ${JSON.stringify(conteo)}`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
