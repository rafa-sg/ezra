import test, { before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/; páginas, imágenes, Meta y Gemini simulados (sin red).
process.env.EZRA_DATA_DIR = path.resolve(`work/eventos-fuentes-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
import type { Respuesta } from "../src/lib/granjas/fuentes";
let eventos: typeof import("../src/lib/granjas/eventos");
let completar: typeof import("../src/lib/granjas/completar-imagenes");
let imagenes: typeof import("../src/lib/granjas/imagenes");
let tiempo: typeof import("../src/lib/granjas/tiempo");
let db: typeof import("../src/lib/granjas/db");
const ffmpeg = "/opt/homebrew/bin/ffmpeg";
const hayFfmpeg = existsSync(ffmpeg);
let cartel: Buffer;
let otroCartel: Buffer;
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  eventos = await import("../src/lib/granjas/eventos");
  completar = await import("../src/lib/granjas/completar-imagenes");
  imagenes = await import("../src/lib/granjas/imagenes");
  tiempo = await import("../src/lib/granjas/tiempo");
  db = await import("../src/lib/granjas/db");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
  const generar = (nombre: string, filtro: string) => {
    const destino = path.join(process.env.EZRA_DATA_DIR!, nombre);
    execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", filtro, "-frames:v", "1", destino]);
    return readFile(destino);
  };
  if (hayFfmpeg) {
    cartel = await generar("cartel.jpg", "color=c=orange:s=800x1000");
    otroCartel = await generar("cartel2.jpg", "color=c=purple:s=900x900");
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
const html = (cabecera: string, cuerpo = "") => `<html><head>${cabecera}</head><body><main>${cuerpo}</main></body></html>`;
const mesesEs = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const textoFecha = (dia: string) => `${Number(dia.slice(8))} de ${mesesEs[Number(dia.slice(5, 7)) - 1]}`;
function nuevo(datos: Partial<Parameters<typeof eventos.crearEvento>[0]> & { titulo: string; fuenteUrl: string }) {
  return eventos.crearEvento({
    fecha: null,
    hora: null,
    lugar: "",
    municipio: "",
    departamento: "",
    categoria: "musica",
    precio: null,
    boletosUrl: null,
    confirmadoEn: {},
    sugerencias: {},
    descripcion: "",
    imagenUrl: null,
    notaVerificacion: "",
    granjaId: null,
    ejecucionId: null,
    ...datos,
  });
}

test("imagen genérica: logos, portada del sitio y la que se repite en varios eventos no se usan", { skip: !hayFfmpeg }, async () => {
  assert.equal(imagenes.rutaGenerica("https://elsalvador.travel/wp-content/uploads/logo-mitur.png"), true);
  assert.equal(imagenes.rutaGenerica("https://blob.example.net/static-st/og/es/home.jpg"), true);
  assert.equal(imagenes.rutaGenerica("https://blob.example.net/eventos/7566B_1528.jpg"), false);
  // Dos eventos ya traen la misma og:image del portal: para el tercero es genérica.
  for (const t of ["Feria del maíz de Cojutepeque", "Festival de las flores de Juayúa"])
    nuevo({ titulo: t, fuenteUrl: `https://portal.sv/${t.length}`, imagenUrl: "https://portal.sv/compartir/portal.jpg" });
  const sitios = web({
    "https://portal.sv/evento-a": html(`<meta property="og:image" content="https://portal.sv/compartir/portal.jpg">`, "<h1>Carnaval de San Miguel</h1>"),
    "https://portal.sv/compartir/portal.jpg": cartel,
    "https://portal.sv/evento-b": html(`<meta property="og:image" content="https://portal.sv/img/portada.jpg">`, "<h1>Carnaval de San Miguel</h1>"),
    "https://portal.sv/": html(`<meta property="og:image" content="https://portal.sv/img/portada.jpg">`),
    "https://portal.sv/img/portada.jpg": cartel,
  });
  const repetida = await imagenes.buscarImagenEvento({ titulo: "Carnaval de San Miguel", fuenteUrl: "https://portal.sv/evento-a", boletosUrl: null }, { descargar: sitios });
  assert.equal(repetida.medio, null);
  assert.match((repetida as { motivo: string }).motivo, /se repite en varios eventos/);
  const portada = await imagenes.buscarImagenEvento({ titulo: "Carnaval de San Miguel", fuenteUrl: "https://portal.sv/evento-b", boletosUrl: null }, { descargar: sitios });
  assert.equal(portada.medio, null);
  assert.match((portada as { motivo: string }).motivo, /genérica del sitio/);
});

test("ficha en ticketera: se encuentra por título y fecha en la cartelera, pasa a boletos y da la imagen", { skip: !hayFfmpeg }, async () => {
  const dia = tiempo.sumarDias(tiempo.diaLocal(), 9);
  const e = nuevo({ titulo: "Andrea Bocelli Romanza World Tour", fecha: dia, fuenteUrl: "https://elsalvador.travel/esp/event/andrea-bocelli/", lugar: "Estadio Cuscatlán" });
  const sitios = web({
    // El portal turístico solo trae su logo.
    "https://elsalvador.travel/esp/event/andrea-bocelli/": html(`<meta property="og:image" content="https://elsalvador.travel/wp-content/uploads/logo.png">`, "<h1>Andrea Bocelli</h1>"),
    "https://www.smartticket.fun/es": html(
      `<meta property="og:image" content="https://blob.example.net/static-st/og/es/home.jpg">`,
      `<a href="/event-dates/la-navidad-de-el-grinch-sv">La Navidad de El Grinch</a><a href="/es/event/andrea-bocelli-romanza-world-tour">Tickets</a><a href="/es/event/otro">Otro concierto</a>`,
    ),
    // Un enlace parecido cuya página es de otra fecha no cuenta.
    "https://www.smartticket.fun/es/event/andrea-bocelli-romanza-world-tour": html(
      `<meta property="og:image" content="https://blob.example.net/eventos/7566B_1528.jpg">`,
      `<h1>Andrea Bocelli – Romanza World Tour</h1><p>${textoFecha(dia)} · Estadio Cuscatlán</p>`,
    ),
    "https://blob.example.net/eventos/7566B_1528.jpg": otroCartel,
  });
  const ctx = { dominios: ["elsalvador.travel", "smartticket.fun"], descargar: sitios, listados: completar.carteleras };
  const ficha = await completar.buscarFichaTicketera({ titulo: "Andrea Bocelli Romanza World Tour", fecha: dia }, ctx);
  assert.equal(ficha?.url, "https://www.smartticket.fun/es/event/andrea-bocelli-romanza-world-tour");
  assert.equal(await completar.buscarFichaTicketera({ titulo: "Andrea Bocelli Romanza World Tour", fecha: tiempo.sumarDias(dia, 20) }, ctx), null, "otra fecha: no es la misma ficha");
  assert.equal(await completar.buscarFichaTicketera({ titulo: "Andrea Bocelli Romanza World Tour", fecha: dia }, { ...ctx, dominios: ["elsalvador.travel"] }), null, "ticketera fuera de la lista: no se lee");

  const r = await completar.completarImagenEvento(e.id, { descargar: sitios, dominios: ctx.dominios });
  assert.equal(r.estado, "ticketera");
  const despues = eventos.leerEvento(e.id);
  assert.equal(despues.boletosUrl, "https://www.smartticket.fun/es/event/andrea-bocelli-romanza-world-tour");
  assert.ok(despues.imagenMedioId);
  assert.equal(despues.imagenConfirmada, false, "queda pendiente de tu confirmación");
  assert.match(despues.imagenPermiso, /smartticket\.fun · pendiente de tu confirmación$/);
  assert.deepEqual(
    despues.fuentes.map((f) => [f.dominio, f.tipo]),
    [
      ["elsalvador.travel", "gobierno"],
      ["smartticket.fun", "ticketera"],
    ],
  );
  // Ya tiene imagen: no se vuelve a buscar.
  assert.equal((await completar.completarImagenEvento(e.id, { descargar: sitios, dominios: ctx.dominios })).estado, "ya_tenia");
});

test("sin imagen oficial: queda sin imagen con el motivo (nunca se genera una)", async () => {
  const e = nuevo({ titulo: "Festival gastronómico de Panchimalco", fuenteUrl: "https://elsalvador.travel/esp/event/panchimalco/" });
  const sitios = web({ "https://elsalvador.travel/esp/event/panchimalco/": html("", "<h1>Festival gastronómico de Panchimalco</h1>") });
  const r = await completar.completarImagenEvento(e.id, { descargar: sitios, dominios: ["elsalvador.travel"] });
  assert.equal(r.estado, "sin_imagen");
  assert.match(r.motivo, /no tiene imagen del evento/);
  assert.equal(eventos.leerEvento(e.id).imagenMedioId, null);
});
