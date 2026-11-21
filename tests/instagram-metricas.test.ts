import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/; la API de Instagram está simulada (sin red) y el token es falso.
process.env.EZRA_DATA_DIR = path.resolve(`work/ig-metricas-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
let ig: typeof import("../src/lib/granjas/instagram-metricas");
let db: typeof import("../src/lib/granjas/db");
let cripto: typeof import("../src/lib/granjas/cripto");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  ig = await import("../src/lib/granjas/instagram-metricas");
  db = await import("../src/lib/granjas/db");
  cripto = await import("../src/lib/granjas/cripto");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
const conectar = (expira: string | null = new Date(Date.now() + 40 * 86_400_000).toISOString()) =>
  db
    .base()
    .prepare("insert or replace into conexiones (canal, estado, identidad, capacidades, permisos, opciones, token_cifrado, expira, actualizado) values ('instagram', 'conectada_publicacion', ?, '[]', '[]', '[]', ?, ?, ?)")
    .run(JSON.stringify({ id: "ig1", nombre: "@spotmi.sv" }), cripto.cifrar({ acceso: "TOKEN-SECRETO-IG" }), expira, new Date().toISOString());
const respuesta = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

test("sin conexión: estado claro y nunca números inventados", async () => {
  const m = await ig.consultarInstagram({ solicitar: async () => respuesta({}) });
  assert.equal(m.estado, "sin_conexion");
  assert.equal(m.cuenta, null);
  assert.match(m.avisos.join(" "), /no está conectado/);
});

test("cuenta, recientes y totales de 7 y 30 días; métricas faltantes en null; caché de 30 minutos", async () => {
  conectar();
  db.base().exec("delete from ajustes_estudio where clave = 'instagram_metricas'");
  const urls: string[] = [];
  const solicitar = async (url: string) => {
    urls.push(url);
    if (url.includes("/me?")) return respuesta({ username: "spotmi.sv", name: "Spotmi", followers_count: 1234, follows_count: 50, media_count: 87, profile_picture_url: "https://cdn.example/p.jpg" });
    if (url.includes("/me/media")) return respuesta({ data: [{ id: "1", media_type: "IMAGE", media_url: "https://cdn.example/1.jpg", permalink: "https://www.instagram.com/p/AAA/", timestamp: "2026-11-18T12:00:00+0000", caption: "Hola", like_count: 40, comments_count: 3 }, { id: "2", media_type: "VIDEO", media_url: "https://cdn.example/2.mp4", thumbnail_url: "https://cdn.example/2.jpg", permalink: "https://www.instagram.com/reel/BBB/" }] });
    if (url.includes("/me/insights")) return respuesta({ data: [{ name: "reach", total_value: { value: url.includes(`since=${Math.floor(Date.now() / 1000) - 7 * 86400 + 60}`) ? 900 : 4100 } }, { name: "views", total_value: { value: 5000 } }] });
    return respuesta({}, 404);
  };
  const ahora = new Date();
  const m = await ig.metricasInstagram({ solicitar, ahora });
  assert.equal(m.estado, "ok");
  assert.deepEqual([m.cuenta?.usuario, m.cuenta?.seguidores, m.cuenta?.publicaciones], ["@spotmi.sv", 1234, 87]);
  assert.equal(m.recientes.length, 2);
  assert.equal(m.recientes[1].miniatura, "https://cdn.example/2.jpg", "un video usa su miniatura");
  assert.equal(m.recientes[1].meGusta, null);
  assert.deepEqual(m.periodos.map((p) => p.dias), [7, 30]);
  assert.equal(m.periodos[1].valores.reach, 4100);
  assert.equal(m.periodos[0].valores.likes, undefined, "lo que la API no devolvió no se inventa");
  assert.ok(urls.every((u) => u.startsWith("https://graph.instagram.com/")));
  // Segunda lectura en menos de 30 min: desde la caché, sin llamar a la API.
  const antes = urls.length;
  const otra = await ig.metricasInstagram({ solicitar, ahora: new Date(ahora.getTime() + 10 * 60_000) });
  assert.equal(otra.desdeCache, true);
  assert.equal(urls.length, antes);
  // Forzar: lee de nuevo.
  await ig.metricasInstagram({ solicitar, ahora: new Date(ahora.getTime() + 11 * 60_000), forzar: true });
  assert.ok(urls.length > antes);
});

test("errores: un fallo de insights es un aviso; token vencido conserva la última lectura y nunca muestra el token", async () => {
  conectar();
  const parcial = await ig.consultarInstagram({
    solicitar: async (url: string) => (url.includes("/me/insights") ? respuesta({ error: { code: 10, message: "permiso" } }, 403) : url.includes("/me?") ? respuesta({ username: "spotmi.sv" }) : respuesta({ data: [] })),
  });
  assert.equal(parcial.estado, "ok");
  assert.equal(parcial.periodos.length, 0);
  assert.match(parcial.avisos.join(" "), /Métricas de 7 días no disponibles/);
  const vencido = await ig.metricasInstagram({ forzar: true, solicitar: async () => respuesta({ error: { code: 190, message: "Error validating access token TOKEN-SECRETO-IG" } }, 401) });
  assert.equal(vencido.desdeCache, true, "se muestra la última lectura correcta");
  assert.match(vencido.avisos.join(" "), /venció o fue revocado/);
  assert.doesNotMatch(JSON.stringify(vencido), /TOKEN-SECRETO-IG/);
  // Token ilegible (por ejemplo, otra EZRA_TOKEN_KEY): tampoco esconde la última lectura correcta.
  db.base().prepare("update conexiones set token_cifrado = ? where canal = 'instagram'").run("no-es-un-token-cifrado");
  const ilegible = await ig.metricasInstagram({ forzar: true, solicitar: async () => respuesta({}) });
  assert.equal(ilegible.desdeCache, true);
  assert.equal(ilegible.cuenta?.usuario, "@spotmi.sv");
  assert.ok(ilegible.avisos.length >= 2);
});
