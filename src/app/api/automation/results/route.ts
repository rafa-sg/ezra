import { automationConfig, recordResult, secretHeader, secretMatches } from "@/lib/automation";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Callback for n8n. Each result is validated against the job it answers; it is
// stored in that job (and ideas list) plus history. It never changes a post.
export async function POST(request: Request) {
  try {
    const { inbound } = automationConfig();
    if (!inbound)
      throw new WorkflowError("La automatización no está configurada en este servidor.", 503);
    if (!secretMatches(request.headers.get(secretHeader), inbound))
      throw new WorkflowError("No autorizado.", 401);
    const text = await request.text();
    if (Buffer.byteLength(text) > 256 * 1024)
      throw new WorkflowError("El resultado supera el límite.", 413);
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new WorkflowError("Formato de datos inválido.", 400);
    }
    const { job, duplicate } = await recordResult(raw);
    return Response.json({ jobId: job.jobId, status: job.status, duplicate });
  } catch (e) {
    return apiError(e);
  }
}
