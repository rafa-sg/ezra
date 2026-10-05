import { requestBusinessId } from "@/lib/businesses";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { mediaDirectoryFor, readWorkspace } from "@/lib/store";
import { byteRange } from "@/lib/media";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const businessId = await requestBusinessId(request);
    const { id } = await params;
    const media = (await readWorkspace(businessId)).media.find((m) => m.id === id);
    if (!media) return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
    const file = path.join(mediaDirectoryFor(businessId), media.filename);
    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      return Response.json(
        { error: "Este archivo falta en tu carpeta. Recupéralo desde un respaldo." },
        { status: 404 },
      );
    }
    const headers: Record<string, string> = {
      "Content-Type": media.mime,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    };
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const range = byteRange(rangeHeader, size);
      if (!range)
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${size}` },
        });
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
      headers["Content-Length"] = String(range.end - range.start + 1);
      return new Response(Readable.toWeb(createReadStream(file, range)) as ReadableStream, {
        status: 206,
        headers,
      });
    }
    headers["Content-Length"] = String(size);
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
  } catch (e) {
    return apiError(e);
  }
}
