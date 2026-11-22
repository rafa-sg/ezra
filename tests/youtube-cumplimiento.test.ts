import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Todo ocurre en una carpeta de prueba; nunca en data/.
process.env.EZRA_DATA_DIR = path.resolve(`work/youtube-cumplimiento-${process.pid}-${Date.now()}`);
process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 5).toString("base64");
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
import type { Encargo, VideoViral } from "../src/lib/produccion/modelo";
let produccion: typeof import("../src/lib/produccion/modelo");
let almacenProduccion: typeof import("../src/lib/produccion/almacen");
let caducidad: typeof import("../src/lib/produccion/virales-caducidad");
let conexiones: typeof import("../src/lib/granjas/conexiones");
let db: typeof import("../src/lib/granjas/db");
let almacen: typeof import("../src/lib/granjas/almacen");
let clips: typeof import("../src/lib/granjas/clips");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  produccion = await import("../src/lib/produccion/modelo");
  almacenProduccion = await import("../src/lib/produccion/almacen");
  caducidad = await import("../src/lib/produccion/virales-caducidad");
  conexiones = await import("../src/lib/granjas/conexiones");
  db = await import("../src/lib/granjas/db");
  almacen = await import("../src/lib/granjas/almacen");
  clips = await import("../src/lib/granjas/clips");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});

const DIA = 24 * 3600 * 1000;
const video: VideoViral = {
  id: "abcdefghijk",
  titulo: "Video ajeno",
  canal: "Canal ajeno",
  canalId: "UCx",
  publicado: "2026-10-01T00:00:00.000Z",
  miniatura: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg",
  duracion: 40,
  vistas: 5000,
  meGusta: 50,
  comentarios: 5,
  vistasDia: 200,
  interaccion: 0.011,
};
function encargoViral(consultado: string | null, extra: Partial<Encargo> = {}): Encargo {
  const base = produccion.crearEncargo({
    titulo: "Videos virales: pupusas",
    agente: "virales",
    proveedor: "gemini",
    canales: ["youtube"],
    encargo: "pupusas",
    resultado: "1. Video ajeno — Canal ajeno · 5 mil vistas",
    fuentes: [
      { nombre: "Video ajeno · Canal ajeno", url: "https://www.youtube.com/watch?v=abcdefghijk", imagen: "", nota: "5 mil vistas" },
      { nombre: "MITUR", url: "https://elsalvador.travel/esp/eventos/", imagen: "", nota: "" },
    ],
    fechaPrevista: "",
  });
  return {
    ...base,
    origenResultado: "youtube",
    videos: [video],
    videosConsultados: consultado,
    historial: [{ version: 1, accion: "generado", estado: "revision", nota: "", resultado: "1. Video ajeno · 5 mil vistas", fecha: consultado ?? base.actualizado }],
    ...extra,
  };
}

test("virales: los datos de videos ajenos duran 30 días desde la consulta y después se borran por completo", () => {
  const consulta = "2026-10-01T12:00:00.000Z";
  const e = encargoViral(consulta);
  assert.equal(caducidad.caducidadVirales(e), "2026-10-31T12:00:00.000Z");
  // Día 29: se conserva tal cual.
  assert.equal(caducidad.caducarEncargoViral(e, new Date(Date.parse(consulta) + 29 * DIA)), e);
  // Día 30: se borran videos, enlaces de YouTube, estadísticas del texto y del historial.
  const vencido = caducidad.caducarEncargoViral(e, new Date(Date.parse(consulta) + 30 * DIA));
  assert.deepEqual(vencido.videos, []);
  assert.equal(vencido.videosConsultados, null);
  assert.deepEqual(vencido.fuentes.map((f) => f.url), ["https://elsalvador.travel/esp/eventos/"], "las fuentes que no son de YouTube quedan");
  assert.equal(vencido.resultado, caducidad.AVISO_VIRALES_CADUCADOS);
  assert.ok(vencido.historial.every((h) => !h.resultado || h.resultado === caducidad.AVISO_VIRALES_CADUCADOS));
  assert.ok(!JSON.stringify(vencido).includes("abcdefghijk"), "no queda ni el id del video");
  // Ya borrado, no vuelve a cambiar.
  assert.equal(caducidad.caducarEncargoViral(vencido, new Date(Date.parse(consulta) + 60 * DIA)), vencido);
  // Encargos anteriores al campo nuevo: cuenta desde la última entrega guardada.
  const viejo = encargoViral(null, { historial: [{ version: 1, accion: "generado", estado: "revision", nota: "", resultado: "x", fecha: consulta }] });
  assert.equal(caducidad.fechaConsultaVirales(viejo), consulta);
  // Otros encargos no se tocan.
  const otro = { ...encargoViral(consulta), agente: "redactor_ig" as const };
  assert.equal(caducidad.caducarEncargoViral(otro, new Date(Date.parse(consulta) + 90 * DIA)), otro);
});

test("virales: la limpieza guarda el estudio sin los datos vencidos y respeta los vigentes", async () => {
  const ahora = new Date("2026-11-21T12:00:00.000Z");
  const vencido = encargoViral(new Date(ahora.getTime() - 31 * DIA).toISOString());
  const vigente = encargoViral(new Date(ahora.getTime() - 2 * DIA).toISOString());
  const p = await almacenProduccion.leerProduccion();
  await almacenProduccion.guardarProduccion(p.revision, (a) => ({ ...a, encargos: [vencido, vigente, ...a.encargos] }));
  assert.equal(await caducidad.purgarViralesVencidos(ahora), 1);
  const tras = (await almacenProduccion.leerProduccion()).encargos;
  assert.deepEqual(tras.find((e) => e.id === vencido.id)!.videos, []);
  assert.equal(tras.find((e) => e.id === vigente.id)!.videos.length, 1);
  assert.equal(await caducidad.purgarViralesVencidos(ahora), 0, "una segunda pasada no cambia nada");
});

test("Clips: la referencia con títulos y estadísticas de videos ajenos se borra a los 30 días", () => {
  const g = almacen.crearDesdeReceta("clips");
  const insertar = (consultado: string) => {
    const id = crypto.randomUUID();
    db.base()
      .prepare(
        "insert into artefactos (id, granja_id, nodo_id, tipo, version, contenido, procedencia, config_nodo, hash, creado) values (?, ?, ?, 'investigacion', 1, ?, '{}', '', 'x', ?)",
      )
      .run(id, g.id, g.grafo.nodos[0].id, JSON.stringify({ encargo: { id: "e1" }, consultado, total: 1, destacados: [{ titulo: "Video ajeno", vistasDia: 200 }] }), consultado);
    return id;
  };
  const ahora = new Date("2026-11-21T12:00:00.000Z");
  const viejo = insertar(new Date(ahora.getTime() - 31 * DIA).toISOString());
  const nuevo = insertar(new Date(ahora.getTime() - 1 * DIA).toISOString());
  assert.equal(clips.purgarReferenciasVencidas(ahora), 1);
  const contenido = (id: string) => almacen.leerArtefacto(id).contenido;
  assert.ok(!contenido(viejo).includes("Video ajeno"));
  assert.match(contenido(viejo), /"caducado": true/);
  assert.match(contenido(nuevo), /Video ajeno/);
  assert.equal(clips.purgarReferenciasVencidas(ahora), 0);
});

test("Desconectar YouTube revoca el token en Google, borra el token local y olvida las métricas", async () => {
  process.env.YOUTUBE_CLIENT_ID = "cliente-prueba";
  process.env.YOUTUBE_CLIENT_SECRET = "secreto-prueba";
  const llamadas: { url: string; metodo: string }[] = [];
  conexiones.usarRedDePrueba(async (url, init) => {
    const u = String(url);
    llamadas.push({ url: u, metodo: init?.method ?? "GET" });
    const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.startsWith("https://oauth2.googleapis.com/token"))
      return json({ access_token: "acceso-prueba", refresh_token: "refresco-prueba", expires_in: 3600, scope: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload" });
    if (u.includes("/youtube/v3/channels")) return json({ items: [{ id: "UCspotmi", snippet: { title: "Spotmi" } }] });
    if (u.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response("{}", { status: 404 });
  });
  try {
    const url = new URL(conexiones.iniciarOAuth("youtube", "owner", true));
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.deepEqual(url.searchParams.get("scope")!.split(" ").sort(), [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ]);
    const c = await conexiones.completarOAuth("youtube", { estado: url.searchParams.get("state"), codigo: "codigo", error: null, usuario: "owner" });
    assert.equal(c.identidad?.id, "UCspotmi");
    // El token queda cifrado en la base, nunca en claro.
    const fila = db.base().prepare("select token_cifrado from conexiones where canal = 'youtube'").get() as { token_cifrado: string };
    assert.ok(fila.token_cifrado && !fila.token_cifrado.includes("refresco-prueba"));

    const r = await conexiones.desconectar("youtube");
    assert.equal(r.aviso, "");
    const revocar = llamadas.find((l) => l.url.startsWith("https://oauth2.googleapis.com/revoke"));
    assert.ok(revocar, "se llamó a Google para revocar");
    assert.equal(revocar!.metodo, "POST");
    assert.equal(new URL(revocar!.url).searchParams.get("token"), "refresco-prueba", "se revoca el refresh token (revoca todo el acceso)");
    assert.equal(db.base().prepare("select count(*) as n from conexiones where canal = 'youtube'").get()!.n, 0, "token local borrado");
    assert.equal(conexiones.leerConexion("youtube").identidad, null);
    // Si Google no responde, el token local se borra igual y se avisa cómo quitar el acceso a mano.
    const url2 = new URL(conexiones.iniciarOAuth("youtube", "owner"));
    await conexiones.completarOAuth("youtube", { estado: url2.searchParams.get("state"), codigo: "codigo", error: null, usuario: "owner" });
    conexiones.usarRedDePrueba(async () => {
      throw new Error("sin red");
    });
    const sinRed = await conexiones.desconectar("youtube");
    assert.match(sinRed.aviso, /quita el acceso también/);
    // Solo queda el aviso del error, sin token.
    const resto = db.base().prepare("select token_cifrado, identidad from conexiones where canal = 'youtube'").get() as { token_cifrado: string | null; identidad: string | null };
    assert.equal(resto.token_cifrado, null);
    assert.equal(conexiones.leerConexion("youtube").identidad, null);
  } finally {
    conexiones.usarRedDePrueba(undefined);
  }
});
