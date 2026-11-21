import { administrador, errorApi } from "@/lib/granjas/api";
import { estadoGranja } from "@/lib/granjas/ejecucion";
import { faltantesNodo } from "@/lib/granjas/modelo";
import { vistaPieza } from "@/lib/granjas/publicacion";
import { resumenEjecucionEventos } from "@/lib/granjas/pasos-eventos";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado completo consultado al backend: la interfaz se recupera aunque se cierre la pestaña. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await administrador();
    const { id } = await params;
    const estado = estadoGranja(id);
    const geminiHabilitado = process.env.EZRA_PRODUCCION_IA === "1" && Boolean(process.env.GEMINI_API_KEY?.trim());
    const piezas = (estado.ultima?.pasos ?? []).filter((p) => p.piezaId).map((p) => vistaPieza(p.piezaId!));
    return Response.json({
      ...estado,
      faltantes: Object.fromEntries(estado.granja.grafo.nodos.map((n) => [n.id, faltantesNodo(n, estado.granja.grafo, { geminiHabilitado, purpose: estado.granja.ajustes.purpose })])),
      piezas,
      // Granja de eventos: nuevos, duplicados, con imagen y tokens de la última ejecución.
      resumenEventos: estado.granja.ajustes.purpose === "eventos_el_salvador" && estado.ultima ? resumenEjecucionEventos(estado.ultima.id) : null,
      ahora: new Date().toISOString(),
    });
  } catch (error) {
    return errorApi(error);
  }
}
