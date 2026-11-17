import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
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
