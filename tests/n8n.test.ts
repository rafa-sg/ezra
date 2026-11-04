import { test } from "node:test";
import assert from "node:assert/strict";
import { probarN8n, transportePublicacion, estadoN8n } from "../src/lib/granjas/n8n";
import type { Solicitar } from "../src/lib/granjas/adaptadores";
process.env.EZRA_N8N_SECRET = "x".repeat(32);
process.env.EZRA_N8N_WEBHOOK_URL = "https://spotmi.app.n8n.cloud/webhook/ezra-publicaciones";
process.env.EZRA_N8N_PUBLICACION = "1";

test("n8n: prueba autenticada sin publicar, respuesta ligada al id", async () => {
  const estado = await probarN8n(async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("X-Ezra-Secret"), "x".repeat(32));
    assert.equal(init?.redirect, "error");
    const cuerpo = JSON.parse(String(init?.body));
    assert.equal(cuerpo.accion, "probar_conexion");
    return Response.json({
      ok: true,
      conexion: "ezra-n8n",
      id_solicitud: cuerpo.id_solicitud,
      modo: "prueba",
      publicado: false,
    });
  });
  assert.equal(estado.estado, "conectada");
  assert.ok(!JSON.stringify(estado).includes("x".repeat(32)));
  await assert.rejects(
    probarN8n(async () => Response.json({ ok: true, id_solicitud: "viejo" })),
    /no corresponde/,
  );
  assert.equal(estadoN8n().estado, "error");
});
test("n8n: transporta formulario y resultado remoto; rechaza destinos externos", async () => {
  const enviar: Solicitar = async (_url, init) => {
    const cuerpo = JSON.parse(String(init?.body));
    assert.equal(cuerpo.accion, "meta_solicitud");
    assert.equal(cuerpo.solicitud.metodo, "POST");
    assert.equal(Buffer.from(cuerpo.solicitud.cuerpoBase64, "base64").toString(), "message=Hola");
    return Response.json({
      id_solicitud: cuerpo.id_solicitud,
      status: 403,
      cuerpo: '{"error":{"code":200}}',
    });
  };
  const transportar = transportePublicacion("facebook", enviar);
  const respuesta = await transportar("https://graph.facebook.com/v26.0/123/feed", {
    method: "POST",
    body: new URLSearchParams({ message: "Hola" }),
  });
  assert.equal(respuesta.status, 403);
  assert.equal((await respuesta.json()).error.code, 200);
  await assert.rejects(transportar("https://graph.facebook.com.evil.test/feed"), /no pertenece/);
  await assert.rejects(transportar("http://graph.facebook.com/feed"), /no pertenece/);
  await assert.rejects(
    transportar("https://graph.facebook.com/feed", { method: "DELETE" }),
    /Método/,
  );
});
test("n8n: no envía archivos excesivos, no reintenta y nunca acepta éxito de otro id", async () => {
  let llamadas = 0;
  const transportar = transportePublicacion("instagram", async () => {
    llamadas++;
    throw new Error("red");
  });
  await assert.rejects(
    transportar("https://graph.instagram.com/v26.0/123/media", {
      method: "POST",
      body: new Uint8Array(8 * 1024 * 1024 + 1),
    }),
    /supera/,
  );
  assert.equal(llamadas, 0);
  await assert.rejects(transportar("https://graph.instagram.com/v26.0/123/media"), /desconocido/);
  assert.equal(llamadas, 1);
  const ajeno = transportePublicacion("facebook", async () =>
    Response.json({ id_solicitud: "otro", status: 200, cuerpo: '{"id":"123"}' }),
  );
  await assert.rejects(ajeno("https://graph.facebook.com/v26.0/123"), /verificable/);
});
test("n8n: conserva multipart y bytes de video; otros canales no pasan por Meta", async () => {
  const transportar = transportePublicacion("facebook", async (_url, init) => {
    const cuerpo = JSON.parse(String(init?.body));
    assert.match(cuerpo.solicitud.cabeceras["content-type"], /multipart\/form-data; boundary=/);
    assert.match(Buffer.from(cuerpo.solicitud.cuerpoBase64, "base64").toString(), /archivo-real/);
    return Response.json({
      id_solicitud: cuerpo.id_solicitud,
      status: 200,
      cuerpo: '{"id":"123"}',
    });
  });
  const formulario = new FormData();
  formulario.set("source", new Blob(["archivo-real"]), "foto.jpg");
  assert.equal(
    (
      await transportar("https://graph.facebook.com/v26.0/123/photos", {
        method: "POST",
        body: formulario,
      })
    ).status,
    200,
  );
  const directo: Solicitar = async () => Response.json({ directo: true });
  assert.equal(transportePublicacion("spotmi", directo), directo);
});
