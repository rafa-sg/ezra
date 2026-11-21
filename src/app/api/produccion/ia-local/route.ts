import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { guardarAjuste, leerAjuste } from "@/lib/granjas/ajustes";
import {
  diagnosticar,
  diagnosticoReciente,
  diagnosticoSchema,
  probar,
  recordar,
  type ProveedorLocal,
} from "@/lib/produccion/ia-local";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Diagnóstico de Codex y Claude Code locales. Verificar no invoca al modelo; Probar sí (acción explícita). */
const clave = (p: ProveedorLocal) => `ia-local:${p}`;
async function ultimo(p: ProveedorLocal) {
  return leerAjuste(clave(p), diagnosticoSchema.nullable(), null) ?? (await diagnosticoReciente(p));
}
export async function GET() {
  try {
    await requireAdmin();
    const [astra, claude] = await Promise.all([ultimo("astra"), ultimo("claude")]);
    return Response.json({ astra, claude });
  } catch (error) {
    return apiError(error);
  }
}
const pedido = z.object({
  proveedor: z.enum(["astra", "claude"]),
  accion: z.enum(["verificar", "probar"]),
});
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const { proveedor, accion } = pedido.parse(await request.json().catch(() => ({})));
    const anterior = leerAjuste(clave(proveedor), diagnosticoSchema.nullable(), null);
    const nuevo = accion === "probar" ? await probar(proveedor) : await diagnosticar(proveedor);
    // Verificar conserva el resultado de la última prueba del modelo (son comprobaciones distintas).
    const guardado = guardarAjuste(
      clave(proveedor),
      diagnosticoSchema,
      accion === "verificar" ? { ...nuevo, prueba: anterior?.prueba ?? null } : nuevo,
    );
    recordar(guardado);
    return Response.json({ diagnostico: guardado });
  } catch (error) {
    return apiError(error);
  }
}
