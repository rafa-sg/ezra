import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/; Gemini siempre simulado.
process.env.EZRA_DATA_DIR = path.resolve(`work/consumo-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.GEMINI_API_KEY = "clave-de-prueba";
process.env.EZRA_PRODUCCION_IA = "1";
let consumo: typeof import("../src/lib/granjas/consumo");
let gemini: typeof import("../src/lib/ia/gemini");
let db: typeof import("../src/lib/granjas/db");
let especialistas: typeof import("../src/lib/granjas/especialistas");
let tiempo: typeof import("../src/lib/granjas/tiempo");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  consumo = await import("../src/lib/granjas/consumo");
  gemini = await import("../src/lib/ia/gemini");
  db = await import("../src/lib/granjas/db");
  especialistas = await import("../src/lib/granjas/especialistas");
  tiempo = await import("../src/lib/granjas/tiempo");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
const vaciar = () => db.base().exec("delete from consumo_ia; delete from ajustes_estudio;");

test("registro: cada llamada guarda tokens de usageMetadata, búsqueda, duración y errores sin el prompt", async () => {
  vaciar();
  const peticiones: unknown[] = [];
  gemini.usarGeminiDePrueba(async (p) => {
    peticiones.push(p);
    return {
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80, thoughtsTokenCount: 40, toolUsePromptTokenCount: 300, totalTokenCount: 540 },
      candidates: [{ groundingMetadata: { webSearchQueries: ["eventos san salvador", "conciertos noviembre"] } }],
    };
  });
  await gemini.llamarGemini(
    { origen: "granja", paso: "Cazador de eventos", granjaId: "g1", ejecucionId: "e1", pasoId: "p1" },
    { model: "gemini-prueba", contents: "texto secreto del prompt", config: { tools: [{ googleSearch: {} }] } },
  );
  gemini.usarGeminiDePrueba(async () => {
    throw Object.assign(new Error("Service Unavailable AIzaSyA-clave-que-no-debe-quedar-1234567890"), { status: 503 });
  });
  await assert.rejects(gemini.llamarGemini({ origen: "ask", paso: "Pregúntale a la IA" }, { model: "gemini-prueba", contents: "hola" }));
  gemini.usarGeminiDePrueba(undefined);
  const filas = db.base().prepare("select * from consumo_ia order by fecha").all() as unknown as import("../src/lib/granjas/consumo").FilaConsumo[];
  assert.equal(filas.length, 2);
  const [ok, fallo] = filas;
  assert.deepEqual(
    [ok.origen, ok.granja_id, ok.ejecucion_id, ok.paso_id, ok.paso, ok.modelo],
    ["granja", "g1", "e1", "p1", "Cazador de eventos", "gemini-prueba"],
  );
  assert.deepEqual(
    [ok.prompt_tokens, ok.candidatos_tokens, ok.pensamiento_tokens, ok.herramientas_tokens, ok.total_tokens],
    [120, 80, 40, 300, 540],
  );
  assert.equal(ok.busqueda, 1);
  assert.equal(ok.consultas_busqueda, 2);
  assert.ok(ok.duracion_ms >= 0);
  assert.equal(ok.error, "");
  assert.equal(fallo.origen, "ask");
  assert.equal(fallo.total_tokens, 0);
  assert.match(fallo.error, /HTTP 503/);
  assert.doesNotMatch(fallo.error, /AIza/, "la clave nunca queda en el registro");
  const columnas = (db.base().prepare("pragma table_info(consumo_ia)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(!columnas.some((c) => /prompt$|texto|respuesta|contenido/.test(c) && c !== "prompt_tokens"), "no hay columnas para el texto");
});

test("presupuesto: al 80 % avisa, al 100 % Gemini se detiene sin llamar y se reanuda al día o mes siguiente", async () => {
  vaciar();
  const ahora = new Date("2026-11-17T15:00:00-06:00");
  consumo.guardarPresupuesto({ tokensDia: 1000, tokensMes: 5000 });
  const anotar = (tokens: number, fecha: Date) =>
    consumo.registrarConsumo({ fecha: fecha.toISOString(), origen: "granja", paso: "x", modelo: "m", uso: { totalTokenCount: tokens }, busqueda: false, consultasBusqueda: 0, duracionMs: 1 });
  anotar(850, ahora);
  let estado = consumo.estadoPresupuesto(ahora);
  assert.equal(estado.agotado, null);
  assert.equal(estado.aviso, true, "85 % del día");
  assert.equal(estado.dia.porcentaje, 85);
  anotar(200, ahora);
  estado = consumo.estadoPresupuesto(ahora);
  assert.equal(estado.agotado, "dia");
  assert.equal(estado.reanuda, "2026-11-18T06:00:00.000Z", "medianoche de El Salvador");
  assert.throws(() => consumo.exigirPresupuesto(ahora), (e: Error & { status?: number }) => e.status === 429 && /presupuesto agotado/.test(e.message));
  // Con el presupuesto agotado no sale ninguna petición.
  let llamadas = 0;
  gemini.usarGeminiDePrueba(async () => {
    llamadas++;
    return {};
  });
  // El registro de la prueba usa la fecha real: se agota también el día de hoy.
  consumo.guardarPresupuesto({ tokensDia: 1000, tokensMes: null });
  anotar(1000, new Date());
  await assert.rejects(gemini.llamarGemini({ origen: "granja", paso: "x" }, { model: "m", contents: "x" }), /presupuesto agotado/);
  assert.equal(llamadas, 0);
  gemini.usarGeminiDePrueba(undefined);
  // Al día siguiente vuelve a estar disponible.
  consumo.guardarPresupuesto({ tokensDia: 1000, tokensMes: 5000 });
  assert.equal(consumo.estadoPresupuesto(new Date("2026-11-18T00:30:00-06:00")).agotado, null);
  // El mensual manda sobre el diario y se reanuda el primer día del mes siguiente.
  anotar(3000, new Date("2026-11-03T10:00:00-06:00"));
  anotar(900, new Date("2026-11-10T10:00:00-06:00"));
  estado = consumo.estadoPresupuesto(new Date("2026-11-20T10:00:00-06:00"));
  assert.equal(estado.agotado, "mes");
  assert.equal(estado.reanuda, "2026-12-01T06:00:00.000Z");
  assert.equal(consumo.estadoPresupuesto(new Date("2026-12-01T00:01:00-06:00")).agotado, null);
  // Sin límites no hay pausa.
  consumo.guardarPresupuesto({ tokensDia: null, tokensMes: null });
  assert.equal(consumo.estadoPresupuesto(ahora).agotado, null);
  assert.throws(() => consumo.guardarPresupuesto({ tokensDia: -5, tokensMes: null }));
});

test("costo: solo con tarifas que escribe el propietario; sin tarifa queda «sin tarifa»", () => {
  vaciar();
  const hoy = new Date();
  consumo.registrarConsumo({ origen: "granja", granjaId: null, paso: "Cazador", modelo: "con-tarifa", uso: { promptTokenCount: 1_000_000, toolUsePromptTokenCount: 0, candidatesTokenCount: 500_000, thoughtsTokenCount: 500_000, totalTokenCount: 2_000_000 }, busqueda: true, consultasBusqueda: 4, duracionMs: 10, fecha: hoy.toISOString() });
  consumo.registrarConsumo({ origen: "encargo", paso: "Encargo · guion", modelo: "sin-tarifa", uso: { totalTokenCount: 10 }, busqueda: false, consultasBusqueda: 0, duracionMs: 10, fecha: hoy.toISOString() });
  assert.deepEqual(consumo.leerTarifas(), {}, "el código no trae precios");
  consumo.guardarTarifas({ "con-tarifa": { entrada: 0.1, salida: 0.4, busqueda: 14 } });
  const r = consumo.resumenConsumo(hoy);
  // 1 M × 0,10 + 1 M × 0,40 + 4 × 14/1000 = 0,556
  assert.equal(Math.round(r.periodos.hoy.costo * 1000) / 1000, 0.556);
  assert.equal(r.periodos.hoy.sinTarifa, 1);
  assert.equal(r.periodos.hoy.tokens, 2_000_010);
  assert.equal(r.serie.length, 30);
  assert.equal(r.serie.at(-1)!.dia, tiempo.diaLocal(hoy));
  assert.equal(r.caras[0].modelo, "con-tarifa");
  assert.equal(r.caras[1].costo, null);
  assert.deepEqual(r.porPaso.map((p) => p.paso).sort(), ["Cazador", "Encargo · guion"]);
  assert.throws(() => consumo.guardarTarifas({ "modelo con espacios": { entrada: 1, salida: 1, busqueda: 1 } }));
});

test("especialistas: cuatro visibles por defecto; ocultar no borra y se pueden reactivar", () => {
  vaciar();
  assert.deepEqual(especialistas.especialistasVisibles(), ["cazador", "verificador", "redactor_ig", "disenador_post"]);
  assert.deepEqual(especialistas.guardarEspecialistas(["guion", "cazador"]), ["cazador", "guion"], "orden del catálogo");
  assert.deepEqual(especialistas.especialistasVisibles(), ["cazador", "guion"]);
  assert.throws(() => especialistas.guardarEspecialistas([]));
  assert.throws(() => especialistas.guardarEspecialistas(["inventado"]));
});
