import { auth } from "@clerk/nextjs/server";
import type { z } from "zod";
import { requireAdmin } from "../auth";
import { apiError } from "../http";
import { WorkflowError } from "../workflow";

/** Toda la API de granjas es solo de administración; el id de Clerk liga el estado OAuth a la sesión. */
export async function administrador() {
  const cuenta = await requireAdmin();
  const { userId } = await auth();
  if (!userId) throw new WorkflowError("Inicia sesión de nuevo.", 401);
  return { cuenta, usuario: userId };
}
export async function cuerpo<T extends z.ZodType>(request: Request, esquema: T, limite = 200_000): Promise<z.infer<T>> {
  const texto = await request.text();
  if (Buffer.byteLength(texto) > limite) throw new WorkflowError("La solicitud es demasiado grande.", 413);
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new WorkflowError("JSON inválido.", 400);
  }
  const leido = esquema.safeParse(datos);
  if (!leido.success)
    throw new WorkflowError(
      `Revisa los datos: ${leido.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "solicitud"} ${i.message}`)
        .join("; ")}`,
      422,
    );
  return leido.data;
}
export const errorApi = (error: unknown) => {
  // Los errores de la base o de Zod internos no se muestran tal cual.
  if (error instanceof WorkflowError) return apiError(error);
  if (error instanceof Error && error.name === "ZodError")
    return apiError(new WorkflowError("Revisa los campos: hay datos inválidos o demasiado largos.", 422));
  console.error("[granjas]", error instanceof Error ? error.message : error);
  return apiError(new WorkflowError("No se pudo completar la operación. Tus datos se conservaron.", 500));
};
