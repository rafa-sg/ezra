import { readFile } from "node:fs/promises";
import { administrador, errorApi } from "@/lib/granjas/api";
import { leerMedio, rutaMedio } from "@/lib/granjas/medios";
import { byteRange } from "@/lib/media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo la administración ve los medios; nunca se exponen públicamente desde esta Mac. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await administrador();
    const medio = leerMedio((await params).id);
    const bytes = await readFile(rutaMedio(medio));
    const rango = request.headers.get("range");
    const parte = rango ? byteRange(rango, bytes.length) : null;
    // ?descargar=nombre: el navegador lo guarda como archivo (por ejemplo, el PNG de un post).
    const descargar = new URL(request.url).searchParams.get("descargar");
    const nombre = descargar ? `${descargar.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "archivo"}.${medio.archivo.split(".").pop()}` : null;
    const cabeceras = {
      ...(nombre ? { "Content-Disposition": `attachment; filename="${nombre}"` } : {}),
      "Content-Type": medio.mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    };
    if (parte)
      return new Response(new Uint8Array(bytes.subarray(parte.start, parte.end + 1)), {
        status: 206,
        headers: { ...cabeceras, "Content-Range": `bytes ${parte.start}-${parte.end}/${bytes.length}` },
      });
    return new Response(new Uint8Array(bytes), { headers: cabeceras });
  } catch (error) {
    return errorApi(error);
  }
}
