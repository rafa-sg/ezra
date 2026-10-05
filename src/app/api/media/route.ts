import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { mediaDirectory, mutateWorkspace } from "@/lib/store";
import { type Media } from "@/lib/model";
import { WorkflowError } from "@/lib/workflow";
import { apiError } from "@/lib/http";
import { detectMedia } from "@/lib/media";
export const runtime = "nodejs";
const limit = 50 * 1024 * 1024;
export async function POST(request: Request) {
  let savedPath: string | undefined;
  try {
    if (Number(request.headers.get("content-length")) > limit + 1024 * 1024)
      throw new WorkflowError("El archivo supera 50 MB.", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > limit)
      throw new WorkflowError("Selecciona un archivo de hasta 50 MB.", 413);
    const origin = form.get("origin");
    if (!["owned", "ai", "licensed"].includes(String(origin)))
      throw new WorkflowError("Indica el origen del archivo.");
    const attribution = String(form.get("attribution") || "").slice(0, 2000);
    if (origin === "licensed" && !attribution.trim())
      throw new WorkflowError("Describe la licencia o autorización del archivo.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const { mime, ext } = detectMedia(bytes);
    const id = crypto.randomUUID();
    const media: Media = {
      id,
      filename: `${id}.${ext}`,
      originalName: path.basename(file.name).slice(0, 240),
      mime,
      size: bytes.length,
      createdAt: new Date().toISOString(),
      origin: origin as Media["origin"],
      attribution,
    };
    const workspace = await mutateWorkspace(async (current) => {
      if (current.media.length >= 1000)
        throw new WorkflowError("La biblioteca alcanzó el límite del piloto.");
      savedPath = path.join(mediaDirectory, media.filename);
      await writeFile(savedPath, bytes, { mode: 0o600 });
      return { ...current, revision: current.revision + 1, media: [media, ...current.media] };
    });
    return Response.json({ workspace, media });
  } catch (e) {
    if (savedPath) await unlink(savedPath).catch(() => {});
    return apiError(e);
  }
}
