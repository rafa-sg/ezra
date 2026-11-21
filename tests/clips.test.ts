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
  renderizarClip: async () => {
    throw new Error("render de clip no esperado en esta prueba");
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

/* ── Fase 2 · Momentos con Gemini (simulado: sin red) ── */
const momentosJson = (clipsCrudos: { inicio: number; fin: number; titulo?: string }[], transcripcion = [{ inicio: 0, fin: 4, texto: "Hoy probamos las pupusas de loroco más famosas de Olocuilta" }]) =>
  JSON.stringify({ transcripcion, clips: clipsCrudos.map((c, i) => ({ titulo: `Clip ${i + 1}`, gancho: "¿Sabías esto?", motivo: "Dato curioso", ...c })) });
const ajustesPrueba = { minimo: 3, maximo: 8, segundosMin: 15, segundosMax: 60 };

test("momentos: valida tiempos, descarta lo que no cumple y arma subtítulos por clip", () => {
  const video = { id: crypto.randomUUID(), sha256: "a".repeat(64), segundos: 120 };
  const { momentos, problemas } = clips.validarMomentos(
    `Aquí va: ${momentosJson([
      { inicio: 0, fin: 20 },
      { inicio: 25, fin: 50 },
      { inicio: 30, fin: 52 }, // se repite con el anterior
      { inicio: 60, fin: 63 }, // muy corto
      { inicio: 70, fin: 100 },
      { inicio: 118, fin: 200 }, // fuera del video
    ])}`,
    video,
    ajustesPrueba,
  );
  assert.deepEqual(problemas, []);
  assert.equal(momentos!.clips.length, 3);
  assert.deepEqual(momentos!.clips.map((c) => [c.inicio, c.fin]), [[0, 20], [25, 50], [70, 100]]);
  assert.equal(momentos!.descartados.length, 3);
  // Subtítulos relativos al clip y en líneas cortas.
  const subs = momentos!.clips[0].subtitulos;
  assert.ok(subs.length >= 2);
  assert.ok(subs.every((s) => s.texto.length <= 42 && s.inicio >= 0 && s.fin <= 4.1));
  assert.equal(subs.map((s) => s.texto).join(" "), "Hoy probamos las pupusas de loroco más famosas de Olocuilta");
  // Pocos clips válidos: no se inventa ninguno.
  const pocos = clips.validarMomentos(momentosJson([{ inicio: 0, fin: 20 }]), video, ajustesPrueba);
  assert.equal(pocos.momentos, null);
  assert.match(pocos.problemas[0], /al menos 3/);
  assert.match(clips.validarMomentos("sin json", video, ajustesPrueba).problemas[0], /JSON/);
  // Un video de 40 s solo da para 2 clips de 15 s.
  assert.deepEqual(clips.rangoClips(40, ajustesPrueba), { minimo: 2, maximo: 2 });
});

test("Gemini con video: exige presupuesto, estima tokens, sube, pide resolución baja y borra el archivo", async () => {
  const gemini = await import("../src/lib/ia/gemini");
  const consumo = await import("../src/lib/granjas/consumo");
  const contexto = { origen: "granja" as const, paso: "Momentos" };
  const ruta = path.join(process.env.EZRA_DATA_DIR!, "no-se-lee.mp4");
  consumo.guardarPresupuesto({ tokensDia: null, tokensMes: null });
  await assert.rejects(gemini.analizarVideoGemini(contexto, { ruta, mime: "video/mp4", segundos: 60 }, "x"), /Define el presupuesto/);
  // 10 minutos ≈ 78.000 tokens: no caben en 50.000 por día.
  consumo.guardarPresupuesto({ tokensDia: 50_000, tokensMes: 3_000_000 });
  assert.equal(gemini.estimarTokensVideo(600), 600 * gemini.TOKENS_POR_SEGUNDO_VIDEO + gemini.TOKENS_EXTRA_VIDEO);
  let subidos = 0;
  const borrados: string[] = [];
  gemini.usarArchivosGeminiDePrueba({
    subir: async () => {
      subidos++;
      return { nombre: "files/prueba", uri: "https://generativelanguage.googleapis.com/v1beta/files/prueba", mime: "video/mp4" };
    },
    borrar: async (n) => {
      borrados.push(n);
    },
  });
  try {
    await assert.rejects(gemini.analizarVideoGemini(contexto, { ruta, mime: "video/mp4", segundos: 600 }, "x"), /quedan/);
    assert.equal(subidos, 0, "sin cupo no se sube nada");
    let peticion: Parameters<Parameters<typeof gemini.usarGeminiDePrueba>[0] & object>[0] | null = null;
    gemini.usarGeminiDePrueba(async (p) => {
      peticion = p;
      return { text: momentosJson([{ inicio: 0, fin: 20 }]), usageMetadata: { promptTokenCount: 6000, candidatesTokenCount: 300, totalTokenCount: 6300 } } as never;
    });
    const r = await gemini.analizarVideoGemini({ ...contexto, paso: "Momentos (prueba)" }, { ruta, mime: "video/mp4", segundos: 30 }, "Propón clips");
    assert.match(r.texto, /transcripcion/);
    assert.equal(r.estimado, 30 * gemini.TOKENS_POR_SEGUNDO_VIDEO + gemini.TOKENS_EXTRA_VIDEO);
    const p = peticion! as { contents: { parts: { fileData?: { fileUri: string }; text?: string }[] }[]; config: { mediaResolution: string } };
    assert.equal(p.contents[0].parts[0].fileData?.fileUri, "https://generativelanguage.googleapis.com/v1beta/files/prueba");
    assert.equal(p.config.mediaResolution, "MEDIA_RESOLUTION_LOW");
    assert.deepEqual(borrados, ["files/prueba"]);
    // Los tokens reales quedan en Consumo.
    const fila = db.base().prepare("select total_tokens from consumo_ia where paso = 'Momentos (prueba)'").get() as { total_tokens: number };
    assert.equal(fila.total_tokens, 6300);
    // Si Gemini falla, el archivo remoto también se borra.
    gemini.usarGeminiDePrueba(async () => {
      throw new Error("503 saturado");
    });
    await assert.rejects(gemini.analizarVideoGemini(contexto, { ruta, mime: "video/mp4", segundos: 30 }, "x"), /503/);
    assert.equal(borrados.length, 2);
  } finally {
    gemini.usarGeminiDePrueba(undefined);
    gemini.usarArchivosGeminiDePrueba(undefined);
  }
});

/** Ejecución completa hasta Momentos con Gemini simulado. Devuelve la ejecución y el video. */
async function ejecutarHastaMomentos(segundos = 40, respuesta?: (s: number) => string) {
  const encargo = await encargoVirales();
  const propio = await medios.guardarMedio(await videoPrueba(segundos), {
    nombre: `propio-${segundos}.mp4`,
    procedencia: { origen: "subida", nota: "" },
    licencia: "",
    generado: false,
    permiso: { tipo: "propio", autor: "Spotmi", constancia: "" },
  });
  const g = prepararGranja(encargo.id, [propio.id]);
  const datos = almacen.leerGranja(g.id);
  // Clips de prueba más cortos para no renderizar minutos de video.
  const ajustada = almacen.actualizarGranja(g.id, g.revision, { datos: { ...datos, ajustes: { ...datos.ajustes, clips: { minimo: 2, maximo: 3, segundosMin: 5, segundosMax: 10 } } } });
  const prompts: string[] = [];
  const analizarVideo: Dependencias["analizarVideo"] = async (v, prompt) => {
    prompts.push(prompt);
    assert.equal(v.ruta, medios.rutaMedio(propio));
    return {
      texto: respuesta?.(v.segundos) ?? momentosJson([{ inicio: 1, fin: 7, titulo: "Primer clip con un título bastante largo para probar el ajuste de líneas" }, { inicio: 9, fin: 16 }], [{ inicio: 1, fin: 5, texto: "Hoy probamos las pupusas de loroco" }, { inicio: 9, fin: 12, texto: "¿Cuál es tu favorita?" }]),
      estimado: 1234,
    };
  };
  const anterior = process.env.EZRA_PRODUCCION_IA;
  process.env.EZRA_PRODUCCION_IA = "1";
  try {
    const e = ejecucion.iniciarEjecucion(ajustada.id, { confirmarIA: true, usuario: "prueba", encargos: new Map([[encargo.id, encargo.version]]) });
    return { e, propio, prompts, deps: deps({ analizarVideo }), granja: ajustada };
  } finally {
    process.env.EZRA_PRODUCCION_IA = anterior;
  }
}

test("granja Clips: Momentos envía el video subido a Gemini con la referencia y guarda los clips propuestos", async () => {
  if (!hayFfmpeg) return;
  const { e, prompts, deps: d } = await ejecutarHastaMomentos(20);
  process.env.EZRA_PRODUCCION_IA = "1";
  try {
    // Sin render real todavía: el paso Render se detiene aquí (fase siguiente).
    await vaciarCola(d);
  } finally {
    process.env.EZRA_PRODUCCION_IA = "0";
  }
  const momentos = pasoDe(e.id, "Momentos");
  assert.equal(momentos.estado, "completado", momentos.detalle || momentos.error);
  assert.match(momentos.detalle, /2 clips propuestos/);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /pupusas/i, "la referencia viaja como datos");
  assert.match(prompts[0], /de 2 a 2 momentos|de 2 a 3 momentos/);
  const guardado = JSON.parse(almacen.leerArtefacto(momentos.salidas[0]).contenido) as import("../src/lib/granjas/clips").Momentos;
  assert.equal(guardado.clips.length, 2);
  assert.equal(guardado.clips[1].subtitulos[0].texto, "¿Cuál es tu favorita?");
  assert.equal(almacen.leerArtefacto(momentos.salidas[0]).procedencia.origen, "gemini");
});

test("granja Clips: Momentos con Astra o Claude se bloquea (no ven el video)", async () => {
  if (!hayFfmpeg) return;
  const encargo = await encargoVirales();
  const propio = await medios.guardarMedio(await videoPrueba(5), { nombre: "c.mp4", procedencia: { origen: "subida", nota: "" }, licencia: "", generado: false, permiso: { tipo: "propio", autor: "", constancia: "" } });
  const g = prepararGranja(encargo.id, [propio.id]);
  const grafo = { ...g.grafo, nodos: g.grafo.nodos.map((n) => (n.titulo === "Momentos" ? { ...n, proveedor: "claude" as const } : n)) };
  const g2 = almacen.actualizarGranja(g.id, g.revision, { grafo });
  const e = ejecucion.iniciarEjecucion(g2.id, { confirmarIA: true, usuario: "prueba", encargos: new Map([[encargo.id, encargo.version]]) });
  await vaciarCola();
  const momentos = pasoDe(e.id, "Momentos");
  assert.equal(momentos.estado, "bloqueado");
  assert.match(momentos.detalle, /elige Gemini o trabajo manual/);
});

/* ── Fase 3 · Render vertical con subtítulos (ffmpeg real si está instalado) ── */
test("render: gancho y subtítulos siempre dentro de las zonas seguras", async () => {
  const render = await import("../src/lib/granjas/clips-render");
  assert.ok(render.dentroDeZonaSegura(render.CAJA_SUBTITULOS));
  assert.ok(render.dentroDeZonaSegura(render.CAJA_GANCHO));
  assert.ok(!render.dentroDeZonaSegura({ x: 0, y: 1700, ancho: 1080, alto: 200 }));
  const capas = render.capasClip({
    inicio: 10,
    fin: 22,
    gancho: "¿Sabías esto?",
    subtitulos: [
      { inicio: 0.5, fin: 2, texto: "Hoy probamos" },
      { inicio: 11.5, fin: 14, texto: "se sale del clip" },
      { inicio: 13, fin: 15, texto: "no entra" },
    ],
  });
  assert.deepEqual(capas.map((c) => [c.tipo, c.inicio, c.fin]), [["gancho", 0, 3], ["subtitulo", 0.5, 2], ["subtitulo", 11.5, 12]]);
  assert.ok(capas.every((c) => render.dentroDeZonaSegura(c.caja)));
  // Sin audio en el original: se agrega silencio; nunca se usan herramientas de descarga.
  const args = render.argumentosClip("/x/entrada.mp4", { inicio: 10, fin: 22 }, capas.map((capa, i) => ({ capa, archivo: `/x/c${i}.png` })), false, "/x/salida.mp4");
  assert.deepEqual(args.slice(0, 9), ["-y", "-v", "error", "-ss", "10.00", "-t", "12.00", "-i", "/x/entrada.mp4"]);
  assert.ok(args.includes("anullsrc=channel_layout=stereo:sample_rate=44100"));
  const filtro = args[args.indexOf("-filter_complex") + 1];
  assert.match(filtro, /overlay=90:250:enable='between\(t,0\.00,3\.00\)'/);
  assert.match(filtro, /crop=1080:1920/);
  assert.equal(args[args.indexOf("-map", args.indexOf("-map") + 1) + 1], "4:a");
  assert.ok(!args.join(" ").match(/yt-dlp|youtube-dl|https?:/));
  // El PNG de una capa mide lo mismo que su caja.
  const png = await render.pngCapa(capas[1], []);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [render.CAJA_SUBTITULOS.ancho, render.CAJA_SUBTITULOS.alto]);
});

/** Color de un píxel de un cuadro del video (RGB). */
function pixel(archivo: string, segundo: number, x: number, y: number) {
  const salida = execFileSync(rutaFfmpeg, ["-v", "error", "-ss", String(segundo), "-i", archivo, "-frames:v", "1", "-vf", `crop=2:2:${x}:${y},format=rgb24`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  return [...salida.subarray(0, 3)];
}
test("granja Clips: render real de cada clip en 1080×1920 con gancho quemado, como medio con su origen", async () => {
  if (!hayFfmpeg) return;
  const { e, propio, deps: d } = await ejecutarHastaMomentos(20);
  const render = await import("../src/lib/granjas/clips-render");
  process.env.EZRA_PRODUCCION_IA = "1";
  try {
    await vaciarCola({ ...d, renderizarClip: render.renderizarClip });
  } finally {
    process.env.EZRA_PRODUCCION_IA = "0";
  }
  const paso = pasoDe(e.id, "Render de clips");
  assert.equal(paso.estado, "completado", paso.detalle || paso.error);
  const almacenClips = await import("../src/lib/granjas/clips-almacen");
  const lista = almacenClips.clipsDeEjecucion(e.id);
  assert.deepEqual(lista.map((c) => [c.numero, c.estado, c.inicio, c.fin]), [[1, "por_revisar", 1, 7], [2, "por_revisar", 9, 16]]);
  for (const c of lista) {
    const m = medios.leerMedio(c.medioId!);
    assert.deepEqual([m.ancho, m.alto], [1080, 1920]);
    assert.ok(Math.abs((m.duracion ?? 0) - (c.fin - c.inicio)) < 0.6, `duración del clip ${c.numero}`);
    assert.equal(m.procedencia.origen, "render");
    assert.deepEqual(m.procedencia.fuentes, [propio.sha256]);
    assert.deepEqual(m.permiso, propio.permiso);
  }
  // El gancho (recuadro violeta) aparece arriba en el primer segundo y ya no a los 4 s.
  const archivo = medios.rutaMedio(medios.leerMedio(lista[0].medioId!));
  const [r, g, b] = pixel(archivo, 0.5, 540, render.CAJA_GANCHO.y + 6);
  assert.ok(Math.abs(r - 98) < 30 && Math.abs(g - 75) < 30 && Math.abs(b - 190) < 30, `gancho: ${r},${g},${b}`);
  const despues = pixel(archivo, 4.5, 540, render.CAJA_GANCHO.y + 6);
  assert.ok(Math.abs(despues[2] - 190) > 20 || Math.abs(despues[0] - 98) > 20, "el gancho desaparece tras 3 s");
  // La revisión queda esperando al propietario.
  assert.equal(pasoDe(e.id, "Tu revisión").estado, "en_revision");
});

/* ── Fase 4 · Tu revisión clip por clip y destinos ── */
/** Render simulado: un video pequeño distinto por llamada (la lógica de revisión no depende del tamaño). */
let rendersSimulados = 0;
const renderSimulado = async () => {
  rendersSimulados++;
  const destino = path.join(process.env.EZRA_DATA_DIR!, `render-${crypto.randomUUID()}.mp4`);
  execFileSync(rutaFfmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=c=0x${(0x202020 + rendersSimulados * 7919).toString(16).slice(-6)}:s=108x192:d=1`, "-pix_fmt", "yuv420p", destino]);
  return medios.guardarMedio(await readFile(destino), { nombre: "clip.mp4", procedencia: { origen: "render", nota: "simulado" }, licencia: "Material propio.", generado: false });
};
async function ejecutarHastaRevision() {
  const r = await ejecutarHastaMomentos(20);
  process.env.EZRA_PRODUCCION_IA = "1";
  try {
    await vaciarCola({ ...r.deps, renderizarClip: renderSimulado });
  } finally {
    process.env.EZRA_PRODUCCION_IA = "0";
  }
  const almacenClips = await import("../src/lib/granjas/clips-almacen");
  return { ...r, almacenClips, lista: almacenClips.clipsDeEjecucion(r.e.id) };
}
const todas = { hechos: true, derechos: true, marca: true };

test("revisión de Clips: aprobar, rechazar con motivo y pedir cambios rehace solo ese clip", async () => {
  if (!hayFfmpeg) return;
  const { e, almacenClips, lista, deps: d } = await ejecutarHastaRevision();
  const publicacion = await import("../src/lib/granjas/publicacion");
  assert.equal(lista.length, 2);
  const revision = pasoDe(e.id, "Tu revisión");
  assert.equal(revision.estado, "en_revision");
  // No se aprueba todo de golpe: es clip por clip.
  assert.throws(() => ejecucion.aprobarRevision(revision.id, todas), /clip por clip/);
  assert.throws(() => almacenClips.aprobarClip(lista[0].id, { ...todas, derechos: false }), /hechos, derechos y marca/);
  assert.throws(() => almacenClips.rechazarClip(lista[1].id, " "), /motivo/);
  assert.throws(() => almacenClips.pedirCambiosClip(lista[1].id, { motivo: "Más corto", fin: 11 }), /debe durar de 5 a 10/);

  // Pedir cambios: nuevos tiempos y título; se rehace y vuelve a revisión como versión 2.
  const antes = lista[1].medioId;
  const cambiado = almacenClips.pedirCambiosClip(lista[1].id, { motivo: "Empieza en la pregunta", inicio: 9, fin: 15, titulo: "¿Cuál es tu favorita?" });
  assert.equal(cambiado.estado, "cambios");
  await vaciarCola({ ...d, renderizarClip: renderSimulado });
  const rehecho = almacenClips.leerClip(lista[1].id);
  assert.equal(rehecho.estado, "por_revisar");
  assert.equal(rehecho.version, 2);
  assert.equal(rehecho.titulo, "¿Cuál es tu favorita?");
  assert.notEqual(rehecho.medioId, antes);
  assert.equal(rehecho.subtitulos[0].texto, "¿Cuál es tu favorita?");

  // Aprobar el primero crea su vista previa aprobada, pero no se puede autorizar hasta terminar la revisión.
  const aprobado = almacenClips.aprobarClip(lista[0].id, todas);
  assert.equal(aprobado.estado, "aprobado");
  const pieza = publicacion.leerPieza(aprobado.piezaId!);
  assert.deepEqual(pieza.contenido.canales, ["youtube", "tiktok", "instagram"]);
  assert.deepEqual(pieza.contenido.fuentes, [], "ningún enlace de terceros");
  assert.equal(pieza.contenido.medios[0].id, aprobado.medioId);
  assert.match(pieza.contenido.textos.instagram, /^Primer clip/);
  assert.ok(publicacion.aprobacionPieza(pieza.id, pieza.hash), "aprobada esta versión exacta");
  assert.equal(pasoDe(e.id, "Tu revisión").estado, "en_revision", "falta decidir el clip 2");
  assert.throws(
    () => publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["youtube"], confirmacion: "PUBLICAR", usuario: "prueba" }),
    /Termina «Tu revisión»/,
  );

  // Rechazar el segundo con motivo cierra la revisión y Destinos espera tu autorización.
  const rechazado = almacenClips.rechazarClip(lista[1].id, "No se entiende sin contexto");
  assert.equal(rechazado.motivo, "No se entiende sin contexto");
  await vaciarCola(d);
  assert.equal(pasoDe(e.id, "Tu revisión").estado, "aprobado");
  const destinos = pasoDe(e.id, "Destinos");
  assert.equal(destinos.estado, "esperando_autorizacion");
  assert.match(destinos.detalle, /1 clip\(s\) aprobados/);
  assert.throws(() => almacenClips.aprobarClip(lista[1].id, todas), /no está esperando/);

  // Autorizar exige escribir PUBLICAR y cuentas conectadas: aquí no hay ninguna, así que nada sale.
  assert.throws(
    () => publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["youtube", "tiktok", "instagram"], confirmacion: "publicar", usuario: "prueba" }),
    /Escribe PUBLICAR/,
  );
  assert.throws(
    () => publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos: ["youtube", "tiktok", "instagram"], confirmacion: "PUBLICAR", usuario: "prueba" }),
    /youtube: .*tiktok: .*instagram: /,
  );
  assert.equal((db.base().prepare("select count(*) as n from recibos").get() as { n: number }).n, 0);
  // Editar el texto crea otra versión: la aprobación anterior ya no vale para ella.
  const editada = publicacion.editarPieza(pieza.id, pieza.version, { ...pieza.contenido, textos: { ...pieza.contenido.textos, instagram: "Otro texto" } });
  assert.equal(publicacion.aprobacionPieza(editada.id, editada.hash), undefined);
  assert.throws(
    () => publicacion.autorizarPublicacion({ piezaId: editada.id, hash: editada.hash, destinos: ["youtube"], confirmacion: "PUBLICAR", usuario: "prueba" }),
    /Aprueba esta versión/,
  );
});

test("revisión de Clips: rechazar todos deja la granja detenida, sin destinos", async () => {
  if (!hayFfmpeg) return;
  const { e, almacenClips, lista, deps: d } = await ejecutarHastaRevision();
  for (const c of lista) almacenClips.rechazarClip(c.id, "No me convence");
  await vaciarCola(d);
  assert.equal(pasoDe(e.id, "Tu revisión").estado, "bloqueado");
  assert.equal(pasoDe(e.id, "Destinos").estado, "esperando");
  // El texto lleva el crédito cuando el video es de otra persona con permiso.
  assert.equal(
    almacenClips.textoClip({ titulo: "Título", gancho: "Gancho" }, { tipo: "autorizado", autor: "Canal de Ana", constancia: "correo" }),
    "Título\n\nGancho\n\nVideo: Canal de Ana (con permiso).",
  );
});
