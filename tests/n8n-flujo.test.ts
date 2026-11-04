import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const flujo = JSON.parse(readFileSync("docs/n8n/ezra-meta.json", "utf8"));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const validar = new AsyncFunction(
  "$json",
  "Buffer",
  flujo.nodes.find((n: { name: string }) => n.name === "Validar y preparar").parameters.jsCode,
);
const contexto = {
  helpers: { prepareBinaryData: async (bytes: Buffer) => ({ data: bytes.toString("base64") }) },
};

test("flujo n8n: prueba no toca Meta y valida destinos, métodos, cabeceras y binarios", async () => {
  const ejecutar = (body: object) => validar.call(contexto, { body }, Buffer);
  const prueba = await ejecutar({ id_solicitud: "1", accion: "probar_conexion" });
  assert.equal(prueba[0].json.prueba, true);
  const tarea = {
    id_solicitud: "2",
    accion: "meta_solicitud",
    solicitud: {
      url: "https://graph.facebook.com/v26.0/123/feed",
      metodo: "POST",
      cabeceras: { "content-type": "application/x-www-form-urlencoded" },
      cuerpoBase64: Buffer.from("message=Hola").toString("base64"),
    },
  };
  const resultado = await ejecutar(tarea);
  assert.equal(resultado[0].json.valido, true);
  assert.equal(resultado[0].binary.carga.data, tarea.solicitud.cuerpoBase64);
  for (const url of [
    "https://graph.facebook.com.evil.test/x",
    "https://graph.facebook.com@evil.test/x",
    "http://graph.facebook.com/x",
    "https://graph.facebook.com\\@evil.test/x",
  ]) {
    assert.equal(
      (await ejecutar({ ...tarea, solicitud: { ...tarea.solicitud, url } }))[0].json.valido,
      false,
    );
  }
  assert.equal(
    (await ejecutar({ ...tarea, solicitud: { ...tarea.solicitud, metodo: "DELETE" } }))[0].json
      .valido,
    false,
  );
  assert.equal(
    (
      await ejecutar({
        ...tarea,
        solicitud: { ...tarea.solicitud, cabeceras: { host: "evil.test" } },
      })
    )[0].json.valido,
    false,
  );
  assert.equal(flujo.settings.saveDataErrorExecution, "none");
  assert.equal(flujo.settings.saveDataSuccessExecution, "none");
  assert.equal(flujo.settings.saveManualExecutions, false);
});
test("puente OAuth: regreso fijo, sin tokens en archivos ni redirección elegida por visitante", async () => {
  for (const canal of ["facebook", "instagram"]) {
    const codigo = flujo.nodes.find((n: { name: string }) => n.name === `Validar regreso ${canal}`)
      .parameters.jsCode;
    const ejecutar = new AsyncFunction("$json", codigo);
    const resultado = await ejecutar({
      query: { state: "a".repeat(43), code: "codigo", redirect_uri: "https://evil.test" },
    });
    const url = new URL(resultado[0].json.url);
    assert.equal(url.origin, "http://127.0.0.1:3000");
    assert.equal(url.pathname, `/conexiones/${canal}/callback`);
    assert.equal(url.searchParams.get("code"), "codigo");
    const invalido = await ejecutar({ query: { state: "incorrecto", code: "codigo" } });
    assert.ok(!invalido[0].json.url.includes("code="));
  }
});
