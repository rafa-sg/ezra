import { open, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { imageThumbnail } from "@/lib/image-thumbnail";
import { administrador, errorApi } from "@/lib/granjas/api";
import { leerMedio, rutaMedio } from "@/lib/granjas/medios";
import { byteRange } from "@/lib/media";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo la administración ve los medios; nunca se exponen públicamente desde esta Mac. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await administrador("*");
    const medio = leerMedio((await params).id);
    // Si el archivo ya no está en disco (por ejemplo, una copia sin la carpeta de medios), 404 claro, no 500.
    const ruta = rutaMedio(medio);
    const info = await stat(ruta).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") throw new WorkflowError("El archivo de este medio ya no está en esta computadora.", 404);
      throw e;
    });
    const url = new URL(request.url);
    const thumbnail = url.searchParams.get("thumbnail");
    if (thumbnail && !url.searchParams.has("descargar")) {
      if ((thumbnail !== "160" && thumbnail !== "480") || !medio.mime.startsWith("image/"))
        throw new WorkflowError("Tamaño o formato de miniatura no compatible.", 422);
      const version = `${medio.sha256}:${info.size}:${info.mtimeMs}:webp-v1`;
      const etag = `"${createHash("sha256").update(`${version}:${thumbnail}`).digest("hex")}"`;
      const headers = {
        "Content-Type": "image/webp", ETag: etag,
        // Revalidar siempre: quitar acceso debe impedir también reutilizar una miniatura.
        "Cache-Control": "private, no-cache", Vary: "Cookie, Authorization",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      };
      if (request.headers.get("if-none-match")?.split(",").some((value) => value.trim().replace(/^W\//, "") === etag))
        return new Response(null, { status: 304, headers });
      const bytes = await imageThumbnail(ruta, version, Number(thumbnail) as 160 | 480);
      return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
    }
    const rango = request.headers.get("range");
    const parte = rango ? byteRange(rango, info.size) : null;
    // ?descargar=nombre: el navegador lo guarda como archivo (por ejemplo, el PNG de un post).
    const descargar = url.searchParams.get("descargar");
    const nombre = descargar ? `${descargar.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "archivo"}.${medio.archivo.split(".").pop()}` : null;
    const cabeceras = {
      ...(nombre ? { "Content-Disposition": `attachment; filename="${nombre}"` } : {}),
      "Content-Type": medio.mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    };
    if (rango && !parte)
      return new Response(null, { status: 416, headers: { ...cabeceras, "Content-Range": `bytes */${info.size}` } });
    // Lectura por streaming, también para rangos de video: no carga el archivo entero en memoria.
    const file = await open(ruta, "r");
    const stream = file.createReadStream(parte ?? {});
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: parte ? 206 : 200,
      headers: {
        ...cabeceras, "Content-Length": String(parte ? parte.end - parte.start + 1 : info.size),
        ...(parte ? { "Content-Range": `bytes ${parte.start}-${parte.end}/${info.size}` } : {}),
      },
    });
  } catch (error) {
    // La excepción del proxy sólo permite caché en respuestas válidas de miniaturas.
    const response = errorApi(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
