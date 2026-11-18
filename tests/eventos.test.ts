import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/; Gemini, páginas y Supabase simulados.
process.env.EZRA_DATA_DIR = path.resolve(`work/eventos-test-${process.pid}-${Date.now()}`);
process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.EZRA_PRODUCCION_IA = "1";
process.env.GEMINI_API_KEY = "clave-de-prueba";
process.env.SPOTMI_SUPABASE_URL = "https://prueba.supabase.co";
process.env.SPOTMI_SUPABASE_ANON_KEY = "sb_publishable_prueba";
process.env.SPOTMI_EDITORIAL_EMAIL = "editorial@example.test";
process.env.SPOTMI_EDITORIAL_PASSWORD = "contrasena-de-prueba";
import type { Respuesta } from "../src/lib/granjas/fuentes";
import type { Dependencias } from "../src/lib/granjas/pasos";
let eventos: typeof import("../src/lib/granjas/eventos");
let verificador: typeof import("../src/lib/granjas/verificador");
let cazador: typeof import("../src/lib/granjas/cazador");
let almacen: typeof import("../src/lib/granjas/almacen");
let ejecucion: typeof import("../src/lib/granjas/ejecucion");
let conexiones: typeof import("../src/lib/granjas/conexiones");
let propuestas: typeof import("../src/lib/granjas/spotmi-propuestas");
let db: typeof import("../src/lib/granjas/db");
let tiempo: typeof import("../src/lib/granjas/tiempo");
let procesarUno: typeof import("../src/lib/granjas/trabajador").procesarUno;
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  eventos = await import("../src/lib/granjas/eventos");
  verificador = await import("../src/lib/granjas/verificador");
  cazador = await import("../src/lib/granjas/cazador");
  almacen = await import("../src/lib/granjas/almacen");
  ejecucion = await import("../src/lib/granjas/ejecucion");
  conexiones = await import("../src/lib/granjas/conexiones");
  propuestas = await import("../src/lib/granjas/spotmi-propuestas");
  db = await import("../src/lib/granjas/db");
  tiempo = await import("../src/lib/granjas/tiempo");
  ({ procesarUno } = await import("../src/lib/granjas/trabajador"));
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
const hoy = () => tiempo.diaLocal();
const en = (n: number) => tiempo.sumarDias(hoy(), n);
const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const largo = (dia: string) => `${Number(dia.slice(8, 10))} de ${meses[Number(dia.slice(5, 7)) - 1]}`;
/** Páginas simuladas por URL; robots.txt siempre permite. */
function web(paginas: Record<string, string>) {
  return async (u: URL): Promise<Respuesta> => {
    if (u.pathname === "/robots.txt") return { estado: 404, tipo: "text/plain", cuerpo: Buffer.from(""), url: u.toString() };
    const html = paginas[u.toString()];
    return html === undefined
      ? { estado: 404, tipo: "text/html", cuerpo: Buffer.from("no"), url: u.toString() }
      : { estado: 200, tipo: "text/html", cuerpo: Buffer.from(html), url: u.toString() };
  };
}
const candidato = (c: Partial<import("../src/lib/granjas/cazador").Candidato> & { titulo: string; fuente_url: string }) =>
  cazador.candidatoSchema.parse({ fecha: null, hora: null, lugar: "Teatro Nacional", municipio: "San Salvador Centro", departamento: "san salvador", categoria: "concierto", precio: null, boletos_url: null, imagen_url: null, descripcion: "Concierto sinfónico de fin de año.", ...c });

test("duplicados: mismo evento con otro título o fecha cercana; distinto evento no se confunde", () => {
  assert.ok(eventos.parecido("Festival del Maíz", "Festival del Maíz de Suchitoto 2026") >= 0.6);
  assert.ok(eventos.parecido("Concierto de la Orquesta Sinfónica", "Feria Gastronómica de Juayúa") < 0.3);
  const refs = [
    { titulo: "Festival del Maíz de Suchitoto", fecha: "2026-11-28", origen: "Spotmi" },
    { titulo: "Fiestas patronales de San Miguel", fecha: null, origen: "Ezra" },
  ];
  assert.equal(eventos.buscarDuplicado({ titulo: "Festival del Maíz", fecha: "2026-11-29" }, refs)?.origen, "Spotmi");
  assert.equal(eventos.buscarDuplicado({ titulo: "Festival del Maíz", fecha: "2026-12-05" }, refs), null, "otra fecha, otro evento");
  assert.equal(eventos.buscarDuplicado({ titulo: "Fiestas Patronales de San Miguel 2026", fecha: "2026-11-21" }, refs)?.origen, "Ezra");
  assert.equal(eventos.huellaTitulo("¡Festival del MAÍZ!"), eventos.huellaTitulo("festival maiz"));
  // Caso real del 18 nov: misma fecha, distinto pueblo. Las palabras genéricas no deciden.
  const mismoDia = [{ titulo: "Fiestas patronales de Armenia", fecha: "2026-11-20", origen: "esta búsqueda" }];
  assert.equal(eventos.buscarDuplicado({ titulo: "Fiestas patronales de Apopa", fecha: "2026-11-20" }, mismoDia), null);
  assert.ok(eventos.buscarDuplicado({ titulo: "Fiestas Patronales de Armenia 2026", fecha: "2026-11-20" }, mismoDia));
  assert.equal(eventos.buscarDuplicado({ titulo: "Concierto de Navidad", fecha: "2026-12-12" }, [{ titulo: "Feria de Navidad de Santa Tecla", fecha: "2026-12-12", origen: "Spotmi" }]), null);
  assert.ok(eventos.buscarDuplicado({ titulo: "Concierto Milo J", fecha: "2026-11-25" }, [{ titulo: "Concierto Milo J", fecha: "2026-11-25", origen: "Spotmi" }]));
  assert.ok(eventos.parecido("Festival número uno", "Festival número dos") < 0.6);
  assert.equal(eventos.departamentoNormalizado("departamento de usulutan"), "Usulután");
  assert.equal(eventos.categoriaNormalizada("Fiestas patronales"), "religioso");
});

test("verificador: fecha, hora y precio solo si aparecen en la fuente; nunca se inventan", () => {
  const texto = "Concierto de Navidad. Sábado 28 de noviembre, 7:30 p. m. Entrada general $15.00 y VIP $30";
  assert.equal(verificador.fechaEnTexto(texto, "2026-11-28"), true);
  assert.equal(verificador.fechaEnTexto(texto, "2026-11-29"), false);
  assert.equal(verificador.fechaEnTexto("Del 27 al 29 de noviembre", "2026-11-27"), true);
  assert.equal(verificador.fechaEnTexto("Fecha: 28/11/2026", "2026-11-28"), true);
  assert.equal(verificador.fechaEnTexto("", "2026-11-28", '{"startDate":"2026-11-28T19:30:00-06:00"}'), true, "schema.org");
  assert.equal(verificador.horaEnTexto(texto, "19:30"), true);
  assert.equal(verificador.horaEnTexto(texto, "07:30"), false, "7:30 p. m. no es 07:30");
  assert.equal(verificador.horaEnTexto("Abre a las 7:30", "19:30"), false, "7:30 sin a. m./p. m. es ambiguo");
  assert.equal(verificador.horaEnTexto("Inicio 20:00 h", "20:00"), true);
  assert.equal(verificador.horaEnTexto("Desde las 8 pm", "20:00"), true);
  assert.equal(verificador.precioEnTexto(texto, "$15 general, $30 VIP"), "$15 general, $30 VIP");
  assert.equal(verificador.precioEnTexto(texto, "$20"), null);
  assert.equal(verificador.precioEnTexto("Entrada libre para toda la familia", "Gratis"), "Entrada gratuita");
  assert.equal(verificador.precioEnTexto("Sin precio publicado", "Gratis"), null);
  assert.equal(verificador.tituloEnTexto("Gran Concierto de Navidad en el Teatro", "Concierto de Navidad"), true);
  assert.equal(verificador.tituloEnTexto("Feria agrícola", "Concierto de Navidad"), false);
});

test("verificador: redes sociales, dominios fuera de la lista, páginas que no mencionan el evento, ventana y duplicados", async () => {
  const d1 = en(5);
  const d2 = en(9);
  const pagina = (titulo: string, extra = "") =>
    `<html><head><title>${titulo}</title><meta property="og:image" content="https://cultura.gob.sv/img/cartel.jpg"></head><body><h1>${titulo}</h1>${extra}<a href="https://boletos.cultura.gob.sv/compra">Compra</a></body></html>`;
  const paginas = {
    "https://cultura.gob.sv/agenda/concierto-navidad": pagina("Concierto de Navidad", `<p>${largo(d1)}, 7:30 p. m. Entrada general $15</p>`),
    "https://cultura.gob.sv/agenda/feria-sin-datos": pagina("Feria de Artesanías", "<p>Pronto más información</p>"),
    "https://cultura.gob.sv/agenda/otra-cosa": pagina("Exposición de pintura", "<p>Nada que ver</p>"),
    "https://cultura.gob.sv/agenda/lejano": pagina("Festival lejano", `<p>${largo(en(40))}</p>`),
  };
  const r = await verificador.verificarCandidatos(
    [
      candidato({ titulo: "Concierto de Navidad", fecha: d1, hora: "19:30", precio: "$15", boletos_url: "https://boletos.cultura.gob.sv/compra", fuente_url: "https://cultura.gob.sv/agenda/concierto-navidad" }),
      candidato({ titulo: "Feria de Artesanías", fecha: d2, hora: "10:00", precio: "$2", categoria: "feria", fuente_url: "https://cultura.gob.sv/agenda/feria-sin-datos" }),
      candidato({ titulo: "Concierto en Instagram", fuente_url: "https://www.instagram.com/p/abc/" }),
      candidato({ titulo: "Concierto en un blog", fuente_url: "https://blog.example.com/evento" }),
      candidato({ titulo: "Gran Gala Lírica", fecha: d1, fuente_url: "https://cultura.gob.sv/agenda/otra-cosa" }),
      candidato({ titulo: "Concierto de Navidad 2026", fecha: d1, fuente_url: "https://cultura.gob.sv/agenda/concierto-navidad" }),
      candidato({ titulo: "Festival lejano", fecha: en(40), fuente_url: "https://cultura.gob.sv/agenda/lejano" }),
      candidato({ titulo: "Festival del Maíz", fecha: en(3), fuente_url: "https://cultura.gob.sv/agenda/maiz" }),
    ],
    { hoy: hoy(), diasAdelante: 14, dominios: ["gob.sv", "instagram.com"], restantes: 10, referencias: [], granjaId: null, ejecucionId: null },
    { descargar: web(paginas), catalogoSpotmi: async () => [{ titulo: "Festival del Maíz", fecha: en(3), origen: "Spotmi" }] },
  );
  assert.deepEqual(
    r.nuevos.map((n) => [n.titulo, n.porConfirmar]),
    [
      ["Concierto de Navidad", []],
      ["Feria de Artesanías", ["fecha", "hora", "precio"]],
    ],
  );
  const motivos = Object.fromEntries(r.descartados.map((d) => [d.titulo, d.motivo]));
  assert.match(motivos["Concierto en Instagram"], /red social/);
  assert.match(motivos["Concierto en un blog"], /no está en las fuentes permitidas/);
  assert.match(motivos["Gran Gala Lírica"], /no menciona/);
  assert.match(motivos["Festival lejano"], /Fuera de los 14 días/);
  assert.deepEqual(r.duplicados.map((d) => d.titulo).sort(), ["Concierto de Navidad 2026", "Festival del Maíz"]);
  const concierto = eventos.leerEvento(r.nuevos[0].id);
  assert.deepEqual([concierto.fecha, concierto.hora, concierto.precio], [d1, "19:30", "$15"]);
  assert.equal(concierto.boletosUrl, "https://boletos.cultura.gob.sv/compra");
  assert.equal(concierto.imagenUrl, "https://cultura.gob.sv/img/cartel.jpg");
  assert.equal(concierto.imagenMedioId, null, "una imagen sugerida no queda autorizada");
  assert.equal(concierto.departamento, "San Salvador");
  assert.equal(concierto.categoria, "musica");
  const feria = eventos.leerEvento(r.nuevos[1].id);
  assert.deepEqual([feria.fecha, feria.hora, feria.precio], [null, null, null], "por confirmar");
  assert.deepEqual(feria.sugerencias, { fecha: d2, hora: "10:00", precio: "$2" });
});

const llamadasGemini: string[] = [];
const depsGranja = (respuesta: string, paginas: Record<string, string>): Dependencias => ({
  generar: async (encargo, prompt, contexto, opciones) => {
    llamadasGemini.push(`${encargo.agente}|${contexto.paso}|${opciones?.maxTokens ?? ""}|${prompt.slice(0, 60)}`);
    return { texto: respuesta, busquedaHtml: "" };
  },
  recolectar: async () => [],
  renderizar: async () => {
    throw new Error("render no esperado");
  },
  usosLegado: async () => 0,
  especialistas: { descargar: web(paginas), catalogoSpotmi: async () => [] },
});
async function vaciar(d: Dependencias) {
  for (let i = 0; i < 30; i++) if (!(await procesarUno("prueba", { dependencias: d, concurrencia: 2 }))) return;
}

test("granja «Eventos de El Salvador»: cazador (Gemini simulado) → verificador sin IA → bandeja, con máximo por día", async () => {
  db.base().exec("delete from eventos");
  const granja = almacen.crearDesdeReceta("eventos_el_salvador");
  assert.deepEqual(
    granja.grafo.nodos.map((n) => [n.agente, n.proveedor]),
    [
      ["cazador", "gemini"],
      ["verificador", "local"],
    ],
  );
  const dias = [en(2), en(4), en(6)];
  const paginas = Object.fromEntries(
    dias.map((d, i) => [`https://elsalvador.travel/eventos/e${i}`, `<html><body><h1>Festival número ${["uno", "dos", "tres"][i]}</h1><p>${largo(d)}</p></body></html>`]),
  );
  const json = JSON.stringify(
    dias.map((d, i) => ({ titulo: `Festival número ${["uno", "dos", "tres"][i]}`, fecha: d, hora: null, lugar: "Plaza", municipio: "", departamento: "La Libertad", categoria: "festival", precio: null, boletos_url: null, fuente_url: `https://elsalvador.travel/eventos/e${i}`, imagen_url: null, descripcion: "Festival." })),
  );
  // Con máximo 2 por día, el tercero no entra aunque sea válido.
  almacen.actualizarGranja(granja.id, granja.revision, { datos: { ...granja, ajustes: { ...granja.ajustes, eventos: { maxPorDia: 2, diasAdelante: 14 } } } });
  assert.throws(() => ejecucion.iniciarEjecucion(granja.id, { confirmarIA: false, usuario: "u", encargos: new Map() }), /Confirma/);
  const e = ejecucion.iniciarEjecucion(granja.id, { confirmarIA: true, usuario: "u", encargos: new Map() });
  llamadasGemini.length = 0;
  await vaciar(depsGranja(`Aquí tienes:\n\`\`\`json\n${json}\n\`\`\``, paginas));
  const verif = granja.grafo.nodos.find((n) => n.agente === "verificador")!.id;
  const pasoVerif = (id: string) => ejecucion.pasosDe(id).find((p) => p.nodoId === verif)!;
  assert.deepEqual(ejecucion.pasosDe(e.id).map((p) => p.estado), ["completado", "completado"]);
  assert.equal(llamadasGemini.length, 1, "una sola llamada a la IA: el verificador no usa IA");
  assert.match(llamadasGemini[0], /^cazador\|Cazador de eventos\|8192\|# Spotmi · Cazador de eventos de El Salvador/);
  assert.equal(eventos.listarEventos().length, 2);
  assert.ok(eventos.listarEventos().every((x) => x.ejecucionId === e.id && x.estado === "nuevo" && x.fecha && x.departamento === "La Libertad"));
  // Una segunda ejecución del mismo día ya no agrega más.
  const e2 = ejecucion.iniciarEjecucion(granja.id, { confirmarIA: true, usuario: "u", encargos: new Map() });
  await vaciar(depsGranja(json, paginas));
  assert.match(pasoVerif(e2.id).detalle, /máximo de eventos nuevos de hoy/);
  assert.equal(eventos.listarEventos().length, 2);
  // Una respuesta sin JSON deja el verificador bloqueado con una explicación.
  db.base().exec("delete from eventos");
  const e3 = ejecucion.iniciarEjecucion(granja.id, { confirmarIA: true, usuario: "u", encargos: new Map() });
  await vaciar(depsGranja("No encontré nada.", paginas));
  assert.equal(pasoVerif(e3.id).estado, "bloqueado");
});

test("bandeja: aprobar, descartar con motivo, editar vuelve a «nuevo» y exportar CSV seguro", () => {
  db.base().exec("delete from eventos");
  const e = eventos.crearEvento({
    titulo: "=Feria, \"especial\"",
    fecha: null,
    hora: null,
    lugar: "Plaza",
    municipio: "",
    departamento: "",
    categoria: "feria",
    precio: null,
    boletosUrl: null,
    fuenteUrl: "https://cultura.gob.sv/x",
    confirmadoEn: {},
    sugerencias: {},
    descripcion: "",
    imagenUrl: null,
    notaVerificacion: "",
    granjaId: null,
    ejecucionId: null,
  });
  assert.throws(() => eventos.descartarEvento(e.id, e.revision, ""), /motivo/);
  const aprobado = eventos.aprobarEvento(e.id, e.revision);
  assert.equal(aprobado.estadoVisible, "aprobado");
  assert.throws(() => eventos.aprobarEvento(e.id, e.revision), /otra ventana/);
  const editado = eventos.editarEvento(e.id, aprobado.revision, {
    ...aprobado,
    titulo: "Feria especial",
    fecha: en(3),
    hora: "18:00",
    precio: "Entrada gratuita",
  });
  assert.equal(editado.estado, "nuevo", "editar hechos exige aprobar otra vez");
  assert.deepEqual(editado.confirmadoEn, { fecha: "propietario", hora: "propietario", precio: "propietario" });
  assert.throws(() => eventos.editarEvento(e.id, editado.revision, { ...editado, fuenteUrl: "https://www.facebook.com/evento" }), /redes sociales/);
  const csv = eventos.eventosCsv([eventos.crearEvento({ ...editado, titulo: "=SUMA(1;2)", fecha: null }), editado]);
  assert.ok(csv.startsWith("﻿titulo,fecha"));
  assert.match(csv, /"'=SUMA\(1;2\)"/, "una fórmula no se ejecuta en la hoja de cálculo");
  assert.match(csv, /por confirmar/);
  const descartado = eventos.descartarEvento(e.id, editado.revision, "No es en El Salvador");
  assert.equal(descartado.motivoDescarte, "No es en El Salvador");
});

test("Spotmi: mapeo al esquema de event_proposals, idempotencia ante fallos de red y estado de la propuesta", async () => {
  db.base().exec("delete from eventos");
  const llamadas: { url: string; cuerpo: Record<string, unknown> }[] = [];
  let caerRed = false;
  let estadoRemoto = "pending";
  const propuestasPorClave = new Map<string, string>();
  conexiones.usarRedDePrueba(async (url, init) => {
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : {};
    llamadas.push({ url, cuerpo });
    const ok = (datos: unknown) => new Response(JSON.stringify(datos), { status: 200 });
    if (url.includes("/auth/v1/token")) return ok({ access_token: "acceso", refresh_token: "refresco", expires_in: 3600 });
    if (url.endsWith("/rpc/ezra_identidad_editorial")) return ok({ usuario: "u1", correo: "editorial@example.test", activo: true });
    if (url.endsWith("/rpc/ezra_proponer_evento")) {
      if (!propuestasPorClave.has(cuerpo.clave)) propuestasPorClave.set(cuerpo.clave, crypto.randomUUID());
      if (caerRed) throw new TypeError("fetch failed"); // Spotmi la guardó, pero la respuesta no llegó.
      return ok({ id: propuestasPorClave.get(cuerpo.clave), estado: "pending" });
    }
    if (url.endsWith("/rpc/ezra_estado_propuesta")) return ok({ id: cuerpo.propuesta, estado: estadoRemoto, evento: null });
    return new Response("{}", { status: 404 });
  });
  const base = {
    titulo: "Concierto de Navidad",
    fecha: en(5),
    hora: "19:30",
    lugar: "Teatro Nacional",
    municipio: "San Salvador Centro",
    departamento: "San Salvador",
    categoria: "musica" as const,
    precio: "$15",
    boletosUrl: "https://boletos.cultura.gob.sv/compra",
    fuenteUrl: "https://cultura.gob.sv/agenda/concierto-navidad",
    confirmadoEn: {},
    sugerencias: {},
    descripcion: "Concierto sinfónico.",
    imagenUrl: null,
    notaVerificacion: "",
    granjaId: null,
    ejecucionId: null,
  };
  const ev = eventos.crearEvento(base);
  await assert.rejects(propuestas.enviarEventoASpotmi(ev.id), /no está conectado/, "sin cuenta editorial no sale nada");
  await conexiones.conectarDirecto("spotmi");
  assert.ok(propuestas.spotmiPuedeProponer());
  await assert.rejects(propuestas.enviarEventoASpotmi(ev.id), /Aprueba el evento/);
  eventos.aprobarEvento(ev.id, ev.revision);
  const { datos, fuente_url } = propuestas.mapearPropuesta(eventos.leerEvento(ev.id));
  assert.deepEqual(datos, {
    titulo: "Concierto de Navidad",
    fecha: en(5),
    hora: "19:30",
    lugar: "Teatro Nacional",
    municipio: "San Salvador Centro",
    departamento: "San Salvador",
    categoria: "musica",
    descripcion: "Concierto sinfónico.\n\nPrecio: $15\nBoletos: https://boletos.cultura.gob.sv/compra",
  });
  assert.equal(fuente_url, base.fuenteUrl);
  // 1. La red falla después de que Spotmi guardó la propuesta: el resultado es desconocido.
  caerRed = true;
  await assert.rejects(propuestas.enviarEventoASpotmi(ev.id), /desconocido/);
  const pendiente = eventos.leerEvento(ev.id);
  assert.ok(pendiente.spotmiClave && !pendiente.spotmiPropuestaId);
  assert.throws(() => eventos.editarEvento(ev.id, pendiente.revision, { ...pendiente }), /sin confirmar/);
  // 2. Reintentar usa la misma clave y recibe la misma propuesta: no hay duplicado.
  caerRed = false;
  const enviado = await propuestas.enviarEventoASpotmi(ev.id);
  const envios = llamadas.filter((l) => l.url.endsWith("/rpc/ezra_proponer_evento"));
  assert.equal(envios.length, 2);
  assert.equal(envios[0].cuerpo.clave, envios[1].cuerpo.clave);
  assert.equal(propuestasPorClave.size, 1);
  assert.match(String(envios[0].cuerpo.clave), /^ezra-evento-[0-9a-f-]{36}-[0-9a-f]{16}$/);
  assert.deepEqual(Object.keys(envios[1].cuerpo).sort(), ["clave", "datos", "fuente_url"]);
  assert.equal(enviado.spotmiEstado, "propuesto");
  assert.equal(enviado.spotmiPropuestaId, propuestasPorClave.get(String(envios[0].cuerpo.clave)));
  assert.equal(enviado.estadoVisible, "propuesto");
  // 3. Enviar otra vez no crea otra propuesta.
  await assert.rejects(propuestas.enviarEventoASpotmi(ev.id), /ya se propuso/);
  // 4. El equipo la aprueba en Spotmi.
  estadoRemoto = "approved";
  assert.equal((await propuestas.consultarEstadoSpotmi(ev.id)).estadoVisible, "aceptado");
  // Un evento con fecha por confirmar no se envía.
  const sinFecha = eventos.crearEvento({ ...base, titulo: "Feria sin fecha", fecha: null });
  eventos.aprobarEvento(sinFecha.id, sinFecha.revision);
  await assert.rejects(propuestas.enviarEventoASpotmi(sinFecha.id), /Confirma la fecha/);
  conexiones.usarRedDePrueba(undefined);
});
