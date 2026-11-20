import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { WorkflowError } from "../workflow";
import { detectMedia } from "../media";

/**
 * Imagen con Astra (Codex con tu sesión de ChatGPT, sin claves de API). Codex genera la imagen
 * con su herramienta `image_generation` y la guarda en ~/.codex/generated_images/<sesión>/;
 * Ezra la toma de ahí. Sin archivos, comandos, búsqueda ni otras herramientas.
 */
export type EjecutarCodex = (binario: string, argumentos: string[], entrada: string, carpeta: string, tiempo: number, incluirErrores: boolean) => Promise<string>;
const DESHABILITADAS = [
  "shell_tool",
  "unified_exec",
  "multi_agent",
  "plugins",
  "hooks",
  "apps",
  "browser_use",
  "browser_use_external",
  "computer_use",
  "in_app_browser",
  "view_image",
  "skill_search",
  "memories",
  "code_mode_host",
];
export function argumentosImagenAstra(salida: string) {
  return [
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--model",
    "gpt-6-astra",
    "--config",
    'web_search="disabled"',
    "--config",
    "project_doc_max_bytes=0",
    // image_generation queda encendida (es la única herramienta que se usa).
    ...DESHABILITADAS.flatMap((n) => ["--disable", n]),
    "--output-last-message",
    salida,
    "-",
  ];
}
export const carpetaImagenesCodex = () => process.env.EZRA_CODEX_IMAGENES || path.join(homedir(), ".codex", "generated_images");

/** Mensaje claro para el límite de uso del plan de ChatGPT («try again at 12:07 PM»). */
export function errorDeCodex(salida: string): WorkflowError | null {
  if (/usage limit/i.test(salida)) {
    const hora = salida.match(/try again at ([^.\n]+)/i)?.[1]?.trim();
    return new WorkflowError(`Tu plan de ChatGPT llegó al límite de uso de Codex${hora ? `; se libera a las ${hora}` : ""}. Vuelve a intentarlo entonces.`, 429);
  }
  if (/not logged in|login required|unauthorized/i.test(salida)) return new WorkflowError("Inicia sesión en Codex con tu cuenta de ChatGPT para usar Astra.", 503);
  return null;
}

/** La imagen más reciente creada después de `desde`: primero en la carpeta de la sesión, si no en todas. */
export async function buscarImagenNueva(carpeta: string, sesion: string | null, desde: number): Promise<string | null> {
  const candidatas: { ruta: string; fecha: number }[] = [];
  const revisar = async (dir: string) => {
    let nombres: string[];
    try {
      nombres = await readdir(dir);
    } catch {
      return;
    }
    for (const n of nombres) {
      const ruta = path.join(dir, n);
      const info = await stat(ruta).catch(() => null);
      if (!info) continue;
      if (info.isFile() && /\.(png|jpe?g|webp)$/i.test(n) && info.mtimeMs >= desde) candidatas.push({ ruta, fecha: info.mtimeMs });
    }
  };
  if (sesion) await revisar(path.join(carpeta, sesion));
  if (!candidatas.length) {
    let sesiones: string[] = [];
    try {
      sesiones = await readdir(carpeta);
    } catch {
      /* Codex nunca generó imágenes en esta Mac */
    }
    for (const s of sesiones) await revisar(path.join(carpeta, s));
  }
  return candidatas.sort((a, b) => b.fecha - a.fecha)[0]?.ruta ?? null;
}

export async function generarImagenAstra(
  prompt: string,
  opciones: { binario?: string; ejecutar?: EjecutarCodex; carpetaImagenes?: string; tiempoMs?: number } = {},
): Promise<{ bytes: Buffer; mime: string; sesion: string | null }> {
  const { buscarHerramienta, ejecutarProceso } = await import("../produccion/proveedores");
  const binario = opciones.binario || (await buscarHerramienta("codex"));
  if (!binario) throw new WorkflowError("Codex (Astra) no está instalado en esta Mac.", 503);
  const ejecutar: EjecutarCodex = opciones.ejecutar ?? ejecutarProceso;
  const carpeta = await mkdtemp(path.join(tmpdir(), "ezra-astra-imagen-"));
  try {
    const sesionActual = await ejecutar(binario, ["login", "status"], "", carpeta, 10_000, true);
    if (!/ChatGPT/i.test(sesionActual)) throw new WorkflowError("Inicia sesión en Codex con tu cuenta de ChatGPT para usar Astra.", 503);
    const desde = Date.now() - 1000;
    let salida = "";
    try {
      salida = await ejecutar(
        binario,
        argumentosImagenAstra(path.join(carpeta, "respuesta.txt")),
        `Usa tu herramienta de generación de imágenes para crear exactamente UNA imagen vertical (proporción 4:5) con esta descripción. No escribas archivos ni ejecutes comandos. Cuando termines, responde solo «LISTO».\n\n${prompt}`,
        carpeta,
        opciones.tiempoMs ?? 240_000,
        true,
      );
    } catch (error) {
      const texto = `${(error as { salida?: string }).salida ?? ""}\n${error instanceof Error ? error.message : ""}`;
      throw errorDeCodex(texto) ?? new WorkflowError(`Astra no generó la imagen (${error instanceof Error ? error.message.slice(0, 160) : "error"}).`, 502);
    }
    const conocido = errorDeCodex(salida);
    if (conocido) throw conocido;
    const sesion = salida.match(/session id:\s*([0-9a-f-]{36})/i)?.[1] ?? null;
    const ruta = await buscarImagenNueva(opciones.carpetaImagenes ?? carpetaImagenesCodex(), sesion, desde);
    if (!ruta) throw new WorkflowError("Astra respondió, pero no dejó ninguna imagen. Revisa que tu Codex tenga activa la generación de imágenes.", 502);
    // Ruta fuera del proyecto (carpeta de Codex): el empaquetador no debe rastrearla.
    const bytes = await readFile(/* turbopackIgnore: true */ ruta);
    const { mime } = detectMedia(bytes);
    if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) throw new WorkflowError("Astra entregó un archivo que no es imagen.", 502);
    return { bytes, mime, sesion };
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
