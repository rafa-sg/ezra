import test, { before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/; páginas e imágenes simuladas (sin red).
process.env.EZRA_DATA_DIR = path.resolve(`work/imagenes-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
import type { Respuesta } from "../src/lib/granjas/fuentes";
let imagenes: typeof import("../src/lib/granjas/imagenes");
let eventos: typeof import("../src/lib/granjas/eventos");
let verificador: typeof import("../src/lib/granjas/verificador");
let instagram: typeof import("../src/lib/granjas/instagram");
let pi: typeof import("../src/lib/granjas/pasos-instagram");
let medios: typeof import("../src/lib/granjas/medios");
let tiempo: typeof import("../src/lib/granjas/tiempo");
let db: typeof import("../src/lib/granjas/db");
const ffmpeg = "/opt/homebrew/bin/ffmpeg";
const hayFfmpeg = existsSync(ffmpeg);
let grande: Buffer;
let chica: Buffer;
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  imagenes = await import("../src/lib/granjas/imagenes");
  eventos = await import("../src/lib/granjas/eventos");
  verificador = await import("../src/lib/granjas/verificador");
  instagram = await import("../src/lib/granjas/instagram");
  pi = await import("../src/lib/granjas/pasos-instagram");
  medios = await import("../src/lib/granjas/medios");
  tiempo = await import("../src/lib/granjas/tiempo");
  db = await import("../src/lib/granjas/db");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
  const generar = (nombre: string, filtro: string) => {
    const destino = path.join(process.env.EZRA_DATA_DIR!, nombre);
    execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", filtro, "-frames:v", "1", destino]);
    return readFile(destino);
  };
  if (hayFfmpeg) {
    grande = await generar("cartel.jpg", "color=c=orange:s=800x1000");
    chica = await generar("icono.png", "color=c=blue:s=300x300");
  }
});
/** Web simulada: HTML o binarios por URL; robots.txt siempre permite. */
function web(paginas: Record<string, string | Buffer>) {
  return async (u: URL): Promise<Respuesta> => {
    if (u.pathname === "/robots.txt") return { estado: 404, tipo: "text/plain", cuerpo: Buffer.from(""), url: u.toString() };
    const v = paginas[u.toString()];
    if (v === undefined) return { estado: 404, tipo: "text/html", cuerpo: Buffer.from("no"), url: u.toString() };
    return { estado: 200, tipo: Buffer.isBuffer(v) ? "image/*" : "text/html", cuerpo: Buffer.isBuffer(v) ? v : Buffer.from(v), url: u.toString() };
  };
}
const pagina = (cabecera: string, cuerpo = "") => `<html><head>${cabecera}</head><body><main><h1>Concierto de prueba</h1>${cuerpo}</main></body></html>`;

test("medidas: PNG, JPEG y WebP desde la cabecera; otra cosa no", { skip: !hayFfmpeg }, () => {
  assert.deepEqual(imagenes.medidasImagen(grande), { ancho: 800, alto: 1000 });
  assert.deepEqual(imagenes.medidasImagen(chica), { ancho: 300, alto: 300 });
  // WebP extendido (VP8X): lienzo 1200×700.
  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0, "ascii");
  webp.write("WEBP", 8, "ascii");
  webp.write("VP8X", 12, "ascii");
  webp.writeUIntLE(1199, 24, 3);
  webp.writeUIntLE(699, 27, 3);
  assert.deepEqual(imagenes.medidasImagen(webp), { ancho: 1200, alto: 700 });
  assert.equal(imagenes.medidasImagen(Buffer.from("<html>")), null);
});

test("candidatas en orden: og:image, twitter:image, schema.org Event y la imagen principal", () => {
  const html = pagina(
    `<meta name="twitter:image" content="/img/tw.jpg"><meta property="og:image" content="https://cdn.ejemplo.sv/og.jpg"><script type="application/ld+json">{"@type":"MusicEvent","image":["https://ejemplo.sv/ld.jpg"]}</script>`,
    `<img src="/logo.svg"><img src="/fotos/principal.jpg">`,
  );
  assert.deepEqual(imagenes.candidatasImagen(html, "https://ejemplo.sv/evento"), [
    "https://cdn.ejemplo.sv/og.jpg",
    "https://ejemplo.sv/img/tw.jpg",
    "https://ejemplo.sv/ld.jpg",
    "https://ejemplo.sv/fotos/principal.jpg",
  ]);
});

test("descarga: og:image válida; muy pequeña, no imagen, red social y página sin imagen se rechazan; boletos como respaldo", { skip: !hayFfmpeg }, async () => {
  const sitios = web({
    "https://ejemplo.sv/valida": pagina(`<meta property="og:image" content="https://ejemplo.sv/cartel.jpg">`),
    "https://ejemplo.sv/cartel.jpg": grande,
    "https://ejemplo.sv/chica": pagina(`<meta property="og:image" content="https://ejemplo.sv/icono.png">`),
    "https://ejemplo.sv/icono.png": chica,
    "https://ejemplo.sv/no-imagen": pagina(`<meta property="og:image" content="https://ejemplo.sv/falsa.jpg">`),
    "https://ejemplo.sv/falsa.jpg": Buffer.from("<html>no soy una imagen</html>"),
    "https://ejemplo.sv/social": pagina(`<meta property="og:image" content="https://scontent.cdninstagram.com/foto.jpg">`),
    "https://ejemplo.sv/vacia": pagina("", "<p>Sin fotos</p>"),
    "https://boletos.sv/evento": pagina(`<meta name="twitter:image" content="https://boletos.sv/cartel.jpg">`),
    "https://boletos.sv/cartel.jpg": grande,
  });
  const buscar = (fuenteUrl: string, boletosUrl: string | null = null) => imagenes.buscarImagenEvento({ titulo: "Concierto de prueba", fuenteUrl, boletosUrl }, { descargar: sitios });
  const ok = await buscar("https://ejemplo.sv/valida");
  assert.ok(ok.medio);
  assert.equal(ok.medio.mime, "image/jpeg");
  assert.equal(ok.dominio, "ejemplo.sv");
  assert.equal(ok.medio.licencia, "Imagen promocional de la fuente oficial: ejemplo.sv · pendiente de tu confirmación");
  const motivo = async (fuente: string) => {
    const r = await buscar(fuente);
    assert.equal(r.medio, null, fuente);
    return (r as { motivo: string }).motivo;
  };
  assert.match(await motivo("https://ejemplo.sv/chica"), /muy pequeña \(300×300/);
  assert.match(await motivo("https://ejemplo.sv/no-imagen"), /no es una imagen/);
  assert.match(await motivo("https://ejemplo.sv/social"), /red social/);
  assert.match(await motivo("https://ejemplo.sv/vacia"), /no tiene imagen del evento/);
  assert.match(await motivo("https://www.instagram.com/p/x/"), /Sin fuente|imagen/);
  // La fuente solo tiene un ícono: se usa la imagen de la página de boletos.
  const respaldo = await buscar("https://ejemplo.sv/chica", "https://boletos.sv/evento");
  assert.ok(respaldo.medio);
  assert.equal(respaldo.dominio, "boletos.sv");
});

test("verificador e Instagram: la imagen llega pendiente; el post solo la usa cuando la confirmas", { skip: !hayFfmpeg }, async () => {
  const dia = tiempo.sumarDias(tiempo.diaLocal(), 6);
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const sitios = web({
    "https://ejemplo.sv/evento": pagina(`<meta property="og:image" content="https://ejemplo.sv/cartel.jpg">`, `<p>${Number(dia.slice(8))} de ${meses[Number(dia.slice(5, 7)) - 1]}</p>`),
    "https://ejemplo.sv/cartel.jpg": grande,
  });
  const r = await verificador.verificarCandidatos(
    [{ titulo: "Concierto de prueba", fecha: dia, hora: null, lugar: "Teatro", municipio: null, departamento: "San Salvador", categoria: "musica", precio: null, boletos_url: null, fuente_url: "https://ejemplo.sv/evento", imagen_url: null, descripcion: null }],
    { hoy: tiempo.diaLocal(), diasAdelante: 14, dominios: ["ejemplo.sv"], restantes: 5, referencias: [], granjaId: null, ejecucionId: null },
    { descargar: sitios },
  );
  assert.equal(r.conImagen, 1);
  let e = eventos.leerEvento(r.nuevos[0].id);
  assert.ok(e.imagenMedioId);
  assert.equal(e.imagenConfirmada, false, "nunca se confirma sola");
  assert.match(e.imagenPermiso, /pendiente de tu confirmación$/);
  e = eventos.aprobarEvento(e.id, e.revision);
  const post = instagram.crearPost({ eventoId: e.id, granjaId: null, ejecucionId: null, cuenta: "@spotmi.sv", texto: "x", textoOrigen: "plantilla", nota: "" });
  assert.equal((await pi.datosDePost(post)).datos.fondo, null, "pendiente: fondo azul");
  e = eventos.confirmarImagen(e.id, e.revision);
  assert.equal(e.imagenConfirmada, true);
  assert.match(e.imagenPermiso, /^Imagen promocional de la fuente oficial: ejemplo\.sv · confirmada por ti el /);
  assert.ok((await pi.datosDePost(post)).datos.fondo, "confirmada: la usa de fondo");
  // Cambiar a otra imagen quitándola deja el evento sin imagen ni confirmación.
  e = eventos.autorizarImagen(e.id, e.revision, null, "");
  assert.equal(e.imagenConfirmada, false);
  assert.throws(() => eventos.confirmarImagen(e.id, e.revision), /no tiene imagen/);
  const antes = medios.listarMedios().length;
  await imagenes.buscarImagenEvento({ titulo: "x", fuenteUrl: "https://ejemplo.sv/evento", boletosUrl: null }, { descargar: sitios });
  assert.equal(medios.listarMedios().length, antes, "la misma imagen no se guarda dos veces (sha256)");
});
