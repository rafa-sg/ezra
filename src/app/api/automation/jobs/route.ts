import { automationConfig, createJob, dispatchJob, jobRequestSchema } from "@/lib/automation";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Same-origin UI route (protected by proxy.ts). Secrets stay on the server.
export async function POST(request: Request) {
  try {
    const { inbound, outbound, webhook } = automationConfig();
    if (!inbound || !outbound || !webhook)
      throw new WorkflowError(
        "La automatización no está configurada. Revisa los secretos y la dirección local en .env.local.",
        503,
      );
    const text = await request.text();
    if (Buffer.byteLength(text) > 16 * 1024)
      throw new WorkflowError("La solicitud supera el límite.", 413);
    let parsed;
    try {
      parsed = jobRequestSchema.safeParse(JSON.parse(text));
    } catch {
      throw new WorkflowError("Formato de datos inválido.", 400);
    }
    if (!parsed.success)
      throw new WorkflowError("Solo se permiten pruebas de conexión simuladas.", 422);
    const job = await dispatchJob(await createJob(parsed.data.postId), webhook, outbound);
    if (job.status === "delivery_failed")
      return Response.json({ error: job.deliveryError, job }, { status: 502 });
    return Response.json({ job }, { status: 202 });
  } catch (e) {
    return apiError(e);
  }
}
