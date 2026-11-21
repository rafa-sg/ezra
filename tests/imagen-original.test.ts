import test, { before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

// Datos aislados en work/; Meta y las descargas simuladas (sin red).
process.env.EZRA_DATA_DIR = path.resolve(`work/imagen-original-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
import type { Respuesta } from "../src/lib/granjas/fuentes";
import { hayFfmpeg, rutaFfmpeg } from "./helpers/ffmpeg";
let io: typeof import("../src/lib/granjas/imagen-original");
let eventos: typeof import("../src/lib/granjas/eventos");
let medios: typeof import("../src/lib/granjas/medios");
let instagram: typeof import("../src/lib/granjas/instagram");
let cripto: typeof import("../src/lib/granjas/cripto");
let db: typeof import("../src/lib/granjas/db");
const ffmpeg = rutaFfmpeg;
let afiche: Buffer;
let captura: Buffer;
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  io = await import("../src/lib/granjas/imagen-original");
  eventos = await import("../src/lib/granjas/eventos");
  medios = await import("../src/lib/granjas/medios");
  instagram = await import("../src/lib/granjas/instagram");
  cripto = await import("../src/lib/granjas/cripto");
  db = await import("../src/lib/granjas/db");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!));
  const gen = (n: string, f: string) => {
    const d = path.join(process.env.EZRA_DATA_DIR!, n);
    execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", f, "-frames:v", "1", d]);
    return readFile(d);
  };
  if (hayFfmpeg) {
    afiche = await gen("afiche.jpg", "color=c=orange:s=1080x1350");
    captura = await gen("captura.png", "color=c=teal:s=900x1100");
  }
});
const evento = (titulo = "Ella Conecta, Ella Invierte") =>
  eventos.crearEvento({ titulo, fecha: "2026-12-02", hora: null, lugar: "Hotel Sheraton", municipio: "San Salvador", departamento: "San Salvador", categoria: "otro", precio: null, boletosUrl: null, fuenteUrl: "https://elsalvador.travel/esp/event/ella-conecta/", confirmadoEn: {}, sugerencias: {}, descripcion: "", imagenUrl: null, notaVerificacion: "", granjaId: null, ejecucionId: null });
const ok = { titulo: true, fecha: true, lugar: true, organizador: true };

test("enlaces: Instagram (post, reel, con usuario) y Facebook válidos; otros no", () => {
  assert.deepEqual(io.parsearPublicacion("https://www.instagram.com/p/DQabc123xyz/?igsh=xx"), { plataforma: "instagram", url: "https://www.instagram.com/p/DQabc123xyz/", codigo: "DQabc123xyz", cuentaEnUrl: null });
  assert.equal(io.parsearPublicacion("https://instagram.com/bolsadevaloressv/p/DQabc123xyz/").cuentaEnUrl, "bolsadevaloressv");
  assert.equal(io.parsearPublicacion("https://www.instagram.com/reels/DQabc123xyz/").url, "https://www.instagram.com/reel/DQabc123xyz/");
  assert.equal(io.parsearPublicacion("https://m.facebook.com/bolsadevaloressv/posts/pfbid0abc").plataforma, "facebook");
  for (const malo of ["http://www.instagram.com/p/DQabc123xyz/", "https://www.instagram.com/bolsadevaloressv/", "https://tiktok.com/@x/video/1", "no es un enlace", "https://user:pw@instagram.com/p/DQabc123xyz/"])
    assert.throws(() => io.parsearPublicacion(malo), Error, malo);
});

test("publicación de terceros sin Business Discovery ni Facebook aprobado: motivo real, sin éxito fingido", async () => {
  const r = await io.buscarMediosPublicacion("https://www.instagram.com/bolsadevaloressv/p/DQabc123xyz/");
  assert.equal(r.accesible, false);
  assert.match((r as { motivo: string }).motivo, /Tu cuenta de Instagram no está conectada/);
  assert.match((r as { motivo: string }).motivo, /Business Discovery/);
  const fb = await io.buscarMediosPublicacion("https://www.facebook.com/bolsadevaloressv/posts/pfbid0abc");
  assert.equal(fb.accesible, false);
  assert.match((fb as { motivo: string }).motivo, /Page Public Content Access/);
});

test("cuenta propia (API simulada): imagen, carrusel y video con miniatura; Business Discovery para terceros", async () => {
  const ahora = new Date().toISOString();
  db.base()
    .prepare("insert or replace into conexiones (canal, estado, identidad, capacidades, permisos, opciones, token_cifrado, actualizado) values ('instagram', 'conectada_publicacion', ?, '[]', '[]', '[]', ?, ?)")
    .run(JSON.stringify({ id: "ig1", nombre: "spotmi.sv" }), cripto.cifrar({ acceso: "token-ig" }), ahora);
  const llamadas: string[] = [];
  const solicitar = async (url: string) => {
    llamadas.push(url);
    const u = new URL(url);
    if (u.hostname === "graph.instagram.com" && u.pathname.endsWith("/me/media")) {
      if (!u.searchParams.get("after"))
        return new Response(JSON.stringify({ data: [{ id: "1", permalink: "https://www.instagram.com/p/OTRO1/", media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/otro.jpg" }], paging: { next: `${url}&after=c1` } }));
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "2",
              permalink: "https://www.instagram.com/p/CARRUSEL1/",
              media_type: "CAROUSEL_ALBUM",
              timestamp: "2026-11-10T15:00:00+0000",
              caption: "Ella Conecta, Ella Invierte · 2 de diciembre",
              children: { data: [{ media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/a.jpg" }, { media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/b.jpg" }, { media_type: "VIDEO", thumbnail_url: "https://scontent.cdninstagram.com/v-thumb.jpg" }] },
            },
          ],
        }),
      );
    }
    return new Response(JSON.stringify({ error: { code: 100, message: "no" } }), { status: 400 });
  };
  const r = await io.buscarMediosPublicacion("https://www.instagram.com/p/CARRUSEL1/", { solicitar });
  assert.equal(r.accesible, true);
  if (!r.accesible) return;
  assert.equal(r.via, "instagram_propia");
  assert.equal(r.cuenta, "@spotmi.sv");
  assert.equal(r.publicado, "2026-11-10T15:00:00+0000", "fecha de la publicación, distinta de la del evento");
  assert.deepEqual(r.medios.map((m) => [m.tipo, Boolean(m.url), Boolean(m.miniatura)]), [["imagen", true, false], ["imagen", true, false], ["video", false, true]]);
  assert.ok(llamadas.every((u) => u.startsWith("https://graph.instagram.com/")), "solo la API oficial");
  // No está en la cuenta propia y no hay Business Discovery: motivo concreto.
  const tercera = await io.buscarMediosPublicacion("https://www.instagram.com/p/AJENA9/", { solicitar });
  assert.equal(tercera.accesible, false);
  assert.match((tercera as { motivo: string }).motivo, /No está entre las publicaciones recientes de tu cuenta/);
});

test("guardar: exige comprobar el evento; captura sin duplicar la fuente; invalida el post; la exportación pública solo con permiso confirmado", { skip: !hayFfmpeg }, async () => {
  const e = evento();
  const url = "https://www.instagram.com/bolsadevaloressv/p/DQabc123xyz/";
  const cap = await medios.guardarMedio(captura, { nombre: "captura.png", procedencia: { origen: "subida", nota: "" }, licencia: `Captura de ${url}`, generado: false });
  await assert.rejects(io.guardarImagenOriginal(e.id, { url, origen: "captura", medioId: cap.id, comprobaciones: { ...ok, fecha: false } }), /confirma que coinciden el título, la fecha y el año/);
  await assert.rejects(io.guardarImagenOriginal(e.id, { url, origen: "captura", comprobaciones: ok }), /Elige una imagen/);
  let ev = await io.guardarImagenOriginal(e.id, { url, origen: "captura", medioId: cap.id, comprobaciones: ok });
  assert.equal(ev.imagenTipo, "red");
  assert.equal(ev.imagenOrigen, "captura");
  assert.equal(ev.imagenConfirmada, false, "referencia interna: permiso pendiente");
  assert.deepEqual(ev.imagenPublicacion && [ev.imagenPublicacion.url, ev.imagenPublicacion.plataforma, ev.imagenPublicacion.cuenta, ev.imagenPublicacion.verificada], [url.replace("bolsadevaloressv/", ""), "instagram", "@bolsadevaloressv", false]);
  assert.match(ev.imagenPermiso, /^Captura de la publicación de @bolsadevaloressv en Instagram · referencia interna, permiso de reutilización pendiente$/);
  // Exportación pública: sin portada mientras el permiso esté pendiente.
  assert.equal(eventos.eventosJson([ev])[0].portada, null);
  // Un post preparado con esta imagen: cambiarla lo devuelve a borrador.
  ev = eventos.confirmarImagen(ev.id, ev.revision);
  assert.ok(eventos.eventosJson([ev])[0].portada, "con permiso confirmado sí sale");
  const post = instagram.crearPost({ eventoId: ev.id, granjaId: null, ejecucionId: null, cuenta: "@spotmi.sv", texto: "x", textoOrigen: "plantilla", nota: "" });
  db.base().prepare("update posts_ig set estado = 'listo', medio_id = ? where id = ?").run(cap.id, post.id);
  // Imagen original por API (descarga simulada): reemplaza la captura, que queda en el historial.
  const web = async (u: URL): Promise<Respuesta> => ({ estado: 200, tipo: "image/jpeg", cuerpo: afiche, url: u.toString() });
  // La API (simulada) confirma que la imagen es de esa publicación: Business Discovery con la conexión de Facebook.
  db.base()
    .prepare("insert or replace into conexiones (canal, estado, identidad, capacidades, permisos, opciones, token_cifrado, actualizado) values ('facebook', 'conectada_publicacion', ?, '[]', ?, '[]', ?, ?)")
    .run(JSON.stringify({ id: "pag1", nombre: "Spotmi" }), JSON.stringify(["instagram_basic", "instagram_manage_insights", "pages_read_engagement"]), cripto.cifrar({ acceso: "token-fb", paginaId: "pag1", paginas: { pag1: "token-pag" } }), new Date().toISOString());
  const meta = async (u: string) => {
    const x = new URL(u);
    if (x.hostname === "graph.instagram.com") return new Response(JSON.stringify({ data: [] }));
    if (x.pathname.endsWith("/pag1")) return new Response(JSON.stringify({ instagram_business_account: { id: "igspotmi" } }));
    return new Response(JSON.stringify({ business_discovery: { media: { data: [{ permalink: "https://www.instagram.com/p/DQabc123xyz/", media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/a.jpg" }] } } }));
  };
  await assert.rejects(
    io.guardarImagenOriginal(e.id, { url, origen: "original", medioUrl: "https://scontent.cdninstagram.com/inventada.jpg", comprobaciones: ok }, { descargar: web, solicitar: meta }),
    /ya no aparece en la publicación/,
  );
  ev = await io.guardarImagenOriginal(e.id, { url, origen: "original", medioUrl: "https://scontent.cdninstagram.com/a.jpg", comprobaciones: ok }, { descargar: web, solicitar: meta });
  assert.equal(ev.imagenOrigen, "original");
  assert.equal(ev.imagenConfirmada, false, "otra imagen: el permiso vuelve a pendiente");
  assert.equal(ev.imagenPublicacion?.verificada, true);
  assert.deepEqual(ev.imagenes.map((i) => i.origen), ["captura", "original"]);
  assert.equal(ev.fuentes.filter((f) => f.url.includes("DQabc123xyz")).length, 1, "la publicación se vincula una sola vez");
  const p = db.base().prepare("select estado, nota from posts_ig where id = ?").get(post.id) as { estado: string; nota: string };
  assert.equal(p.estado, "borrador");
  assert.match(p.nota, /La imagen del evento cambió/);
  // Vincular solo el enlace no duplica.
  assert.equal(io.vincularPublicacion(e.id, url).nueva, false);
  // Recargar (leer de la base): todo sigue.
  const otra = eventos.leerEvento(e.id);
  assert.equal(otra.imagenMedioId, ev.imagenMedioId);
  assert.equal(otra.imagenPublicacion?.cuenta, "@bolsadevaloressv");
});
