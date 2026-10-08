import { GoogleGenAI } from "@google/genai";
import { requireAccount } from "@/lib/auth";
import { requestBusinessId } from "@/lib/businesses";
import { apiError } from "@/lib/http";
import { readWorkspace } from "@/lib/store";
import { WorkflowError } from "@/lib/workflow";
import {
  DEFAULT_MODEL,
  answer,
  geminiError,
  historySchema,
  takeRateLimit,
  withRetry,
} from "@/lib/ask/assistant";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ask AI: Gemini answers from read-only tools over the active business's data.
 * The key is read here on every request and never leaves the server. */
export async function POST(request: Request) {
  try {
    const account = await requireAccount();
    if (!new URL(request.url).searchParams.get("business"))
      throw new WorkflowError("Elegí un negocio antes de preguntar.", 400);
    const businessId = await requestBusinessId(request);
    const text = await request.text();
    if (Buffer.byteLength(text) > 48_000)
      throw new WorkflowError("La conversación es demasiado larga. Iniciá un chat nuevo.", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new WorkflowError("Formato inválido.", 400);
    }
    const parsed = historySchema.safeParse((body as { history?: unknown })?.history);
    if (!parsed.success)
      throw new WorkflowError("La pregunta está vacía o la conversación no es válida.", 400);
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey)
      throw new WorkflowError(
        "Falta configurar GEMINI_API_KEY en .env.local. Agregala y reiniciá el servidor.",
        503,
      );
    takeRateLimit(account.email || account.username);
    const workspace = await readWorkspace(businessId);
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 30_000 } });
    try {
      const result = await answer({
        history: parsed.data,
        workspace,
        model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
        generate: withRetry((request) => ai.models.generateContent(request)),
      });
      return Response.json(result);
    } catch (error) {
      // Status only, for local diagnosis; never the key, the question or the data.
      console.error("[ask] Gemini falló:", (error as { status?: number })?.status ?? "sin estado");
      throw geminiError(error);
    }
  } catch (error) {
    return apiError(error);
  }
}
