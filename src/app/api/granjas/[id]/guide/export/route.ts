import { createHash } from "node:crypto";
import { administrador, errorApi } from "@/lib/granjas/api";
import { readGuide } from "@/lib/granjas/guide-store";
import { printScript, renderGuideHtml } from "@/lib/granjas/guide-export";
import { leerBytesMedio, leerMedio } from "@/lib/granjas/medios";
import { WorkflowError } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await administrador();
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const requested = query.get("version");
    const version = requested === null ? undefined : Number(requested);
    if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) throw new WorkflowError("Versión inválida.", 422);
    const guide = readGuide(id, version);
    if (!guide) throw new WorkflowError("Guardá la guía antes de exportarla.", 404);
    const filename = `spotmi-guia-v${guide.version}${guide.approvedAt ? "-aprobada" : "-borrador"}`;
    if (query.get("format") === "json") return new Response(JSON.stringify(guide, null, 2), { headers: {
      "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}.json"`, "Cache-Control": "no-store",
    } });
    let cover;
    if (guide.content.coverMediaId) {
      const media = leerMedio(guide.content.coverMediaId);
      const bytes = await leerBytesMedio(media);
      cover = { dataUrl: `data:${media.mime};base64,${bytes.toString("base64")}`, generated: media.generado };
    }
    const scriptHash = createHash("sha256").update(printScript).digest("base64");
    return new Response(renderGuideHtml(guide, cover), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      ...(query.get("download") === "1" ? { "Content-Disposition": `attachment; filename="${filename}.html"` } : {}),
    } });
  } catch (error) { return errorApi(error); }
}
