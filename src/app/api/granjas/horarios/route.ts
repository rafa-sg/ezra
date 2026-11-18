import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { actualizarGranja, leerGranja, listarGranjas } from "@/lib/granjas/almacen";
import { guardarHorario, horarioSchema, vistaHorario } from "@/lib/granjas/horario";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const peticion = z.object({
  granjaId: z.string().uuid(),
  horario: horarioSchema,
  aceptoIA: z.boolean().default(false),
  // Máximo por día (eventos o posts) y cuenta de destino de Instagram, guardados en la granja.
  maximo: z.number().int().min(1).max(30).optional(),
  cuenta: z.string().trim().min(2).max(60).optional(),
});
export async function GET() {
  try {
    await administrador();
    const horarios = Object.fromEntries(listarGranjas().filter((g) => g.estado !== "archivada").map((g) => [g.id, vistaHorario(g.id)]));
    return Response.json({ horarios, ahora: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    const { usuario } = await administrador();
    const p = await cuerpo(request, peticion, 10_000);
    const granja = leerGranja(p.granjaId);
    if (p.maximo !== undefined || p.cuenta !== undefined) {
      const ajustes = { ...granja.ajustes };
      if (granja.ajustes.purpose === "eventos_el_salvador" && p.maximo !== undefined)
        ajustes.eventos = { diasAdelante: 45, ...granja.ajustes.eventos, maxPorDia: p.maximo };
      if (granja.ajustes.purpose === "post_instagram_eventos")
        ajustes.instagram = {
          cuenta: "@spotmi.sv",
          postsPorDia: 3,
          ...granja.ajustes.instagram,
          ...(p.maximo !== undefined ? { postsPorDia: Math.min(20, p.maximo) } : {}),
          ...(p.cuenta !== undefined ? { cuenta: p.cuenta } : {}),
        };
      if (JSON.stringify(ajustes) !== JSON.stringify(granja.ajustes)) actualizarGranja(granja.id, granja.revision, { datos: { ...granja, ajustes } });
    }
    guardarHorario(p.granjaId, p.horario, usuario, p.aceptoIA);
    return Response.json({ horario: vistaHorario(p.granjaId), granja: leerGranja(p.granjaId) });
  } catch (error) {
    return errorApi(error);
  }
}
