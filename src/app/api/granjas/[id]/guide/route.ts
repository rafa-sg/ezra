import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { guideChecksSchema, guideContentSchema } from "@/lib/granjas/guide-model";
import { approveGuide, guideHistory, readGuide, saveGuide } from "@/lib/granjas/guide-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), version: z.number().int().min(0), content: guideContentSchema }),
  z.object({ action: z.literal("approve"), version: z.number().int().min(1), hash: z.string().length(64), checks: guideChecksSchema }),
]);
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    await administrador();
    const { id } = await params;
    return Response.json({ guide: readGuide(id), history: guideHistory(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorApi(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    await administrador();
    const { id } = await params;
    const action = await cuerpo(request, actionSchema, 500_000);
    const guide = action.action === "save" ? saveGuide(id, action.version, action.content) : approveGuide(id, action.version, action.hash, action.checks);
    return Response.json({ guide, history: guideHistory(id) });
  } catch (error) { return errorApi(error); }
}
