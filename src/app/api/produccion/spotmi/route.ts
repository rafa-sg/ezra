import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { consultarSpotmi } from "@/lib/produccion/spotmi";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await consultarSpotmi());
  } catch (error) {
    return apiError(
      error instanceof WorkflowError
        ? error
        : new WorkflowError(
            "No se pudo conectar con Spotmi. Revisa la dirección y vuelve a intentar.",
            502,
          ),
    );
  }
}
