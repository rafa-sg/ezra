import { z } from "zod";
import { administrador, errorApi } from "@/lib/granjas/api";
import { WorkflowError } from "@/lib/workflow";
import { relacionesEncargo } from "@/lib/produccion/relaciones";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Eventos y granjas relacionados con un encargo (vínculos guardados; solo administración). */
export async function GET(request: Request) {
  try {
    await administrador("encargos");
    const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success) throw new WorkflowError("Encargo inválido.", 400);
    const r = await relacionesEncargo(id.data);
    if (!r) throw new WorkflowError("Encargo no encontrado.", 404);
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
