import test, { before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/; Gemini simulado; la imagen se renderiza de verdad (next/og, local).
process.env.EZRA_DATA_DIR = path.resolve(`work/horario-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.EZRA_PRODUCCION_IA = "1";
process.env.GEMINI_API_KEY = "clave-de-prueba";
import type { Dependencias } from "../src/lib/granjas/pasos";
import { hayFfmpeg, rutaFfmpeg } from "./helpers/ffmpeg";
let horario: typeof import("../src/lib/granjas/horario");
let almacen: typeof import("../src/lib/granjas/almacen");
let ejecucion: typeof import("../src/lib/granjas/ejecucion");
let consumo: typeof import("../src/lib/granjas/consumo");
let eventos: typeof import("../src/lib/granjas/eventos");
let instagram: typeof import("../src/lib/granjas/instagram");
let diseno: typeof import("../src/lib/granjas/diseno");
let medios: typeof import("../src/lib/granjas/medios");
let db: typeof import("../src/lib/granjas/db");
let tiempo: typeof import("../src/lib/granjas/tiempo");
let procesarUno: typeof import("../src/lib/granjas/trabajador").procesarUno;
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  horario = await import("../src/lib/granjas/horario");
  almacen = await import("../src/lib/granjas/almacen");
  ejecucion = await import("../src/lib/granjas/ejecucion");
  consumo = await import("../src/lib/granjas/consumo");
  eventos = await import("../src/lib/granjas/eventos");
  instagram = await import("../src/lib/granjas/instagram");
  diseno = await import("../src/lib/granjas/diseno");
  medios = await import("../src/lib/granjas/medios");
  db = await import("../src/lib/granjas/db");
  tiempo = await import("../src/lib/granjas/tiempo");
  ({ procesarUno } = await import("../src/lib/granjas/trabajador"));
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
const sv = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-06:00`);
const todos = [0, 1, 2, 3, 4, 5, 6];

test("horario: a su hora, tarea perdida una sola vez al despertar, nunca dos veces el mismo día y días de la semana", async () => {
  db.base().exec("delete from horarios; delete from consumo_ia; delete from ajustes_estudio;");
  const granja = almacen.crearDesdeReceta("eventos_el_salvador");
  const config = { activa: true, hora: "04:30", dias: todos, despuesDe: null };
  assert.throws(() => horario.guardarHorario(granja.id, config, "u", true), /presupuesto/, "con Gemini exige presupuesto");
  consumo.guardarPresupuesto({ tokensDia: 100_000, tokensMes: 2_000_000 });
  assert.throws(() => horario.guardarHorario(granja.id, config, "u", false), /Confirma/, "y el consentimiento");
  // Activarlo a las 14:00 del lunes no lo dispara en ese momento: la primera es el martes a las 4:30.
  horario.guardarHorario(granja.id, config, "u", true, sv("2026-11-16", "14:00"));
  assert.equal(horario.proximaEjecucion(horario.leerHorario(granja.id), sv("2026-11-16", "14:01")), sv("2026-11-17", "04:30").toISOString());
  const iniciadas: string[] = [];
  const iniciar = async (id: string) => {
    iniciadas.push(id);
    return `ejecucion-${iniciadas.length}`;
  };
  // Martes 17 de noviembre de 2026.
  assert.deepEqual(await horario.revisarHorarios(sv("2026-11-17", "04:29"), iniciar), []);
  assert.equal(horario.proximaEjecucion(horario.leerHorario(granja.id), sv("2026-11-17", "04:29")), sv("2026-11-17", "04:30").toISOString());
  assert.equal((await horario.revisarHorarios(sv("2026-11-17", "04:30"), iniciar))[0].accion, "iniciada");
  assert.deepEqual(await horario.revisarHorarios(sv("2026-11-17", "04:31"), iniciar), [], "no corre dos veces el mismo día");
  assert.equal(horario.proximaEjecucion(horario.leerHorario(granja.id), sv("2026-11-17", "05:00")), sv("2026-11-18", "04:30").toISOString());
  // La Mac durmió el miércoles hasta las 9:15: corre al despertar, una sola vez.
  const despertar = await Promise.all([horario.revisarHorarios(sv("2026-11-18", "09:15"), iniciar), horario.revisarHorarios(sv("2026-11-18", "09:15"), iniciar)]);
  assert.equal(despertar.flat().filter((r) => r.accion === "iniciada").length, 1, "dos revisiones a la vez: una sola ejecución");
  assert.deepEqual(await horario.revisarHorarios(sv("2026-11-18", "23:59"), iniciar), []);
  assert.equal(iniciadas.length, 2);
  // Solo lunes a viernes: el sábado 21 no corre.
  horario.guardarHorario(granja.id, { ...config, dias: [1, 2, 3, 4, 5] }, "u", false);
  assert.deepEqual(await horario.revisarHorarios(sv("2026-11-21", "06:00"), iniciar), []);
  assert.equal(horario.proximaEjecucion(horario.leerHorario(granja.id), sv("2026-11-21", "06:00")), sv("2026-11-23", "04:30").toISOString());
  // Desactivado no corre.
  horario.guardarHorario(granja.id, { ...config, activa: false }, "u", false);
  assert.deepEqual(await horario.revisarHorarios(sv("2026-11-23", "05:00"), iniciar), []);
});

test("horario: presupuesto agotado pausa con motivo y se reanuda al día siguiente; la de Instagram corre encadenada", async () => {
  db.base().exec("delete from horarios; delete from consumo_ia; delete from ajustes_estudio;");
  consumo.guardarPresupuesto({ tokensDia: 1000, tokensMes: 1_000_000 });
  const ev = almacen.crearDesdeReceta("eventos_el_salvador");
  const ig = almacen.crearDesdeReceta("post_instagram_eventos");
  horario.guardarHorario(ev.id, { activa: true, hora: "04:30", dias: todos, despuesDe: null }, "u", true, sv("2026-11-16", "12:00"));
  horario.guardarHorario(ig.id, { activa: true, hora: "00:00", dias: todos, despuesDe: ev.id }, "u", true);
  assert.throws(() => horario.guardarHorario(ev.id, { activa: true, hora: "04:30", dias: todos, despuesDe: ig.id }, "u", true), /esperándose/);
  // Se gastó el presupuesto del día antes de las 4:30.
  consumo.registrarConsumo({ fecha: sv("2026-11-19", "02:00").toISOString(), origen: "ask", paso: "x", modelo: "m", uso: { totalTokenCount: 1000 }, busqueda: false, consultasBusqueda: 0, duracionMs: 1 });
  const pausa = await horario.revisarHorarios(sv("2026-11-19", "04:30"));
  assert.equal(pausa[0].accion, "pausada");
  const h = horario.leerHorario(ev.id);
  assert.equal(h.pausaMotivo, "presupuesto agotado");
  assert.equal(h.pausaHasta, sv("2026-11-20", "00:00").toISOString());
  assert.notEqual(h.ultimaFecha, "2026-11-19", "no se reservó el día");
  // Al día siguiente vuelve sola: primero eventos (ejecución real en cola), Instagram espera a que termine.
  const r = await horario.revisarHorarios(sv("2026-11-20", "04:30"));
  assert.deepEqual(r.map((x) => [x.granjaId, x.accion]), [[ev.id, "iniciada"]]);
  assert.equal(horario.leerHorario(ev.id).pausaMotivo, "", "la pausa se limpia");
  const idEventos = horario.leerHorario(ev.id).ultimaEjecucionId!;
  assert.equal(ejecucion.leerEjecucion(idEventos).instantanea.origen, "horario");
  assert.deepEqual(await horario.revisarHorarios(sv("2026-11-20", "04:35")), [], "Instagram espera mientras eventos sigue en curso");
  db.base().prepare("update ejecuciones set estado = 'completada' where id = ?").run(idEventos);
  const encadenada = await horario.revisarHorarios(sv("2026-11-20", "04:40"));
  assert.deepEqual(encadenada.map((x) => [x.granjaId, x.accion]), [[ig.id, "iniciada"]]);
  assert.deepEqual(await horario.revisarHorarios(sv("2026-11-20", "04:41")), []);
  const vista = horario.vistaHorario(ig.id, sv("2026-11-20", "05:00"));
  assert.equal(vista.ultima?.estado, "en_curso");
  assert.equal(vista.proxima, null, "encadenada: sin hora propia");
  db.base().exec("delete from trabajos");
});

function eventoAprobado(titulo: string, dias: number, extra: Partial<Parameters<typeof eventos.crearEvento>[0]> = {}) {
  const e = eventos.crearEvento({
    titulo,
    fecha: tiempo.sumarDias(tiempo.diaLocal(), dias),
    hora: null,
    lugar: "Teatro Nacional",
    municipio: "San Salvador Centro",
    departamento: "San Salvador",
    categoria: "musica",
    precio: null,
    boletosUrl: null,
    fuenteUrl: "https://cultura.gob.sv/agenda/x",
    confirmadoEn: {},
    sugerencias: {},
    descripcion: "Concierto de la Orquesta Sinfónica Juvenil.",
    imagenUrl: null,
    notaVerificacion: "",
    granjaId: null,
    ejecucionId: null,
    ...extra,
  });
  return eventos.aprobarEvento(e.id, e.revision);
}

test("texto del post: plantilla válida; la validación rechaza datos no confirmados, faltantes y hashtags de más", () => {
  const e = eventoAprobado("Gala de Navidad", 6, { descripcion: "Abre a las 7 pm, entrada $5." });
  const plantilla = instagram.textoPlantilla(e);
  assert.deepEqual(instagram.validarTextoIG(plantilla, e), []);
  assert.ok(plantilla.includes("\nMás info en spotmi\n"));
  assert.doesNotMatch(plantilla, /7 pm|\$5/, "la descripción con hora y precio sin confirmar no entra");
  const p = instagram.partesFecha(e.fecha!);
  const bueno = `Gala de Navidad 🎄\n${p.dia} de ${p.mes} en el Teatro Nacional.\n\nMás info en spotmi\n\n#ElSalvador #Spotmi #Navidad #Conciertos #SanSalvador`;
  assert.deepEqual(instagram.validarTextoIG(bueno, e), []);
  assert.match(instagram.validarTextoIG(bueno.replace("Más info en spotmi", ""), e).join(" "), /Más info en spotmi/);
  assert.match(instagram.validarTextoIG(bueno.replace(" #SanSalvador", ""), e).join(" "), /entre 5 y 10/);
  assert.match(instagram.validarTextoIG(`${bueno} #a #b #c #d #e #f`, e).join(" "), /entre 5 y 10/);
  assert.match(instagram.validarTextoIG(bueno.replace("Teatro Nacional.", "Teatro Nacional a las 7:30 p. m."), e).join(" "), /hora/);
  assert.match(instagram.validarTextoIG(bueno.replace("Teatro Nacional.", "Teatro Nacional. Entrada gratis."), e).join(" "), /precio/);
  assert.match(instagram.validarTextoIG("x".repeat(2300), e).join(" "), /2200/);
});

test("granja «Post para Instagram»: Gemini simulado corrige o cae a la plantilla, PNG 1080×1350 real, máximo por día y marcar como subido", async () => {
  db.base().exec("delete from posts_ig; delete from eventos; delete from horarios;");
  const uno = eventoAprobado("Concierto de Navidad", 3);
  const dos = eventoAprobado("Feria de Artesanías", 5, { categoria: "feria", descripcion: "Artesanías de todo el país." });
  eventoAprobado("Festival de Jazz", 8);
  eventos.crearEvento({ ...uno, titulo: "Evento sin aprobar" });
  // Imagen oficial con permiso para el primero (fondo de la plantilla).
  if (hayFfmpeg) {
    const destino = path.join(process.env.EZRA_DATA_DIR!, "fondo.jpg");
    execFileSync(rutaFfmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=orange:s=640x800", "-frames:v", "1", destino]);
    const medio = await medios.guardarMedio(await readFile(destino), { nombre: "Cartel oficial", procedencia: { origen: "subida", nota: "prueba" }, licencia: "Permiso de prueba", generado: false });
    const conImagen = eventos.autorizarImagen(uno.id, eventos.leerEvento(uno.id).revision, medio.id, "Autorizado por la organización (prueba)");
    assert.equal(conImagen.estado, "nuevo", "cambiar la portada exige revisar de nuevo");
    eventos.aprobarEvento(conImagen.id, conImagen.revision);
  }
  const granja = almacen.crearDesdeReceta("post_instagram_eventos");
  almacen.actualizarGranja(granja.id, granja.revision, { datos: { ...granja, ajustes: { ...granja.ajustes, instagram: { cuenta: "@spotmi.sv", postsPorDia: 2 } } } });
  const prompts: string[] = [];
  let llamada = 0;
  const deps: Dependencias = {
    generar: async (_encargo, prompt, contexto) => {
      prompts.push(prompt);
      assert.equal(contexto.origen, "granja");
      llamada++;
      // Concierto: primero sin hashtags (falla), luego bien. Feria: siempre mal → plantilla.
      if (prompt.includes("Concierto de Navidad"))
        return { texto: llamada === 1 ? "Ven al concierto." : `Concierto de Navidad\n${instagram.partesFecha(uno.fecha!).dia} de ${instagram.partesFecha(uno.fecha!).mes}, Teatro Nacional.\n\nMás info en spotmi\n\n#ElSalvador #Spotmi #Navidad #Conciertos #SanSalvador`, busquedaHtml: "" };
      return { texto: "Feria a las 3 pm con entrada gratis #uno", busquedaHtml: "" };
    },
    recolectar: async () => [],
    renderizar: async () => {
      throw new Error("no");
    },
    usosLegado: async () => 0,
  };
  const e = ejecucion.iniciarEjecucion(granja.id, { confirmarIA: true, usuario: "u", encargos: new Map() });
  for (let i = 0; i < 20; i++) if (!(await procesarUno("prueba", { dependencias: deps, concurrencia: 2 }))) break;
  assert.deepEqual(ejecucion.pasosDe(e.id).map((p) => p.estado).sort(), ["completado", "completado"]);
  assert.match(prompts[1], /Tu intento anterior falló por/, "el segundo intento recibe los problemas");
  const posts = instagram.listarPosts();
  assert.equal(posts.length, 2, "máximo 2 posts por día; el tercero espera");
  const concierto = posts.find((p) => p.eventoId === uno.id)!;
  const feria = posts.find((p) => p.eventoId === dos.id)!;
  assert.equal(concierto.textoOrigen, "ia");
  assert.equal(feria.textoOrigen, "plantilla");
  assert.match(feria.nota, /no cumplió las reglas/);
  assert.doesNotMatch(feria.texto, /3 pm|gratis/);
  for (const p of posts) {
    assert.equal(p.estado, "listo");
    const bytes = await medios.leerBytesMedio(medios.leerMedio(p.medioId!));
    assert.deepEqual(diseno.medidasPng(bytes), { ancho: 1080, alto: 1350 });
    assert.equal(eventos.leerEvento(p.eventoId).igEstado, "post_listo");
  }
  // Una segunda ejecución el mismo día no pasa del máximo.
  const e2 = ejecucion.iniciarEjecucion(granja.id, { confirmarIA: true, usuario: "u", encargos: new Map() });
  for (let i = 0; i < 20; i++) if (!(await procesarUno("prueba", { dependencias: deps, concurrencia: 2 }))) break;
  assert.equal(instagram.listarPosts().length, 2);
  assert.match(ejecucion.pasosDe(e2.id).map((p) => p.detalle).join(" "), /máximo de posts de hoy/);
  // Marcar como subido solo acepta un enlace de Instagram.
  assert.throws(() => instagram.marcarSubido(concierto.id, concierto.revision, "https://example.com/p/abc"), /Instagram/);
  const subido = instagram.marcarSubido(concierto.id, concierto.revision, "https://instagram.com/p/AbC123/?igsh=xyz");
  assert.equal(subido.igUrl, "https://www.instagram.com/p/AbC123/");
  assert.equal(eventos.leerEvento(uno.id).estadoVisible, "subido_ig");
});

test("diseño: la plantilla produce un PNG 1080×1350 con o sin fondo", async () => {
  const sinFondo = await diseno.renderizarPost({ dia: "28", mes: "noviembre", semana: "sábado", titulo: "Festival del Maíz de Suchitoto con un título bastante largo para probar el ajuste", lugar: "Plaza Centenario, Suchitoto", hora: "7:30 p. m.", fondo: null });
  assert.deepEqual(diseno.medidasPng(sinFondo), { ancho: 1080, alto: 1350 });
  assert.equal(diseno.medidasPng(Buffer.from("no es png")), null);
});
