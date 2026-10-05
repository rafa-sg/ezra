import {
  automationConfig,
  recordResult,
  resultSchema,
  secretHeader,
  secretMatches,
} from "@/lib/automation";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Callback for n8n. A simulated result is stored in its job and history only;
// it never changes a post's status.
export async function POST(request: Request) {
  try {
    const { inbound } = automationConfig();
    if (!inbound)
      throw new WorkflowError("La automatización no está configurada en este servidor.", 503);
    if (!secretMatches(request.headers.get(secretHeader), inbound))
      throw new WorkflowError("No autorizado.", 401);
    const text = await request.text();
    if (Buffer.byteLength(text) > 16 * 1024)
      throw new WorkflowError("El resultado supera el límite.", 413);
    let parsed;
    try {
      parsed = resultSchema.safeParse(JSON.parse(text));
    } catch {
      throw new WorkflowError("Formato de datos inválido.", 400);
    }
    if (!parsed.success)
      throw new WorkflowError("Resultado inválido. Solo se aceptan resultados simulados.", 422);
    const { job, duplicate } = await recordResult(parsed.data);
    return Response.json({ jobId: job.jobId, status: job.status, duplicate });
  } catch (e) {
    return apiError(e);
  }
}
