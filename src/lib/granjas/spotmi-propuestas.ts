import { WorkflowError } from "../workflow";
import { ErrorProveedor, sesionSpotmi, supabase, type Solicitar } from "./adaptadores";
import { conectarDirecto, guardarSecretoRenovado, leerConexion, secretoDe, solicitar as solicitarReal } from "./conexiones";
import { auditar, transaccion } from "./db";
import { archivarEnvioDeOtroDestino, leerEvento, marcarSpotmi, type Evento } from "./eventos";
import { sha256 } from "./huella";
import { canonico } from "./modelo";
import { diaLocal } from "./tiempo";

/**
 * Propuestas a Spotmi con la RPC `ezra_proponer_evento` (migración 20261103 ampliada).
 * Solo crea filas `pending` en `event_proposals`; publicar es del equipo de Spotmi.
 * La clave de idempotencia se guarda ANTES de llamar: si la red falla, reintentar
 * reutiliza la misma clave y Spotmi devuelve la misma propuesta en vez de duplicarla.
 */
export type DatosPropuesta = {
  titulo: string;
  fecha: string;
  hora?: string;
  lugar: string;
  municipio?: string;
  departamento?: string;
  categoria?: string;
  descripcion: string;
};
/** Campos que `admin_decidir_propuesta` copia al evento. Precio y boletos no tienen columna: van en la descripción. */
export function mapearPropuesta(e: Evento): { datos: DatosPropuesta; fuente_url: string } {
  const problemas: string[] = [];
  if (e.estado !== "aprobado") problemas.push("Aprueba el evento antes de enviarlo.");
  if (!e.fecha) problemas.push("Confirma la fecha (está por confirmar).");
  else if (e.fecha < diaLocal()) problemas.push("El evento ya pasó.");
  if (e.titulo.trim().length < 3) problemas.push("El título es demasiado corto.");
  if (!e.lugar.trim()) problemas.push("Falta el lugar.");
  if (problemas.length) throw new WorkflowError(problemas.join(" "), 422);
  const extras = [e.precio ? `Precio: ${e.precio}` : "", e.boletosUrl ? `Boletos: ${e.boletosUrl}` : ""].filter(Boolean);
  const datos: DatosPropuesta = {
    titulo: e.titulo.trim().slice(0, 160),
    fecha: e.fecha!,
    ...(e.hora ? { hora: e.hora } : {}),
    lugar: e.lugar.trim().slice(0, 200),
    ...(e.municipio ? { municipio: e.municipio.slice(0, 120) } : {}),
    ...(e.departamento ? { departamento: e.departamento } : {}),
    ...(e.categoria ? { categoria: e.categoria } : {}),
    descripcion: [e.descripcion.trim(), extras.join("\n")].filter(Boolean).join("\n\n").slice(0, 5000),
  };
  return { datos, fuente_url: e.fuenteUrl };
}
/** Misma propuesta → misma clave. Si el propietario corrige el evento, la clave cambia. */
export const claveIdempotencia = (eventoId: string, propuesta: ReturnType<typeof mapearPropuesta>) =>
  `ezra-evento-${eventoId}-${sha256(canonico(propuesta)).slice(0, 16)}`;

export const spotmiPuedeProponer = () => {
  const c = leerConexion("spotmi");
  return c.capacidades.includes("proponer_borrador") && !c.configFaltante.length;
};

/** PostgREST devuelve {code, message}: se conservan para explicar el rechazo. */
export async function rpc(solicitar: Solicitar, acceso: string, funcion: string, cuerpo: object): Promise<Record<string, unknown>> {
  let r: Response;
  try {
    r = await solicitar(`${supabase()}/rest/v1/rpc/${funcion}`, {
      method: "POST",
      headers: { apikey: process.env.SPOTMI_SUPABASE_ANON_KEY!, Authorization: `Bearer ${acceso}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
  } catch {
    throw new ErrorProveedor("Spotmi no respondió a tiempo. El resultado es desconocido: vuelve a enviar y no se duplicará.", "ambiguo", 504);
  }
  const texto = await r.text();
  let datos: Record<string, unknown> = {};
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = {};
  }
  if (r.ok) return datos;
  const mensaje = String(datos.message ?? r.status).slice(0, 300);
  if (r.status === 401 || /jwt/i.test(mensaje)) throw new ErrorProveedor("La sesión editorial venció.", "vencido", 401);
  if (datos.code === "42501") throw new ErrorProveedor(`Spotmi rechazó la cuenta: ${mensaje}`, "permiso", 403);
  if (datos.code === "PGRST202") throw new ErrorProveedor(funcion === "ezra_publicar_evento"
    ? "Falta la función de publicación directa de Ezra (migración 20261125 sin aplicar)."
    : "Spotmi todavía no tiene la función de propuestas de Ezra (migración 20261103 sin aplicar).", "rechazo", 422);
  if (r.status >= 500) throw new ErrorProveedor("Spotmi falló temporalmente. El resultado es desconocido: vuelve a enviar y no se duplicará.", "ambiguo", 502);
  throw new ErrorProveedor(`Spotmi rechazó la propuesta: ${mensaje}`, "rechazo", 422);
}
/** Usa la sesión guardada; si venció, la renueva o vuelve a entrar con la cuenta editorial de .env.local. */
export async function conSesion<T>(trabajo: (acceso: string) => Promise<T>, solicitar: Solicitar): Promise<T> {
  if (!spotmiPuedeProponer()) throw sinConexion();
  const intento = async () => {
    const secreto = secretoDe("spotmi");
    const actual = await sesionSpotmi(secreto, solicitar);
    if (actual !== secreto) guardarSecretoRenovado("spotmi", actual);
    return trabajo(actual.acceso);
  };
  try {
    return await intento();
  } catch (error) {
    if (!(error instanceof ErrorProveedor && error.tipo === "vencido")) throw error;
    await conectarDirecto("spotmi");
    return intento();
  }
}

const sinConexion = () =>
  new WorkflowError("Spotmi no está conectado con una cuenta editorial habilitada. Usa «Copiar ficha» o exporta el día.", 409);
export async function enviarEventoASpotmi(id: string, solicitar: Solicitar = solicitarReal) {
  if (!spotmiPuedeProponer()) throw sinConexion();
  const preparado = transaccion(() => {
    archivarEnvioDeOtroDestino(id);
    const e = leerEvento(id);
    if (e.spotmiClave?.startsWith("ezra-publicar-"))
      throw new WorkflowError("Hay una publicación directa iniciada. Confírmala con «Publicar en Spotmi»; no la envíes como propuesta.", 409);
    if (e.spotmiEstado && e.spotmiPropuestaId)
      throw new WorkflowError("Este evento ya se propuso a Spotmi. Consulta su estado.", 409);
    const propuesta = mapearPropuesta(e);
    const clave = claveIdempotencia(e.id, propuesta);
    // La clave queda guardada antes de salir a la red.
    if (e.spotmiClave !== clave) marcarSpotmi(id, { clave });
    return { propuesta, clave };
  });
  const r = await conSesion(
    (acceso) => rpc(solicitar, acceso, "ezra_proponer_evento", { datos: preparado.propuesta.datos, fuente_url: preparado.propuesta.fuente_url, clave: preparado.clave }),
    solicitar,
  );
  const propuestaId = typeof r.id === "string" ? r.id : null;
  if (!propuestaId) throw new WorkflowError("Spotmi no devolvió el id de la propuesta.", 502);
  auditar("evento.spotmi.proponer", id, { propuesta: propuestaId });
  return marcarSpotmi(id, { estado: estadoDesde(String(r.estado ?? "pending")), propuestaId });
}
const estadoDesde = (estado: string): Evento["spotmiEstado"] =>
  estado === "approved" ? "aceptado" : estado === "discarded" ? "descartado" : estado === "duplicate" ? "duplicado" : "propuesto";
export async function consultarEstadoSpotmi(id: string, solicitar: Solicitar = solicitarReal) {
  const e = leerEvento(id);
  if (!e.spotmiPropuestaId) throw new WorkflowError("Este evento todavía no se propuso a Spotmi.", 409);
  const r = await conSesion((acceso) => rpc(solicitar, acceso, "ezra_estado_propuesta", { propuesta: e.spotmiPropuestaId }), solicitar);
  return marcarSpotmi(id, { estado: estadoDesde(String(r.estado ?? "pending")) });
}
/** Revisa las propuestas pendientes (hasta 25), sin detenerse si una falla. */
export async function actualizarPropuestasPendientes(ids: string[], solicitar: Solicitar = solicitarReal) {
  const resultado: { id: string; estado: Evento["spotmiEstado"] | null; error?: string }[] = [];
  for (const id of ids.slice(0, 25)) {
    try {
      resultado.push({ id, estado: (await consultarEstadoSpotmi(id, solicitar)).spotmiEstado });
    } catch (error) {
      resultado.push({ id, estado: null, error: error instanceof Error ? error.message : "Error" });
    }
  }
  return resultado;
}
