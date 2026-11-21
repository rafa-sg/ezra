import test, { before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

// Todo ocurre en una carpeta de prueba; nunca en data/.
process.env.EZRA_DATA_DIR = path.resolve(`work/granjas-test-${process.pid}-${Date.now()}`);
process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.EZRA_PRODUCCION_IA = "0";
import type { Dependencias } from "../src/lib/granjas/pasos";
import type { Grafo, Nodo } from "../src/lib/granjas/modelo";
import { hayFfmpeg, rutaFfmpeg } from "./helpers/ffmpeg";
let modelo: typeof import("../src/lib/granjas/modelo");
let almacen: typeof import("../src/lib/granjas/almacen");
let ejecucion: typeof import("../src/lib/granjas/ejecucion");
let cola: typeof import("../src/lib/granjas/cola");
let db: typeof import("../src/lib/granjas/db");
let fuentes: typeof import("../src/lib/granjas/fuentes");
let cripto: typeof import("../src/lib/granjas/cripto");
let conexiones: typeof import("../src/lib/granjas/conexiones");
let publicacion: typeof import("../src/lib/granjas/publicacion");
let medios: typeof import("../src/lib/granjas/medios");
let procesarUno: typeof import("../src/lib/granjas/trabajador").procesarUno;
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  modelo = await import("../src/lib/granjas/modelo");
  almacen = await import("../src/lib/granjas/almacen");
  ejecucion = await import("../src/lib/granjas/ejecucion");
  cola = await import("../src/lib/granjas/cola");
  db = await import("../src/lib/granjas/db");
  fuentes = await import("../src/lib/granjas/fuentes");
  cripto = await import("../src/lib/granjas/cripto");
  conexiones = await import("../src/lib/granjas/conexiones");
  publicacion = await import("../src/lib/granjas/publicacion");
  medios = await import("../src/lib/granjas/medios");
  ({ procesarUno } = await import("../src/lib/granjas/trabajador"));
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
const uuid = () => crypto.randomUUID();
const nodo = (datos: Partial<Nodo> & Pick<Nodo, "tipo" | "titulo">): Nodo =>
  modelo.nodoSchema.parse({ id: uuid(), posicion: { x: 0, y: 0 }, ...datos });
const datos = (nombre = "Granja de prueba") => ({
  nombre,
  objetivo: "",
  formato: "publicacion" as const,
  canales: ["facebook" as const, "instagram" as const],
  politicaFuentes: { dominios: ["example.test"], maxFuentesPorPaso: 3 },
  ajustes: { zonaHoraria: "America/El_Salvador" as const },
});
const llamadasIA: string[] = [];
const deps = (cambios: Partial<Dependencias> = {}): Dependencias => ({
  generar: async (encargo, prompt) => {
    llamadasIA.push(prompt);
    return { texto: `Resultado simulado de ${encargo.agente}`, busquedaHtml: "" };
  },
  recolectar: async (lista) =>
    lista.map((f) => ({ nombre: f.nombre, url: f.url, consultado: new Date().toISOString(), estado: 200, sha256: "x", titulo: "Simulada", extracto: "Evento simulado", fechas: [], publicado: "", entradas: [], error: "" })),
  renderizar: async () => {
    throw new Error("render no esperado");
  },
  usosLegado: async () => 0,
  ...cambios,
});
async function vaciarCola(d = deps()) {
  for (let i = 0; i < 50; i++) if (!(await procesarUno("prueba", { dependencias: d, concurrencia: 4 }))) return;
}
async function imagenPrueba(color = "red") {
  const destino = path.join(process.env.EZRA_DATA_DIR!, `${color}-${uuid()}.jpg`);
  execFileSync(rutaFfmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=c=${color}:s=320x240`, "-frames:v", "1", destino]);
  return readFile(destino);
}


test("grafo: rechaza ciclos, duplicados, nodos faltantes e incompatibilidades", () => {
  const a = nodo({ tipo: "agente", agente: "cazador", titulo: "Caza" });
  const b = nodo({ tipo: "agente", agente: "guion", titulo: "Guion" });
  const m = nodo({ tipo: "medios", titulo: "Medios" });
  const r = nodo({ tipo: "render", titulo: "Render" });
  const base: Grafo = { nodos: [a, b, m, r], aristas: [{ id: uuid(), desde: a.id, hacia: b.id }] };
  assert.deepEqual(modelo.validarGrafo(base), []);
  const codigos = (g: Grafo) => modelo.validarGrafo(g).map((p) => p.codigo);
  assert.ok(codigos({ ...base, aristas: [...base.aristas, { id: uuid(), desde: b.id, hacia: a.id }] }).includes("ciclo"));
  assert.ok(codigos({ ...base, aristas: [...base.aristas, { id: uuid(), desde: a.id, hacia: b.id }] }).includes("arista_duplicada"));
  assert.ok(codigos({ ...base, aristas: [{ id: uuid(), desde: a.id, hacia: uuid() }] }).includes("nodo_inexistente"));
  assert.ok(codigos({ ...base, aristas: [{ id: uuid(), desde: a.id, hacia: a.id }] }).includes("bucle"));
  // La investigación no es un medio: el render no puede usarla.
  assert.ok(codigos({ ...base, aristas: [{ id: uuid(), desde: a.id, hacia: r.id }] }).includes("incompatible"));
  assert.ok(codigos({ ...base, aristas: [{ id: uuid(), desde: b.id, hacia: m.id }] }).includes("incompatible"));
  // Varias entradas en un mismo paso son válidas.
  assert.deepEqual(modelo.validarGrafo({ ...base, aristas: [{ id: uuid(), desde: m.id, hacia: r.id }, { id: uuid(), desde: b.id, hacia: r.id }] }), []);
  for (const receta of modelo.recetas) assert.deepEqual(modelo.validarGrafo(modelo.grafoDeReceta(receta)), [], receta.clave);
});

test("granjas: crear, duplicar, renombrar, pausar y archivar sin perder datos", () => {
  const g = almacen.crearDesdeReceta("evento_verificado");
  assert.equal(g.receta, "evento_verificado");
  assert.match(g.objetivo, /Completa aquí/);
  const copia = almacen.duplicarGranja(g.id);
  assert.notEqual(copia.id, g.id);
  assert.equal(copia.grafo.nodos.length, g.grafo.nodos.length);
  assert.ok(copia.grafo.nodos.every((n) => !g.grafo.nodos.some((o) => o.id === n.id)));
  const renombrada = almacen.actualizarGranja(g.id, g.revision, { datos: { ...g, nombre: "Evento de octubre" } });
  assert.equal(renombrada.nombre, "Evento de octubre");
  assert.throws(() => almacen.actualizarGranja(g.id, g.revision, { estado: "pausada" }), /otra ventana/);
  const pausada = almacen.actualizarGranja(g.id, renombrada.revision, { estado: "pausada" });
  assert.throws(() => ejecucion.iniciarEjecucion(g.id, { confirmarIA: false, usuario: "u", encargos: new Map() }), /pausa/);
  const archivada = almacen.actualizarGranja(g.id, pausada.revision, { estado: "archivada" });
  assert.equal(almacen.leerGranja(g.id).estado, "archivada");
  assert.throws(() => almacen.actualizarGranja(g.id, archivada.revision, { datos: { ...g, nombre: "x2" } }), /archivada/);
  // Guardado y relectura tras «reiniciar»: se cierra la conexión y se abre otra.
  const globales = globalThis as { ezraGranjasBases?: Map<string, { close(): void }> };
  globales.ezraGranjasBases?.get(db.archivoBase)?.close();
  globales.ezraGranjasBases?.delete(db.archivoBase);
  assert.equal(almacen.leerGranja(copia.id).nombre, copia.nombre);
});

function granjaManual() {
  const caza = nodo({ tipo: "agente", agente: "cazador", titulo: "Caza", proveedor: "manual" });
  const texto = nodo({ tipo: "agente", agente: "descripcion", titulo: "Texto", proveedor: "manual" });
  const revision = nodo({ tipo: "revision", titulo: "Revisión" });
  const pub = nodo({ tipo: "publicacion", titulo: "Publicar", canales: ["facebook", "instagram"] });
  const grafo: Grafo = {
    nodos: [caza, texto, revision, pub],
    aristas: [
      { id: uuid(), desde: caza.id, hacia: texto.id },
      { id: uuid(), desde: texto.id, hacia: revision.id },
      { id: uuid(), desde: revision.id, hacia: pub.id },
    ],
  };
  return { granja: almacen.crearGranja(datos(), grafo), caza, texto, revision, pub };
}
const pasoDe = (ejecucionId: string, nodoId: string) => ejecucion.pasosDe(ejecucionId).find((p) => p.nodoId === nodoId)!;

test("ejecución manual: espera, importa, revisa, pausa/reanuda y prepara la vista previa sin publicar", async () => {
  const { granja, caza, texto, revision, pub } = granjaManual();
  const e = ejecucion.iniciarEjecucion(granja.id, { confirmarIA: false, usuario: "u", encargos: new Map() });
  assert.equal(pasoDe(e.id, texto.id).estado, "esperando");
  await vaciarCola();
  assert.equal(pasoDe(e.id, caza.id).estado, "esperando_manual");
  const evidencia = ejecucion.completarManual(pasoDe(e.id, caza.id).id, { contenido: "Hallazgo con fuente", nota: "Hecho en otro chat" });
  assert.equal(evidencia.procedencia.origen, "manual");
  assert.equal(evidencia.tipo, "investigacion");
  ejecucion.pausar(e.id);
  await vaciarCola();
  assert.equal(pasoDe(e.id, texto.id).estado, "en_cola", "pausada: el trabajador no toma el paso");
  ejecucion.reanudar(e.id);
  await vaciarCola();
  ejecucion.completarManual(pasoDe(e.id, texto.id).id, { contenido: "Texto para redes #Spotmi", nota: "" });
  await vaciarCola();
  const rev = pasoDe(e.id, revision.id);
  assert.equal(rev.estado, "en_revision");
  assert.throws(() => ejecucion.aprobarRevision(rev.id, { hechos: true, derechos: false, marca: true }), /Confirma/);
  ejecucion.aprobarRevision(rev.id, { hechos: true, derechos: true, marca: true });
  await vaciarCola();
  const final = pasoDe(e.id, pub.id);
  assert.equal(final.estado, "esperando_autorizacion");
  assert.ok(final.piezaId);
  assert.equal(ejecucion.leerEjecucion(e.id).estado, "esperando_dueno");
  const vista = publicacion.vistaPieza(final.piezaId!);
  assert.equal(vista.pieza.contenido.textos.facebook, "Texto para redes #Spotmi");
  assert.equal(vista.aprobada, false);
  assert.equal(vista.recibos.length, 0, "preparar no publica");

  // Editar un resultado anterior desactualiza lo aprobado después.
  const artTexto = pasoDe(e.id, texto.id).salidas[0];
  ejecucion.editarArtefacto(artTexto, "Texto corregido", "fecha");
  assert.equal(pasoDe(e.id, revision.id).estado, "desactualizado");
  assert.equal(pasoDe(e.id, pub.id).estado, "desactualizado");
  assert.equal(ejecucion.aprobacionVigente(rev.id), undefined);
  assert.equal(almacen.leerArtefacto(artTexto).estado, "reemplazado", "la versión anterior se conserva");
  ejecucion.reintentarPaso(pasoDe(e.id, revision.id).id, false);
  await vaciarCola();
  assert.equal(pasoDe(e.id, revision.id).estado, "en_revision");
  // Un paso suelto no puede ejecutarse con entradas desactualizadas.
  assert.throws(() => ejecucion.iniciarEjecucion(granja.id, { nodoId: pub.id, confirmarIA: false, usuario: "u", encargos: new Map() }), /aprobación|resultado/);
  ejecucion.cancelar(e.id);
  assert.equal(pasoDe(e.id, revision.id).estado, "cancelado");
  assert.throws(() => ejecucion.reintentarPaso(pasoDe(e.id, revision.id).id, false), /cancelada/);
});

test("IA: exige consentimiento, recolecta fuentes, respeta el límite mensual y Gemini deshabilitado", async () => {
  const caza = nodo({ tipo: "agente", agente: "cazador", titulo: "Caza IA", proveedor: "claude", fuentes: [{ nombre: "Agenda", url: "https://example.test/agenda", imagen: "", nota: "" }] });
  const gem = nodo({ tipo: "agente", agente: "guion", titulo: "Guion Gemini", proveedor: "gemini" });
  const granja = almacen.crearGranja(datos("IA"), { nodos: [caza, gem], aristas: [{ id: uuid(), desde: caza.id, hacia: gem.id }] });
  assert.throws(() => ejecucion.iniciarEjecucion(granja.id, { confirmarIA: false, usuario: "u", encargos: new Map() }), /Confirma/);
  const e = ejecucion.iniciarEjecucion(granja.id, { confirmarIA: true, usuario: "u", encargos: new Map() });
  llamadasIA.length = 0;
  await vaciarCola();
  const p = pasoDe(e.id, caza.id);
  assert.equal(p.estado, "completado");
  assert.equal(p.salidas.length, 2, "evidencia + resultado");
  const [ev, res] = p.salidas.map(almacen.leerArtefacto);
  assert.equal(ev.procedencia.origen, "fuentes");
  assert.equal(res.procedencia.origen, "claude");
  assert.match(llamadasIA[0], /NO confiables/);
  const g = pasoDe(e.id, gem.id);
  assert.equal(g.estado, "bloqueado");
  assert.match(g.detalle, /Gemini está deshabilitado/);
  // Límite compartido de 30 intentos.
  const e2 = ejecucion.iniciarEjecucion(granja.id, { nodoId: caza.id, confirmarIA: true, usuario: "u", encargos: new Map() });
  await vaciarCola(deps({ usosLegado: async () => 30 }));
  const bloqueado = pasoDe(e2.id, caza.id);
  assert.equal(bloqueado.estado, "bloqueado");
  assert.match(bloqueado.detalle, /30 intentos/);
  // Reintentar un paso de IA vuelve a pedir consentimiento.
  assert.throws(() => ejecucion.reintentarPaso(bloqueado.id, false), /Confirma/);
});

test("cola: arriendos vencidos se recuperan y un envío interrumpido queda desconocido", () => {
  const g = almacen.crearGranja(datos("Cola"), { nodos: [nodo({ tipo: "revision", titulo: "R" })], aristas: [] });
  ejecucion.iniciarEjecucion(g.id, { confirmarIA: false, usuario: "u", encargos: new Map() });
  const tomado = cola.tomar("caido", { concurrencia: 1, arriendoMs: 1000 });
  assert.ok(tomado);
  assert.equal(cola.tomar("otro", { concurrencia: 1, arriendoMs: 1000 }), null, "respeta la concurrencia");
  const futuro = new Date(Date.now() + 5000).toISOString();
  assert.equal(cola.recuperarVencidos(futuro), 1);
  const otra = cola.tomar("otro", { concurrencia: 1, arriendoMs: 60000 });
  assert.equal(otra?.id, tomado!.id);
  assert.equal(otra?.intentos, 2);
  cola.terminar(otra!.id, "otro", "hecho");
  // Un envío a una red cortado a medias no se reintenta solo: queda «desconocido» para conciliarlo.
  const base = db.base();
  base.exec("pragma foreign_keys = off");
  const ahora = new Date().toISOString();
  base.prepare(
    "insert into recibos (id, autorizacion_id, pieza_id, hash, canal, cuenta_id, cuenta_nombre, clave_idempotencia, estado, creado, actualizado) values ('r-corte', 'a', 'p', 'h', 'facebook', 'c', 'C', 'k-corte', 'enviando', ?, ?)",
  ).run(ahora, ahora);
  base.exec("pragma foreign_keys = on");
  cola.encolar("publicar", { reciboId: "r-corte" }, { maxIntentos: 1 });
  const envio = cola.tomar("caido2", { concurrencia: 1, arriendoMs: 1000 });
  assert.equal(envio?.tipo, "publicar");
  cola.recuperarVencidos(new Date(Date.now() + 5000).toISOString());
  const recibo = base.prepare("select estado from recibos where id = 'r-corte'").get() as { estado: string };
  assert.equal(recibo.estado, "desconocido");
  const trabajo = base.prepare("select estado from trabajos where id = ?").get(envio!.id) as { estado: string };
  assert.equal(trabajo.estado, "fallido", "no se vuelve a enviar automáticamente");
});

test("fuentes: solo https, dominios permitidos, sin redes privadas ni redirecciones peligrosas", async () => {
  assert.ok(fuentes.direccionPrivada("10.1.2.3"));
  assert.ok(fuentes.direccionPrivada("127.0.0.1"));
  assert.ok(fuentes.direccionPrivada("169.254.169.254"));
  assert.ok(fuentes.direccionPrivada("::1"));
  assert.ok(fuentes.direccionPrivada("::ffff:192.168.0.1"));
  assert.ok(!fuentes.direccionPrivada("8.8.8.8"));
  assert.ok(fuentes.dominioPermitido("www.cultura.gob.sv", ["cultura.gob.sv"]));
  assert.ok(!fuentes.dominioPermitido("cultura.gob.sv.atacante.test", ["cultura.gob.sv"]));
  await assert.rejects(fuentes.descargarSegura("http://example.test/", ["example.test"]), /https/);
  await assert.rejects(fuentes.descargarSegura("https://otro.test/", ["example.test"]), /permitidos/);
  await assert.rejects(fuentes.descargarSegura("https://127.0.0.1/", ["127.0.0.1"]), /dominio/);
  const redirige = async () => ({ estado: 302, tipo: "", cuerpo: Buffer.alloc(0), url: "https://interno.otro.test/" });
  await assert.rejects(fuentes.descargarSegura("https://example.test/", ["example.test"], { descargar: redirige }), /permitidos/);
  assert.equal(fuentes.permitidoPorRobots("User-agent: *\nDisallow: /privado", "/privado/x"), false);
  assert.equal(fuentes.permitidoPorRobots("User-agent: otro\nDisallow: /", "/x"), true);
  const ev = fuentes.extraerEvidencia("rss", { estado: 200, tipo: "xml", url: "https://example.test/feed", cuerpo: Buffer.from("<rss><item><title>Fiesta &amp; feria</title><link>https://example.test/a</link><pubDate>Sat, 31 Oct 2026</pubDate></item></rss>") }, "2026-10-27T00:00:00Z");
  assert.equal(ev.entradas[0].titulo, "Fiesta & feria");
  const ficha = fuentes.extraerEvidencia("ficha", { estado: 200, tipo: "html", url: "https://example.test/e", cuerpo: Buffer.from('<html><script type="application/ld+json">{"datePublished":"2026-10-10T19:24:37+00:00"}</script><body><nav>Inicio Agenda 1 de enero</nav><h1>Noche de prueba</h1><div>31 de octubre de 2026</div><footer>2 de mayo</footer></body></html>') }, "2026-10-27T00:00:00Z");
  assert.deepEqual(ficha.fechas, ["31 de octubre de 2026"], "sin fechas del menú ni del pie");
  assert.equal(ficha.publicado, "2026-10-10T19:24:37+00:00");
  assert.match(ficha.extracto, /^Noche de prueba/);
});

test("cifrado: tokens cifrados y clave obligatoria", () => {
  const c = cripto.cifrar({ acceso: "secreto-de-prueba" });
  assert.ok(!c.includes("secreto-de-prueba"));
  assert.equal(cripto.descifrar<{ acceso: string }>(c).acceso, "secreto-de-prueba");
  const clave = process.env.EZRA_TOKEN_KEY;
  process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
  assert.throws(() => cripto.descifrar(c), /descifrar/);
  process.env.EZRA_TOKEN_KEY = "";
  assert.throws(() => cripto.cifrar({}), /EZRA_TOKEN_KEY/);
  process.env.EZRA_TOKEN_KEY = clave;
});

type Ruta = { metodo?: string; patron: RegExp; responder: (url: string, init?: RequestInit) => unknown | Promise<unknown>; estado?: number };
function red(rutas: Ruta[]) {
  const llamadas: { url: string; metodo: string }[] = [];
  conexiones.usarRedDePrueba(async (url, init) => {
    llamadas.push({ url, metodo: init?.method ?? "GET" });
    const ruta = rutas.find((r) => r.patron.test(url) && (!r.metodo || r.metodo === (init?.method ?? "GET")));
    if (!ruta) throw new Error(`Llamada no simulada: ${url}`);
    const cuerpo = await ruta.responder(url, init);
    if (cuerpo instanceof Error) throw cuerpo;
    return new Response(JSON.stringify(cuerpo), { status: ruta.estado ?? 200 });
  });
  return llamadas;
}

test("OAuth: estado ligado a la sesión, permisos negados, cuenta personal y token revocado (red simulada)", async () => {
  process.env.INSTAGRAM_APP_ID = "app-prueba";
  process.env.INSTAGRAM_APP_SECRET = "secreto-prueba";
  process.env.EZRA_OAUTH_REDIRECT_BASE = "https://ezra.example.test";
  const url = new URL(conexiones.iniciarOAuth("instagram", "user_a"));
  const estado = url.searchParams.get("state")!;
  assert.match(url.searchParams.get("scope")!, /instagram_business_content_publish/);
  // Otra sesión no puede usar el estado, y el estado es de un solo uso.
  await assert.rejects(conexiones.completarOAuth("instagram", { estado, codigo: "c", error: null, usuario: "user_b" }), /no es válida/);
  await assert.rejects(conexiones.completarOAuth("instagram", { estado, codigo: "c", error: null, usuario: "user_a" }), /no es válida/);
  const negado = new URL(conexiones.iniciarOAuth("instagram", "user_a")).searchParams.get("state");
  await assert.rejects(conexiones.completarOAuth("instagram", { estado: negado, codigo: null, error: "access_denied", usuario: "user_a" }), /no concedió/);
  assert.match(conexiones.leerConexion("instagram").ultimoError, /negaste/);

  const respuesta = (permisos: string, tipo: string): Ruta[] => [
    { metodo: "POST", patron: /api\.instagram\.com\/oauth\/access_token/, responder: () => ({ access_token: "corto", user_id: "1", permissions: permisos }) },
    { patron: /graph\.instagram\.com\/access_token/, responder: () => ({ access_token: "largo", expires_in: 5184000 }) },
    { patron: /graph\.instagram\.com\/v\d+\.\d+\/me/, responder: () => ({ user_id: "17841", username: "spotmi", account_type: tipo }) },
  ];
  red(respuesta("instagram_business_basic", "BUSINESS"));
  let st = new URL(conexiones.iniciarOAuth("instagram", "user_a")).searchParams.get("state");
  let c = await conexiones.completarOAuth("instagram", { estado: st, codigo: "ok", error: null, usuario: "user_a" });
  assert.equal(c.estado, "conectada_lectura", "sin permiso de publicación solo lee");
  red(respuesta("instagram_business_basic,instagram_business_content_publish", "PERSONAL"));
  st = new URL(conexiones.iniciarOAuth("instagram", "user_a")).searchParams.get("state");
  c = await conexiones.completarOAuth("instagram", { estado: st, codigo: "ok", error: null, usuario: "user_a" });
  assert.equal(c.estado, "restringida", "cuenta personal");
  red(respuesta("instagram_business_basic,instagram_business_content_publish", "BUSINESS"));
  st = new URL(conexiones.iniciarOAuth("instagram", "user_a")).searchParams.get("state");
  c = await conexiones.completarOAuth("instagram", { estado: st, codigo: "ok", error: null, usuario: "user_a" });
  assert.equal(c.estado, "conectada_publicacion");
  assert.deepEqual(c.identidad, { id: "17841", nombre: "@spotmi", tipo: "BUSINESS" });
  assert.ok(!JSON.stringify(c).includes("largo"), "el token nunca sale en la vista");
  red([{ patron: /graph\.instagram\.com/, estado: 400, responder: () => ({ error: { code: 190, message: "revoked" } }) }]);
  await assert.rejects(conexiones.verificarConexion("instagram"), /venció/);
  assert.equal(conexiones.leerConexion("instagram").estado, "vencida");
  conexiones.usarRedDePrueba(undefined);
});

async function conectarFacebook(paginaId = "pag1") {
  process.env.META_APP_ID = "meta";
  process.env.META_APP_SECRET = "secreto";
  red([
    { patron: /oauth\/access_token/, responder: () => ({ access_token: "usuario", expires_in: 5000000 }) },
    { patron: /me\/permissions/, responder: () => ({ data: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"].map((permission) => ({ permission, status: "granted" })) }) },
    { patron: /me\/accounts/, responder: () => ({ data: [{ id: paginaId, name: "Spotmi", tasks: ["CREATE_CONTENT", "MANAGE"], access_token: "pagina" }] }) },
  ]);
  const st = new URL(conexiones.iniciarOAuth("facebook", "user_a")).searchParams.get("state");
  return conexiones.completarOAuth("facebook", { estado: st, codigo: "ok", error: null, usuario: "user_a" });
}

test("publicación: aprobación por hash, simulación, envío idempotente, fallos parciales, desconocidos y cuenta cambiada", async () => {
  const fb = await conectarFacebook();
  assert.equal(fb.estado, "conectada_publicacion");
  const g = almacen.crearGranja(datos("Publicar"), { nodos: [nodo({ tipo: "revision", titulo: "R" })], aristas: [] });
  const contenido = {
    titulo: "Prueba",
    textos: { spotmi: "", instagram: "Texto IG", facebook: "Texto FB", tiktok: "" },
    medios: [],
    enlaces: [],
    canales: ["facebook", "instagram"] as ("facebook" | "instagram")[],
    programacion: { tipo: "ahora" as const },
    divulgaciones: { creditos: "", imagenGenerada: false },
    spotmi: { titulo: "", fecha: "", lugar: "", departamento: "", fuente: "" },
    fuentes: [],
  };
  let pieza = publicacion.guardarPiezaNueva(g.id, null, null, contenido);
  const llamadas = red([]);
  const sim = publicacion.simular(pieza.id, ["facebook", "instagram"]);
  assert.equal(llamadas.length, 0, "la simulación no toca la red");
  assert.deepEqual(sim.destinos.find((d) => d.canal === "facebook")!.problemas, []);
  assert.ok(sim.destinos.find((d) => d.canal === "instagram")!.problemas.some((p) => /imagen o un video/.test(p)));
  assert.throws(() => publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["facebook"], confirmacion: "PUBLICAR", usuario: "u" }), /Aprueba/);
  publicacion.aprobarPieza(pieza.id, pieza.hash, { hechos: true, derechos: true, marca: true });
  // Editar tras aprobar exige una aprobación nueva.
  pieza = publicacion.editarPieza(pieza.id, pieza.version, { ...contenido, textos: { ...contenido.textos, facebook: "Texto FB corregido" } });
  assert.throws(() => publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["facebook"], confirmacion: "PUBLICAR", usuario: "u" }), /Aprueba/);
  publicacion.aprobarPieza(pieza.id, pieza.hash, { hechos: true, derechos: true, marca: true });
  assert.throws(() => publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["facebook"], confirmacion: "si", usuario: "u" }), /PUBLICAR/);
  assert.throws(() => publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["facebook", "instagram"], confirmacion: "PUBLICAR", usuario: "u" }), /instagram/);

  // Red ambigua: el envío queda desconocido y no se repite a ciegas.
  let posts = 0;
  red([
    { metodo: "POST", patron: /pag1\/feed/, responder: () => { posts++; return new Error("timeout"); } },
    { patron: /pag1\/posts/, responder: () => ({ data: [] }) },
  ]);
  const aut = publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["facebook"], confirmacion: "PUBLICAR", usuario: "u" });
  await vaciarCola();
  let recibo = publicacion.vistaPieza(pieza.id).recibos[0];
  assert.equal(recibo.estado, "desconocido");
  assert.equal(posts, 1);
  await publicacion.ejecutarPublicacion(aut.recibos[0]);
  assert.equal(posts, 1, "conciliar no vuelve a publicar");
  assert.throws(() => publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["facebook"], confirmacion: "PUBLICAR", usuario: "u" }), /ya se envió/);
  publicacion.resolverDesconocido(recibo.id, "no_publicado", "");

  // Reintento comprobado: publicación con confirmación de estado y enlace.
  red([
    { metodo: "POST", patron: /pag1\/feed/, responder: () => ({ id: "pag1_99" }) },
    { patron: /pag1_99\?fields/, responder: () => ({ permalink_url: "https://www.facebook.com/pag1/posts/99", is_published: true }) },
  ]);
  publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["facebook"], confirmacion: "PUBLICAR", usuario: "u" });
  await vaciarCola();
  const espera = (globalThis as { setTimeout: typeof setTimeout }).setTimeout;
  void espera;
  // La confirmación se agenda 15 s después; se adelanta para la prueba.
  db.base().prepare("update trabajos set disponible_desde = ? where tipo = 'confirmar' and estado = 'pendiente'").run(new Date(0).toISOString());
  await vaciarCola();
  recibo = publicacion.vistaPieza(pieza.id).recibos.find((r) => r.estado !== "fallido")!;
  assert.equal(recibo.estado, "publicado");
  assert.equal(recibo.enlace, "https://www.facebook.com/pag1/posts/99");

  // Cuenta cambiada entre la autorización y el envío.
  const otra = publicacion.guardarPiezaNueva(g.id, null, null, { ...contenido, textos: { ...contenido.textos, facebook: "Otra" } });
  publicacion.aprobarPieza(otra.id, otra.hash, { hechos: true, derechos: true, marca: true });
  publicacion.autorizarPublicacion({ piezaId: otra.id, hash: otra.hash, destinos: ["facebook"], confirmacion: "PUBLICAR", usuario: "u" });
  await conectarFacebook("pag2");
  await vaciarCola();
  const cambiado = publicacion.vistaPieza(otra.id).recibos[0];
  assert.equal(cambiado.estado, "cancelado");
  assert.match(cambiado.error, /cuenta conectada|revocada/);
  conexiones.usarRedDePrueba(undefined);
});

test("publicación en varios canales: un fallo no oculta el éxito del otro; TikTok queda como borrador", async () => {
  if (!hayFfmpeg) return;
  await conectarFacebook("pag3");
  process.env.TIKTOK_CLIENT_KEY = "tk";
  process.env.TIKTOK_CLIENT_SECRET = "ts";
  red([
    { metodo: "POST", patron: /oauth\/token/, responder: () => ({ access_token: "t", refresh_token: "r", expires_in: 86400, refresh_expires_in: 31536000, scope: "user.info.basic,video.upload", open_id: "o" }) },
    { patron: /user\/info/, responder: () => ({ data: { user: { open_id: "o1", display_name: "spotmi.sv" } } }) },
  ]);
  const st = new URL(conexiones.iniciarOAuth("tiktok", "user_a")).searchParams.get("state");
  const tk = await conexiones.completarOAuth("tiktok", { estado: st, codigo: "ok", error: null, usuario: "user_a" });
  assert.equal(tk.estado, "restringida", "publicación directa bloqueada");
  assert.ok(tk.capacidades.includes("subir_borrador"));
  const [img1, img2] = [await imagenPrueba("red"), await imagenPrueba("blue")];
  const m1 = await medios.guardarMedio(img1, { nombre: "a.jpg", procedencia: { origen: "subida", nota: "" }, licencia: "Foto propia", generado: false });
  const m2 = await medios.guardarMedio(img2, { nombre: "b.jpg", procedencia: { origen: "subida", nota: "" }, licencia: "Foto propia", generado: false });
  const video = await medios.renderizarVertical([m1, m2], 1);
  assert.equal(video.ancho, 1080);
  assert.equal(video.alto, 1920);
  assert.ok((video.duracion ?? 0) >= 1.5);
  assert.equal(video.procedencia.origen, "render");
  const g = almacen.crearGranja(datos("Multi"), { nodos: [nodo({ tipo: "revision", titulo: "R" })], aristas: [] });
  const pieza = publicacion.guardarPiezaNueva(g.id, null, null, {
    titulo: "Video",
    textos: { spotmi: "", instagram: "", facebook: "Video FB", tiktok: "Video TK" },
    medios: [{ id: video.id, sha256: video.sha256, mime: video.mime, generado: false, licencia: video.licencia }],
    enlaces: [],
    canales: ["facebook", "tiktok"],
    programacion: { tipo: "ahora" },
    divulgaciones: { creditos: "Foto propia", imagenGenerada: false },
    spotmi: { titulo: "", fecha: "", lugar: "", departamento: "", fuente: "" },
    fuentes: [],
  });
  publicacion.aprobarPieza(pieza.id, pieza.hash, { hechos: true, derechos: true, marca: true });
  red([
    { metodo: "POST", patron: /graph-video\.facebook\.com/, estado: 400, responder: () => ({ error: { code: 100, message: "Invalid video" } }) },
    { metodo: "POST", patron: /inbox\/video\/init/, responder: () => ({ data: { publish_id: "p1", upload_url: "https://upload.tiktok.test/x" }, error: { code: "ok" } }) },
    { metodo: "PUT", patron: /upload\.tiktok\.test/, responder: () => ({}) },
    { metodo: "POST", patron: /status\/fetch/, responder: () => ({ data: { status: "SEND_TO_USER_INBOX" } }) },
  ]);
  publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["facebook", "tiktok"], confirmacion: "PUBLICAR", usuario: "u" });
  await vaciarCola();
  db.base().prepare("update trabajos set disponible_desde = ? where tipo = 'confirmar' and estado = 'pendiente'").run(new Date(0).toISOString());
  await vaciarCola();
  const recibos = publicacion.vistaPieza(pieza.id).recibos;
  assert.equal(recibos.find((r) => r.canal === "facebook")!.estado, "fallido");
  assert.equal(recibos.find((r) => r.canal === "tiktok")!.estado, "borrador_subido");
  conexiones.usarRedDePrueba(undefined);
});

test("granja de video: medios → render → revisión con un MP4 real", async () => {
  if (!hayFfmpeg) return;
  const m = await medios.guardarMedio(await imagenPrueba("green"), { nombre: "c.jpg", procedencia: { origen: "subida", nota: "" }, licencia: "Propia", generado: false });
  const med = nodo({ tipo: "medios", titulo: "Medios", medios: [m.id] });
  const ren = nodo({ tipo: "render", titulo: "Render", segundosPorImagen: 2 });
  const rev = nodo({ tipo: "revision", titulo: "Revisión" });
  const g = almacen.crearGranja(datos("Video"), {
    nodos: [med, ren, rev],
    aristas: [{ id: uuid(), desde: med.id, hacia: ren.id }, { id: uuid(), desde: ren.id, hacia: rev.id }],
  });
  const e = ejecucion.iniciarEjecucion(g.id, { confirmarIA: false, usuario: "u", encargos: new Map() });
  const { renderizarVertical } = medios;
  await vaciarCola(deps({ renderizar: renderizarVertical }));
  const paso = pasoDe(e.id, ren.id);
  assert.equal(paso.estado, "completado", paso.error);
  const art = almacen.leerArtefacto(paso.salidas[0]);
  assert.equal(art.tipo, "video");
  const v = medios.leerMedio(art.medioId!);
  assert.equal(v.mime, "video/mp4");
  assert.equal((await medios.leerBytesMedio(v)).length, v.bytes, "archivo real con suma comprobada");
  assert.equal(pasoDe(e.id, rev.id).estado, "en_revision");
  // Cambiar los medios del flujo invalida lo aprobado aguas abajo.
  ejecucion.aprobarRevision(pasoDe(e.id, rev.id).id, { hechos: true, derechos: true, marca: true });
  const actual = almacen.leerGranja(g.id);
  almacen.actualizarGranja(g.id, actual.revision, { grafo: { ...actual.grafo, nodos: actual.grafo.nodos.map((n) => (n.id === med.id ? { ...n, medios: [] } : n)) } });
  assert.equal(pasoDe(e.id, rev.id).estado, "desactualizado");
});
