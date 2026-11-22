import { administrador, errorApi } from "@/lib/granjas/api";
import { leerProduccion } from "@/lib/produccion/almacen";
import { listarEventos } from "@/lib/granjas/eventos";
import { calendarioIcs } from "@/lib/produccion/calendario";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Calendario en formato iCalendar (.ics): fechas previstas de encargos y eventos aprobados. No programa nada. */
export async function GET() {
  try {
    await administrador("calendario");
    const ics = calendarioIcs((await leerProduccion()).encargos, listarEventos().filter((e) => e.estado === "aprobado"));
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="ezra-calendario.ics"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorApi(error);
  }
}
