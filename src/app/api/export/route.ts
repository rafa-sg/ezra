import { requestBusinessId, readBusinessDirectory } from "@/lib/businesses";
import JSZip from "jszip";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { mediaDirectoryFor, readWorkspace } from "@/lib/store";
import { readAutomation } from "@/lib/automation";
import { readBot } from "@/lib/bot/store";
import { siteEventPackage } from "@/lib/site-event";
import { approvalIssues, defaultBusinessId, formatLabels, statusLabels } from "@/lib/model";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const businessId = await requestBusinessId(request);
    const state = await readWorkspace(businessId);
    const url = new URL(request.url);
    const postId = url.searchParams.get("post");
    const forSite = url.searchParams.get("for") === "site";
    const zip = new JSZip();
    const post = postId ? state.posts.find((p) => p.id === postId) : undefined;
    if (postId && !post)
      return Response.json({ error: "Publicación no encontrada." }, { status: 404 });
    if (forSite && !post)
      throw new WorkflowError("Indica la publicación que quieres exportar para el sitio.", 400);
    const site = forSite && post ? siteEventPackage(post, state) : undefined;
    const assets = site
      ? site.photo
        ? [site.photo]
        : []
      : post
        ? state.media.filter((m) => post.mediaIds.includes(m.id))
        : state.media;
    if (assets.reduce((sum, m) => sum + m.size, 0) > 1024 * 1024 * 1024)
      throw new WorkflowError(
        "El respaldo supera 1 GB. Detén el servidor y copia la carpeta data/ completa para conservar todos tus archivos.",
        413,
      );
    // Only an approved version may be scheduled by hand (e.g. in Metricool).
    const approved = post
      ? ["approved", "planned", "published"].includes(post.status) &&
        (!post.productId || post.status === "published" || !approvalIssues(post, state).length)
      : true;
    if (site) zip.file("evento.txt", site.text);
    else if (post) {
      const sources = state.sources.filter((s) => post.sourceIds.includes(s.id));
      const warnings = [
        post.demo ? "EJEMPLO DE DEMOSTRACIÓN — revisar antes de usar" : "",
        approved
          ? ""
          : "VERSIÓN NO APROBADA — no la programes ni la publiques hasta aprobarla en ezrá.",
        post.channel === "instagram" &&
        assets.some((m) => m.mime === "image/png" || m.mime === "image/webp")
          ? "AVISO: Instagram publica fotos por API solo en JPEG. Si tu herramienta de programación rechaza un PNG o WebP, conviértelo a JPEG antes de subirlo."
          : "",
      ].filter(Boolean);
      // Caption alone, ready to copy and paste into the scheduling tool.
      zip.file("texto.txt", `${post.caption}\n`);
      zip.file(
        "publicacion.txt",
        `${warnings.map((w) => `${w}\n\n`).join("")}${post.title}\n\n${post.caption}\n\nRed: ${post.channel}\nFormato: ${formatLabels[post.format]}\nEstado: ${statusLabels[post.status]}\nFecha prevista (El Salvador): ${post.plannedAt || "Sin definir"}\n\nFUENTES\n${sources.map((s) => `${s.name}: ${s.url} (revisión: ${s.reviewedOn || "pendiente"})`).join("\n")}\n\nMEDIOS\n${assets.map((m) => `${m.filename} — origen: ${m.origin}; licencia/nota: ${m.attribution || "sin nota"}`).join("\n")}\n\nEste paquete no publica ni programa contenido en una red social. texto.txt contiene solo el texto para copiar y pegar. Las ilustraciones de ejemplo no son fotografías reales.\n`,
      );
    } else {
      zip.file("workspace.json", JSON.stringify(state, null, 2));
      // «Bot de atención» configuration, knowledge, rules, local tests and activity.
      zip.file("bot.json", JSON.stringify(await readBot(businessId), null, 2));
      if (businessId === defaultBusinessId)
        zip.file("automation.json", JSON.stringify(await readAutomation(), null, 2));
      const business = (await readBusinessDirectory()).businesses.find((b) => b.id === businessId);
      zip.file("negocio.json", JSON.stringify(business, null, 2));
      zip.file(
        "LEEME.txt",
        `Respaldo del negocio ${state.brand.name}.\nDetén el servidor y conserva una copia de data/ completa, incluyendo businesses.json y accounts.json. Restaura workspace.json, bot.json y media/ en ${businessId === defaultBusinessId ? "data/ (y automation.json si está incluido)" : `data/businesses/${businessId}/`}. negocio.json describe este negocio; conserva su registro en businesses.json. Las cuentas y otros negocios no están incluidos en este paquete. Reinicia con npm run dev.\nNo subas el respaldo a un repositorio público.\n`,
      );
    }
    const missing: string[] = [];
    for (const media of assets) {
      const file = path.join(mediaDirectoryFor(businessId), media.filename);
      try {
        await stat(file);
      } catch {
        missing.push(`${media.filename} (${media.originalName})`);
        continue;
      }
      zip.file(`${site ? "foto" : "media"}/${media.filename}`, createReadStream(file));
    }
    if (missing.length)
      zip.file(
        "ADVERTENCIA-ARCHIVOS-FALTANTES.txt",
        `Este paquete está incompleto: los siguientes archivos faltan en el disco. El texto y los datos sí se conservaron. Recupéralos de otra copia.\n\n${missing.join("\n")}`,
      );
    const stream = zip.generateNodeStream({
      type: "nodebuffer",
      compression: "STORE",
      streamFiles: true,
    });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="ezra-${post ? post.id : "respaldo"}${site ? "-sitio" : ""}${approved ? "" : "-no-aprobada"}${missing.length ? "-incompleto" : ""}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
