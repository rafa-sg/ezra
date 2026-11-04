import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { WorkflowError } from "../workflow";
import type { Solicitar } from "./adaptadores";

export const destinosMeta = [
  "graph.facebook.com",
  "graph-video.facebook.com",
  "graph.instagram.com",
  "rupload.facebook.com",
];
const limiteBytes = 8 * 1024 * 1024;
type Estado = {
  estado: "sin_configurar" | "sin_verificar" | "conectada" | "error";
  verificado: string | null;
  error: string;
  produccion: boolean;
  publicacionHabilitada: boolean;
  faltantes: string[];
};
const globales = globalThis as typeof globalThis & { ezraEstadoN8n?: Estado };

/** Solo se leen las tres opciones de esta integración, sin cargar secretos al navegador. */
function configuracion() {
  const archivo = path.join(process.cwd(), ".env.n8n.local");
  const valores: Record<string, string> = {};
  if (existsSync(archivo)) {
    for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
      const coincidencia = linea.match(/^(EZRA_N8N_(?:SECRET|WEBHOOK_URL|PUBLICACION))=(.*)$/);
      if (coincidencia)
        valores[coincidencia[1]] = coincidencia[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  const valor = (nombre: string) => process.env[nombre]?.trim() || valores[nombre] || "";
  const secreto = valor("EZRA_N8N_SECRET");
  const direccion = valor("EZRA_N8N_WEBHOOK_URL");
  const habilitada = valor("EZRA_N8N_PUBLICACION") === "1";
  const faltantes: string[] = [];
  if (secreto.length < 32) faltantes.push("EZRA_N8N_SECRET");
  let url: URL | null = null;
  try {
    url = new URL(direccion);
    if (
      url.origin !== "https://spotmi.app.n8n.cloud" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["/webhook/ezra-publicaciones", "/webhook-test/ezra-publicaciones"].includes(url.pathname)
    )
      url = null;
  } catch {
    /* Una dirección inválida se muestra como configuración pendiente. */
  }
  if (!url) faltantes.push("EZRA_N8N_WEBHOOK_URL");
  return { secreto, url, habilitada, faltantes };
}
export function estadoN8n(): Estado {
  const c = configuracion();
  return {
    estado: c.faltantes.length
      ? "sin_configurar"
      : (globales.ezraEstadoN8n?.estado ?? "sin_verificar"),
    verificado: globales.ezraEstadoN8n?.verificado ?? null,
    error: globales.ezraEstadoN8n?.error ?? "",
    produccion: c.url?.pathname === "/webhook/ezra-publicaciones",
    publicacionHabilitada: c.habilitada,
    faltantes: c.faltantes,
  };
}
async function enviarN8n(cuerpo: object, enviar: Solicitar = fetch, tiempo = 30000) {
  const c = configuracion();
  if (!c.url || c.faltantes.length)
    throw new WorkflowError("Completa la configuración privada de n8n.", 503);
  let respuesta: Response;
  try {
    respuesta = await enviar(c.url.href, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ezra-Secret": c.secreto },
      body: JSON.stringify(cuerpo),
      redirect: "error",
      signal: AbortSignal.timeout(tiempo),
    });
  } catch {
    throw new WorkflowError(
      "n8n no respondió. El resultado del envío es desconocido; no se repite automáticamente.",
      504,
    );
  }
  if (!respuesta.ok)
    throw new WorkflowError(
      respuesta.status === 404
        ? "Publica el flujo de n8n o activa su escucha de prueba."
        : [401, 403].includes(respuesta.status)
          ? "n8n rechazó la clave compartida."
          : "n8n no pudo completar la tarea.",
      502,
    );
  try {
    return (await respuesta.json()) as Record<string, unknown>;
  } catch {
    throw new WorkflowError("n8n no devolvió una respuesta JSON válida.", 502);
  }
}
export async function probarN8n(enviar: Solicitar = fetch) {
  const id = randomUUID();
  try {
    const datos = await enviarN8n({ id_solicitud: id, accion: "probar_conexion" }, enviar);
    if (
      datos.ok !== true ||
      datos.conexion !== "ezra-n8n" ||
      datos.id_solicitud !== id ||
      datos.modo !== "prueba" ||
      datos.publicado !== false
    )
      throw new WorkflowError("La respuesta de n8n no corresponde a esta prueba.", 502);
    globales.ezraEstadoN8n = {
      ...estadoN8n(),
      estado: "conectada",
      verificado: new Date().toISOString(),
      error: "",
    };
  } catch (error) {
    globales.ezraEstadoN8n = {
      ...estadoN8n(),
      estado: "error",
      error: error instanceof WorkflowError ? error.message : "Falló la comprobación de n8n.",
    };
    throw error;
  }
  return estadoN8n();
}

/** Solo el trabajador que ya verificó la autorización llama a este transporte. */
export function transportePublicacion(canal: string, directo: Solicitar): Solicitar {
  if (!["facebook", "instagram"].includes(canal) || !configuracion().habilitada) return directo;
  return async (direccion, opciones = {}) => {
    const c = configuracion();
    if (c.url?.pathname !== "/webhook/ezra-publicaciones")
      throw new WorkflowError("La publicación por n8n exige su URL de producción.", 503);
    const url = new URL(direccion);
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      !destinosMeta.includes(url.hostname)
    )
      throw new WorkflowError("El destino no pertenece a las API de Meta autorizadas.", 422);
    const metodo = (opciones.method ?? "GET").toUpperCase();
    if (!["GET", "POST"].includes(metodo))
      throw new WorkflowError("Método de Meta no permitido.", 422);
    const solicitud = new Request(url, { ...opciones, signal: undefined });
    const bytes = Buffer.from(await solicitud.arrayBuffer());
    if (bytes.length > limiteBytes)
      throw new WorkflowError(
        "El archivo supera los 8 MB admitidos por esta conexión con n8n. Usa un archivo más pequeño.",
        422,
      );
    const id = randomUUID();
    const datos = await enviarN8n(
      {
        id_solicitud: id,
        accion: "meta_solicitud",
        solicitud: {
          url: url.href,
          metodo,
          cabeceras: Object.fromEntries(solicitud.headers),
          cuerpoBase64: bytes.toString("base64"),
        },
      },
      directo,
      120000,
    );
    if (
      datos.id_solicitud !== id ||
      !Number.isInteger(datos.status) ||
      Number(datos.status) < 200 ||
      Number(datos.status) > 599 ||
      typeof datos.cuerpo !== "string"
    )
      throw new WorkflowError("n8n no devolvió el resultado verificable de Meta.", 502);
    return new Response([204, 205, 304].includes(Number(datos.status)) ? null : datos.cuerpo, {
      status: Number(datos.status),
      headers: { "Content-Type": "application/json" },
    });
  };
}
