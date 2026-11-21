import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { guardarIngresos, leerCsv, leerIngresos, resumenIngresos } from "@/lib/granjas/ingresos";
import { diaLocal } from "@/lib/granjas/tiempo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resumen mensual de los cortes oficiales de ingresos (DGME, reportes de origen, CEPA). */
export async function GET(request: Request) {
  try {
    await administrador();
    const mes = new URL(request.url).searchParams.get("mes");
    const { filas, cargado } = await leerIngresos();
    return Response.json(
      {
        ...resumenIngresos(filas, diaLocal(), mes && /^\d{4}-\d{2}$/.test(mes) ? mes : null),
        cargado,
        filas: filas.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorApi(error);
  }
}

/** Carga manual de un CSV agregado. Con errores no se guarda nada (todo o nada). */
export async function POST(request: Request) {
  try {
    await administrador();
    const { csv, modo } = await cuerpo(
      request,
      z.object({ csv: z.string().max(2_000_000), modo: z.enum(["agregar", "reemplazar"]) }),
      2_100_000,
    );
    const { filas, errores, vacias } = leerCsv(csv);
    if (errores.length)
      return Response.json(
        { error: "El CSV tiene errores; no se guardó nada.", errores: errores.slice(0, 20) },
        { status: 422 },
      );
    const total = await guardarIngresos(filas, modo);
    return Response.json({ guardadas: filas.length, vacias, total });
  } catch (error) {
    return errorApi(error);
  }
}
