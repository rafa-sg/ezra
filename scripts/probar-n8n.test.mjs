/* global Response */
import { test } from "node:test";
import assert from "node:assert/strict";
import { probarConexion } from "./probar-n8n.mjs";
const entorno = { EZRA_N8N_SECRET: "x".repeat(32) };
test("envía autenticación y valida la respuesta de esta solicitud", async () => {
  const resultado = await probarConexion(entorno, async (url, opciones) => {
    assert.equal(url.hostname, "spotmi.app.n8n.cloud");
    assert.equal(opciones.headers["X-Ezra-Secret"], entorno.EZRA_N8N_SECRET);
    assert.equal(opciones.redirect, "error");
    const cuerpo = JSON.parse(opciones.body);
    assert.equal(cuerpo.accion, "probar_conexion");
    return Response.json({
      ok: true,
      conexion: "ezra-n8n",
      id_solicitud: cuerpo.id_solicitud,
      modo: "prueba",
      publicado: false,
    });
  });
  assert.equal(resultado.publicado, false);
});
test("no envía secretos a otro destino", async () => {
  await assert.rejects(
    probarConexion({ ...entorno, EZRA_N8N_WEBHOOK_URL: "https://example.com" }, () =>
      assert.fail("No debe enviar"),
    ),
    /URL debe/,
  );
});
test("rechaza respuesta fijada y errores de autenticación", async () => {
  await assert.rejects(
    probarConexion(entorno, async () => Response.json({ ok: true, id_solicitud: "vieja" })),
    /no coincide/,
  );
  await assert.rejects(
    probarConexion(entorno, async () => new Response("", { status: 403 })),
    /rechazó la clave/,
  );
});
