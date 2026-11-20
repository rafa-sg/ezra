import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/; Gemini (SDK) y páginas simulados. La clave es falsa.
process.env.EZRA_DATA_DIR = path.resolve(`work/gemini-errores-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.EZRA_PRODUCCION_IA = "1";
process.env.GEMINI_API_KEY = "clave-de-prueba";
import type { Respuesta } from "../src/lib/granjas/fuentes";
import type { Dependencias } from "../src/lib/granjas/pasos";
import type { GenerateContentParameters } from "@google/genai";
let errores: typeof import("../src/lib/ia/errores");
let gemini: typeof import("../src/lib/ia/gemini");
let proveedores: typeof import("../src/lib/produccion/proveedores");
let almacen: typeof import("../src/lib/granjas/almacen");
let ejecucion: typeof import("../src/lib/granjas/ejecucion");
let eventos: typeof import("../src/lib/granjas/eventos");
let db: typeof import("../src/lib/granjas/db");
let tiempo: typeof import("../src/lib/granjas/tiempo");
let procesarUno: typeof import("../src/lib/granjas/trabajador").procesarUno;
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  errores = await import("../src/lib/ia/errores");
  gemini = await import("../src/lib/ia/gemini");
  proveedores = await import("../src/lib/produccion/proveedores");
  almacen = await import("../src/lib/granjas/almacen");
  ejecucion = await import("../src/lib/granjas/ejecucion");
  eventos = await import("../src/lib/granjas/eventos");
  db = await import("../src/lib/granjas/db");
  tiempo = await import("../src/lib/granjas/tiempo");
  ({ procesarUno } = await import("../src/lib/granjas/trabajador"));
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
const claveFalsa = "AIzaSyFALSA-clave-que-nunca-debe-aparecer-123456";
const errorSdk = (status: number, mensaje = "error") => Object.assign(new Error(`{"error":{"code":${status},"message":"${mensaje} ${claveFalsa}"}}`), { status });

test("clasificación: 429 con y sin búsqueda, clave, modelo, saturado y tiempo; nunca la clave", () => {
  const casos: [unknown, boolean, string, RegExp][] = [
    [errorSdk(429, "RESOURCE_EXHAUSTED"), true, "busqueda_no_disponible", /no incluye la búsqueda de Google o se agotó su cuota\. Activa la facturación en AI Studio o apaga la búsqueda en este paso/],
    [errorSdk(429, "RESOURCE_EXHAUSTED"), false, "cuota", /cuota de Gemini o el límite de llamadas por minuto/],
    [errorSdk(401), false, "clave", /clave de Gemini no es válida/],
    [errorSdk(403), true, "clave", /clave de Gemini no es válida/],
    [errorSdk(400, "API key not valid. Please pass a valid API key."), false, "clave", /clave de Gemini no es válida/],
    [errorSdk(404, "models/x is not found"), false, "modelo", /modelo de Gemini configurado no existe/],
    [errorSdk(503, "UNAVAILABLE"), true, "saturado", /saturado/],
    [errorSdk(504), false, "tiempo", /tardó demasiado/],
    [Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }), false, "tiempo", /tardó demasiado/],
    [Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND generativelanguage.googleapis.com" } }), true, "red", /No hubo conexión con Gemini/],
    [new Error("respuesta rara"), false, "invalido", /no devolvió un resultado válido/],
  ];
  for (const [error, busqueda, codigo, mensaje] of casos) {
    const e = errores.clasificarErrorGemini(error, busqueda) as InstanceType<typeof errores.ErrorGemini>;
    assert.equal(e.codigo, codigo, String((error as Error).message));
    assert.match(e.message, mensaje);
    assert.doesNotMatch(e.message, /AIza|clave-que-nunca/, "el mensaje no lleva la clave ni el cuerpo");
  }
});

test("generarGemini: la búsqueda es una opción (no depende del especialista) y un 429 se traduce", async () => {
  const pedidas: GenerateContentParameters[] = [];
  gemini.usarGeminiDePrueba(async (p) => {
    pedidas.push(p);
    if ((p.config?.tools ?? []).length) throw errorSdk(429, "RESOURCE_EXHAUSTED");
    return { text: "Resultado", usageMetadata: { totalTokenCount: 10 } } as never;
  });
  const encargo = { agente: "cazador", proveedor: "gemini", titulo: "x" } as never;
  await assert.rejects(proveedores.generarGemini(encargo, "hola", { origen: "prueba", paso: "x" }), (e: Error & { codigo?: string }) => e.codigo === "busqueda_no_disponible");
  assert.equal((await proveedores.generarGemini(encargo, "hola", { origen: "prueba", paso: "x" }, { busqueda: false })).texto, "Resultado");
  await assert.rejects(
    proveedores.generarGemini({ ...(encargo as object), agente: "guion" } as never, "hola", { origen: "prueba", paso: "x" }, { busqueda: true }),
    (e: Error & { codigo?: string }) => e.codigo === "busqueda_no_disponible",
    "un paso que no es cazador también puede pedir búsqueda",
  );
  assert.deepEqual(
    pedidas.map((p) => (p.config?.tools ?? []).length),
    [1, 0, 1],
  );
  gemini.usarGeminiDePrueba(undefined);
});

/* ── Paso «Cazador de eventos» de punta a punta, con el adaptador real de Gemini ── */
const dia = () => tiempo.sumarDias(tiempo.diaLocal(), 5);
const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const largo = (d: string) => `${Number(d.slice(8, 10))} de ${meses[Number(d.slice(5, 7)) - 1]}`;
function web(paginas: Record<string, string>) {
  return async (u: URL): Promise<Respuesta> => {
    if (u.pathname === "/robots.txt") return { estado: 404, tipo: "text/plain", cuerpo: Buffer.from(""), url: u.toString() };
    const html = paginas[u.toString()];
    return html === undefined ? { estado: 404, tipo: "text/html", cuerpo: Buffer.from("no"), url: u.toString() } : { estado: 200, tipo: "text/html", cuerpo: Buffer.from(html), url: u.toString() };
  };
}
const paginas = () => ({
  "https://elsalvador.travel/esp/eventos/": `<html><body><h1>Eventos</h1><ul><li><a href="/esp/eventos/festival-del-cafe">Festival del Café de Apaneca</a> · ${largo(dia())}</li></ul><a href="https://www.instagram.com/mitur">Síguenos</a></body></html>`,
  "https://elsalvador.travel/esp/eventos/festival-del-cafe": `<html><body><h1>Festival del Café de Apaneca</h1><p>${largo(dia())}, desde las 9 a. m. Entrada gratuita.</p></body></html>`,
});
const deps = (): Dependencias => ({
  generar: (encargo, prompt, contexto, opciones) => proveedores.generarGemini(encargo, prompt, contexto, opciones),
  recolectar: async () => [],
  renderizar: async () => {
    throw new Error("no");
  },
  usosLegado: async () => 0,
  especialistas: { descargar: web(paginas()), catalogoSpotmi: async () => [] },
});
async function vaciar() {
  for (let i = 0; i < 30; i++) if (!(await procesarUno("prueba", { dependencias: deps(), concurrencia: 2 }))) return;
}
function granjaCon(cambio: (n: import("../src/lib/granjas/modelo").Nodo) => import("../src/lib/granjas/modelo").Nodo) {
  const g = almacen.crearDesdeReceta("eventos_el_salvador");
  const grafo = { ...g.grafo, nodos: g.grafo.nodos.map((n) => (n.agente === "cazador" ? cambio(n) : n)) };
  return almacen.actualizarGranja(g.id, g.revision, { grafo });
}
const consumoDe = (pasoId: string) =>
  db.base().prepare("select busqueda, error from consumo_ia where paso_id = ? order by fecha").all(pasoId) as { busqueda: number; error: string }[];

test("cazador: un 429 con búsqueda reintenta una vez solo con las Fuentes, lo avisa y el verificador confirma en la fuente", async () => {
  const prompts: string[] = [];
  gemini.usarGeminiDePrueba(async (p) => {
    const prompt = String(p.contents);
    prompts.push(prompt);
    if ((p.config?.tools ?? []).length) throw errorSdk(429, "RESOURCE_EXHAUSTED");
    // Sin búsqueda: Gemini solo ve el material de las Fuentes y responde con lo que trae.
    assert.match(prompt, /No tienes búsqueda en internet/);
    assert.match(prompt, /Festival del Café de Apaneca/);
    return {
      text: JSON.stringify([{ titulo: "Festival del Café de Apaneca", fecha: dia(), hora: "09:00", lugar: "Apaneca", municipio: "Apaneca", departamento: "Ahuachapán", categoria: "gastronomia", precio: "Entrada gratuita", boletos_url: null, fuente_url: "https://elsalvador.travel/esp/eventos/festival-del-cafe", imagen_url: null, descripcion: "Festival del café." }]),
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120, totalTokenCount: 1020 },
    } as never;
  });
  const granja = granjaCon((n) => n);
  const caza = granja.grafo.nodos.find((n) => n.agente === "cazador")!;
  assert.equal(caza.fuentes.length, 4, "la receta trae fuentes oficiales para trabajar sin búsqueda");
  const e = ejecucion.iniciarEjecucion(granja.id, { nodoId: caza.id, confirmarIA: true, usuario: "u", encargos: new Map() });
  await vaciar();
  const paso = ejecucion.pasosDe(e.id)[0];
  assert.equal(paso.estado, "completado");
  assert.match(paso.detalle, /se reintentó una vez sin búsqueda, solo con las Fuentes/);
  assert.deepEqual(
    consumoDe(paso.id).map((c) => [c.busqueda, /HTTP 429/.test(c.error)]),
    [
      [1, true],
      [0, false],
    ],
    "los dos intentos quedan en Consumo",
  );
  assert.match(prompts[0], /Busca en Google/);
  assert.equal(prompts.length, 2, "un solo reintento");
  // El verificador usa el resultado del cazador y confirma en la página del evento.
  const verif = granja.grafo.nodos.find((n) => n.agente === "verificador")!;
  const e2 = ejecucion.iniciarEjecucion(granja.id, { nodoId: verif.id, confirmarIA: true, usuario: "u", encargos: new Map() });
  await vaciar();
  assert.equal(ejecucion.pasosDe(e2.id)[0].estado, "completado");
  const [ev] = eventos.listarEventos();
  assert.equal(ev.fuenteUrl, "https://elsalvador.travel/esp/eventos/festival-del-cafe");
  assert.deepEqual([ev.fecha, ev.hora, ev.precio], [dia(), "09:00", "Entrada gratuita"]);
  gemini.usarGeminiDePrueba(undefined);
});

test("cazador: 429 sin búsqueda es cuota; 429 con búsqueda y sin Fuentes no reintenta y explica qué hacer", async () => {
  gemini.usarGeminiDePrueba(async () => {
    throw errorSdk(429, "RESOURCE_EXHAUSTED");
  });
  // Búsqueda apagada en el inspector: trabaja con las Fuentes y el 429 es de cuota.
  const sinBusqueda = granjaCon((n) => ({ ...n, busqueda: false }));
  const c1 = sinBusqueda.grafo.nodos.find((n) => n.agente === "cazador")!;
  const e1 = ejecucion.iniciarEjecucion(sinBusqueda.id, { nodoId: c1.id, confirmarIA: true, usuario: "u", encargos: new Map() });
  await vaciar();
  const p1 = ejecucion.pasosDe(e1.id)[0];
  assert.equal(p1.estado, "bloqueado", "se puede reintentar");
  assert.match(p1.detalle, /cuota de Gemini o el límite de llamadas por minuto/);
  assert.deepEqual(consumoDe(p1.id).map((c) => c.busqueda), [0]);
  // Con búsqueda y sin fuentes no hay con qué reintentar.
  const sinFuentes = granjaCon((n) => ({ ...n, fuentes: [] }));
  const c2 = sinFuentes.grafo.nodos.find((n) => n.agente === "cazador")!;
  const e2 = ejecucion.iniciarEjecucion(sinFuentes.id, { nodoId: c2.id, confirmarIA: true, usuario: "u", encargos: new Map() });
  await vaciar();
  const p2 = ejecucion.pasosDe(e2.id)[0];
  assert.equal(p2.estado, "bloqueado");
  assert.equal(p2.detalle, errores.MENSAJE_BUSQUEDA_NO_DISPONIBLE);
  assert.doesNotMatch(p2.detalle + p2.error, /AIza|RESOURCE_EXHAUSTED/);
  assert.equal(consumoDe(p2.id).length, 1, "sin fuentes no hay reintento");
  // Sin búsqueda y sin fuentes, el inspector explica lo que falta.
  const { faltantesNodo } = await import("../src/lib/granjas/modelo");
  const vacio = granjaCon((n) => ({ ...n, fuentes: [], busqueda: false }));
  const c3 = vacio.grafo.nodos.find((n) => n.agente === "cazador")!;
  assert.match(faltantesNodo(c3, vacio.grafo, { geminiHabilitado: true }).join(" "), /Sin búsqueda de Google, agrega al menos una fuente/);
  gemini.usarGeminiDePrueba(undefined);
});

test("cazador: sin internet (fetch failed) no falla: vuelve a la cola en 1 min, luego 3 y 10; al volver la red termina", async () => {
  let red = false;
  gemini.usarGeminiDePrueba(async () => {
    if (!red) throw new TypeError("fetch failed");
    return {
      text: JSON.stringify([{ titulo: "Festival del Café de Apaneca", fecha: dia(), hora: null, lugar: "Apaneca", municipio: "Apaneca", departamento: "Ahuachapán", categoria: "gastronomia", precio: null, boletos_url: null, fuente_url: "https://elsalvador.travel/esp/eventos/festival-del-cafe", imagen_url: null, descripcion: "x" }]),
      usageMetadata: { totalTokenCount: 50 },
    } as never;
  });
  const granja = granjaCon((n) => ({ ...n, busqueda: false }));
  const caza = granja.grafo.nodos.find((n) => n.agente === "cazador")!;
  const e = ejecucion.iniciarEjecucion(granja.id, { nodoId: caza.id, confirmarIA: true, usuario: "u", encargos: new Map() });
  const trabajo = () => db.base().prepare("select estado, disponible_desde from trabajos where ejecucion_id = ?").get(e.id) as { estado: string; disponible_desde: string };
  const adelantar = () => db.base().prepare("update trabajos set disponible_desde = ? where ejecucion_id = ?").run(new Date(Date.now() - 1000).toISOString(), e.id);
  const esperas: number[] = [];
  for (let i = 0; i < 3; i++) {
    const antes = Date.now();
    await vaciar();
    const paso = ejecucion.pasosDe(e.id)[0];
    assert.equal(paso.estado, "en_cola", `intento ${i + 1}: espera en la cola, no falla`);
    assert.match(paso.detalle, new RegExp(`No hubo conexión con Gemini.*Reintento ${i + 1} de 3`));
    assert.equal(trabajo().estado, "pendiente");
    esperas.push(Math.round((Date.parse(trabajo().disponible_desde) - antes) / 60_000));
    assert.notEqual(ejecucion.leerEjecucion(e.id).estado, "fallida");
    adelantar();
  }
  assert.deepEqual(esperas, [1, 3, 10]);
  red = true;
  await vaciar();
  assert.equal(ejecucion.pasosDe(e.id)[0].estado, "completado", "con red, el cuarto intento termina");
  // Sin red en los 4 intentos, el paso sí falla (no se reintenta para siempre).
  red = false;
  const e2 = ejecucion.iniciarEjecucion(granja.id, { nodoId: caza.id, confirmarIA: true, usuario: "u", encargos: new Map() });
  for (let i = 0; i < 4; i++) {
    await vaciar();
    db.base().prepare("update trabajos set disponible_desde = ? where ejecucion_id = ?").run(new Date(Date.now() - 1000).toISOString(), e2.id);
  }
  const final = ejecucion.pasosDe(e2.id)[0];
  assert.notEqual(final.estado, "en_cola");
  assert.match(final.error, /No hubo conexión con Gemini/);
  gemini.usarGeminiDePrueba(undefined);
});
