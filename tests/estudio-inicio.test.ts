import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Datos aislados en work/: nunca la carpeta data/ del propietario.
process.env.EZRA_DATA_DIR = path.resolve(`work/estudio-inicio-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
let onboarding: typeof import("../src/lib/produccion/onboarding");
let inicio: typeof import("../src/lib/produccion/inicio");
let almacen: typeof import("../src/lib/produccion/almacen");
let granjas: typeof import("../src/lib/granjas/almacen");
let calendario: typeof import("../src/lib/produccion/calendario");
let modelo: typeof import("../src/lib/produccion/modelo");
let db: typeof import("../src/lib/granjas/db");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  onboarding = await import("../src/lib/produccion/onboarding");
  inicio = await import("../src/lib/produccion/inicio");
  almacen = await import("../src/lib/produccion/almacen");
  granjas = await import("../src/lib/granjas/almacen");
  calendario = await import("../src/lib/produccion/calendario");
  modelo = await import("../src/lib/produccion/modelo");
  db = await import("../src/lib/granjas/db");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
const ctx = { espacios: ["owner-main"], proveedorPorDefecto: "gemini" as const };

test("guía de inicio: orden de pasos, espacio autorizado, granja reutilizada sin cambios, encargo real e idempotente, retomar sin perder nada", async () => {
  const u = "user_prueba";
  assert.equal(onboarding.leerOnboarding(u).paso, 1);
  await assert.rejects(onboarding.avanzarOnboarding(u, { accion: "objetivo", objetivo: "eventos" }, ctx), /espacio de trabajo/);
  await assert.rejects(onboarding.avanzarOnboarding(u, { accion: "espacio", espacio: "motoxspress-main" }, ctx), /no está disponible/);
  let e = await onboarding.avanzarOnboarding(u, { accion: "espacio", espacio: "owner-main" }, ctx);
  assert.equal(e.paso, 2);
  await assert.rejects(onboarding.avanzarOnboarding(u, { accion: "encargo", titulo: "x" }, ctx));
  e = await onboarding.avanzarOnboarding(u, { accion: "objetivo", objetivo: "eventos" }, ctx);
  assert.equal(e.paso, 3);
  // Ya existe una granja de eventos activa (con un cambio del propietario): se reutiliza tal cual.
  const existente = granjas.crearDesdeReceta("eventos_el_salvador");
  const conCambio = granjas.actualizarGranja(existente.id, existente.revision, { datos: { ...existente, nombre: "Mis eventos" } });
  e = await onboarding.avanzarOnboarding(u, { accion: "configurar", crearGranja: true, proveedor: "claude" }, ctx);
  assert.equal(e.granjaId, existente.id);
  assert.equal(e.granjaReutilizada, true);
  assert.equal(granjas.leerGranja(existente.id).revision, conCambio.revision, "la granja existente no se modifica");
  assert.equal(granjas.listarGranjas().filter((g) => g.receta === "eventos_el_salvador").length, 1, "no se duplica");
  // Primer encargo: real, en el almacén, con la plantilla del objetivo y el proveedor elegido.
  e = await onboarding.avanzarOnboarding(u, { accion: "encargo", titulo: "Eventos de esta semana", fuente: "https://www.smartticket.fun/es" }, ctx);
  assert.equal(e.paso, 5);
  const produccion = await almacen.leerProduccion();
  const encargo = produccion.encargos.find((x) => x.id === e.encargoId)!;
  assert.equal(encargo.titulo, "Eventos de esta semana");
  assert.equal(encargo.agente, "cazador");
  assert.equal(encargo.proveedor, "claude");
  assert.equal(encargo.fuentes[0].url, "https://www.smartticket.fun/es");
  assert.equal(encargo.historial[0].accion, "creado");
  // Repetir el paso no crea otro encargo.
  await onboarding.avanzarOnboarding(u, { accion: "encargo", titulo: "Otro título" }, ctx);
  assert.equal((await almacen.leerProduccion()).encargos.length, 1);
  // Volver a un paso y omitir la configuración no borra lo hecho.
  e = await onboarding.avanzarOnboarding(u, { accion: "ir", paso: 3 }, ctx);
  assert.equal(e.encargoId, encargo.id);
  e = await onboarding.avanzarOnboarding(u, { accion: "omitir_configuracion" }, ctx);
  assert.equal(e.configuracionOmitida, true);
  assert.equal(e.granjaId, existente.id);
  e = await onboarding.avanzarOnboarding(u, { accion: "completar" }, ctx);
  assert.ok(e.completado);
  // Otro usuario empieza de cero; el progreso de cada uno se guarda aparte.
  assert.equal(onboarding.leerOnboarding("otro_usuario").paso, 1);
  assert.equal(onboarding.leerOnboarding(u).paso, 5);
  // Objetivo sin receta disponible creada aún: la crea (sin horario).
  const v = "user_dos";
  await onboarding.avanzarOnboarding(v, { accion: "espacio", espacio: "owner-main" }, ctx);
  await onboarding.avanzarOnboarding(v, { accion: "objetivo", objetivo: "instagram" }, ctx);
  const c = await onboarding.avanzarOnboarding(v, { accion: "configurar", crearGranja: true, proveedor: "gemini" }, ctx);
  assert.equal(c.granjaReutilizada, false);
  assert.equal(granjas.leerGranja(c.granjaId!).receta, "post_instagram_eventos");
  const horario = db.base().prepare("select activa from horarios where granja_id = ?").get(c.granjaId!) as { activa: number } | undefined;
  assert.ok(!horario || horario.activa === 0, "la guía no activa horarios");
});

test("inicio: pendientes y próximas fechas salen de lo guardado", async () => {
  const actual = await almacen.leerProduccion();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  const pasado = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const enTres = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date(pasado));
  let revisar = modelo.crearEncargo({ titulo: "Guion para revisar", agente: "guion", proveedor: "gemini", canales: ["spotmi"], encargo: "x", resultado: "Texto", fuentes: [{ nombre: "f", url: "https://example.test/x", imagen: "", nota: "" }], fechaPrevista: `${enTres}T10:00` });
  revisar = modelo.cambiarEstado(revisar, "revision");
  let cambios = modelo.crearEncargo({ titulo: "Post con cambios", agente: "redactor_ig", proveedor: "gemini", canales: ["instagram"], encargo: "x", resultado: "Texto", fuentes: [], fechaPrevista: "" });
  cambios = modelo.solicitarCambios(modelo.cambiarEstado(cambios, "revision"), "Quita el precio.");
  await almacen.guardarProduccion(actual.revision, (p) => ({ ...p, encargos: [revisar, cambios, ...p.encargos] }));
  const r = await inicio.resumenInicio();
  assert.equal(r.encargos.porEstado.revision, 1);
  assert.ok(r.pendientes.some((p) => p.tipo === "encargo_revision" && p.id === revisar.id));
  assert.ok(r.pendientes.some((p) => p.tipo === "encargo_cambios" && /Quita el precio/.test(p.detalle)));
  assert.ok(r.proximas.some((x) => x.id === revisar.id), "la fecha prevista aparece en próximas");
  assert.ok(r.proximas.every((x) => x.fecha.slice(0, 10) >= hoy));
  assert.ok(r.granjas.every((g) => g.ultima === null), "sin ejecuciones: no se inventa ninguna");
  assert.ok(r.conexiones.every((c) => c.estado !== "conectada_publicacion"), "sin credenciales nada aparece conectado");
});

test("calendario .ics: hora de El Salvador a UTC, día completo para eventos sin hora y texto escapado", () => {
  const e = modelo.crearEncargo({ titulo: "Guion; con coma, y punto", agente: "guion", proveedor: "gemini", canales: ["spotmi"], encargo: "x", resultado: "", fuentes: [], fechaPrevista: "2026-12-05T18:30" });
  const evento = { id: "ev1", titulo: "Fiestas de Suchitoto", fecha: "2026-12-06", fechaFin: "2026-12-08", hora: null, lugar: "Plaza", municipio: "Suchitoto", departamento: "Cuscatlán", precio: null, fuenteUrl: "https://elsalvador.travel/x" } as never;
  const ics = calendario.calendarioIcs([e], [evento], new Date("2026-11-19T00:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261206T003000Z/, "18:30 en El Salvador = 00:30 UTC del día siguiente");
  assert.match(ics, /DTEND:20261206T010000Z/);
  assert.match(ics, /SUMMARY:\[Encargo · pendiente\] Guion\\; con coma\\, y punto/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261206\r\nDTEND;VALUE=DATE:20261209/);
  assert.match(ics, /No programa ni publica/);
  assert.ok(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75), "líneas plegadas a 75 octetos");
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test("agenda: distingue fecha prevista, autorización, publicación confirmada y subida manual", async () => {
  const { agenda } = await import("../src/lib/produccion/agenda");
  const ahora = new Date();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(ahora);
  const actual = await almacen.leerProduccion();
  const conFecha = modelo.asignarFecha(modelo.crearEncargo({ titulo: "Encargo con fecha", agente: "guion", proveedor: "gemini", canales: ["spotmi"], encargo: "x", resultado: "", fuentes: [], fechaPrevista: "" }), `${hoy}T15:00`);
  await almacen.guardarProduccion(actual.revision, (p) => ({ ...p, encargos: [conFecha, ...p.encargos] }));
  const g = granjas.crearDesdeReceta("eventos_el_salvador");
  const iso = ahora.toISOString();
  const b = db.base();
  b.prepare("insert into piezas (id, granja_id, version, contenido, hash, creado, actualizado) values ('pieza1', ?, 2, ?, 'h', ?, ?)").run(g.id, JSON.stringify({ titulo: "Post autorizado" }), iso, iso);
  b.prepare("insert into autorizaciones (id, pieza_id, hash, destinos, estado, usuario, creado, expira) values ('aut1', 'pieza1', 'h', ?, 'vigente', 'u', ?, ?)").run(JSON.stringify([{ canal: "instagram" }]), iso, iso);
  b.prepare("insert into autorizaciones (id, pieza_id, hash, destinos, estado, usuario, creado, expira) values ('aut2', 'pieza1', 'h', ?, 'usada', 'u', ?, ?)").run(JSON.stringify([{ canal: "facebook" }]), iso, iso);
  b.prepare("insert into recibos (id, autorizacion_id, pieza_id, hash, canal, cuenta_id, cuenta_nombre, clave_idempotencia, estado, enlace, creado, actualizado) values ('rec1', 'aut2', 'pieza1', 'h', 'facebook', 'c', 'Spotmi', 'k1', 'publicado', 'https://facebook.com/x', ?, ?)").run(iso, iso);
  b.prepare("insert into recibos (id, autorizacion_id, pieza_id, hash, canal, cuenta_id, cuenta_nombre, clave_idempotencia, estado, creado, actualizado) values ('rec2', 'aut2', 'pieza1', 'h', 'facebook', 'c', 'Spotmi', 'k2', 'fallido', ?, ?)").run(iso, iso);
  const a = await agenda({}, ahora);
  const tipos = (t: string) => a.entradas.filter((x) => x.tipo === t);
  assert.ok(tipos("prevista").some((x) => x.titulo === "Encargo con fecha" && x.dia === hoy));
  assert.equal(tipos("autorizada").length, 2, "vigente y usada");
  assert.match(tipos("autorizada")[0].detalle, /v2 · (instagram|facebook)/);
  assert.equal(tipos("publicada").length, 1, "un envío fallido no es una publicación");
  assert.equal(tipos("publicada")[0].enlace, "https://facebook.com/x");
  // Fuera del rango no aparece.
  assert.equal((await agenda({ desde: "2030-01-01", hasta: "2030-01-31" }, ahora)).entradas.length, 0);
  // El inicio propone el siguiente paso más urgente (hay un encargo en revisión de la prueba anterior).
  const r = await inicio.resumenInicio();
  assert.equal(r.siguiente.accion, "encargo_revision");
});
