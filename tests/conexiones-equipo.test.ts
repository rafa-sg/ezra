import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Todo en una carpeta de prueba; nunca en data/. Los módulos se importan después de fijarla.
process.env.EZRA_DATA_DIR = path.resolve(`work/conexiones-equipo-test-${process.pid}-${Date.now()}`);
process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 5).toString("base64");
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
process.env.META_APP_ID = "meta";
process.env.META_APP_SECRET = "secreto";
process.env.EZRA_OAUTH_REDIRECT_BASE = "https://ezra.example.test";
let conexiones: typeof import("../src/lib/granjas/conexiones");
let equipo: typeof import("../src/lib/equipo/almacen");
let publicacion: typeof import("../src/lib/granjas/publicacion");
let almacen: typeof import("../src/lib/granjas/almacen");
let modelo: typeof import("../src/lib/granjas/modelo");
let db: typeof import("../src/lib/granjas/db");
let procesarUno: typeof import("../src/lib/granjas/trabajador").procesarUno;
type Eq = import("../src/lib/equipo/modelo").Equipo;
let dueno: Eq, socioA: Eq, socioB: Eq, invitado: Eq;
let idSocioA = "";

before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  conexiones = await import("../src/lib/granjas/conexiones");
  equipo = await import("../src/lib/equipo/almacen");
  publicacion = await import("../src/lib/granjas/publicacion");
  almacen = await import("../src/lib/granjas/almacen");
  modelo = await import("../src/lib/granjas/modelo");
  db = await import("../src/lib/granjas/db");
  ({ procesarUno } = await import("../src/lib/granjas/trabajador"));
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!));
  dueno = equipo.equipoDe(equipo.asegurarPropietario({ clerkUserId: "user_owner", email: "owner@example.test", nombre: "Dueño" }));
  equipo.invitar({ email: "a@example.test", rol: "socio" }, "owner");
  equipo.invitar({ email: "b@example.test", rol: "socio" }, "owner");
  equipo.invitar({ email: "i@example.test", rol: "invitado", secciones: ["conexiones"] }, "owner");
  const a = equipo.vincularMiembro({ clerkUserId: "user_a", correos: ["a@example.test"] })!;
  idSocioA = a.id;
  socioA = equipo.equipoDe(a);
  socioB = equipo.equipoDe(equipo.vincularMiembro({ clerkUserId: "user_b", correos: ["b@example.test"] })!);
  invitado = equipo.equipoDe(equipo.vincularMiembro({ clerkUserId: "user_i", correos: ["i@example.test"] })!);
});

/** Red simulada de Meta: cada Página tiene su propio token («token-<página>») y su propio feed. */
const publicados: { pagina: string; token: string }[] = [];
let paginaSiguiente = "";
let paginaQueFalla = "";
function redMeta() {
  conexiones.usarRedDePrueba(async (url, init) => {
    const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { "Content-Type": "application/json" } });
    if (/oauth\/access_token/.test(url)) return json({ access_token: `usuario-${paginaSiguiente}`, expires_in: 5000000 });
    if (/me\/permissions/.test(url))
      return json({ data: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"].map((permission) => ({ permission, status: "granted" })) });
    if (/me\/accounts/.test(url))
      return json({ data: [{ id: paginaSiguiente, name: `Página ${paginaSiguiente}`, tasks: ["CREATE_CONTENT", "MANAGE"], access_token: `token-${paginaSiguiente}` }] });
    const feed = url.match(/\/(pag\w+)\/feed$/)?.[1];
    if (feed && init?.method === "POST") {
      const token = new URLSearchParams(String(init.body)).get("access_token") ?? "";
      publicados.push({ pagina: feed, token });
      if (feed === paginaQueFalla) return json({ error: { message: "Permiso rechazado", code: 200 } }, 403);
      return json({ id: `${feed}_1` });
    }
    const post = url.match(/\/(pag\w+)_1\?fields/)?.[1];
    if (post) return json({ permalink_url: `https://www.facebook.com/${post}/posts/1`, is_published: true });
    if (/permissions/.test(url) && init?.method === "DELETE") return json({ success: true });
    throw new Error(`Llamada no simulada: ${url}`);
  });
}
async function conectar(pagina: string, quien: { usuario: string; alcance: "compartida" | "personal"; miembroId: string | null }) {
  paginaSiguiente = pagina;
  const st = new URL(
    conexiones.iniciarOAuth("facebook", quien.usuario, false, { alcance: quien.alcance, miembroId: quien.miembroId }),
  ).searchParams.get("state");
  return conexiones.completarOAuth("facebook", { estado: st, codigo: "ok", error: null, usuario: quien.usuario });
}
async function vaciarCola() {
  for (let i = 0; i < 50; i++) if (!(await procesarUno("prueba", { concurrencia: 4 }))) return;
}

let compartida1 = "", compartida2 = "", personalA = "", personalB = "", personalInvitado = "";
test("varias cuentas por red, en dos niveles, sin cruzarse", async () => {
  redMeta();
  compartida1 = (await conectar("pag1", { usuario: "user_owner", alcance: "compartida", miembroId: null })).id!;
  compartida2 = (await conectar("pag2", { usuario: "user_owner", alcance: "compartida", miembroId: null })).id!;
  personalA = (await conectar("pag3", { usuario: "user_a", alcance: "personal", miembroId: socioA.miembroId })).id!;
  personalB = (await conectar("pag4", { usuario: "user_b", alcance: "personal", miembroId: socioB.miembroId })).id!;
  personalInvitado = (await conectar("pag5", { usuario: "user_i", alcance: "personal", miembroId: invitado.miembroId })).id!;
  assert.equal(new Set([compartida1, compartida2, personalA, personalB, personalInvitado]).size, 5);
  // Reconectar la misma cuenta actualiza su fila (no la duplica).
  assert.equal((await conectar("pag3", { usuario: "user_a", alcance: "personal", miembroId: socioA.miembroId })).id, personalA);

  const ids = (e: Eq) => conexiones.listarConexiones(e).map((c) => c.id).sort();
  assert.deepEqual(ids(dueno), [compartida1, compartida2].sort(), "el propietario no ve las personales de nadie");
  assert.deepEqual(ids(socioA), [compartida1, compartida2, personalA].sort());
  assert.deepEqual(ids(socioB), [compartida1, compartida2, personalB].sort());
  assert.deepEqual(ids(invitado), [personalInvitado], "un invitado no usa las compartidas");
  assert.equal(conexiones.listarConexiones(socioA).find((c) => c.id === personalA)!.propia, true);
});

test("ataques: una cuenta personal ajena no existe para los demás y los tokens nunca salen", () => {
  // Ver, usar o administrar la personal de otro: 404 (ni se revela que existe), también para el propietario.
  for (const [quien, id] of [
    [socioB, personalA],
    [dueno, personalA],
    [invitado, compartida1],
    [socioA, personalInvitado],
  ] as const) {
    assert.throws(() => conexiones.conexionDe(id, quien), (e: Error & { status?: number }) => e.status === 404);
    assert.throws(() => conexiones.conexionDe(id, quien, "administrar"), (e: Error & { status?: number }) => e.status === 404);
  }
  // Un socio usa las compartidas, pero no las administra.
  assert.equal(conexiones.conexionDe(compartida1, socioA).id, compartida1);
  assert.throws(() => conexiones.conexionDe(compartida1, socioA, "administrar"), (e: Error & { status?: number }) => e.status === 403);
  assert.equal(conexiones.conexionDe(compartida1, dueno, "administrar").id, compartida1);
  assert.equal(conexiones.conexionDe(personalA, socioA, "administrar").id, personalA);
  // Ninguna vista lleva tokens, ni cifrados ni en claro.
  for (const e of [dueno, socioA, socioB, invitado]) {
    const texto = JSON.stringify([conexiones.listarConexiones(e), conexiones.estadoCanales(e), conexiones.resumenCanales(e)]);
    assert.doesNotMatch(texto, /token-pag|usuario-pag|token_cifrado|"acceso"/);
  }
  // En la base, cifrados.
  const filas = db.base().prepare("select token_cifrado from conexiones").all() as { token_cifrado: string }[];
  for (const f of filas) assert.doesNotMatch(f.token_cifrado, /token-pag/);
  // Un estado OAuth de A no sirve a B, aunque B esté en el equipo.
  const st = new URL(
    conexiones.iniciarOAuth("facebook", "user_a", false, { alcance: "personal", miembroId: socioA.miembroId }),
  ).searchParams.get("state");
  return assert.rejects(
    conexiones.completarOAuth("facebook", { estado: st, codigo: "ok", error: null, usuario: "user_b" }),
    /no es válida/,
  );
});

test("publicación múltiple: varias cuentas a la vez, token de cada cuenta y un fallo no bloquea las demás", async () => {
  redMeta();
  const g = almacen.crearGranja(
    {
      nombre: "Varias cuentas",
      objetivo: "",
      formato: "publicacion",
      canales: ["facebook"],
      politicaFuentes: { dominios: ["example.test"], maxFuentesPorPaso: 3 },
      ajustes: { zonaHoraria: "America/El_Salvador" },
    },
    { nodos: [modelo.nodoSchema.parse({ id: crypto.randomUUID(), posicion: { x: 0, y: 0 }, tipo: "revision", titulo: "R" })], aristas: [] },
  );
  const pieza = publicacion.guardarPiezaNueva(g.id, null, null, {
    titulo: "Varias",
    textos: { spotmi: "", instagram: "", facebook: "Texto FB", tiktok: "" },
    medios: [],
    enlaces: [],
    canales: ["facebook"],
    programacion: { tipo: "ahora" },
    divulgaciones: { creditos: "", imagenGenerada: false },
    spotmi: { titulo: "", fecha: "", lugar: "", departamento: "", fuente: "" },
    fuentes: [],
  });
  publicacion.aprobarPieza(pieza.id, pieza.hash, { hechos: true, derechos: true, marca: true });
  const autorizar = (destinos: string[], quien: Eq) =>
    publicacion.autorizarPublicacion({ piezaId: pieza.id, hash: pieza.hash, destinos, confirmacion: "PUBLICAR", usuario: "u", equipo: quien });
  // B no puede publicar en la personal de A; el propietario tampoco.
  assert.throws(() => autorizar([compartida1, personalA], socioB), /no tienes acceso/);
  assert.throws(() => autorizar([personalA], dueno), /no tienes acceso/);
  assert.throws(() => autorizar([compartida1, compartida1], socioA), /distintas/);
  // A elige dos compartidas y su personal. La Página 2 rechaza el envío.
  paginaQueFalla = "pag2";
  publicados.length = 0;
  const aut = autorizar([compartida1, compartida2, personalA], socioA);
  assert.equal(aut.recibos.length, 3, "un recibo por cuenta");
  await vaciarCola();
  db.base().prepare("update trabajos set disponible_desde = ? where tipo = 'confirmar' and estado = 'pendiente'").run(new Date(0).toISOString());
  await vaciarCola();
  assert.deepEqual(
    publicados.map((p) => `${p.pagina}:${p.token}`).sort(),
    ["pag1:token-pag1", "pag2:token-pag2", "pag3:token-pag3"],
    "cada envío usa el token de SU cuenta, una sola vez",
  );
  const recibos = publicacion.vistaPieza(pieza.id).recibos;
  const estadoDe = (nombre: string) => recibos.find((r) => r.cuenta === nombre)!.estado;
  assert.equal(estadoDe("Página pag1"), "publicado");
  assert.equal(estadoDe("Página pag3"), "publicado");
  assert.equal(estadoDe("Página pag2"), "fallido", "el fallo queda en su recibo");
  // Volver a autorizar solo repite la que falló; las publicadas no se repiten.
  assert.throws(() => autorizar([compartida1], socioA), /ya se envió/);
  publicados.length = 0;
  paginaQueFalla = "";
  autorizar([compartida2], socioA);
  await vaciarCola();
  assert.deepEqual(publicados.map((p) => p.pagina), ["pag2"]);
});

test("quitar acceso a un socio desconecta sus cuentas personales y no toca las demás", async () => {
  redMeta();
  equipo.retirar(idSocioA);
  await conexiones.borrarConexionesPersonales(idSocioA);
  assert.equal(db.base().prepare("select count(*) as n from conexiones where dueno_id = ?").get(idSocioA)!.n, 0);
  assert.deepEqual(
    conexiones.listarConexiones(socioB).map((c) => c.id).sort(),
    [compartida1, compartida2, personalB].sort(),
  );
  conexiones.usarRedDePrueba(undefined);
});
