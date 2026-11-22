import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Datos de prueba en work/; nunca data/. Sin llamadas a ninguna IA.
process.env.EZRA_DATA_DIR = path.resolve(`work/uso-ia-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.GEMINI_API_KEY = "clave-de-prueba";
process.env.EZRA_PRODUCCION_IA = "1";
let uso: typeof import("../src/lib/ia/uso");
let db: typeof import("../src/lib/granjas/db");
let consumo: typeof import("../src/lib/granjas/consumo");
let almacen: typeof import("../src/lib/produccion/almacen");
let modelo: typeof import("../src/lib/produccion/modelo");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  db = await import("../src/lib/granjas/db");
  consumo = await import("../src/lib/granjas/consumo");
  almacen = await import("../src/lib/produccion/almacen");
  modelo = await import("../src/lib/produccion/modelo");
  uso = await import("../src/lib/ia/uso");
  assert.ok(
    db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!),
    "la base de prueba vive en work/",
  );
});

test("uso de las 3 IAs: Gemini contra el presupuesto, Astra y Claude contra los 30 intentos compartidos", async () => {
  const ahora = new Date("2026-11-21T22:00:00-06:00");
  // Sin límites escritos: no hay porcentaje inventado.
  let r = await uso.resumenUsoIA(ahora);
  assert.equal(r.gemini.dia.limite, null);
  assert.equal(r.gemini.dia.porcentaje, null);
  assert.equal(r.intentos.usados, 0);
  assert.equal(r.intentos.limite, 30);
  assert.equal(r.gemini.habilitado, true);

  consumo.guardarPresupuesto({ tokensDia: 10_000, tokensMes: 100_000 });
  consumo.registrarConsumo({
    fecha: "2026-11-21T20:00:00-06:00",
    origen: "prueba",
    paso: "p",
    modelo: "gemini-prueba",
    uso: { totalTokenCount: 2500 },
    busqueda: false,
    consultasBusqueda: 0,
    duracionMs: 1,
  });
  // Intentos de granjas: 2 de Astra y 1 de Claude este mes; uno del mes pasado no cuenta; Gemini no cuenta.
  const ins = db
    .base()
    .prepare("insert into usos_ia (id, fecha, paso_id, proveedor) values (?, ?, ?, ?)");
  ins.run(crypto.randomUUID(), "2026-11-20T10:00:00.000Z", "a", "astra");
  ins.run(crypto.randomUUID(), "2026-11-21T10:00:00.000Z", "b", "astra");
  ins.run(crypto.randomUUID(), "2026-11-21T11:00:00.000Z", "c", "claude");
  ins.run(crypto.randomUUID(), "2026-10-15T11:00:00.000Z", "d", "claude");
  ins.run(crypto.randomUUID(), "2026-11-21T11:00:00.000Z", "e", "gemini");
  // Intento de un encargo de Claude guardado en el estudio.
  const encargo = modelo.crearEncargo({
    titulo: "Prueba",
    agente: "cazador",
    proveedor: "claude",
    canales: ["spotmi"],
    encargo: "x",
    resultado: "",
    fuentes: [],
    fechaPrevista: "",
  });
  await almacen.guardarProduccion(0, (p) => ({
    ...p,
    encargos: [encargo],
    usos: [{ fecha: "2026-11-21T12:00:00.000Z", encargoId: encargo.id }],
  }));

  r = await uso.resumenUsoIA(ahora);
  assert.equal(r.gemini.dia.usado, 2500);
  assert.equal(r.gemini.dia.porcentaje, 25);
  assert.equal(r.gemini.mes.limite, 100_000);
  assert.equal(r.intentos.usados, 4);
  assert.equal(r.astra.usados, 2);
  assert.equal(r.claude.usados, 2);
  assert.equal(r.intentos.porcentaje, 13.3);
  // Se restablece al inicio del mes siguiente, hora de El Salvador.
  assert.equal(r.intentos.reanuda, new Date("2026-12-01T00:00:00-06:00").toISOString());
  assert.equal(r.astra.estado, null, "sin comprobación guardada no se afirma una sesión");
  assert.ok(!JSON.stringify(r).includes("clave-de-prueba"), "nunca devuelve la clave");
});
