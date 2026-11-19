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
let banner: Buffer;
let fotoPrensa: Buffer;
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
    banner = await generar("banner.jpg", "color=c=green:s=1238x556");
    fotoPrensa = await generar("prensa.jpg", "color=c=gray:s=1200x800");
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

/* ── Parte 3: porcentaje de confianza ── */
test("confianza: tipo de la mejor fuente, coincidencias, datos por confirmar, contradicciones, antigüedad y ajustes", async () => {
  const { calcularConfianza, clasificarFuente } = await import("../src/lib/granjas/confianza");
  const hoy = "2026-11-18";
  type Ev = { fecha: string | null; fechaFin: string | null; hora: string | null; precio: string | null; lugar: string; municipio: string };
  const completo: Ev = { fecha: "2026-12-05", fechaFin: null, hora: "19:00", precio: "$25", lugar: "Teatro Presidente", municipio: "San Salvador" };
  const f = (url: string, extra: Partial<Parameters<typeof calcularConfianza>[1][number]> = {}) => ({
    url,
    via: "web" as const,
    cuenta: "",
    publicado: null,
    leido: "2026-11-17T10:00:00Z",
    campos: ["titulo", "fecha"],
    datos: { fecha: "2026-12-05", lugar: "Teatro Presidente" },
    ...extra,
  });
  const puntos = (evento: Ev, fuentes: ReturnType<typeof f>[], ajustes = {}) => calcularConfianza(evento, fuentes, { hoy, ajustes }).puntos;
  // Tipos base.
  assert.equal(puntos(completo, [f("https://www.smartticket.fun/es/event/x")]), 90, "ticketera");
  assert.equal(puntos(completo, [f("https://elsalvador.travel/esp/event/x/")]), 85, "MITUR");
  assert.equal(puntos(completo, [f("https://cultura.gob.sv/x")]), 85, "otro dominio .gob.sv");
  assert.equal(puntos(completo, [f("https://www.elsalvador.com/x")]), 65, "prensa");
  assert.equal(puntos(completo, [f("https://blog-desconocido.com/x")]), 45, "agregador");
  assert.equal(puntos(completo, [f("https://www.instagram.com/p/x/", { via: "instagram", cuenta: "@teatro" })]), 80, "cuenta oficial por API");
  assert.equal(puntos(completo, [f("https://www.tiktok.com/@x/video/1", { via: "manual" })]), 35, "enlace manual de TikTok");
  // +10: dos orígenes independientes coinciden; el mismo dominio dos veces no cuenta.
  assert.equal(puntos(completo, [f("https://elsalvador.travel/a"), f("https://www.smartticket.fun/b")]), 100, "90 + 10 (tope 100)");
  assert.equal(puntos(completo, [f("https://www.elsalvador.com/a"), f("https://www.elsalvador.com/b")]), 65);
  assert.equal(puntos(completo, [f("https://www.elsalvador.com/a"), f("https://blog.com/b")]), 75);
  // −10 por cada dato por confirmar.
  assert.equal(puntos({ ...completo, hora: null, precio: null }, [f("https://elsalvador.travel/a")]), 65);
  assert.equal(puntos({ ...completo, hora: null, precio: null, lugar: "", municipio: "" }, [f("https://blog.com/a")]), 15);
  // −20 si se contradicen (otra fecha u otro lugar); un evento de varios días no se contradice dentro de su rango.
  const otraFecha = f("https://www.elsalvador.com/b", { datos: { fecha: "2026-12-20", lugar: "Teatro Presidente" } });
  assert.equal(puntos(completo, [f("https://www.smartticket.fun/a"), otraFecha]), 70);
  const otroLugar = f("https://www.elsalvador.com/b", { datos: { fecha: "2026-12-05", lugar: "Estadio Cuscatlán" } });
  assert.equal(puntos(completo, [f("https://www.smartticket.fun/a"), otroLugar]), 70);
  const fiestas = { ...completo, fechaFin: "2026-12-10" };
  const dentro = f("https://www.elsalvador.com/b", { datos: { fecha: "2026-12-08", lugar: "Teatro Presidente" } });
  assert.equal(puntos(fiestas, [f("https://www.smartticket.fun/a"), dentro]), 100);
  // −15 si la mejor fuente tiene más de 30 días (por fecha de publicación o, si no hay, de lectura).
  assert.equal(puntos(completo, [f("https://www.smartticket.fun/a", { leido: "2026-09-01T00:00:00Z" })]), 75);
  assert.equal(puntos(completo, [f("https://www.instagram.com/p/x/", { via: "instagram", cuenta: "@t", publicado: "2026-10-01T00:00:00Z" })]), 65);
  // Límite 0–100 y desglose legible.
  const peor = calcularConfianza({ ...completo, hora: null, precio: null, lugar: "", municipio: "" }, [f("https://www.tiktok.com/@x/video/1", { via: "manual", leido: "2026-01-01T00:00:00Z" }), f("https://blog.com/z", { datos: { fecha: "2027-03-01" } })], { hoy });
  assert.equal(peor.puntos, 0);
  assert.ok(peor.desglose.some((l) => /contradicen \(fecha\)/.test(l.concepto)));
  // Ajuste del propietario: un dominio pasa a organizador con 95 puntos.
  assert.equal(puntos(completo, [f("https://www.teatropresidente.gob.sv/x")], { "teatropresidente.gob.sv": { tipo: "organizador", puntos: 95 } }), 95);
  assert.equal(clasificarFuente({ url: "https://sub.smartticket.fun/x", via: "web" }).tipo, "ticketera");
  // En la bandeja: la confianza se ve en cada evento y cambia con los ajustes guardados.
  const e = nuevo({ titulo: "Recital de piano en el Teatro Nacional", fuenteUrl: "https://blog-cultural.com/recital", fecha: "2026-12-05", hora: "19:00", precio: "$10", lugar: "Teatro Nacional" });
  assert.equal(e.confianza.puntos, 45);
  const { guardarAjuste } = await import("../src/lib/granjas/ajustes");
  const { confianzaDominiosSchema } = await import("../src/lib/granjas/confianza");
  guardarAjuste("confianza_dominios", confianzaDominiosSchema, { "blog-cultural.com": { tipo: "prensa", puntos: 70 } });
  assert.equal(eventos.leerEvento(e.id).confianza.puntos, 70);
  guardarAjuste("confianza_dominios", confianzaDominiosSchema, {});
});

/* ── Parte 4: actualización diaria ── */
test("diaria: un evento repetido suma su URL como fuente y recalcula la confianza; si su fuente cambia fecha o precio queda «Actualizado»", async () => {
  const hoy = tiempo.diaLocal();
  const dia = tiempo.sumarDias(hoy, 15);
  const nuevoDia = tiempo.sumarDias(hoy, 18);
  const candidato = (fuente: string, fecha: string, precio: string) => ({
    titulo: "Festival del Café de Ataco",
    fecha,
    hora: null,
    lugar: "Concepción de Ataco",
    municipio: "Ataco",
    departamento: "Ahuachapán",
    categoria: "feria",
    precio,
    boletos_url: null,
    fuente_url: fuente,
    imagen_url: null,
    descripcion: null,
    fecha_fin: null,
    nota_verificacion: null,
  });
  const pag = (fecha: string, precio: string) => html("", `<h1>Festival del Café de Ataco</h1><p>${textoFecha(fecha)} en Concepción de Ataco. Entrada ${precio}</p>`);
  const ctx = (dominios: string[]) => ({ hoy, diasAdelante: 60, dominios, restantes: 10, referencias: eventos.referenciasLocales(), granjaId: null, ejecucionId: null });
  const mitur = "https://elsalvador.travel/esp/event/festival-cafe-ataco/";
  // Día 1: entra nuevo desde MITUR.
  const r1 = await verificador.verificarCandidatos([candidato(mitur, dia, "$10")], ctx(["elsalvador.travel"]), { descargar: web({ [mitur]: pag(dia, "$10") }) });
  assert.equal(r1.nuevos.length, 1);
  const id = r1.nuevos[0].id;
  let e = eventos.leerEvento(id);
  assert.equal(e.confianza.puntos, 75, "MITUR 85 − hora por confirmar");
  e = eventos.aprobarEvento(id, e.revision);
  // Día 2: Smart Ticket publica el mismo evento (misma fecha) → se suma como fuente; no hay otra tarjeta.
  const st = "https://www.smartticket.fun/es/event/festival-cafe-ataco";
  const r2 = await verificador.verificarCandidatos([candidato(st, dia, "$10")], ctx(["elsalvador.travel", "smartticket.fun"]), { descargar: web({ [st]: pag(dia, "$10") }) });
  assert.equal(r2.nuevos.length, 0);
  assert.deepEqual(r2.duplicados.map((d) => [d.id, d.fuenteNueva]), [[id, true]]);
  e = eventos.leerEvento(id);
  assert.equal(e.fuentes.length, 2);
  assert.equal(e.confianza.puntos, 90, "ticketera 90 + 10 por coincidir − 10 hora por confirmar");
  assert.equal(e.estado, "aprobado", "sumar una fuente que coincide no cambia la revisión");
  // Día 3: MITUR cambia la fecha y el precio en su propia página → «Actualizado» con antes y después; vuelve a revisión.
  const r3 = await verificador.verificarCandidatos([candidato(mitur, nuevoDia, "$15")], ctx(["elsalvador.travel", "smartticket.fun"]), { descargar: web({ [mitur]: pag(nuevoDia, "$15") }) });
  assert.equal(r3.nuevos.length, 0, "la misma URL es el mismo evento aunque cambie la fecha");
  assert.equal(r3.actualizados.length, 1);
  e = eventos.leerEvento(id);
  assert.equal(e.fecha, nuevoDia);
  assert.equal(e.precio, "$15");
  assert.deepEqual(
    e.cambios.map((c) => [c.campo, c.antes, c.despues]),
    [
      ["fecha", dia, nuevoDia],
      ["precio", "$10", "$15"],
    ],
  );
  assert.equal(e.estado, "nuevo", "cambió un hecho: vuelve a tu revisión");
  assert.ok(e.confianza.desglose.some((l) => /contradicen \(fecha\)/.test(l.concepto)), "Smart Ticket sigue diciendo la fecha anterior: −20");
  // Otra fuente (no la propia) que dice otra fecha no cambia el evento: solo baja la confianza.
  const prensa = "https://www.elsalvador.com/eventos/cafe-ataco";
  const r4 = await verificador.verificarCandidatos([candidato(prensa, nuevoDia, "$20")], ctx(["elsalvador.com"]), { descargar: web({ [prensa]: pag(nuevoDia, "$20") }) });
  assert.equal(r4.actualizados.length, 0);
  assert.equal(eventos.leerEvento(id).precio, "$15");
  // Un dato escrito por el propietario nunca lo cambia una fuente.
  e = eventos.leerEvento(id);
  e = eventos.editarEvento(id, e.revision, { titulo: e.titulo, fecha: e.fecha, fechaFin: null, hora: null, lugar: e.lugar, municipio: e.municipio, departamento: e.departamento, categoria: e.categoria, precio: "$12 (preventa)", boletosUrl: null, fuenteUrl: e.fuenteUrl, descripcion: "" });
  await verificador.verificarCandidatos([candidato(mitur, nuevoDia, "$15")], ctx(["elsalvador.travel"]), { descargar: web({ [mitur]: pag(nuevoDia, "$15") }) });
  assert.equal(eventos.leerEvento(id).precio, "$12 (preventa)");
  // Ya enviado a Spotmi: el cambio no se aplica, queda anotado.
  eventos.marcarSpotmi(id, { estado: "propuesto", propuestaId: "p-1", clave: "k-1" });
  const otroDia = tiempo.sumarDias(hoy, 25);
  await verificador.verificarCandidatos([candidato(mitur, otroDia, "$12")], ctx(["elsalvador.travel"]), { descargar: web({ [mitur]: pag(otroDia, "$12") }) });
  e = eventos.leerEvento(id);
  assert.equal(e.fecha, nuevoDia);
  assert.match(e.notaVerificacion, /Cambio detectado sin aplicar \(ya está en Spotmi\): fecha/);
});

/* ── 19 nov · Imágenes oficiales: CDN de la fuente, baja resolución y foto de prensa ── */
test("afiche desde el CDN de una fuente permitida (1238×556 → baja resolución); la foto de prensa queda debajo y el afiche la reemplaza", { skip: !hayFfmpeg }, async () => {
  const dia = tiempo.sumarDias(tiempo.diaLocal(), 11);
  // Ficha de Smart Ticket: su og:image vive en otro servidor (blob de Azure), como en la realidad.
  const ficha = "https://www.smartticket.fun/es/event/molotov-ejemplo";
  const e = nuevo({ titulo: "Molotov en El Salvador", fecha: dia, fuenteUrl: ficha });
  const sitios = web({
    [ficha]: html(`<meta property="og:image" content="https://blobsmartticket.blob.core.windows.net/eventos/7700B_1.jpg">`, `<h1>Molotov en El Salvador</h1><p>${textoFecha(dia)}</p>`),
    "https://blobsmartticket.blob.core.windows.net/eventos/7700B_1.jpg": banner,
  });
  const r = await completar.completarImagenEvento(e.id, { descargar: sitios, dominios: ["smartticket.fun"] });
  assert.equal(r.estado, "afiche");
  assert.match(r.motivo, /smartticket\.fun · baja resolución/);
  const conAfiche = eventos.leerEvento(e.id);
  assert.equal(conAfiche.imagenTipo, "afiche");
  assert.equal(conAfiche.imagenBaja, true);
  assert.match(conAfiche.imagenPermiso, /fuente oficial: smartticket\.fun · pendiente/);

  // Evento con solo una nota de prensa: queda «foto de prensa».
  const nota = "https://www.elsalvador.com/entretenimiento/nota-festival";
  const p = nuevo({ titulo: "Festival de jazz de Suchitoto", fecha: dia, fuenteUrl: nota });
  const conPrensa = web({ [nota]: html(`<meta property="og:image" content="https://cdn-pro.elsalvador.com/fotos/jazz.jpg">`, "<h1>Festival de jazz de Suchitoto</h1>"), "https://cdn-pro.elsalvador.com/fotos/jazz.jpg": fotoPrensa });
  assert.equal((await completar.completarImagenEvento(p.id, { descargar: conPrensa, dominios: ["elsalvador.com"] })).estado, "prensa");
  let ev = eventos.leerEvento(p.id);
  assert.equal(ev.imagenTipo, "prensa");
  assert.match(ev.imagenPermiso, /^Foto de prensa: elsalvador\.com · pendiente/);
  // Aparece la ficha oficial: el afiche reemplaza a la foto de prensa, que queda en el historial.
  const oficial = "https://www.smartticket.fun/es/event/jazz-suchitoto";
  eventos.agregarFuente(p.id, { url: oficial, via: "web", campos: ["titulo"] });
  const ambos = web({
    [oficial]: html(`<meta property="og:image" content="https://blobsmartticket.blob.core.windows.net/eventos/jazz.jpg">`, "<h1>Festival de jazz de Suchitoto</h1>"),
    "https://blobsmartticket.blob.core.windows.net/eventos/jazz.jpg": otroCartel,
  });
  assert.equal((await completar.completarImagenEvento(p.id, { descargar: ambos, dominios: ["elsalvador.com", "smartticket.fun"] })).estado, "afiche");
  ev = eventos.leerEvento(p.id);
  assert.equal(ev.imagenTipo, "afiche");
  assert.deepEqual(ev.imagenes.map((i) => i.tipo), ["prensa", "afiche"]);
  // Un afiche no se reemplaza.
  assert.equal((await completar.completarImagenEvento(p.id, { descargar: ambos, dominios: ["smartticket.fun"] })).estado, "ya_tenia");
});
