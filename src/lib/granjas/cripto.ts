import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { WorkflowError } from "../workflow";

/** Clave del servidor (32 bytes en base64). Los tokens nunca se guardan en claro. */
function clave(): Buffer {
  const texto = process.env.EZRA_TOKEN_KEY?.trim();
  const bytes = texto ? Buffer.from(texto, "base64") : Buffer.alloc(0);
  if (bytes.length !== 32)
    throw new WorkflowError("Falta EZRA_TOKEN_KEY (32 bytes en base64) en la configuración local del servidor.", 503);
  return bytes;
}
export const claveConfigurada = () => {
  try {
    clave();
    return true;
  } catch {
    return false;
  }
};
export function cifrar(valor: object): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([cifrador.update(JSON.stringify(valor), "utf8"), cifrador.final()]);
  return ["v1", iv.toString("base64url"), cifrador.getAuthTag().toString("base64url"), datos.toString("base64url")].join(".");
}
export function descifrar<T>(texto: string): T {
  const [version, iv, etiqueta, datos] = texto.split(".");
  if (version !== "v1" || !iv || !etiqueta || !datos) throw new WorkflowError("El token guardado está dañado. Vuelve a conectar la cuenta.", 409);
  try {
    const descifrador = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64url"));
    descifrador.setAuthTag(Buffer.from(etiqueta, "base64url"));
    return JSON.parse(Buffer.concat([descifrador.update(Buffer.from(datos, "base64url")), descifrador.final()]).toString("utf8")) as T;
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError("No se pudo descifrar el token. ¿Cambió EZRA_TOKEN_KEY? Vuelve a conectar la cuenta.", 409);
  }
}
