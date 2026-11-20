import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
import { leerProduccion } from "@/lib/produccion/almacen";
import { reservarGeneracion, guardarEntrega, registrarFallo } from "@/lib/produccion/generacion";
import { buscarHerramienta, generarGemini, generarLocal } from "@/lib/produccion/proveedores";
import { geminiProduccionHabilitado } from "@/lib/ia/gemini";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const peticionSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int(),
  confirmar: z.literal(true),
});
const globales = globalThis as typeof globalThis & { produccionEnCurso?: boolean };
export async function POST(request: Request) {
  let adquirido = false;
  try {
    await requireAdmin();
    const texto = await request.text();
    if (Buffer.byteLength(texto) > 1000) throw new WorkflowError("Petición demasiado grande.", 413);
    const leido = peticionSchema.safeParse(JSON.parse(texto));
    if (!leido.success)
      throw new WorkflowError("Confirma el envío del encargo a la IA asignada.", 422);
    if (globales.produccionEnCurso)
      throw new WorkflowError("Ya hay una generación en curso. Espera su resultado.", 409);
    globales.produccionEnCurso = true;
    adquirido = true;
    const encargo = (await leerProduccion()).encargos.find((e) => e.id === leido.data.id);
    if (!encargo) throw new WorkflowError("Encargo no encontrado.", 404);
    if (encargo.proveedor === "gemini") {
      if (!geminiProduccionHabilitado())
        throw new WorkflowError(
          "La ejecución de Gemini todavía no está habilitada en este estudio.",
          503,
        );
    } else if (!(await buscarHerramienta(encargo.proveedor === "astra" ? "codex" : "claude")))
      throw new WorkflowError(
        "No se encontró la herramienta local. Puedes copiar el encargo a tu sesión de IA.",
        503,
      );
    const reservado = await reservarGeneracion(encargo.id, leido.data.revision);
    let entrega;
    try {
      entrega = reservado.proveedor === "gemini" ? await generarGemini(reservado) : await generarLocal(reservado);
    } catch (error) {
      // El intento ya contó: queda en el historial qué falló; el resultado anterior se conserva.
      await registrarFallo(reservado.id, error instanceof Error ? error.message : "La IA no entregó un resultado.", reservado.proveedor).catch(() => undefined);
      throw error;
    }
    return Response.json(await guardarEntrega(reservado, entrega));
  } catch (error) {
    return apiError(
      error instanceof SyntaxError ? new WorkflowError("JSON inválido.", 400) : error,
    );
  } finally {
    if (adquirido) globales.produccionEnCurso = false;
  }
}
