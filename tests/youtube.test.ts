import test from "node:test";
import assert from "node:assert/strict";
import { youtube, type Envio, type Solicitar } from "../src/lib/granjas/adaptadores";
import type { Medio } from "../src/lib/granjas/medios";
import type { ContenidoPieza } from "../src/lib/granjas/pieza";

// Sin red: cada llamada a Google se responde aquí y queda registrada.
process.env.YOUTUBE_CLIENT_ID = "cliente-de-prueba.apps.googleusercontent.com";
process.env.YOUTUBE_CLIENT_SECRET = "secreto-de-prueba";
process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
const ESCRITURA = "https://www.googleapis.com/auth/youtube.upload";
const LECTURA = "https://www.googleapis.com/auth/youtube.readonly";

type Llamada = { url: string; init?: RequestInit };
function red(respuestas: (l: Llamada) => Response) {
  const llamadas: Llamada[] = [];
  const solicitar: Solicitar = async (url, init) => {
    llamadas.push({ url, init });
    return respuestas({ url, init });
  };
  return { llamadas, solicitar };
}
const json = (cuerpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json", ...headers } });
const canal = { items: [{ id: "UC123", snippet: { title: "Spotmi" } }] };
const video: Medio = { id: "6b1f1c8e-6b8e-4a0e-9b9c-1a2b3c4d5e6f", sha256: "a".repeat(64), mime: "video/mp4", bytes: 4, archivo: "v.mp4", ancho: 1080, alto: 1920, duracion: 10, procedencia: { origen: "render", nota: "" }, licencia: "Propio", generado: false, nombre: "v.mp4", creado: new Date().toISOString() };
const contenido = (titulo: string, generado = false) =>
  ({ titulo, textos: { spotmi: "", instagram: "Festival en Suchitoto #ElSalvador", facebook: "", tiktok: "" }, medios: [], enlaces: [], canales: ["youtube"], programacion: { tipo: "ahora" }, divulgaciones: { creditos: "", imagenGenerada: generado }, spotmi: {} }) as unknown as ContenidoPieza;

test("YouTube: autorización con Google pide solo lectura y subida, sin publicar", () => {
  const url = new URL(youtube.urlAutorizacion!("estado-1"));
  assert.equal(url.host, "accounts.google.com");
  assert.deepEqual(url.searchParams.get("scope")!.split(" ").sort(), [LECTURA, ESCRITURA].sort());
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:3000/conexiones/youtube/callback");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("state"), "estado-1");
  assert.deepEqual(youtube.configuracion(), []);
});

test("YouTube: canjear el código lee el canal; sin youtube.upload solo hay lectura", async () => {
  const { solicitar, llamadas } = red(({ url }) =>
    url.includes("oauth2.googleapis.com/token") ? json({ access_token: "a1", refresh_token: "r1", expires_in: 3600, scope: `${LECTURA} ${ESCRITURA}` }) : json(canal),
  );
  const v = await youtube.canjear!("codigo", solicitar);
  assert.equal(v.estado, "restringida");
  assert.deepEqual(v.identidad, { id: "UC123", nombre: "Spotmi", tipo: "canal" });
  assert.deepEqual(v.capacidades, ["leer_identidad", "subir_borrador"]);
  assert.equal(v.secreto.refresco, "r1");
  assert.match(String(llamadas[0].init?.body), /grant_type=authorization_code/);
  const soloLectura = await youtube.verificar({ acceso: "a1", usuario: LECTURA }, red(() => json(canal)).solicitar);
  assert.deepEqual(soloLectura.capacidades, ["leer_identidad"]);
  await assert.rejects(youtube.verificar({ acceso: "a1", usuario: LECTURA }, red(() => json({ items: [] })).solicitar), /no tiene un canal/);
});

test("YouTube: un token vencido se renueva con el refresh_token y lo conserva", async () => {
  const { solicitar, llamadas } = red(({ url }) => (url.includes("/token") ? json({ access_token: "nuevo", expires_in: 3600, scope: ESCRITURA }) : json(canal)));
  const v = await youtube.verificar({ acceso: "viejo", refresco: "r1", expiraAcceso: new Date(Date.now() - 1000).toISOString(), usuario: ESCRITURA }, solicitar);
  assert.equal(v.secreto.acceso, "nuevo");
  assert.equal(v.secreto.refresco, "r1");
  assert.match(String(llamadas[0].init?.body), /grant_type=refresh_token/);
  await assert.rejects(youtube.verificar({ acceso: "viejo", expiraAcceso: new Date(Date.now() - 1000).toISOString() }, solicitar), /venció/);
});

test("YouTube: validar exige un MP4 y un título de hasta 100 caracteres", () => {
  assert.deepEqual(youtube.validar(contenido("Festival del Maíz"), [video]), []);
  assert.ok(youtube.validar(contenido(""), [video]).some((p) => /título/.test(p)));
  assert.ok(youtube.validar(contenido("x".repeat(101)), [video]).some((p) => /100/.test(p)));
  assert.ok(youtube.validar(contenido("Ok"), []).some((p) => /un video/.test(p)));
  assert.ok(youtube.validar(contenido("Ok"), [{ ...video, mime: "video/quicktime" }]).some((p) => /MP4/.test(p)));
});

test("YouTube: la subida es reanudable y SIEMPRE en privado; confirmar espera el procesamiento", async () => {
  const subida = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=xyz";
  const { solicitar, llamadas } = red(({ url, init }) => {
    if (url.includes("uploadType=resumable")) return new Response(null, { status: 200, headers: { Location: subida } });
    if (url === subida && init?.method === "PUT") return json({ id: "vid1" });
    return json({});
  });
  const envio: Envio = { contenido: contenido("Festival del Maíz", true), medios: [video], bytes: async () => Buffer.from("mp4!"), secreto: { acceso: "a1" }, identidad: { id: "UC123", nombre: "Spotmi" }, clave: "k" };
  const r = await youtube.publicar(envio, solicitar);
  assert.deepEqual(r, { estado: "procesando", remotoId: "vid1", enlace: "https://studio.youtube.com/video/vid1/edit" });
  const metadatos = JSON.parse(String(llamadas[0].init?.body));
  assert.equal(metadatos.status.privacyStatus, "private", "nunca público ni no listado");
  assert.equal(metadatos.status.containsSyntheticMedia, true, "el material generado se declara");
  assert.equal(metadatos.snippet.title, "Festival del Maíz");
  assert.equal(metadatos.snippet.description, "Festival en Suchitoto #ElSalvador");
  assert.equal((llamadas[0].init?.headers as Record<string, string>)["X-Upload-Content-Length"], "4");

  const estado = (status: object, processingDetails: object) => red(() => json({ items: [{ status, processingDetails }] })).solicitar;
  const recibo = { remotoId: "vid1", contenedorId: null };
  assert.equal((await youtube.confirmar(recibo, envio, estado({ uploadStatus: "uploaded" }, { processingStatus: "processing" }))).estado, "procesando");
  assert.equal((await youtube.confirmar(recibo, envio, estado({ uploadStatus: "processed" }, { processingStatus: "succeeded" }))).estado, "borrador_subido");
  const rechazo = await youtube.confirmar(recibo, envio, estado({ uploadStatus: "rejected", rejectionReason: "duplicate" }, {}));
  assert.equal(rechazo.estado, "fallido");
  assert.match(rechazo.error!, /duplicate/);
});

test("YouTube: si Google rechaza el inicio no se sube nada; si se corta la subida el resultado es desconocido", async () => {
  const envio: Envio = { contenido: contenido("Ok"), medios: [video], bytes: async () => Buffer.from("mp4!"), secreto: { acceso: "a1" }, identidad: { id: "UC123", nombre: "Spotmi" }, clave: "k" };
  await assert.rejects(youtube.publicar(envio, red(() => json({ error: { code: 403, message: "quotaExceeded" } }, 403)).solicitar), /rechazó/);
  let n = 0;
  const cortada: Solicitar = async () => {
    if (n++ === 0) return new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=z" } });
    throw new Error("se cortó");
  };
  await assert.rejects(youtube.publicar(envio, cortada), /desconocido/);
});
