import { requireAdmin } from "@/lib/auth";
import {
  deleteAgencyLogo,
  LOGO_LIMIT,
  readAgencyLogo,
  readAgencyLogoFile,
  saveAgencyLogo,
} from "@/lib/agency-brand";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    if (new URL(request.url).searchParams.has("meta"))
      return Response.json({ logo: await readAgencyLogo() });
    const stored = await readAgencyLogoFile();
    if (!stored) throw new WorkflowError("No hay un logotipo guardado.", 404);
    return new Response(new Uint8Array(stored.bytes), {
      headers: {
        "Content-Type": stored.logo.mime,
        "Content-Length": String(stored.bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    if (Number(request.headers.get("content-length")) > LOGO_LIMIT + 64 * 1024)
      throw new WorkflowError("El logotipo debe pesar como máximo 2,5 MB.", 413);
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new WorkflowError("Selecciona una imagen.");
    return Response.json({ logo: await saveAgencyLogo(Buffer.from(await file.arrayBuffer())) });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE() {
  try {
    await requireAdmin();
    await deleteAgencyLogo();
    return Response.json({ logo: null });
  } catch (error) {
    return apiError(error);
  }
}
