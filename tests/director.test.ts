import test, { before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/; Claude, Astra y Gemini simulados; las imágenes se renderizan de verdad (next/og, local).
process.env.EZRA_DATA_DIR = path.resolve(`work/director-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.EZRA_PRODUCCION_IA = "1";
import type { Dependencias } from "../src/lib/granjas/pasos";
let director: typeof import("../src/lib/granjas/director");
let directorWeb: typeof import("../src/lib/granjas/director-web");
let diseno: typeof import("../src/lib/granjas/diseno");
let instagram: typeof import("../src/lib/granjas/instagram");
let pasosIG: typeof import("../src/lib/granjas/pasos-instagram");
let almacen: typeof import("../src/lib/granjas/almacen");
let ejecucion: typeof import("../src/lib/granjas/ejecucion");
let eventos: typeof import("../src/lib/granjas/eventos");
let medios: typeof import("../src/lib/granjas/medios");
let pasos: typeof import("../src/lib/granjas/pasos");
let db: typeof import("../src/lib/granjas/db");
let tiempo: typeof import("../src/lib/granjas/tiempo");
let procesarUno: typeof import("../src/lib/granjas/trabajador").procesarUno;
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  director = await import("../src/lib/granjas/director");
  directorWeb = await import("../src/lib/granjas/director-web");
  diseno = await import("../src/lib/granjas/diseno");
  instagram = await import("../src/lib/granjas/instagram");
  pasosIG = await import("../src/lib/granjas/pasos-instagram");
  almacen = await import("../src/lib/granjas/almacen");
  ejecucion = await import("../src/lib/granjas/ejecucion");
  eventos = await import("../src/lib/granjas/eventos");
  medios = await import("../src/lib/granjas/medios");
  pasos = await import("../src/lib/granjas/pasos");
  db = await import("../src/lib/granjas/db");
  tiempo = await import("../src/lib/granjas/tiempo");
  ({ procesarUno } = await import("../src/lib/granjas/trabajador"));
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
function eventoAprobado(titulo: string, dias: number, extra: Partial<Parameters<typeof eventos.crearEvento>[0]> = {}) {
  const e = eventos.crearEvento({
    titulo,
    fecha: tiempo.sumarDias(tiempo.diaLocal(), dias),
    hora: null,
    lugar: "Plaza Centenario",
    municipio: "Suchitoto",
    departamento: "Cuscatlán",
    categoria: "cultura",
    precio: null,
    boletosUrl: null,
    fuenteUrl: "https://cultura.gob.sv/agenda/x",
    confirmadoEn: {},
    sugerencias: {},
    descripcion: "Festival con música y comida típica.",
    imagenUrl: null,
    notaVerificacion: "",
    granjaId: null,
    ejecucionId: null,
    ...extra,
  });
  return eventos.aprobarEvento(e.id, e.revision);
}
const buenDiseno = (titular: string, laminas = 2) =>
  JSON.stringify({
    estilo: "tipografico",
    paleta: "atardecer",
    encuadre: "centro",
    gancho: "Plan de fin de semana",
    titular,
    laminas: Array.from({ length: laminas }, (_, i) => ({ titulo: `Qué esperar ${i + 1}`, texto: "Música en vivo, comida típica y artesanías en la plaza." })),
  });

test("director: valida estilo, paleta, titular del mismo evento y nada sin confirmar; nunca enlaces", () => {
  const e = eventoAprobado("Festival del Maíz de Suchitoto", 4);
  const ok = director.validarDiseno(`\`\`\`json\n${buenDiseno("Festival del Maíz")}\n\`\`\``, e, false);
  assert.deepEqual(ok.problemas, []);
  assert.equal(ok.diseno?.laminas.length, 2);
  const casos: [string, RegExp][] = [
    ["no es json", /objeto JSON/],
    [JSON.stringify({ estilo: "neon", paleta: "noche", titular: "Festival del Maíz" }), /estilo/],
    [JSON.stringify({ estilo: "tipografico", paleta: "#ff00ff", titular: "Festival del Maíz" }), /paleta/],
    [JSON.stringify({ estilo: "afiche", paleta: "noche", titular: "Festival del Maíz" }), /no tiene imagen autorizada/],
    [JSON.stringify({ estilo: "tipografico", paleta: "noche", titular: "Concierto de Bad Bunny" }), /nombrar el evento/],
    [JSON.stringify({ estilo: "tipografico", paleta: "noche", titular: "Festival del Maíz", gancho: "Desde las 7 p. m." }), /hora o un precio/],
    [JSON.stringify({ estilo: "tipografico", paleta: "noche", titular: "Festival del Maíz", laminas: [{ titulo: "Entrada", texto: "Entrada gratis para todos." }] }), /hora o un precio/],
    [JSON.stringify({ estilo: "tipografico", paleta: "noche", titular: "Festival del Maíz", laminas: [{ titulo: "Más", texto: "Síguenos en @festival" }] }), /enlaces ni cuentas/],
    [JSON.stringify({ estilo: "tipografico", paleta: "noche", titular: "Festival del Maíz", laminas: Array(5).fill({ titulo: "x", texto: "y" }) }), /laminas/],
  ];
  for (const [texto, motivo] of casos) assert.match(director.validarDiseno(texto, e, false).problemas.join(" "), motivo, texto);
  // Con hora confirmada, sí puede mencionarla.
  const conHora = eventos.crearEvento({ ...e, titulo: "Festival del Maíz con hora", hora: "19:00" });
  assert.deepEqual(director.validarDiseno(JSON.stringify({ estilo: "tipografico", paleta: "noche", titular: "Festival del Maíz", gancho: "Desde las 7 p. m." }), conHora, false).problemas, []);
});

test("director: dos intentos con la IA y, si no cumple o falla, la plantilla con la nota del motivo", async () => {
  const e = eventoAprobado("Feria de las Flores y las Palmas", 6);
  const prompts: string[] = [];
  const r1 = await director.dirigirDiseno(e, false, {
    proveedor: "claude",
    generar: async (p) => {
      prompts.push(p);
      return prompts.length === 1 ? "sin json" : buenDiseno("Feria de las Flores y las Palmas", 0);
    },
  });
  assert.equal(r1.origen, "claude");
  assert.match(prompts[1], /Tu intento anterior falló por: No respondiste con un objeto JSON/);
  assert.match(prompts[0], /único permitido/, "sin imagen solo ofrece el estilo tipográfico");
  const r2 = await director.dirigirDiseno(e, false, { proveedor: "astra", generar: async () => buenDiseno("Otro evento distinto") });
  assert.equal(r2.origen, "plantilla");
  assert.match(r2.nota, /La propuesta de astra no cumplió/);
  const r3 = await director.dirigirDiseno(e, true, {
    proveedor: "gemini",
    generar: async () => {
      throw new Error("sin conexión");
    },
  });
  assert.deepEqual([r3.origen, r3.diseno.estilo], ["plantilla", "afiche"]);
  assert.match(r3.nota, /No se pudo diseñar con gemini \(sin conexión\)/);
});

test("render: portada en cada estilo y paleta, carrusel con láminas y cierre, todo PNG 1080×1350", async () => {
  const datos = { dia: "28", mes: "noviembre", semana: "sábado", titulo: "Festival del Maíz", lugar: "Plaza Centenario, Suchitoto", hora: null, fondo: null };
  for (const estilo of director.estilosPost)
    for (const paleta of director.paletasPost) {
      const png = await diseno.renderizarPost(datos, { estilo, paleta, encuadre: "arriba", gancho: "Este sábado", titular: "Festival del Maíz", laminas: [] });
      assert.deepEqual(diseno.medidasPng(png), { ancho: 1080, alto: 1350 }, `${estilo}/${paleta}`);
    }
  const carrusel = await diseno.renderizarCarrusel(datos, JSON.parse(buenDiseno("Festival del Maíz", 3)));
  assert.equal(carrusel.length, 5, "portada + 3 láminas + cierre");
  for (const png of carrusel) assert.deepEqual(diseno.medidasPng(png), { ancho: 1080, alto: 1350 });
  assert.equal((await diseno.renderizarCarrusel(datos, JSON.parse(buenDiseno("Festival del Maíz", 0)))).length, 1, "sin láminas, una sola imagen");
});

test("granja «Post para Instagram» con Claude de director: carrusel guardado, intentos del límite mensual y rediseño sin IA que conserva el diseño", async () => {
  db.base().exec("delete from posts_ig; delete from eventos; delete from usos_ia;");
  const e = eventoAprobado("Festival del Maíz de Suchitoto", 3);
  const granja = almacen.crearDesdeReceta("post_instagram_eventos");
  // El propietario cambia el diseñador a Claude y el redactor a plantilla (local).
  const grafo = {
    ...granja.grafo,
    nodos: granja.grafo.nodos.map((n) => (n.agente === "disenador_post" ? { ...n, proveedor: "claude" as const } : n.agente === "redactor_ig" ? { ...n, proveedor: "local" as const } : n)),
  };
  almacen.actualizarGranja(granja.id, granja.revision, { grafo });
  const encargos: string[] = [];
  const deps: Dependencias = {
    generar: async (encargo, prompt) => {
      encargos.push(`${encargo.proveedor}:${encargo.agente}`);
      assert.match(prompt, /Director de arte/);
      return { texto: buenDiseno("Festival del Maíz", 2), busquedaHtml: "" };
    },
    recolectar: async () => [],
    renderizar: async () => {
      throw new Error("no");
    },
    usosLegado: async () => 0,
  };
  const ej = ejecucion.iniciarEjecucion(granja.id, { confirmarIA: true, usuario: "u", encargos: new Map() });
  for (let i = 0; i < 20; i++) if (!(await procesarUno("prueba", { dependencias: deps, concurrencia: 2 }))) break;
  const pasosEj = ejecucion.pasosDe(ej.id);
  assert.deepEqual(pasosEj.map((p) => p.estado), ["completado", "completado"]);
  assert.match(pasosEj.map((p) => p.detalle).join(" "), /1 carrusel\(es\) · 1 con diseño de claude/);
  assert.deepEqual(encargos, ["claude:disenador_post"]);
  assert.equal(pasos.usosGranjasDelMes(), 1, "cuenta para los 30 intentos de Astra y Claude");
  const [post] = instagram.listarPosts();
  assert.equal(post.eventoId, e.id);
  assert.equal(post.disenoOrigen, "claude");
  assert.equal(post.diseno?.paleta, "atardecer");
  assert.equal(post.carrusel.length, 4, "portada + 2 láminas + cierre");
  assert.equal(post.carrusel[0], post.medioId);
  for (const id of post.carrusel) assert.deepEqual(diseno.medidasPng(await medios.leerBytesMedio(medios.leerMedio(id))), { ancho: 1080, alto: 1350 });
  // «Rehacer imagen» sin IA conserva el diseño de Claude y no gasta intentos.
  const { post: rehecho } = await pasosIG.disenarPost(post.id, await directorWeb.iaDisenoWeb("local", post.id));
  assert.equal(rehecho.disenoOrigen, "claude");
  assert.equal(rehecho.carrusel.length, 4);
  assert.equal(rehecho.medioId, post.medioId, "el mismo diseño da la misma imagen (los medios se guardan por contenido)");
  assert.equal(pasos.usosGranjasDelMes(), 1);
  // Desde la web con Astra: un intento más del límite y el diseño cambia de autor.
  const ia = await directorWeb.iaDisenoWeb("astra", post.id, { ...deps, generar: async () => ({ texto: buenDiseno("Festival del Maíz", 0), busquedaHtml: "" }) });
  const { post: astra } = await pasosIG.disenarPost(post.id, ia);
  assert.deepEqual([astra.disenoOrigen, astra.carrusel.length], ["astra", 1]);
  assert.equal(pasos.usosGranjasDelMes(), 2);
  // Al llegar a 30, Astra y Claude ya no se llaman: queda la plantilla con el motivo.
  const lleno = await directorWeb.iaDisenoWeb("claude", post.id, { ...deps, usosLegado: async () => 30 });
  const { post: sinCupo } = await pasosIG.disenarPost(post.id, lleno);
  assert.equal(sinCupo.disenoOrigen, "plantilla");
  assert.match(sinCupo.disenoNota, /límite de 30 intentos/);
});

test("video: guion validado (titular del evento, nada sin confirmar, máx. 4 escenas) y plantilla si la IA falla", async () => {
  const video = await import("../src/lib/granjas/video");
  const e = eventoAprobado("Festival del Maíz de Suchitoto", 5);
  const bueno = { paleta: "selva", titular: "Festival del Maíz", escenas: [{ texto: "¿Plan para el sábado?", detalle: "", segundos: 3 }] };
  assert.deepEqual(video.validarGuion(JSON.stringify(bueno), e).problemas, []);
  const casos: [object, RegExp][] = [
    [{ ...bueno, titular: "Concierto de otra banda" }, /nombrar el evento/],
    [{ ...bueno, escenas: [{ texto: "Abre a las 8 p. m.", segundos: 3 }] }, /hora o un precio/],
    [{ ...bueno, escenas: [{ texto: "Info en www.x.com", segundos: 3 }] }, /enlaces/],
    [{ ...bueno, escenas: Array(5).fill({ texto: "x", segundos: 3 }) }, /escenas/],
    [{ ...bueno, escenas: [{ texto: "x", segundos: 30 }] }, /segundos/],
    [{ ...bueno, escenas: [] }, /escenas/],
  ];
  for (const [g, motivo] of casos) assert.match(video.validarGuion(JSON.stringify(g), e).problemas.join(" "), motivo);
  const prompts: string[] = [];
  const r = await video.escribirGuion(e, false, {
    proveedor: "claude",
    generar: async (p) => {
      prompts.push(p);
      return "{}";
    },
  });
  assert.equal(r.origen, "plantilla");
  assert.equal(prompts.length, 2);
  assert.match(r.nota, /El guion de claude no cumplió/);
  assert.ok(video.guionSchema.safeParse(r.guion).success, "la plantilla cumple el esquema");
});

test("video del post: MP4 vertical 1080×1920 real con ffmpeg, guardado en el post y un intento del límite", { skip: !existsSync("/opt/homebrew/bin/ffmpeg") }, async () => {
  db.base().exec("delete from posts_ig; delete from eventos; delete from usos_ia;");
  const e = eventoAprobado("Festival del Maíz de Suchitoto", 3);
  const post = instagram.crearPost({ eventoId: e.id, granjaId: null, ejecucionId: null, cuenta: "@spotmi.sv", texto: instagram.textoPlantilla(e), textoOrigen: "plantilla", nota: "" });
  const deps: Dependencias = {
    generar: async (_encargo, prompt) => {
      assert.match(prompt, /Guionista de video vertical/);
      return { texto: JSON.stringify({ paleta: "atardecer", titular: "Festival del Maíz", escenas: [{ texto: "¿Ya tienes plan?", detalle: "", segundos: 2 }] }), busquedaHtml: "" };
    },
    recolectar: async () => [],
    renderizar: async () => {
      throw new Error("no");
    },
    usosLegado: async () => 0,
  };
  const { post: conVideo, medio } = await pasosIG.crearVideoPost(post.id, await directorWeb.iaDisenoWeb("claude", post.id, deps));
  assert.equal(conVideo.video?.origen, "claude");
  assert.equal(conVideo.video?.medioId, medio.id);
  assert.equal(medio.mime, "video/mp4");
  assert.deepEqual([medio.ancho, medio.alto], [1080, 1920]);
  assert.ok(Math.abs((medio.duracion ?? 0) - 9) < 0.5, `portada 3,5 + 2 + cierre 3,5 s (fue ${medio.duracion})`);
  assert.equal(pasos.usosGranjasDelMes(), 1);
  assert.equal(conVideo.medioId, null, "el video no toca la imagen del post");
});
