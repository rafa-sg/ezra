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
let redes: typeof import("../src/lib/granjas/redes");
let verificador: typeof import("../src/lib/granjas/verificador");
let gemini: typeof import("../src/lib/ia/gemini");
let cripto: typeof import("../src/lib/granjas/cripto");
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
  redes = await import("../src/lib/granjas/redes");
  verificador = await import("../src/lib/granjas/verificador");
  gemini = await import("../src/lib/ia/gemini");
  cripto = await import("../src/lib/granjas/cripto");
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

/* ── Parte 2: redes por API oficial, enlaces manuales y dominios prohibidos ── */
type Llamada = { url: string };
/** Graph API simulada: responde según la ruta y guarda cada URL pedida. */
function graph(respuestas: Record<string, object>, llamadas: Llamada[]) {
  return async (url: string) => {
    llamadas.push({ url });
    const u = new URL(url);
    const clave = Object.keys(respuestas).find((k) => u.pathname.endsWith(k));
    return new Response(JSON.stringify(clave ? respuestas[clave] : { error: { code: 100, message: "no existe" } }), { status: clave ? 200 : 400 });
  };
}

test("redes: sin conexión de Facebook no se lee nada; Facebook queda apagado sin Page Public Content Access", () => {
  const estado = redes.estadoLecturaRedes();
  assert.equal(estado.instagram.listo, false);
  assert.match(estado.instagram.motivo, /Conecta Facebook/);
  assert.equal(estado.facebook.listo, false);
  assert.match(estado.facebook.motivo, /Page Public Content Access/);
  // Cuentas: @ y mayúsculas se normalizan; repetidas o inválidas se rechazan.
  const guardadas = redes.guardarCuentasSeguidas({ instagram: [{ usuario: "@Teatro.Presidente", tipo: "recinto" }], facebook: [{ pagina: "https://www.facebook.com/alcaldia.ss/", tipo: "alcaldia" }] });
  assert.deepEqual(guardadas.instagram[0], { usuario: "teatro.presidente", tipo: "recinto", nota: "" });
  assert.equal(guardadas.facebook[0].pagina, "alcaldia.ss");
  assert.throws(() => redes.guardarCuentasSeguidas({ instagram: [{ usuario: "a b", tipo: "recinto" }], facebook: [] }));
  assert.throws(() => redes.guardarCuentasSeguidas({ instagram: [{ usuario: "x", tipo: "recinto" }, { usuario: "@X", tipo: "otro" }], facebook: [] }), /repetidas/);
});

test("Instagram Business Discovery (simulado) → Gemini (simulado) → verificador: fuente = enlace del post e imagen del post pendiente", { skip: !hayFfmpeg }, async () => {
  const dia = tiempo.sumarDias(tiempo.diaLocal(), 12);
  const hoy = tiempo.diaLocal();
  process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.EZRA_PRODUCCION_IA = "1";
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  // Conexión de Facebook con la Página elegida y los permisos de lectura.
  db.base()
    .prepare("insert or replace into conexiones (canal, estado, identidad, capacidades, permisos, opciones, token_cifrado, actualizado) values ('facebook', 'conectada_publicacion', ?, '[]', ?, '[]', ?, ?)")
    .run(
      JSON.stringify({ id: "pagina1", nombre: "Spotmi" }),
      JSON.stringify(["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_manage_insights"]),
      cripto.cifrar({ acceso: "token-usuario", paginaId: "pagina1", paginas: { pagina1: "token-pagina" } }),
      new Date().toISOString(),
    );
  redes.guardarCuentasSeguidas({ instagram: [{ usuario: "teatro.presidente", tipo: "recinto" }], facebook: [] });
  assert.equal(redes.estadoLecturaRedes().instagram.listo, true);
  const ahora = new Date().toISOString();
  const llamadas: Llamada[] = [];
  const solicitar = graph(
    {
      "/pagina1": { instagram_business_account: { id: "ig-spotmi" } },
      "/ig-spotmi": {
        business_discovery: {
          media: {
            data: [
              { id: "p1", caption: `Cascanueces en el Teatro Presidente, ${textoFecha(dia)} a las 7:00 p. m. Boletos $25`, media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/v/cascanueces.jpg", permalink: "https://www.instagram.com/p/AAA/", timestamp: ahora },
              { id: "p2", caption: "Feliz lunes", media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/v/lunes.jpg", permalink: "https://www.instagram.com/p/BBB/", timestamp: ahora },
              { id: "p3", caption: "Post de hace un año", media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/v/viejo.jpg", permalink: "https://www.instagram.com/p/CCC/", timestamp: "2025-01-01T00:00:00+0000" },
            ],
          },
        },
      },
    },
    llamadas,
  );
  const prompts: string[] = [];
  gemini.usarGeminiDePrueba(async (p) => {
    prompts.push(String(p.contents));
    // El modelo intenta poner otra fuente: se ignora y se usa el enlace del post.
    return {
      text: JSON.stringify([{ post: "p1", titulo: "El Cascanueces", fecha: dia, hora: "19:00", lugar: "Teatro Presidente", municipio: "San Salvador", departamento: "San Salvador", categoria: "cultura", precio: "$25", fuente_url: "https://otro.sitio/inventado", descripcion: "Ballet navideño." }]),
      usageMetadata: { totalTokenCount: 120 },
    } as never;
  });
  const { candidatos, resumen } = await redes.candidatosDeRedes({ hoy, diasAdelante: 60, conocidos: [], gemini: { granjaId: null }, solicitar });
  gemini.usarGeminiDePrueba(undefined);
  assert.equal(resumen.posts, 2, "el post de hace un año no se manda a Gemini");
  assert.doesNotMatch(prompts[0], /Post de hace un año/);
  assert.match(llamadas[1].url, /fields=business_discovery\.username\(teatro\.presidente\)/);
  assert.ok(llamadas.every((l) => l.url.startsWith("https://graph.facebook.com/")), "solo la Graph API oficial");
  assert.equal(candidatos.length, 1);
  assert.equal(candidatos[0].fuente_url, "https://www.instagram.com/p/AAA/");

  const sitios = web({ "https://scontent.cdninstagram.com/v/cascanueces.jpg": cartel });
  const r = await verificador.verificarCandidatos(candidatos, { hoy, diasAdelante: 60, dominios: ["elsalvador.travel"], restantes: 5, referencias: eventos.referenciasLocales(), granjaId: null, ejecucionId: null }, { descargar: sitios });
  assert.equal(r.nuevos.length, 1);
  const e = eventos.leerEvento(r.nuevos[0].id);
  assert.equal(e.origen, "instagram");
  assert.equal(e.fuenteUrl, "https://www.instagram.com/p/AAA/");
  assert.equal(e.fecha, dia, "la fecha está en el texto del post");
  assert.equal(e.hora, "19:00");
  assert.equal(e.precio, "$25");
  assert.equal(e.fuentes[0].tipo, "cuenta_red");
  assert.equal(e.fuentes[0].cuenta, "@teatro.presidente");
  assert.ok(e.imagenMedioId, "la imagen del post llega por la API");
  assert.equal(e.imagenConfirmada, false);
  assert.match(e.imagenPermiso, /post de @teatro\.presidente en Instagram \(API oficial\) · pendiente de tu confirmación$/);
});

test("dominios prohibidos: el HTML y las imágenes de redes nunca se leen; el enlace manual sí se guarda (sin abrirlo)", async () => {
  // Una imagen del CDN de Instagram sin pasar por la API se rechaza.
  await assert.rejects(imagenes.descargarImagen("https://scontent.cdninstagram.com/v/x.jpg", "x", web({})), /red social/);
  // El cazador no puede usar una red social como fuente; un post de la API tampoco puede traer otra URL.
  const hoy = tiempo.diaLocal();
  const base = { fecha: null, hora: null, lugar: null, municipio: null, departamento: null, categoria: null, precio: null, boletos_url: null, imagen_url: null, descripcion: null, fecha_fin: null, nota_verificacion: null };
  const r = await verificador.verificarCandidatos(
    [
      { ...base, titulo: "Concierto en TikTok", fuente_url: "https://www.tiktok.com/@banda/video/1" },
      { ...base, titulo: "Post con enlace ajeno", fuente_url: "https://otro.sitio/x", red: { via: "instagram", cuenta: "@x", publicado: "", imagenUrl: null, texto: "Post con enlace ajeno" } },
    ],
    { hoy, diasAdelante: 30, dominios: ["tiktok.com", "otro.sitio"], restantes: 5, referencias: [], granjaId: null, ejecucionId: null },
    { descargar: web({}) },
  );
  assert.deepEqual(
    r.descartados.map((d) => d.motivo),
    ["Fuente en una red social: no se usa.", "El enlace no es el del post leído por la API."],
  );
  // «Pegar enlace»: TikTok queda como fuente principal, origen manual, 35 puntos.
  const dia = tiempo.sumarDias(hoy, 20);
  const manual = eventos.crearEventoManual({ url: "https://www.tiktok.com/@banda/video/123", titulo: "Banda Los Tigres en Santa Ana", fecha: dia, fechaFin: null, hora: null, lugar: "Teatro de Santa Ana", municipio: "Santa Ana", departamento: "Santa Ana", categoria: "musica", precio: null, boletosUrl: null, descripcion: "" });
  assert.equal(manual.duplicado, false);
  assert.equal(manual.evento.origen, "manual");
  assert.equal(manual.evento.fuentes[0].tipo, "red_manual");
  assert.equal(manual.evento.confirmadoEn.fecha, "propietario");
  // Editar conserva ese enlace; pero no se puede cambiar a otra red ni poner una red en otro evento.
  const datos = { titulo: manual.evento.titulo, fecha: dia, fechaFin: null, hora: "20:00", lugar: "Teatro de Santa Ana", municipio: "Santa Ana", departamento: "Santa Ana", categoria: "musica", precio: null, boletosUrl: null, descripcion: "" };
  const editado = eventos.editarEvento(manual.evento.id, manual.evento.revision, { ...datos, fuenteUrl: "https://www.tiktok.com/@banda/video/123" });
  assert.equal(editado.hora, "20:00");
  assert.throws(() => eventos.editarEvento(editado.id, editado.revision, { ...datos, fuenteUrl: "https://www.instagram.com/p/x/" }), /redes sociales/);
  const web1 = nuevo({ titulo: "Feria de Apopa", fuenteUrl: "https://apopa.gob.sv/feria" });
  assert.throws(() => eventos.editarEvento(web1.id, web1.revision, { ...datos, titulo: "Feria de Apopa", fuenteUrl: "https://www.tiktok.com/@x/video/9" }), /redes sociales/);
  // El mismo evento pegado otra vez desde Instagram suma la URL en vez de crear otra tarjeta.
  const otra = eventos.crearEventoManual({ url: "https://www.instagram.com/p/TIGRES/", titulo: "Los Tigres – Santa Ana", fecha: dia, fechaFin: null, hora: null, lugar: "", municipio: "", departamento: "", categoria: "musica", precio: null, boletosUrl: null, descripcion: "" });
  assert.equal(otra.duplicado, true);
  assert.equal(otra.evento.id, manual.evento.id);
  assert.equal(otra.evento.fuentes.length, 2);
});
