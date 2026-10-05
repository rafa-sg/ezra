import {
  automationConfig,
  createJob,
  dispatchJob,
  jobRequestSchema,
  readAutomation,
} from "@/lib/automation";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Status for the Settings page: whether automation is configured and the latest job.
// Never includes secrets or the webhook address.
export async function GET() {
  try {
    const { inbound, outbound, webhook } = automationConfig();
    const latest = (await readAutomation()).jobs.at(-1);
    return Response.json({
      configured: Boolean(inbound && outbound && webhook),
      latest: latest
        ? {
            jobId: latest.jobId,
            status: latest.status,
            deliveryError: latest.deliveryError,
            requestedAt: latest.requestedAt,
            completedAt: latest.result?.completedAt ?? null,
          }
        : null,
    });
  } catch (e) {
    return apiError(e);
  }
}
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
