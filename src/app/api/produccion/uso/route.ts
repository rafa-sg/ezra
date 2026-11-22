import { administrador, errorApi } from "@/lib/granjas/api";
import { resumenUsoIA } from "@/lib/ia/uso";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Uso de las tres IAs (Gemini, Astra y Claude) para el globo de Consumo y Configuración › Uso. */
export async function GET() {
  try {
    await administrador("consumo");
    return Response.json(await resumenUsoIA(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
