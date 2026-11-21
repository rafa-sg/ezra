import { administrador, errorApi } from "@/lib/granjas/api";
import { estadoGranja } from "@/lib/granjas/ejecucion";
import { faltantesNodo } from "@/lib/granjas/modelo";
import { vistaPieza } from "@/lib/granjas/publicacion";
import { resumenEjecucionEventos } from "@/lib/granjas/pasos-eventos";
import { clipsDeEjecucion } from "@/lib/granjas/clips-almacen";
import { leerMedio } from "@/lib/granjas/medios";
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
    // Granja Clips: cada clip con su video y su decisión; los aprobados muestran su vista previa
    // cuando «Destinos» espera tu autorización (antes no se puede autorizar nada).
    const clips =
      estado.granja.ajustes.purpose === "clips" && estado.ultima
        ? clipsDeEjecucion(estado.ultima.id).map((c) => {
            const medio = c.medioId ? leerMedio(c.medioId) : null;
            return { ...c, medio: medio ? { id: medio.id, duracion: medio.duracion, ancho: medio.ancho, alto: medio.alto } : null };
          })
        : [];
    const destinos = estado.ultima?.pasos.find(
      (p) => estado.ultima!.instantanea.grafo.nodos.find((n) => n.id === p.nodoId)?.tipo === "publicacion",
    );
    if (clips.length && destinos && ["esperando_autorizacion", "completado"].includes(destinos.estado))
      for (const c of clips) if (c.estado === "aprobado" && c.piezaId) piezas.push(vistaPieza(c.piezaId));
    return Response.json({
      ...estado,
      faltantes: Object.fromEntries(estado.granja.grafo.nodos.map((n) => [n.id, faltantesNodo(n, estado.granja.grafo, { geminiHabilitado, purpose: estado.granja.ajustes.purpose })])),
      piezas,
      clips,
      // Granja de eventos: nuevos, duplicados, con imagen y tokens de la última ejecución.
      resumenEventos: estado.granja.ajustes.purpose === "eventos_el_salvador" && estado.ultima ? resumenEjecucionEventos(estado.ultima.id) : null,
      ahora: new Date().toISOString(),
    });
  } catch (error) {
    return errorApi(error);
  }
}
