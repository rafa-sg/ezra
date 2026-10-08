import { requireAccount } from "@/lib/auth";
import { requestBusinessId } from "@/lib/businesses";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
import { readBot, mutateBot, spanishIssue } from "@/lib/bot/store";
import { applyOperation, operationSchema } from "@/lib/bot/operations";
import { currentConnections } from "@/lib/bot/connections";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** «Bot de atención»: local configuration and simulator for the authorized business.
 * Nothing here connects to a channel or sends a message. */
function businessParam(request: Request) {
  if (!new URL(request.url).searchParams.get("business"))
    throw new WorkflowError("Elegí un negocio.", 400);
}
export async function GET(request: Request) {
  try {
    businessParam(request);
    const businessId = await requestBusinessId(request);
    return Response.json({ bot: await readBot(businessId), connections: currentConnections() });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    businessParam(request);
    const account = await requireAccount();
    const businessId = await requestBusinessId(request);
    const text = await request.text();
    if (Buffer.byteLength(text) > 64_000)
      throw new WorkflowError("La solicitud supera el límite.", 413);
    let body: { revision?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      throw new WorkflowError("Formato inválido.", 400);
    }
    if (typeof body?.revision !== "number")
      throw new WorkflowError("Falta la revisión. Recargá la página.", 400);
    const parsed = operationSchema.safeParse(body);
    if (!parsed.success)
      throw new WorkflowError(spanishIssue(parsed.error.issues[0]?.message), 400);
    const { bot, result } = await mutateBot(businessId, body.revision, (draft) =>
      applyOperation(draft, parsed.data, { actor: account.displayName }),
    );
    return Response.json({ bot, result: result ?? null, connections: currentConnections() });
  } catch (error) {
    return apiError(error);
  }
}
