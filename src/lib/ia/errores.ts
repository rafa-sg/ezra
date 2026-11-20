import { WorkflowError } from "../workflow";

/**
 * Errores de Gemini traducidos a mensajes claros. Nunca incluyen la clave ni el
 * cuerpo de la respuesta (ese detalle técnico queda solo en Consumo, sin la clave).
 * Sin dependencias de la base: se puede importar desde cualquier módulo.
 */
export type CodigoErrorGemini = "busqueda_no_disponible" | "cuota" | "clave" | "modelo" | "saturado" | "tiempo" | "red" | "invalido";
/** Fallas pasajeras: conviene reintentar más tarde en vez de dar el paso por fallido. */
export const ERRORES_PASAJEROS: CodigoErrorGemini[] = ["red", "saturado", "tiempo"];
export class ErrorGemini extends WorkflowError {
  constructor(
    mensaje: string,
    public codigo: CodigoErrorGemini,
    status: number,
  ) {
    super(mensaje, status);
    this.name = "ErrorGemini";
  }
}
export const MENSAJE_BUSQUEDA_NO_DISPONIBLE =
  "Tu plan de Gemini no incluye la búsqueda de Google o se agotó su cuota. Activa la facturación en AI Studio o apaga la búsqueda en este paso.";

export function clasificarErrorGemini(error: unknown, conBusqueda: boolean): WorkflowError {
  // Lo que ya viene explicado (presupuesto agotado, Gemini apagado) se respeta tal cual.
  if (error instanceof WorkflowError) return error;
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 0;
  const texto = `${(error as { name?: unknown })?.name ?? ""} ${(error as { message?: unknown })?.message ?? ""}`;
  if (status === 429)
    return conBusqueda
      ? new ErrorGemini(MENSAJE_BUSQUEDA_NO_DISPONIBLE, "busqueda_no_disponible", 429)
      : new ErrorGemini("Se agotó la cuota de Gemini o el límite de llamadas por minuto. Espera un minuto o revisa tu plan en AI Studio.", "cuota", 429);
  if (status === 401 || status === 403 || (status === 400 && /api[ _-]?key/i.test(texto)))
    return new ErrorGemini("La clave de Gemini no es válida o no tiene permiso para este modelo. Revisa GEMINI_API_KEY en .env.local y reinicia Ezra.", "clave", 503);
  if (status === 404)
    return new ErrorGemini("El modelo de Gemini configurado no existe o no está disponible para tu clave. Revisa GEMINI_MODEL en .env.local.", "modelo", 503);
  if (status === 503 || status === 500)
    return new ErrorGemini("Gemini está saturado en este momento. Intenta de nuevo en unos minutos.", "saturado", 503);
  if (status === 504 || /timeout|timed out|aborted|deadline/i.test(texto))
    return new ErrorGemini("Gemini tardó demasiado en responder. Intenta de nuevo.", "tiempo", 504);
  // Sin internet (la Mac recién despierta, wifi caído) o DNS: el fetch ni siquiera llega a Google.
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ETIMEDOUT|socket hang up|network/i.test(`${texto} ${causa(error)}`))
    return new ErrorGemini("No hubo conexión con Gemini (sin internet o la red no respondió). Se reintentará en unos minutos.", "red", 503);
  return new ErrorGemini("Gemini no devolvió un resultado válido. El intento quedó registrado en Consumo.", "invalido", 502);
}

/** Código o mensaje de la causa (undici guarda «ENOTFOUND» y similares en `cause`). */
function causa(error: unknown) {
  const c = (error as { cause?: { code?: unknown; message?: unknown } })?.cause;
  return c ? `${c.code ?? ""} ${c.message ?? ""}` : "";
}
