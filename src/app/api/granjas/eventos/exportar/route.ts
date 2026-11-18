import { z } from "zod";
import { administrador, errorApi } from "@/lib/granjas/api";
import { eventosCsv, eventosJson, listarEventos } from "@/lib/granjas/eventos";
import { diaLocal, diaValido } from "@/lib/granjas/tiempo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Respaldo sin Spotmi: los eventos hallados un día (hora de El Salvador), en CSV o JSON. */
export async function GET(request: Request) {
  try {
    await administrador();
    const p = new URL(request.url).searchParams;
    const dia = z.string().refine(diaValido).catch(diaLocal()).parse(p.get("dia") ?? diaLocal());
    const formato = p.get("formato") === "json" ? "json" : "csv";
    const lista = listarEventos({ creadoEl: dia });
    const nombre = `eventos-${dia}.${formato}`;
    const cuerpo = formato === "json" ? JSON.stringify({ dia, eventos: eventosJson(lista) }, null, 2) : eventosCsv(lista);
    return new Response(cuerpo, {
      headers: {
        "Content-Type": formato === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorApi(error);
  }
}
