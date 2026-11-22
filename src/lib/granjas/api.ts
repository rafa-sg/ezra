import { auth } from "@clerk/nextjs/server";
import type { z } from "zod";
import { requireAccount, requireAdmin } from "../auth";
import { permite, type SeccionEquipo } from "../equipo/modelo";
import { apiError } from "../http";
import { WorkflowError } from "../workflow";

/**
 * Acceso a la API del estudio: el propietario y los socios usan todas las secciones; un invitado, solo
 * las que le dio el propietario (y sin escribir si es de solo lectura). Se comprueba en cada solicitud.
 * El id de Clerk (`usuario`) liga el estado OAuth y las preferencias a la sesión.
 */
export async function administrador(seccion: SeccionEquipo | "*", modo: "leer" | "escribir" = "leer") {
  const cuenta = await requireAccount();
  if (!cuenta.equipo) throw new WorkflowError("Esta acción requiere una cuenta del equipo de Spotmi.", 403);
  if (!permite(cuenta.equipo, seccion, modo === "escribir"))
    throw new WorkflowError(
      modo === "escribir" && cuenta.equipo.soloLectura
        ? "Tu acceso es de solo lectura."
        : "Tu acceso no incluye esta sección. Pídeselo al propietario.",
      403,
    );
  const { userId } = await auth();
  if (!userId) throw new WorkflowError("Inicia sesión de nuevo.", 401);
  return { cuenta, usuario: userId, equipo: cuenta.equipo };
}
/** Solo el propietario: equipo, presupuesto, puente n8n, IA local de esta Mac y conexiones compartidas. */
export async function propietario() {
  const cuenta = await requireAdmin();
  const { userId } = await auth();
  if (!userId || !cuenta.equipo) throw new WorkflowError("Inicia sesión de nuevo.", 401);
  return { cuenta, usuario: userId, equipo: cuenta.equipo };
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
