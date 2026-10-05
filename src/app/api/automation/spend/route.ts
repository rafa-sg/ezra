import { requireLegacyAutomation } from "@/lib/businesses";
import { readAutomation, spendSummary } from "@/lib/automation";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini spend for Settings: cap, totals and each generation. No secrets.
export async function GET(request: Request) {
  try {
    await requireLegacyAutomation(request);
    return Response.json(spendSummary(await readAutomation()));
  } catch (e) {
    return apiError(e);
  }
}
