import { z } from "zod";
import { ideasOverview, readAutomation, setIdeaStatus } from "@/lib/automation";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Ideas found in authorized sources, for the Sources screen.
export async function GET() {
  try {
    return Response.json(ideasOverview(await readAutomation()));
  } catch (e) {
    return apiError(e);
  }
}
const patchSchema = z
  .object({ id: z.string().uuid(), status: z.enum(["discarded", "used"]) })
  .strict();
export async function PATCH(request: Request) {
  try {
    let parsed;
    try {
      parsed = patchSchema.safeParse(JSON.parse(await request.text()));
    } catch {
      throw new WorkflowError("Formato de datos inválido.", 400);
    }
    if (!parsed.success) throw new WorkflowError("Cambio de idea inválido.", 422);
    return Response.json(await setIdeaStatus(parsed.data.id, parsed.data.status));
  } catch (e) {
    return apiError(e);
  }
}
