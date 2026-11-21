import test, { before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

// Todo ocurre en una carpeta de prueba; nunca en data/.
process.env.EZRA_DATA_DIR = path.resolve(`work/clips-test-${process.pid}-${Date.now()}`);
process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.EZRA_PRODUCCION_IA = "0";
import type { Dependencias } from "../src/lib/granjas/pasos";
import type { VideoViral } from "../src/lib/produccion/modelo";
import { hayFfmpeg, rutaFfmpeg } from "./helpers/ffmpeg";
let modelo: typeof import("../src/lib/granjas/modelo");
let almacen: typeof import("../src/lib/granjas/almacen");
let ejecucion: typeof import("../src/lib/granjas/ejecucion");
let db: typeof import("../src/lib/granjas/db");
let medios: typeof import("../src/lib/granjas/medios");
let clips: typeof import("../src/lib/granjas/clips");
let produccion: typeof import("../src/lib/produccion/modelo");
let almacenProduccion: typeof import("../src/lib/produccion/almacen");
let procesarUno: typeof import("../src/lib/granjas/trabajador").procesarUno;
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  modelo = await import("../src/lib/granjas/modelo");
  almacen = await import("../src/lib/granjas/almacen");
  ejecucion = await import("../src/lib/granjas/ejecucion");
  db = await import("../src/lib/granjas/db");
  medios = await import("../src/lib/granjas/medios");
  clips = await import("../src/lib/granjas/clips");
  produccion = await import("../src/lib/produccion/modelo");
  almacenProduccion = await import("../src/lib/produccion/almacen");
  ({ procesarUno } = await import("../src/lib/granjas/trabajador"));
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});

const deps = (cambios: Partial<Dependencias> = {}): Dependencias => ({
  generar: async () => {
    throw new Error("IA no esperada");
  },
  recolectar: async () => [],
  renderizar: async () => {
    throw new Error("render genérico no esperado");
  },
  usosLegado: async () => 0,
  ...cambios,
});
async function vaciarCola(d = deps()) {
  for (let i = 0; i < 60; i++) if (!(await procesarUno("prueba-clips", { dependencias: d, concurrencia: 4 }))) return;
}
const video = (n: number, cambios: Partial<VideoViral> = {}): VideoViral => ({
  id: `vid${String(n).padStart(8, "0")}`,
  titulo: `Video ${n}`,
  canal: `Canal ${n}`,
  canalId: `UC${n}`,
  publicado: "2026-11-01T00:00:00.000Z",
  miniatura: "",
  duracion: 45,
  vistas: 1000 * n,
  meGusta: 10 * n,
  comentarios: n,
  vistasDia: 100 * n,
  interaccion: 0.011,
  ...cambios,
});
/** Encargo «Videos virales» con sus métricas, guardado en la carpeta de prueba. */
async function encargoVirales(estado: "aprobado" | "revision" = "aprobado") {
  const base = produccion.crearEncargo({
    titulo: "Videos virales: pupusas",
    agente: "virales",
    proveedor: "gemini",
    canales: ["youtube"],
    encargo: "pupusas\n\nPeríodo: últimos 30 días",
    resultado: "Lista de videos",
    fuentes: [],
    fechaPrevista: "",
  });
  const encargo = {
    ...base,
    estado,
    videos: [
      video(1, { titulo: "¿La MEJOR pupusa de El Salvador?", duracion: 38 }),
      video(2, { titulo: "5 pupuserías que tienes que probar", duracion: 55 }),
      video(3, { titulo: "Pupusas de loroco en Olocuilta", duracion: 610 }),
      video(4, { titulo: "¿Pupusas de arroz o de maíz?", duracion: null }),
    ],
  };
  const p = await almacenProduccion.leerProduccion();
  await almacenProduccion.guardarProduccion(p.revision, (a) => ({ ...a, encargos: [encargo, ...a.encargos] }));
  return encargo;
}
/** Video de prueba generado con ffmpeg (barras de color y un tono), sin material de terceros. */
async function videoPrueba(segundos = 12) {
  const destino = path.join(process.env.EZRA_DATA_DIR!, `prueba-${crypto.randomUUID()}.mp4`);
  execFileSync(rutaFfmpeg, [
    "-v", "error", "-f", "lavfi", "-i", `testsrc=size=640x360:rate=25:duration=${segundos}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${segundos}`,
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", destino,
  ]);
  return readFile(destino);
}
/** Granja Clips desde la receta, con el encargo y el material vinculados. */
function prepararGranja(encargoId: string, medioIds: string[]) {
  const g = almacen.crearDesdeReceta("clips");
  const grafo = {
    ...g.grafo,
    nodos: g.grafo.nodos.map((n) =>
      n.agente === "virales" ? { ...n, encargoId } : n.tipo === "medios" ? { ...n, medios: medioIds } : n,
    ),
  };
  return almacen.actualizarGranja(g.id, g.revision, { grafo });
}
const pasoDe = (ejecucionId: string, titulo: string) => {
  const e = ejecucion.leerEjecucion(ejecucionId);
  const nodo = e.instantanea.grafo.nodos.find((n) => n.titulo === titulo)!;
  return ejecucion.pasosDe(ejecucionId).find((p) => p.nodoId === nodo.id)!;
};

test("referencias: resume duración, títulos y vistas por día solo con enlaces y métricas", () => {
  const r = clips.resumirReferencias([
    video(1, { titulo: "¿La MEJOR pupusa?", duracion: 30 }),
    video(2, { titulo: "5 pupuserías imperdibles", duracion: 50 }),
    video(3, { titulo: "Pupusas en Olocuilta", duracion: 900 }),
    video(4, { titulo: "¿Pupusas de arroz?", duracion: null, interaccion: null }),
  ]);
  assert.equal(r.total, 4);
  assert.deepEqual(r.duracion, { mediana: 50, cortos: 2, medios: 0, largos: 1, sinDato: 1 });
  assert.equal(r.vistasDia.maximo, 400);
  assert.equal(r.titulos.conPregunta, 50);
  assert.equal(r.titulos.conNumero, 25);
  assert.ok(r.titulos.palabras.includes("pupusas"));
  // Destacados: enlace público de YouTube y métricas; ningún archivo.
  assert.equal(r.destacados[0].url, "https://www.youtube.com/watch?v=vid00000004");
  assert.ok(r.destacados.every((d) => Object.keys(d).sort().join() === "canal,duracion,titulo,url,vistasDia"));
  assert.ok(r.pistas.some((p) => /60 s/.test(p)));
  assert.deepEqual(clips.resumirReferencias([]).destacados, []);
});

test("receta Clips: grafo válido, referencia obligatoria y sin texto aparte para los destinos", () => {
  const receta = modelo.recetas.find((r) => r.clave === "clips")!;
  assert.deepEqual(receta.datos.canales, ["youtube", "tiktok", "instagram"]);
  const grafo = modelo.grafoDeReceta(receta);
  assert.deepEqual(modelo.validarGrafo(grafo), []);
  const faltan = (titulo: string, purpose = "clips") =>
    modelo.faltantesNodo(grafo.nodos.find((n) => n.titulo === titulo)!, grafo, { geminiHabilitado: true, purpose });
  assert.match(faltan("Referencias").join(), /Videos virales/);
  assert.match(faltan("Material").join(), /tuyo o con permiso/);
  assert.deepEqual(faltan("Destinos"), []);
  // Fuera de Clips, el paso «virales» sigue bloqueado en granjas.
  assert.match(faltan("Referencias", "custom").join(), /solo se pide desde Encargos/);
});

test("permiso del material: propio o con permiso del autor, con constancia", async () => {
  assert.throws(() => medios.validarPermiso({ tipo: "" }), /tuyo o si tienes permiso/);
  assert.throws(() => medios.validarPermiso({ tipo: "autorizado", autor: "Ana" }), /dónde consta/);
  assert.deepEqual(medios.validarPermiso({ tipo: "propio", autor: "", constancia: "" }), { tipo: "propio", autor: "", constancia: "" });
  if (!hayFfmpeg) return;
  const bytes = await videoPrueba(3);
  // Sin permiso declarado no sirve para Clips; al volver a subirlo con su permiso, se registra.
  const sin = await medios.guardarMedio(bytes, { nombre: "mi-video.mp4", procedencia: { origen: "subida", nota: "" }, licencia: "Mío", generado: false });
  assert.match(clips.problemasMaterial(sin).join(), /no tiene declarado/);
  const permiso = medios.validarPermiso({ tipo: "autorizado", autor: "Canal de Ana", constancia: "Correo del 12 nov" });
  const con = await medios.guardarMedio(bytes, { nombre: "mi-video.mp4", procedencia: { origen: "subida", nota: "" }, licencia: "x", generado: false, permiso });
  assert.equal(con.id, sin.id);
  assert.deepEqual(con.permiso, permiso);
  assert.deepEqual(clips.problemasMaterial(con), []);
  assert.equal(medios.textoPermiso(permiso), "Con permiso de Canal de Ana: Correo del 12 nov");
});

test("granja Clips: sin material propio o con permiso no avanza; la referencia exige el encargo aprobado", async () => {
  if (!hayFfmpeg) return;
  const pendiente = await encargoVirales("revision");
  const sinPermiso = await medios.guardarMedio(await videoPrueba(2), { nombre: "ajeno.mp4", procedencia: { origen: "subida", nota: "" }, licencia: "?", generado: false });
  const g = prepararGranja(pendiente.id, [sinPermiso.id]);
  const versiones = new Map([[pendiente.id, pendiente.version]]);
  const e = ejecucion.iniciarEjecucion(g.id, { confirmarIA: true, usuario: "prueba", encargos: versiones });
  await vaciarCola();
  const referencias = pasoDe(e.id, "Referencias");
  assert.equal(referencias.estado, "bloqueado");
  assert.match(referencias.detalle, /Aprueba primero/);
  const material = pasoDe(e.id, "Material");
  assert.equal(material.estado, "bloqueado");
  assert.match(material.detalle, /no tiene declarado/);
  // Momentos y el resto no se ejecutan.
  assert.equal(pasoDe(e.id, "Momentos").estado, "esperando");
  assert.equal(ejecucion.leerEjecucion(e.id).estado, "bloqueada");
});

test("granja Clips: referencias con el encargo aprobado y material con origen declarado", async () => {
  if (!hayFfmpeg) return;
  const encargo = await encargoVirales();
  const propio = await medios.guardarMedio(await videoPrueba(4), {
    nombre: "mi-recorrido.mp4",
    procedencia: { origen: "subida", nota: "" },
    licencia: "",
    generado: false,
    permiso: { tipo: "propio", autor: "", constancia: "" },
  });
  const g = prepararGranja(encargo.id, [propio.id]);
  const e = ejecucion.iniciarEjecucion(g.id, { confirmarIA: true, usuario: "prueba", encargos: new Map([[encargo.id, encargo.version]]) });
  await vaciarCola();
  const referencias = pasoDe(e.id, "Referencias");
  assert.equal(referencias.estado, "completado");
  const resumen = JSON.parse(almacen.leerArtefacto(referencias.salidas[0]).contenido);
  assert.equal(resumen.total, 4);
  assert.equal(resumen.encargo.id, encargo.id);
  assert.ok(resumen.destacados.every((d: { url: string }) => d.url.startsWith("https://www.youtube.com/watch?v=")));
  const material = pasoDe(e.id, "Material");
  assert.equal(material.estado, "completado");
  assert.equal(almacen.leerArtefacto(material.salidas[0]).medioId, propio.id);
});
