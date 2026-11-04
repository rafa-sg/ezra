import { requireAccount } from "@/lib/auth";
import { createBusiness, authorizedDirectory } from "@/lib/businesses";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await authorizedDirectory());
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const account = await requireAccount();
    const text = await request.text();
    if (Buffer.byteLength(text) > 4096)
      throw new WorkflowError("La solicitud supera el límite.", 413);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new WorkflowError("Formato inválido.", 400);
    }
    return Response.json(await createBusiness(data, account), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
