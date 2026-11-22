import { administrador, errorApi } from "@/lib/granjas/api";
import { guardarMedio, LIMITE_MEDIO, textoPermiso, validarPermiso } from "@/lib/granjas/medios";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Subida de medios propios o con permiso. La nota de permiso es obligatoria. */
export async function POST(request: Request) {
  try {
    await administrador("*", "escribir");
    if (Number(request.headers.get("content-length") || 0) > LIMITE_MEDIO + 100_000)
      throw new WorkflowError("El archivo supera 200 MB.", 413);
    const formulario = await request.formData();
    const archivo = formulario.get("archivo");
    // Origen declarado (propio o con permiso del autor): obligatorio para la granja Clips, opcional en las demás.
    const permiso = formulario.get("permiso_tipo")
      ? validarPermiso({ tipo: formulario.get("permiso_tipo"), autor: formulario.get("permiso_autor"), constancia: formulario.get("permiso_constancia") })
      : null;
    const licencia = String(formulario.get("licencia") ?? "").trim() || (permiso ? textoPermiso(permiso) : "");
    if (!(archivo instanceof File)) throw new WorkflowError("Adjunta un archivo.", 422);
    if (!licencia) throw new WorkflowError("Indica de quién es el archivo o qué permiso tienes para usarlo.", 422);
    const medio = await guardarMedio(Buffer.from(await archivo.arrayBuffer()), {
      nombre: archivo.name || "archivo",
      procedencia: { origen: "subida", nota: "Subido por el propietario." },
      licencia,
      generado: formulario.get("generado") === "1",
      permiso,
    });
    return Response.json({ medio: { id: medio.id, mime: medio.mime, nombre: medio.nombre, ancho: medio.ancho, alto: medio.alto, duracion: medio.duracion, licencia: medio.licencia, generado: medio.generado, bytes: medio.bytes, permiso: medio.permiso } });
  } catch (error) {
    return errorApi(error);
  }
}
