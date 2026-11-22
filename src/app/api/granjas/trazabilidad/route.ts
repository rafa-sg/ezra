import { z } from "zod";
import { administrador, errorApi } from "@/lib/granjas/api";
import { diaValido } from "@/lib/granjas/tiempo";
import { trazabilidad } from "@/lib/granjas/trazabilidad";
import { leerProduccion } from "@/lib/produccion/almacen";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const texto = z.string().trim().min(1).max(120).nullable().catch(null);
const dia = z.string().refine(diaValido).nullable().catch(null);
/** Trazabilidad (procedencia y producción) con filtros compartidos por el mapa y la vista de conexiones. */
export async function GET(request: Request) {
  try {
    await administrador("granjas");
    const p = new URL(request.url).searchParams;
    const filtros = {
      departamento: texto.parse(p.get("departamento")),
      fuente: texto.parse(p.get("fuente")),
      estado: z.enum(["nuevo", "aprobado", "descartado"]).nullable().catch(null).parse(p.get("estado")),
      destino: z.enum(["spotmi", "instagram", "tiktok", "facebook"]).nullable().catch(null).parse(p.get("destino")),
      desde: dia.parse(p.get("desde")),
      hasta: dia.parse(p.get("hasta")),
      tipoFecha: z.enum(["evento", "descubrimiento", "publicacion"]).catch("evento").parse(p.get("tipoFecha") ?? "evento"),
    };
    const { encargos } = await leerProduccion();
    return Response.json({ ...trazabilidad(filtros, { encargos }), leido: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
