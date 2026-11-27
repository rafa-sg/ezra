import { WorkflowError } from "../workflow";
import { ErrorProveedor, supabase, type Solicitar } from "./adaptadores";
import { leerConexion, solicitar as solicitarReal } from "./conexiones";
import { auditar, transaccion } from "./db";
import { archivarEnvioDeOtroDestino, leerEvento, marcarSpotmi, type Evento } from "./eventos";
import { sha256 } from "./huella";
import { leerBytesMedio, leerMedio } from "./medios";
import { canonico } from "./modelo";
import { conSesion, mapearPropuesta, rpc } from "./spotmi-propuestas";

export const spotmiPuedePublicar = () => {
  const c = leerConexion("spotmi");
  return c.capacidades.includes("publicar_eventos") && !c.configFaltante.length;
};

/** El hash incluye la portada y su permiso; nunca se envían referencias IA. */
export function preparePublication(event: Evento) {
  const proposal = mapearPropuesta(event);
  const media = event.imagenMedioId && event.imagenConfirmada && event.imagenTipo !== "ia"
    ? leerMedio(event.imagenMedioId) : null;
  if (media && (media.generado || media.procedencia.origen === "ia"))
    throw new WorkflowError("Una referencia IA no puede usarse como portada pública.", 422);
  const extension = media ? ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[media.mime] : null;
  if (media && (!extension || media.bytes > 5 * 1024 * 1024 || !event.imagenPermiso.trim()))
    throw new WorkflowError("La portada debe tener permiso confirmado y ser JPEG, PNG o WebP de hasta 5 MB.", 422);
  const accountId = leerConexion("spotmi").identidad?.id;
  const content = { ...proposal, cuenta: accountId, fecha_fin: event.fechaFin, portada: media ? { sha256: media.sha256, permiso: event.imagenPermiso } : null };
  return { content, media, extension, key: `ezra-publicar-${event.id}-${sha256(canonico(content))}` };
}

export async function publishEventToSpotmi(
  id: string,
  authorization: { revision: number; confirmation: string; actor: string },
  request: Solicitar = solicitarReal,
) {
  if (authorization.confirmation !== "PUBLICAR" || !authorization.actor)
    throw new WorkflowError("Escribe PUBLICAR para autorizar esta versión en Spotmi.", 422);
  if (!spotmiPuedePublicar())
    throw new WorkflowError("La publicación directa no está habilitada. Verifica la migración y el permiso de la cuenta editorial en Conexiones.", 409);
  if (!/^[0-9a-f-]{36}$/i.test(leerConexion("spotmi").identidad?.id ?? ""))
    throw new WorkflowError("Verifica la identidad de la cuenta editorial en Conexiones.", 409);
  const prepared = transaccion(() => {
    archivarEnvioDeOtroDestino(id);
    const event = leerEvento(id);
    if (event.revision !== authorization.revision)
      throw new WorkflowError("El evento cambió. Recarga y revisa la versión antes de publicar.", 409);
    if (event.spotmiPropuestaId)
      throw new WorkflowError("Este evento ya se envió a Spotmi. Consulta su estado; no se volverá a publicar.", 409);
    if (event.spotmiClave && !event.spotmiClave.startsWith("ezra-publicar-"))
      throw new WorkflowError("Hay una propuesta sin confirmar. Resuelve ese envío antes de publicar.", 409);
    const result = preparePublication(event);
    if (event.spotmiClave && event.spotmiClave !== result.key)
      throw new WorkflowError("La versión no coincide con la publicación iniciada.", 409);
    if (!event.spotmiClave) marcarSpotmi(id, { clave: result.key });
    auditar("evento.spotmi.autorizar_publicacion", id, { actor: authorization.actor, revision: authorization.revision, huella: result.key });
    return result;
  });
  const bytes = prepared.media ? await leerBytesMedio(prepared.media) : null;
  const result = await conSesion(async (access) => {
    // La ruta es inmutable por contenido y cuenta. Un reintento no sobrescribe fotos.
    const identity = leerConexion("spotmi").identidad?.id;
    if (identity !== prepared.content.cuenta)
      throw new WorkflowError("La cuenta editorial cambió después de la autorización. Recupera la conexión original para confirmar el envío.", 409);
    const coverPath = prepared.media ? `ezra/${identity}/${prepared.media.sha256}.${prepared.extension}` : null;
    if (bytes && coverPath) {
      let response: Response;
      try {
        response = await request(`${supabase()}/storage/v1/object/eventos/${coverPath}`, {
          method: "POST",
          headers: { apikey: process.env.SPOTMI_SUPABASE_ANON_KEY!, Authorization: `Bearer ${access}`, "Content-Type": prepared.media!.mime, "x-upsert": "false" },
          body: new Uint8Array(bytes), redirect: "error", signal: AbortSignal.timeout(20000),
        });
      } catch {
        throw new WorkflowError("No se confirmó la subida de la portada. Reintenta la misma publicación.", 504);
      }
      const data = await response.json().catch(() => ({})) as { error?: string; statusCode?: string };
      const duplicate = (response.status === 400 || response.status === 409) && data.error === "Duplicate";
      if (!response.ok && !duplicate) {
        if (response.status === 401) throw new ErrorProveedor("La sesión editorial venció.", "vencido", 401);
        throw new WorkflowError("Spotmi rechazó la portada. Verifica el permiso de almacenamiento y reintenta.", 422);
      }
    }
    return rpc(request, access, "ezra_publicar_evento", {
      datos: prepared.content.datos, fuente_url: prepared.content.fuente_url,
      clave: prepared.key, fecha_fin: prepared.content.fecha_fin, portada_ruta: coverPath,
    });
  }, request);
  if (result.estado === "hidden")
    throw new WorkflowError("El evento ya existe pero Spotmi lo ocultó. Revisa su moderación en Spotmi; no se volverá a publicar desde este reintento.", 409);
  if (result.estado !== "approved" || typeof result.id !== "string" || typeof result.evento !== "string")
    throw new WorkflowError("Spotmi no confirmó la publicación. Reintenta la misma versión para consultar el resultado sin duplicarla.", 502);
  auditar("evento.spotmi.publicado", id, { actor: authorization.actor, propuesta: result.id, evento: result.evento, huella: prepared.key });
  return marcarSpotmi(id, { estado: "aceptado", propuestaId: result.id });
}
