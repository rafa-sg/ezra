import { requestBusinessId } from "@/lib/businesses";
import { readWorkspace, mutateWorkspace } from "@/lib/store";
import { reconcile, WorkflowError } from "@/lib/workflow";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await readWorkspace(await requestBusinessId(request)));
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request) {
  try {
    const businessId = await requestBusinessId(request);
    const text = await request.text();
    if (Buffer.byteLength(text) > 8 * 1024 * 1024)
      throw new WorkflowError("Los datos superan el límite del piloto.", 413);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new WorkflowError("Formato de datos inválido.", 400);
    }
    return Response.json(await mutateWorkspace((current) => reconcile(current, data), businessId));
  } catch (e) {
    return apiError(e);
  }
}
