/* global fetch, URL, AbortSignal */
import process from "node:process";
import console from "node:console";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export async function probarConexion(entorno = process.env, enviar = fetch) {
  const secreto = entorno.EZRA_N8N_SECRET?.trim();
  if (!secreto || secreto.length < 32)
    throw new Error(
      "Configura EZRA_N8N_SECRET con la misma clave de al menos 32 caracteres de n8n.",
    );
  const direccion = new URL(
    entorno.EZRA_N8N_WEBHOOK_URL || "https://spotmi.app.n8n.cloud/webhook-test/ezra-publicaciones",
  );
  if (
    direccion.origin !== "https://spotmi.app.n8n.cloud" ||
    direccion.username ||
    direccion.password ||
    direccion.search ||
    direccion.hash ||
    !["/webhook-test/ezra-publicaciones", "/webhook/ezra-publicaciones"].includes(
      direccion.pathname,
    )
  ) {
    throw new Error("La URL debe ser el webhook de Ezra en spotmi.app.n8n.cloud.");
  }
  const id = randomUUID();
  let respuesta;
  try {
    respuesta = await enviar(direccion, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", "X-Ezra-Secret": secreto },
      body: JSON.stringify({ id_solicitud: id, accion: "probar_conexion" }),
    });
  } catch {
    throw new Error(
      "No se pudo contactar con n8n. Revisa la conexión y activa Listen for test event si usas la URL de prueba.",
    );
  }
  if ([401, 403].includes(respuesta.status))
    throw new Error("n8n rechazó la clave. Revisa Name y Value en Header Auth.");
  if (respuesta.status === 404)
    throw new Error(
      "Webhook no disponible. Activa Listen for test event o publica el flujo si usas producción.",
    );
  if (respuesta.status !== 200)
    throw new Error(`n8n respondió HTTP ${respuesta.status}; la conexión no está confirmada.`);
  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error("n8n no devolvió el JSON esperado.");
  }
  if (
    datos?.ok !== true ||
    datos.conexion !== "ezra-n8n" ||
    datos.id_solicitud !== id ||
    datos.modo !== "prueba" ||
    datos.publicado !== false
  ) {
    throw new Error(
      "La respuesta no coincide con esta prueba. Revisa los nodos de respuesta y quita los datos fijados.",
    );
  }
  return { ok: true, conexion: "ezra-n8n", modo: "prueba", publicado: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  probarConexion()
    .then(() => console.log("Conexión real con n8n confirmada. No se publicó contenido."))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
