import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/: nunca data/.
process.env.EZRA_DATA_DIR = path.resolve(`work/pulso-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
let prefs: typeof import("../src/lib/produccion/preferencias");
let inicio: typeof import("../src/lib/produccion/inicio");
let db: typeof import("../src/lib/granjas/db");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  prefs = await import("../src/lib/produccion/preferencias");
  inicio = await import("../src/lib/produccion/inicio");
  db = await import("../src/lib/granjas/db");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});

test("preferencias: valores por defecto, revisión optimista, por usuario, validación y datos corruptos", () => {
  const p = prefs.leerPreferencias("u1");
  assert.equal(p.revision, 0);
  assert.deepEqual(p.widgets.map((w) => w.id), prefs.widgetsPorDefecto.map((w) => w.id));
  const orden = [...p.widgets].reverse().map((w, i) => ({ ...w, visible: i !== 0, titulo: i === 1 ? "Mi pulso" : "" }));
  const g = prefs.guardarPreferencias("u1", 0, { widgets: orden, temas: { inicio: "oscuro" }, agentes: { cazador: { nombre: "Agente Campo", rol: "Busca eventos" } } });
  assert.equal(g.revision, 1);
  assert.equal(prefs.leerPreferencias("u1").widgets[1].titulo, "Mi pulso");
  assert.equal(prefs.leerPreferencias("u1").temas.inicio, "oscuro");
  assert.equal(prefs.leerPreferencias("u1").agentes.cazador.nombre, "Agente Campo");
  // Otra pestaña con la revisión vieja: 409.
  assert.throws(() => prefs.guardarPreferencias("u1", 0, { temas: { inicio: "claro" } }), /otra ventana/);
  // Cada usuario tiene lo suyo.
  assert.equal(prefs.leerPreferencias("u2").revision, 0);
  // Validación: tema, tamaño, color y widgets repetidos.
  assert.throws(() => prefs.guardarPreferencias("u1", 1, { temas: { inicio: "neon" } }));
  assert.throws(() => prefs.guardarPreferencias("u1", 1, { widgets: [{ id: "kpis", visible: true, tamano: "xl", titulo: "" }] }));
  assert.throws(() => prefs.guardarPreferencias("u1", 1, { coloresGranja: { g: "rojo" } }));
  assert.throws(() => prefs.guardarPreferencias("u1", 1, { widgets: [prefs.widgetsPorDefecto[0], prefs.widgetsPorDefecto[0]] }));
  // Una lista guardada con menos widgets se completa (los que faltan, ocultos al final).
  const parcial = prefs.guardarPreferencias("u1", 1, { widgets: [{ id: "grafica", visible: true, tamano: "l", titulo: "" }] });
  assert.equal(parcial.widgets.length, prefs.widgetsPorDefecto.length);
  assert.equal(parcial.widgets[0].id, "grafica");
  assert.ok(parcial.widgets.slice(1).every((w) => !w.visible));
  // Como la API: los cambios pasan por cambiosSchema; guardar solo el tema no toca el orden ni los agentes.
  const orden2 = prefs.leerPreferencias("u1").widgets.map((w) => w.id);
  const conAgente = prefs.guardarPreferencias("u1", 2, prefs.cambiosSchema.parse({ agentes: { verificador: { nombre: "Revisor", rol: "" } } }));
  const soloTema = prefs.guardarPreferencias("u1", conAgente.revision, prefs.cambiosSchema.parse({ temas: { inicio: "liquido" } }));
  assert.deepEqual(soloTema.widgets.map((w) => w.id), orden2);
  assert.equal(soloTema.agentes.verificador.nombre, "Revisor");
  assert.throws(() => prefs.cambiosSchema.parse({ revision: 99 }), "la revisión no se cambia por aquí");
  // Valor corrupto en la base: se usan los valores por defecto sin romper.
  db.base().prepare("update ajustes_estudio set valor = ? where clave = ?").run("{no es json", "preferencias:u1");
  assert.equal(prefs.leerPreferencias("u1").revision, 0);
});

test("series del pulso: 30 días por día en hora de El Salvador, posts creados y subidos, tokens y próximos 14 días", async () => {
  const ahora = new Date("2026-11-20T15:00:00Z"); // 09:00 en El Salvador
  const base = db.base();
  base.exec("delete from consumo_ia; delete from posts_ig; delete from eventos;");
  const { crearEvento } = await import("../src/lib/granjas/eventos");
  const evento = (titulo: string, creado: string) => {
    const e = crearEvento({
      titulo,
      fecha: "2026-12-01",
      hora: null,
      lugar: "",
      municipio: "",
      departamento: "",
      categoria: "otro",
      precio: null,
      boletosUrl: null,
      fuenteUrl: `https://elsalvador.travel/${encodeURIComponent(titulo)}`,
      confirmadoEn: {},
      sugerencias: {},
      descripcion: "",
      imagenUrl: null,
      notaVerificacion: "",
      granjaId: null,
      ejecucionId: null,
    });
    base.prepare("update eventos set creado = ? where id = ?").run(creado, e.id);
  };
  evento("Festival uno", "2026-11-20T05:00:00Z"); // 19 nov 23:00 en SV → cuenta para el 19
  evento("Concierto dos", "2026-11-20T07:00:00Z"); // 20 nov 01:00 en SV
  evento("Feria tres", "2026-10-01T12:00:00Z"); // fuera de la ventana
  base.prepare("insert into consumo_ia (id, fecha, origen, paso, modelo, total_tokens, busqueda, consultas_busqueda, duracion_ms, error, prompt_tokens, candidatos_tokens, pensamiento_tokens, herramientas_tokens) values ('c1', '2026-11-20T14:00:00Z', 'granja', 'x', 'm', 500, 0, 0, 1, '', 0, 0, 0, 0)").run();
  const s = inicio.seriesPulso(ahora, [{ fecha: "2026-11-21" }, { fecha: "2026-11-21T19:00" }, { fecha: "2026-12-30" }]);
  assert.equal(s.pasado.length, 30);
  assert.equal(s.pasado.at(-1)!.dia, "2026-11-20");
  assert.equal(s.pasado.find((d) => d.dia === "2026-11-19")!.eventos, 1);
  assert.equal(s.pasado.at(-1)!.eventos, 1);
  assert.equal(s.pasado.reduce((t, d) => t + d.eventos, 0), 2, "el evento de octubre queda fuera");
  assert.equal(s.pasado.at(-1)!.tokens, 500);
  assert.equal(s.futuro.length, 14);
  assert.equal(s.futuro[1].proximas, 2, "dos fechas el 21 (con y sin hora)");
  assert.equal(s.futuro.reduce((t, d) => t + d.proximas, 0), 2, "lo que pasa de 14 días no cuenta");
});

test("% del día: resueltas hoy (auditoría + encargos aprobados) frente a pendientes; sin nada, 100 %", () => {
  const ahora = new Date();
  db.base().exec("delete from auditoria;");
  assert.deepEqual(inicio.progresoDia(ahora, 0, 0), { resueltas: 0, pendientes: 0, porcentaje: 100 });
  assert.equal(inicio.progresoDia(ahora, 4, 0).porcentaje, 0);
  db.auditar("evento.aprobar", "e1");
  db.auditar("post.subido", "p1");
  db.auditar("granja.actualizar", "g1"); // no cuenta como resuelta
  assert.deepEqual(inicio.progresoDia(ahora, 2, 1), { resueltas: 3, pendientes: 2, porcentaje: 60 });
});
