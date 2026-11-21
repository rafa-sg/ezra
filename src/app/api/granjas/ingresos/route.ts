import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { duplicados, guardarCortes, leerCortes, leerCsv, resumenIngresos } from "@/lib/granjas/ingresos";
import { diaLocal } from "@/lib/granjas/tiempo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resumen de una fuente (DGME por defecto, o MITUR) en un período cargado. */
export async function GET(request: Request) {
  try {
    await administrador();
    const p = new URL(request.url).searchParams;
    const fuente = p.get("fuente") === "MITUR" ? "MITUR" : "DGME";
    const periodo = p.get("periodo");
    const cortes = await leerCortes();
    return Response.json(
      { ...resumenIngresos(cortes, diaLocal(), fuente, periodo && /^[\d-]{10}_[\d-]{10}$/.test(periodo) ? periodo : null), cargados: cortes.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorApi(error);
  }
}

/**
 * Carga de CSV en dos pasos: «vista» valida y devuelve la vista previa con los duplicados;
 * «guardar» guarda (todo o nada ante errores). Un duplicado reemplaza solo con `reemplazar: true`.
 */
export async function POST(request: Request) {
  try {
    await administrador();
    const { csv, accion, reemplazar } = await cuerpo(
      request,
      z.object({ csv: z.string().max(2_000_000), accion: z.enum(["vista", "guardar"]), reemplazar: z.boolean().default(false) }),
      2_100_000,
    );
    const { cortes, errores, vacias } = leerCsv(csv);
    const dup = duplicados(cortes, await leerCortes());
    if (accion === "vista") return Response.json({ filas: cortes.slice(0, 50), total: cortes.length, errores: errores.slice(0, 30), vacias, duplicados: dup });
    if (errores.length || dup.enArchivo.length)
      return Response.json({ error: "El CSV tiene errores o filas repetidas; no se guardó nada.", errores: [...errores, ...dup.enArchivo.map((d) => `Repetido en el archivo: ${d}`)].slice(0, 30) }, { status: 422 });
    const r = await guardarCortes(cortes, reemplazar);
    return Response.json({ guardadas: cortes.length - r.omitidos, omitidos: r.omitidos, vacias, total: r.total });
  } catch (error) {
    return errorApi(error);
  }
}
