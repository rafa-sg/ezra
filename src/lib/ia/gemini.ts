import {
  createPartFromUri,
  FileState,
  GoogleGenAI,
  MediaResolution,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from "@google/genai";
import { WorkflowError } from "../workflow";
import { DEFAULT_MODEL } from "../ask/assistant";
import { exigirPresupuesto, registrarConsumo, type OrigenConsumo, type UsoGemini } from "../granjas/consumo";

/**
 * Única puerta de salida hacia Gemini (granjas, encargos y «Pregúntale a la IA»).
 * Antes de llamar comprueba el presupuesto; después registra en SQLite los tokens
 * de usageMetadata, si usó la búsqueda de Google, la duración y el error si lo hubo.
 * El registro nunca guarda el prompt, la respuesta ni la clave.
 */
export type ContextoGemini = {
  origen: OrigenConsumo;
  /** Nombre legible del paso o especialidad; aparece en Consumo. */
  paso: string;
  granjaId?: string | null;
  ejecucionId?: string | null;
  pasoId?: string | null;
};
export type RespuestaMinima = {
  usageMetadata?: UsoGemini;
  candidates?: { groundingMetadata?: { webSearchQueries?: string[] } }[];
};
export type Generador<R extends RespuestaMinima = RespuestaMinima> = (peticion: GenerateContentParameters) => Promise<R>;

const globales = globalThis as typeof globalThis & { ezraGeminiSimulado?: Generador };
/** Las pruebas sustituyen la red de Gemini; en uso normal es el SDK oficial. */
export function usarGeminiDePrueba(generador: Generador | undefined) {
  globales.ezraGeminiSimulado = generador;
}
export const modeloGemini = () => process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
export const claveGemini = () => process.env.GEMINI_API_KEY?.trim() || "";
/** Granjas y encargos: además de la clave, el propietario debe encenderlo con EZRA_PRODUCCION_IA=1. */
export const geminiProduccionHabilitado = () => Boolean(claveGemini()) && process.env.EZRA_PRODUCCION_IA === "1";

function describirError(error: unknown) {
  const estado = (error as { status?: number })?.status;
  const mensaje = error instanceof Error ? error.message : "Error desconocido";
  // Nunca la clave ni el cuerpo completo de la respuesta.
  return `${estado ? `HTTP ${estado} · ` : ""}${mensaje.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[clave]")}`.slice(0, 300);
}

export async function llamarGemini<R extends RespuestaMinima = GenerateContentResponse>(
  contexto: ContextoGemini,
  peticion: GenerateContentParameters,
  opciones: { generar?: Generador<R>; tiempoMs?: number } = {},
): Promise<R> {
  exigirPresupuesto();
  const generar =
    opciones.generar ??
    (globales.ezraGeminiSimulado as Generador<R> | undefined) ??
    ((p: GenerateContentParameters) => {
      const apiKey = claveGemini();
      if (!apiKey) throw new Error("Falta GEMINI_API_KEY");
      return new GoogleGenAI({ apiKey, httpOptions: { timeout: opciones.tiempoMs ?? 45_000 } }).models.generateContent(p) as unknown as Promise<R>;
    });
  const busqueda = (peticion.config?.tools ?? []).some((t) => Boolean((t as { googleSearch?: unknown }).googleSearch));
  const inicio = performance.now();
  const anotar = (r: R | null, error: string) => {
    try {
      registrarConsumo({
        origen: contexto.origen,
        granjaId: contexto.granjaId,
        ejecucionId: contexto.ejecucionId,
        pasoId: contexto.pasoId,
        paso: contexto.paso,
        modelo: peticion.model,
        uso: r?.usageMetadata,
        busqueda,
        consultasBusqueda: r?.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length ?? 0,
        duracionMs: performance.now() - inicio,
        error,
      });
    } catch (e) {
      // Si la base local falla, la llamada no se pierde: se avisa en la consola.
      console.error("[consumo] no se pudo registrar la llamada:", e instanceof Error ? e.message : e);
    }
  };
  try {
    const respuesta = await generar(peticion);
    anotar(respuesta, "");
    return respuesta;
  } catch (error) {
    anotar(null, describirError(error));
    throw error;
  }
}

/* ── Imagen ── */
/** Modelo de imagen (sin plan gratuito en Google: exige facturación activa en AI Studio). */
export const modeloImagenGemini = () => process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-lite-image";
type ParteImagen = { inlineData?: { mimeType?: string; data?: string }; text?: string };
/**
 * Genera una imagen 4:5 con el modelo de imagen. Pasa por llamarGemini: presupuesto antes y
 * registro en Consumo después (los tokens de imagen llegan en usageMetadata).
 */
export async function generarImagenGemini(contexto: ContextoGemini, prompt: string, opciones: { tiempoMs?: number } = {}) {
  const r = await llamarGemini<RespuestaMinima & { candidates?: { content?: { parts?: ParteImagen[] } }[] }>(
    contexto,
    {
      model: modeloImagenGemini(),
      contents: prompt,
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } } as GenerateContentParameters["config"],
    },
    { tiempoMs: opciones.tiempoMs ?? 90_000 },
  );
  const parte = (r.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!parte?.inlineData?.data) throw new Error("El modelo no devolvió una imagen.");
  return { bytes: Buffer.from(parte.inlineData.data, "base64"), mime: parte.inlineData.mimeType ?? "image/png", uso: r.usageMetadata };
}
/** Un 429 por cuota gratuita en 0: la clave no tiene facturación para el modelo de imagen. */
export const esFaltaFacturacion = (error: unknown) => {
  const t = `${(error as { status?: number })?.status ?? ""} ${error instanceof Error ? error.message : String(error)}`;
  return /429/.test(t) && /free_tier|limit: 0|billing/i.test(t);
};

/* ── Video (granja Clips) ── */
/**
 * Tokens por segundo de video con resolución baja (1 cuadro/s ≈ 66 tokens + audio ≈ 32): se redondea
 * hacia arriba para no quedarse corto. Con la resolución normal serían unos 300 por segundo.
 */
export const TOKENS_POR_SEGUNDO_VIDEO = 110;
/** Margen para el texto de la petición y la respuesta (transcripción y clips en JSON). */
export const TOKENS_EXTRA_VIDEO = 12_000;
export const estimarTokensVideo = (segundos: number) => Math.ceil(Math.max(0, segundos) * TOKENS_POR_SEGUNDO_VIDEO) + TOKENS_EXTRA_VIDEO;

/**
 * Un video cuesta muchos tokens: solo se envía con un presupuesto definido en Consumo y si la
 * estimación cabe en lo que queda hoy y este mes. Si no cabe, no sale nada hacia Google.
 */
export function exigirCupoVideo(segundos: number, ahora: Date = new Date()) {
  const estado = exigirPresupuesto(ahora);
  if (estado.dia.limite === null && estado.mes.limite === null)
    throw new WorkflowError("Define el presupuesto de tokens en Consumo antes de enviar un video a Gemini.", 422);
  const estimado = estimarTokensVideo(segundos);
  const cifra = (n: number) => new Intl.NumberFormat("es-SV").format(n);
  for (const [nombre, p] of [["hoy", estado.dia], ["este mes", estado.mes]] as const)
    if (p.limite !== null && p.usado + estimado > p.limite)
      throw new WorkflowError(
        `El video necesita unos ${cifra(estimado)} tokens y ${nombre} quedan ${cifra(Math.max(0, p.limite - p.usado))}. Usa un video más corto o sube el límite en Consumo.`,
        429,
      );
  return estimado;
}

/** Archivo subido a la API de archivos de Gemini (se borra al terminar). */
export type ArchivoGemini = { nombre: string; uri: string; mime: string };
export type ArchivosGemini = {
  subir: (ruta: string, mime: string) => Promise<ArchivoGemini>;
  borrar: (nombre: string) => Promise<void>;
};
const globalesArchivos = globalThis as typeof globalThis & { ezraGeminiArchivosSimulados?: ArchivosGemini };
/** Las pruebas sustituyen la subida de archivos; en uso normal es el SDK oficial. */
export function usarArchivosGeminiDePrueba(archivos: ArchivosGemini | undefined) {
  globalesArchivos.ezraGeminiArchivosSimulados = archivos;
}
function archivosReales(): ArchivosGemini {
  const apiKey = claveGemini();
  if (!apiKey) throw new WorkflowError("Falta GEMINI_API_KEY.", 503);
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 10 * 60_000 } });
  return {
    subir: async (ruta, mime) => {
      let archivo = await ai.files.upload({ file: ruta, config: { mimeType: mime } });
      // Gemini procesa el video antes de poder usarlo.
      for (let i = 0; archivo.state === FileState.PROCESSING && i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        archivo = await ai.files.get({ name: archivo.name! });
      }
      if (archivo.state !== FileState.ACTIVE || !archivo.uri || !archivo.name)
        throw new WorkflowError("Gemini no pudo procesar el video. Prueba con un MP4 más corto.", 502);
      return { nombre: archivo.name, uri: archivo.uri, mime: archivo.mimeType ?? mime };
    },
    borrar: async (nombre) => {
      await ai.files.delete({ name: nombre });
    },
  };
}

/**
 * Envía un video local a Gemini con una instrucción y devuelve el texto (JSON). Comprueba el cupo
 * antes de subirlo, registra los tokens en Consumo y borra el archivo remoto al terminar.
 */
export async function analizarVideoGemini(
  contexto: ContextoGemini,
  video: { ruta: string; mime: string; segundos: number },
  prompt: string,
  opciones: { tiempoMs?: number; maxTokens?: number } = {},
): Promise<{ texto: string; estimado: number; uso: UsoGemini | undefined }> {
  const estimado = exigirCupoVideo(video.segundos);
  const archivos = globalesArchivos.ezraGeminiArchivosSimulados ?? archivosReales();
  const archivo = await archivos.subir(video.ruta, video.mime);
  try {
    const r = await llamarGemini<GenerateContentResponse>(
      contexto,
      {
        model: modeloGemini(),
        contents: [{ role: "user", parts: [createPartFromUri(archivo.uri, archivo.mime), { text: prompt }] }],
        config: {
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
          responseMimeType: "application/json",
          maxOutputTokens: opciones.maxTokens ?? 8192,
        },
      },
      { tiempoMs: opciones.tiempoMs ?? 5 * 60_000 },
    );
    const texto = r.text ?? (r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return { texto, estimado, uso: r.usageMetadata };
  } finally {
    await archivos.borrar(archivo.nombre).catch(() => undefined);
  }
}
