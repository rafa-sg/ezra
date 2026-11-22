import { z } from "zod";
import { administrador, cuerpo, errorApi, propietario } from "@/lib/granjas/api";
import { guardarLimiteImagenes, guardarPresupuesto, guardarTarifas, limiteImagenesSchema, presupuestoSchema, resumenConsumo, tarifasSchema } from "@/lib/granjas/consumo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("presupuesto"), presupuesto: presupuestoSchema }),
  z.object({ accion: z.literal("tarifas"), tarifas: tarifasSchema }),
  z.object({ accion: z.literal("imagenes_ia"), porDia: limiteImagenesSchema.shape.porDia }),
]);
/** Consumo de Gemini: solo administración. Nunca devuelve prompts, respuestas ni claves. */
export async function GET() {
  try {
    await administrador("consumo");
    return Response.json(resumenConsumo(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    await propietario();
    const a = await cuerpo(request, accion, 20_000);
    if (a.accion === "presupuesto") guardarPresupuesto(a.presupuesto);
    else if (a.accion === "imagenes_ia") guardarLimiteImagenes(a.porDia);
    else guardarTarifas(a.tarifas);
    return Response.json(resumenConsumo());
  } catch (error) {
    return errorApi(error);
  }
}
