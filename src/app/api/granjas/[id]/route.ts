import { administrador, errorApi } from "@/lib/granjas/api";
import { estadoGranja } from "@/lib/granjas/ejecucion";
import { faltantesNodo } from "@/lib/granjas/modelo";
import { vistaPieza } from "@/lib/granjas/publicacion";
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
      faltantes: Object.fromEntries(estado.granja.grafo.nodos.map((n) => [n.id, faltantesNodo(n, estado.granja.grafo, { geminiHabilitado })])),
      piezas,
      ahora: new Date().toISOString(),
    });
  } catch (error) {
    return errorApi(error);
  }
}
