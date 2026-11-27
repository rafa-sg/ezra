import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

process.env.EZRA_DATA_DIR = path.resolve(`work/spotmi-publicacion-${process.pid}-${Date.now()}`);
process.env.EZRA_TOKEN_KEY = Buffer.alloc(32, 8).toString("base64");
process.env.SPOTMI_SUPABASE_URL = "https://prueba.supabase.co";
process.env.SPOTMI_SUPABASE_ANON_KEY = "sb_publishable_prueba";
process.env.SPOTMI_EDITORIAL_EMAIL = "editorial@example.test";
process.env.SPOTMI_EDITORIAL_PASSWORD = "test-password";
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
let events: typeof import("../src/lib/granjas/eventos");
let publishing: typeof import("../src/lib/granjas/spotmi-publicacion");
let connections: typeof import("../src/lib/granjas/conexiones");
let media: typeof import("../src/lib/granjas/medios");
let db: typeof import("../src/lib/granjas/db");
let canPublish = true;
let loseResponse = false;
let uploadConflict = false;
const actor = "owner-test";
const calls: { url: string; body: Record<string, unknown> }[] = [];
const receipts = new Map<string, { id: string; estado: string; evento: string }>();
const ok = (body: object) => Response.json(body);
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  events = await import("../src/lib/granjas/eventos");
  publishing = await import("../src/lib/granjas/spotmi-publicacion");
  connections = await import("../src/lib/granjas/conexiones");
  media = await import("../src/lib/granjas/medios");
  db = await import("../src/lib/granjas/db");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!));
  connections.usarRedDePrueba(async (url, init) => {
    if (url.includes("/storage/")) {
      calls.push({ url, body: {} });
      return uploadConflict ? new Response(JSON.stringify({ error: "Duplicate" }), { status: 400 }) : ok({ Key: "cover" });
    }
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ url, body });
    if (url.includes("/auth/v1/token")) return ok({ access_token: "access", refresh_token: "refresh", expires_in: 3600 });
    if (url.endsWith("/ezra_identidad_editorial")) return ok({ usuario: "10000000-0000-4000-8000-000000000001", activo: true, puede_publicar: canPublish });
    if (url.endsWith("/ezra_publicar_evento")) {
      if (!receipts.has(body.clave)) receipts.set(body.clave, { id: crypto.randomUUID(), estado: "approved", evento: crypto.randomUUID() });
      if (loseResponse) throw new TypeError("Network response lost after commit");
      return ok(receipts.get(body.clave)!);
    }
    return new Response("{}", { status: 404 });
  });
});
after(() => connections.usarRedDePrueba(undefined));

function create(title = "Festival autorizado") {
  return events.crearEvento({ titulo: title, fecha: future, fechaFin: future, hora: "19:30", lugar: "Teatro Nacional", municipio: "San Salvador Centro", departamento: "San Salvador", categoria: "musica", precio: "$15", boletosUrl: null, fuenteUrl: "https://cultura.gob.sv/agenda", confirmadoEn: {}, sugerencias: {}, descripcion: "Festival con datos revisados.", imagenUrl: null, notaVerificacion: "", granjaId: null, ejecucionId: null });
}
const auth = (revision: number, confirmation = "PUBLICAR") => ({ actor, revision, confirmation });

test("publicación directa: permiso explícito, aprobación vigente y confirmación exacta antes de cualquier envío", async () => {
  const event = create();
  await assert.rejects(publishing.publishEventToSpotmi(event.id, auth(event.revision)), /no está habilitada/);
  canPublish = false;
  await connections.conectarDirecto("spotmi");
  assert.equal(publishing.spotmiPuedePublicar(), false);
  canPublish = true;
  await connections.conectarDirecto("spotmi");
  const before = calls.length;
  await assert.rejects(publishing.publishEventToSpotmi(event.id, auth(event.revision, "SI")), /PUBLICAR/);
  await assert.rejects(publishing.publishEventToSpotmi(event.id, auth(event.revision + 1)), /cambió/);
  await assert.rejects(publishing.publishEventToSpotmi(event.id, auth(event.revision)), /Aprueba/);
  const approved = events.aprobarEvento(event.id, event.revision);
  const edited = events.editarEvento(event.id, approved.revision, { ...approved, titulo: "Título corregido" });
  assert.equal(edited.estado, "nuevo");
  await assert.rejects(publishing.publishEventToSpotmi(event.id, auth(edited.revision)), /Aprueba/);
  assert.equal(calls.length, before);
});

test("una respuesta perdida se recupera sin duplicar, sin editar hechos ni portada durante el envío", async () => {
  const fresh = create("Concierto con reintento");
  const approved = events.aprobarEvento(fresh.id, fresh.revision);
  const count = receipts.size;
  loseResponse = true;
  await assert.rejects(publishing.publishEventToSpotmi(approved.id, auth(approved.revision)), /desconocido/);
  const pending = events.leerEvento(approved.id);
  assert.throws(() => events.editarEvento(pending.id, pending.revision, { ...pending, titulo: "Cambio tardío" }), /sin confirmar/);
  assert.throws(() => events.autorizarImagen(pending.id, pending.revision, null, ""), /sin confirmar/);
  await assert.rejects(publishing.publishEventToSpotmi(pending.id, auth(approved.revision)), /cambió/);
  loseResponse = false;
  const sent = await publishing.publishEventToSpotmi(pending.id, auth(pending.revision));
  assert.equal(sent.spotmiEstado, "aceptado");
  assert.equal(receipts.size, count + 1);
  const requests = calls.filter((c) => c.body.clave === sent.spotmiClave);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].body, requests[1].body);
  assert.equal(requests[0].body.fecha_fin, future);
  assert.equal(requests[0].body.portada_ruta, null);
  const total = calls.length;
  await assert.rejects(publishing.publishEventToSpotmi(sent.id, auth(sent.revision)), /ya se envió/);
  assert.equal(calls.length, total);
});

test("cambiar imagen invalida aprobación; sólo la portada confirmada viaja a la carpeta de la cuenta", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=", "base64");
  const cover = await media.guardarMedio(png, { nombre: "Portada propia", procedencia: { origen: "subida", nota: "Propia" }, licencia: "Propia", generado: false });
  const fresh = create("Festival con portada");
  const approved = events.aprobarEvento(fresh.id, fresh.revision);
  const changed = events.autorizarImagen(approved.id, approved.revision, cover.id, "Fotografía propia autorizada");
  assert.equal(changed.estado, "nuevo");
  await assert.rejects(publishing.publishEventToSpotmi(changed.id, auth(changed.revision)), /Aprueba/);
  const ready = events.aprobarEvento(changed.id, changed.revision);
  uploadConflict = true;
  const sent = await publishing.publishEventToSpotmi(ready.id, auth(ready.revision));
  uploadConflict = false;
  const request = calls.find((c) => c.body.clave === sent.spotmiClave)!;
  assert.match(String(request.body.portada_ruta), /^ezra\/10000000-0000-4000-8000-000000000001\/[a-f0-9]{64}\.png$/);
  assert.ok(calls.some((c) => c.url.endsWith(String(request.body.portada_ruta))));
  db.base().prepare("update medios set generado = 1 where id = ?").run(cover.id);
  assert.throws(() => publishing.preparePublication(ready), /referencia IA/);
  const unconfirmed = { ...ready, imagenConfirmada: false };
  assert.equal(publishing.preparePublication(unconfirmed).media, null);
});

test("un envío a otro proyecto de Supabase (desarrollo) no bloquea publicar en la web real y queda en la auditoría", async () => {
  const fresh = create("Duatlón enviado a desarrollo");
  const approved = events.aprobarEvento(fresh.id, fresh.revision);
  const sent = await publishing.publishEventToSpotmi(approved.id, auth(approved.revision));
  const fila = () => db.base().prepare("select spotmi_destino, spotmi_propuesta_id from eventos where id = ?").get(sent.id) as { spotmi_destino: string | null; spotmi_propuesta_id: string | null };
  assert.equal(fila().spotmi_destino, "prueba.supabase.co");
  // Así quedaron los envíos anteriores al 27 nov 2026: en el proyecto de desarrollo.
  db.base().prepare("update eventos set spotmi_destino = 'nwcmrcgfhdufnaomzkmz.supabase.co' where id = ?").run(sent.id);
  const visto = events.leerEvento(sent.id);
  assert.equal(visto.spotmiPropuestaId, null);
  assert.equal(visto.spotmiEstado, null);
  const reenviado = await publishing.publishEventToSpotmi(visto.id, auth(visto.revision));
  assert.equal(reenviado.spotmiEstado, "aceptado");
  assert.equal(fila().spotmi_destino, "prueba.supabase.co");
  const archivo = db.base().prepare("select detalle from auditoria where accion = 'evento.spotmi.envio_otro_destino' and objeto = ?").get(sent.id) as { detalle: string } | undefined;
  assert.ok(archivo);
  const detalle = JSON.parse(archivo.detalle);
  assert.equal(detalle.destino, "nwcmrcgfhdufnaomzkmz.supabase.co");
  assert.equal(detalle.propuesta, sent.spotmiPropuestaId);
  assert.equal(detalle.nuevoDestino, "prueba.supabase.co");
});
