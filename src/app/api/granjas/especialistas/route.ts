import { z } from "zod";
import { agentes } from "@/lib/produccion/modelo";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { especialistasVisibles, guardarEspecialistas } from "@/lib/granjas/especialistas";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await administrador();
    return Response.json({ visibles: especialistasVisibles(), catalogo: agentes });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    await administrador();
    const { visibles } = await cuerpo(request, z.object({ visibles: z.array(z.enum(agentes)).min(1).max(agentes.length) }), 5_000);
    return Response.json({ visibles: guardarEspecialistas(visibles), catalogo: agentes });
  } catch (error) {
    return errorApi(error);
  }
}
