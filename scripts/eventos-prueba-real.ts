/**
 * Prueba real con datos y servicios de verdad, en tres pasos que decide el propietario:
 *   1. --cazar           Granja «Eventos de El Salvador» con máximo 3 eventos (Gemini real).
 *   2. --enviar=<id>     Envía a Spotmi de desarrollo UN evento que ya aprobaste en la bandeja.
 *   3. --post            Granja «Post para Instagram» con máximo 1 post (Gemini real + PNG local).
 * Siempre con --confirmar. Usa el backend de la app y la base de data/ (lo mismo que la interfaz).
 * Uso: node --env-file-if-exists=.env.local --env-file-if-exists=.env.meta.local --import tsx scripts/eventos-prueba-real.ts --confirmar --cazar
 * El informe queda en work/prueba-real-eventos.json (tokens, ids). No publica en redes.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { crearDesdeReceta, listarGranjas } from "../src/lib/granjas/almacen";
import { base } from "../src/lib/granjas/db";
import { iniciarEjecucion, leerEjecucion, pasosDe, versionesEncargos } from "../src/lib/granjas/ejecucion";
import { leerEvento, listarEventos } from "../src/lib/granjas/eventos";
import { listarPosts } from "../src/lib/granjas/instagram";
import { leerMedio, leerBytesMedio } from "../src/lib/granjas/medios";
import { medidasPng } from "../src/lib/granjas/diseno";
import { enviarEventoASpotmi, spotmiPuedeProponer } from "../src/lib/granjas/spotmi-propuestas";
import { dependenciasReales, procesarUno } from "../src/lib/granjas/trabajador";
import { geminiProduccionHabilitado, modeloGemini } from "../src/lib/ia/gemini";

const arg = (nombre: string) => process.argv.find((a) => a === `--${nombre}` || a.startsWith(`--${nombre}=`));
const INFORME = "work/prueba-real-eventos.json";
async function informe(parte: string, datos: object) {
  await mkdir("work", { recursive: true });
  const previo = await readFile(INFORME, "utf8").then(JSON.parse).catch(() => ({}));
  await writeFile(INFORME, JSON.stringify({ ...previo, [parte]: { fecha: new Date().toISOString(), ...datos } }, null, 2));
}
function granjaDe(proposito: string, receta: string) {
  const existente = listarGranjas().find((g) => g.ajustes.purpose === proposito && g.estado === "activa");
  return existente ?? crearDesdeReceta(receta);
}
function tokens(ejecucionId: string) {
  return base()
    .prepare(
      `select count(*) as llamadas, coalesce(sum(total_tokens),0) as total, coalesce(sum(prompt_tokens),0) as entrada,
       coalesce(sum(candidatos_tokens),0) as salida, coalesce(sum(pensamiento_tokens),0) as razonamiento,
       coalesce(sum(herramientas_tokens),0) as herramientas, coalesce(sum(consultas_busqueda),0) as busquedas
       from consumo_ia where ejecucion_id = ?`,
    )
    .get(ejecucionId) as Record<string, number>;
}
async function correr(granjaId: string, limites: { eventos?: number; posts?: number }) {
  const e = iniciarEjecucion(granjaId, { confirmarIA: true, usuario: "prueba-real", encargos: await versionesEncargos(), limites });
  const deps = await dependenciasReales();
  for (let i = 0; i < 240; i++) {
    const estado = leerEjecucion(e.id).estado;
    if (!["en_curso"].includes(estado)) break;
    // Si el servidor de desarrollo ya tomó el trabajo, solo se espera.
    if (!(await procesarUno(`prueba-real:${process.pid}`, { dependencias: deps }))) await new Promise((r) => setTimeout(r, 1500));
  }
  return { ejecucion: leerEjecucion(e.id), pasos: pasosDe(e.id).map((p) => ({ estado: p.estado, detalle: p.detalle, error: p.error })) };
}

async function main() {
  if (!arg("confirmar")) throw new Error("Agrega --confirmar: esta prueba usa Gemini real y la base de data/.");
  if (arg("cazar") || arg("post")) {
    if (!geminiProduccionHabilitado()) throw new Error("Falta GEMINI_API_KEY o EZRA_PRODUCCION_IA=1 en .env.local.");
  }
  if (arg("cazar")) {
    const granja = granjaDe("eventos_el_salvador", "eventos_el_salvador");
    const antes = new Set(listarEventos().map((x) => x.id));
    const r = await correr(granja.id, { eventos: 3 });
    const nuevos = listarEventos().filter((x) => !antes.has(x.id));
    const datos = {
      modelo: modeloGemini(),
      granja: granja.id,
      ejecucion: r.ejecucion.id,
      estado: r.ejecucion.estado,
      pasos: r.pasos,
      tokens: tokens(r.ejecucion.id),
      eventos: nuevos.map((x) => ({ id: x.id, titulo: x.titulo, fecha: x.fecha, hora: x.hora, precio: x.precio, fuente: x.fuenteUrl })),
    };
    await informe("cazar", datos);
    console.log(JSON.stringify(datos, null, 2));
    console.log("\nRevisa la bandeja Eventos, aprueba UNO y luego corre --enviar=<id>.");
  }
  const enviar = arg("enviar");
  if (enviar) {
    const id = enviar.split("=")[1] ?? "";
    if (!spotmiPuedeProponer()) throw new Error("Spotmi no está conectado: Conexiones → Spotmi web → Conectar/Verificar.");
    if (leerEvento(id).estado !== "aprobado") throw new Error("Aprueba ese evento en la bandeja antes de enviarlo.");
    const e = await enviarEventoASpotmi(id);
    const datos = { evento: e.id, titulo: e.titulo, propuesta: e.spotmiPropuestaId, estado: e.spotmiEstado };
    await informe("enviar", datos);
    console.log(JSON.stringify(datos, null, 2));
  }
  if (arg("post")) {
    const granja = granjaDe("post_instagram_eventos", "post_instagram_eventos");
    const antes = new Set(listarPosts().map((p) => p.id));
    const r = await correr(granja.id, { posts: 1 });
    const nuevos = listarPosts().filter((p) => !antes.has(p.id));
    const posts = await Promise.all(
      nuevos.map(async (p) => ({
        id: p.id,
        evento: p.eventoId,
        origen: p.textoOrigen,
        caracteres: p.texto.length,
        imagen: p.medioId ? medidasPng(await leerBytesMedio(leerMedio(p.medioId))) : null,
      })),
    );
    const datos = { granja: granja.id, ejecucion: r.ejecucion.id, estado: r.ejecucion.estado, pasos: r.pasos, tokens: tokens(r.ejecucion.id), posts };
    await informe("post", datos);
    console.log(JSON.stringify(datos, null, 2));
  }
  if (!arg("cazar") && !enviar && !arg("post")) console.log("Indica --cazar, --enviar=<id> o --post.");
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
