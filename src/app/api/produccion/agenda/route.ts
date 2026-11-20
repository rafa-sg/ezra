import { z } from "zod";
import { administrador, errorApi } from "@/lib/granjas/api";
import { agenda } from "@/lib/produccion/agenda";
import { diaValido } from "@/lib/granjas/tiempo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Agenda del calendario: fecha prevista, autorización, publicación confirmada y eventos. Solo administración. */
export async function GET(request: Request) {
  try {
    await administrador();
    const p = new URL(request.url).searchParams;
    const dia = z.string().refine(diaValido).optional().catch(undefined);
    return Response.json(await agenda({ desde: dia.parse(p.get("desde") ?? undefined), hasta: dia.parse(p.get("hasta") ?? undefined) }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorApi(error);
  }
}
