import { requireLegacyAutomation } from "@/lib/businesses";
import {
  automationConfig,
  createDraftJob,
  createIdeasJob,
  createJob,
  dispatchJob,
  jobRequestSchema,
  readAutomation,
} from "@/lib/automation";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Status for the Settings page: whether automation is configured and the latest
// connection test. Never includes secrets or webhook addresses.
export async function GET(request: Request) {
  try {
    await requireLegacyAutomation(request);
    const { inbound, outbound, webhook } = automationConfig();
    const latest = (await readAutomation()).jobs.findLast((j) => j.action === "connection_test");
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
// Same-origin UI route (protected by proxy.ts). One job per click; secrets stay
// on the server.
export async function POST(request: Request) {
  try {
    await requireLegacyAutomation(request);
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
      throw new WorkflowError(
        "Solo se permiten pruebas de conexión, búsquedas de ideas y propuestas con IA.",
        422,
      );
    const { inbound, outbound, webhook, ideasWebhook, draftWebhook } = automationConfig();
    const target = {
      connection_test: webhook,
      find_ideas: ideasWebhook,
      generate_draft: draftWebhook,
    }[parsed.data.action];
    if (!inbound || !outbound || !target)
      throw new WorkflowError(
        "La automatización no está configurada. Revisa los secretos y la dirección local en .env.local.",
        503,
      );
    const wanted = parsed.data;
    const created =
      wanted.action === "find_ideas"
        ? await createIdeasJob()
        : wanted.action === "generate_draft"
          ? await createDraftJob(wanted.ideaId)
          : await createJob(wanted.postId);
    const job = await dispatchJob(created, target, outbound);
    if (job.status === "delivery_failed")
      return Response.json({ error: job.deliveryError, job }, { status: 502 });
    return Response.json({ job }, { status: 202 });
  } catch (e) {
    return apiError(e);
  }
}
