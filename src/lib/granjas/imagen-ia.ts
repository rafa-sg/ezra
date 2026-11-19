import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { WorkflowError } from "../workflow";
import { guardarAjuste, leerAjuste } from "./ajustes";
import { imagenesIaHoy, leerLimiteImagenes, PASO_IMAGEN_IA } from "./consumo";
import { leerEvento, ponerImagenFuente, prioridadImagen } from "./eventos";
import { herramientasVideo, guardarMedio, leerMedio } from "./medios";
import { promptImagenEvento, revisarPrompt, textoParaModelo } from "./prompt-imagen";
import { z } from "zod";

/**
 * Imagen de referencia generada con IA (Gemini) para un evento sin imagen oficial. Nunca es
 * «imagen oficial»: no se confirma, no llega al post de Instagram ni a Spotmi y cualquier afiche,
 * post oficial o foto de prensa la reemplaza (queda en el historial).
 */
export const LICENCIA_IA = "Imagen de referencia generada con IA (Gemini)";
const ejecutar = promisify(execFile);

/** Último bloqueo por facturación (Google responde 429 con cuota gratuita en 0). Se borra al primer éxito. */
const bloqueoSchema = z.object({ motivo: z.string(), fecha: z.string() }).nullable();
const leerBloqueo = () => leerAjuste("imagen_ia_bloqueo", bloqueoSchema, null);
const guardarBloqueo = (valor: { motivo: string; fecha: string } | null) => guardarAjuste("imagen_ia_bloqueo", bloqueoSchema, valor);

export type EstadoImagenesIA = { activa: boolean; motivo: string; aviso: string; hoy: number; limite: number; modelo: string };
export async function estadoImagenesIA(): Promise<EstadoImagenesIA> {
  const { geminiProduccionHabilitado, modeloImagenGemini } = await import("../ia/gemini");
  const limite = leerLimiteImagenes();
  const hoy = imagenesIaHoy();
  const bloqueo = leerBloqueo();
  const base = { hoy, limite, modelo: modeloImagenGemini(), aviso: bloqueo ? bloqueo.motivo : "" };
  if (!geminiProduccionHabilitado()) return { ...base, activa: false, motivo: "Gemini está apagado (falta GEMINI_API_KEY o EZRA_PRODUCCION_IA=1)." };
  if (limite === 0) return { ...base, activa: false, motivo: "El límite diario de imágenes IA está en 0 (Consumo)." };
  if (hoy >= limite) return { ...base, activa: false, motivo: `Se alcanzó el límite de ${limite} imágenes IA de hoy.` };
  return { ...base, activa: true, motivo: "" };
}

/** 1080×1350 (4:5) en JPEG con ffmpeg local; si no hay ffmpeg, se deja el tamaño que entregó el modelo. */
async function aCuatroQuintos(bytes: Buffer, mime: string): Promise<{ bytes: Buffer; escalada: boolean }> {
  const { ffmpeg } = await herramientasVideo();
  if (!ffmpeg) return { bytes, escalada: false };
  const carpeta = await mkdtemp(path.join(tmpdir(), "ezra-ia-"));
  try {
    const entrada = path.join(carpeta, mime === "image/jpeg" ? "in.jpg" : mime === "image/webp" ? "in.webp" : "in.png");
    const salida = path.join(carpeta, "out.jpg");
    await writeFile(entrada, bytes);
    await ejecutar(ffmpeg, ["-v", "error", "-y", "-i", entrada, "-vf", "scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350", "-q:v", "3", salida], { timeout: 30_000 });
    return { bytes: await readFile(salida), escalada: true };
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

export type Control = { texto: boolean; logo: boolean; persona: boolean } | null;
/** Control barato con el modelo de texto: ¿texto legible, logos o una persona reconocible? null si no respondió. */
async function controlar(bytes: Buffer, mime: string, contexto: { granjaId?: string | null; ejecucionId?: string | null }): Promise<Control> {
  const { llamarGemini, modeloGemini } = await import("../ia/gemini");
  try {
    const r = await llamarGemini<{ text?: string; usageMetadata?: Record<string, number> }>(
      { origen: "granja", paso: "Control de imagen IA", ...contexto },
      {
        model: modeloGemini(),
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: mime, data: bytes.toString("base64") } },
              { text: 'Does this image contain readable text or letters, a logo or brand, or a recognizable real person or celebrity? Answer only JSON: {"texto": bool, "logo": bool, "persona": bool}' },
            ],
          },
        ],
        config: { responseMimeType: "application/json", maxOutputTokens: 200 },
      },
    );
    const t = String(r.text ?? "");
    const json = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as Record<string, unknown>;
    return { texto: json.texto === true, logo: json.logo === true, persona: json.persona === true };
  } catch {
    return null;
  }
}

export type ResultadoReferencia = { ok: true; motivo: string; prompt: string; intentos: number; control: Control } | { ok: false; motivo: string; facturacion?: boolean };
/**
 * Genera la imagen de referencia de un evento. Con prompt editado a mano, revisa nombres propios y
 * marcas: si encuentra alguno, no genera salvo que el propietario confirme (forzar).
 */
export async function generarReferencia(
  id: string,
  opciones: { prompt?: string; forzar?: boolean; regenerar?: boolean; control?: boolean; contexto?: { granjaId?: string | null; ejecucionId?: string | null } } = {},
): Promise<ResultadoReferencia> {
  const e = leerEvento(id);
  if (e.imagenTipo && prioridadImagen[e.imagenTipo] > prioridadImagen.ia) return { ok: false, motivo: "El evento ya tiene una imagen oficial o de prensa." };
  if (e.imagenTipo === "ia" && !opciones.regenerar) return { ok: false, motivo: "Ya tiene una imagen de referencia. Usa «Regenerar»." };
  const estado = await estadoImagenesIA();
  if (!estado.activa) return { ok: false, motivo: estado.motivo };
  const base = promptImagenEvento(e);
  const prompt = opciones.prompt?.trim() || base.prompt;
  if (opciones.prompt?.trim()) {
    const avisos = revisarPrompt(prompt, e);
    if (avisos.length && !opciones.forzar) throw new WorkflowError(`Revisa el prompt antes de generar: ${avisos.join(" ")}`, 422);
  }
  const { generarImagenGemini, esFaltaFacturacion } = await import("../ia/gemini");
  const contexto = { origen: "granja" as const, paso: PASO_IMAGEN_IA, granjaId: opciones.contexto?.granjaId ?? e.granjaId, ejecucionId: opciones.contexto?.ejecucionId ?? null };
  let ultimoControl: Control = null;
  for (let intento = 1; intento <= 2; intento++) {
    // Sin semilla en la API: el segundo intento es otra llamada (y pide otra composición).
    if (intento === 2 && imagenesIaHoy() >= leerLimiteImagenes()) return { ok: false, motivo: "El control falló y ya no queda cupo de imágenes IA hoy." };
    let imagen: { bytes: Buffer; mime: string };
    try {
      imagen = await generarImagenGemini(contexto, textoParaModelo({ prompt: intento === 1 ? prompt : `${prompt} Use a different composition and camera angle.`, negativo: base.negativo }));
    } catch (error) {
      if (esFaltaFacturacion(error)) {
        const motivo = "Tu clave de Gemini no tiene facturación para el modelo de imagen (cuota gratuita en 0). Actívala en AI Studio, o crea la imagen en la app de Gemini y súbela desde el panel del evento.";
        guardarBloqueo({ motivo, fecha: new Date().toISOString() });
        return { ok: false, motivo, facturacion: true };
      }
      return { ok: false, motivo: `Gemini no generó la imagen: ${error instanceof Error ? error.message.slice(0, 160) : "error"}` };
    }
    guardarBloqueo(null);
    const ajustada = await aCuatroQuintos(imagen.bytes, imagen.mime);
    const mime = ajustada.escalada ? "image/jpeg" : imagen.mime;
    if (opciones.control !== false) {
      ultimoControl = await controlar(ajustada.bytes, mime, opciones.contexto ?? { granjaId: e.granjaId });
      if (ultimoControl && (ultimoControl.texto || ultimoControl.logo || ultimoControl.persona)) continue;
    }
    const medio = await guardarMedio(ajustada.bytes, {
      nombre: `Referencia IA · ${e.titulo}`.slice(0, 200),
      procedencia: { origen: "ia", nota: `Generada con ${estado.modelo} a partir del prompt de la plantilla ${base.version}.`, herramienta: estado.modelo },
      licencia: LICENCIA_IA,
      generado: true,
    });
    const reemplazo = e.imagenTipo === "ia";
    ponerImagenFuente(id, medio.id, "", LICENCIA_IA, {
      tipo: "ia",
      ia: { prompt, negativo: base.negativo, version: base.version, modelo: estado.modelo },
      nota: `${opciones.prompt?.trim() ? "Prompt editado por el propietario. " : ""}${intento > 1 ? "Regenerada tras el control. " : ""}${ultimoControl === null && opciones.control !== false ? "Control sin respuesta." : ""}`.trim(),
      reemplazarIgual: reemplazo,
    });
    return { ok: true, motivo: estado.modelo, prompt, intentos: intento, control: ultimoControl };
  }
  const f = ultimoControl!;
  const que = [f.texto && "texto", f.logo && "logo", f.persona && "persona reconocible"].filter(Boolean).join(", ");
  return { ok: false, motivo: `El control detectó ${que} dos veces; queda el cuadro azul.` };
}

/**
 * Referencia IA hecha a mano en la app de Gemini y subida por el propietario: mismas reglas que la
 * generada (etiqueta «IA · referencia», nunca oficial, no va al post ni a Spotmi). No usa la API ni
 * cuenta para el límite diario. Se guarda el prompt que Ezra armó para copiarlo a la app.
 */
export const LICENCIA_IA_SUBIDA = "Imagen de referencia generada con IA (app de Gemini, subida por ti)";
export function ponerReferenciaSubida(id: string, medioId: string) {
  const e = leerEvento(id);
  if (e.imagenTipo && prioridadImagen[e.imagenTipo] > prioridadImagen.ia) throw new WorkflowError("El evento ya tiene una imagen oficial o de prensa.", 409);
  const medio = leerMedio(medioId);
  if (!["image/jpeg", "image/png", "image/webp"].includes(medio.mime)) throw new WorkflowError("Sube una imagen JPG, PNG o WebP.", 422);
  if (!medio.generado) throw new WorkflowError("La imagen debe subirse marcada como generada con IA.", 422);
  const base = promptImagenEvento(e);
  return ponerImagenFuente(id, medio.id, "", LICENCIA_IA_SUBIDA, {
    tipo: "ia",
    ia: { prompt: base.prompt, negativo: base.negativo, version: base.version, modelo: "app de Gemini (subida a mano)" },
    nota: "Subida por el propietario desde la app de Gemini.",
    reemplazarIgual: e.imagenTipo === "ia",
  });
}
