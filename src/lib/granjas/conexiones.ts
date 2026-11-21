import { randomBytes } from "node:crypto";
import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json, transaccion } from "./db";
import { cifrar, descifrar } from "./cripto";
import {
  adaptadores,
  baseRedireccion,
  ErrorProveedor,
  redireccion,
  type CanalConexion,
  type Capacidad,
  type EstadoConexion,
  type Identidad,
  type Secreto,
  type Solicitar,
  type Verificacion,
} from "./adaptadores";

export const canalesConexion: CanalConexion[] = ["instagram", "facebook", "tiktok", "youtube", "spotmi"];
const globales = globalThis as typeof globalThis & { ezraSolicitar?: Solicitar };
/** Las pruebas sustituyen la red; en uso normal es fetch. */
export const solicitar: Solicitar = (url, init) => (globales.ezraSolicitar ?? fetch)(url, init);
export function usarRedDePrueba(funcion: Solicitar | undefined) {
  globales.ezraSolicitar = funcion;
}

export type Conexion = {
  canal: CanalConexion;
  estado: EstadoConexion;
  identidad: Identidad | null;
  capacidades: Capacidad[];
  permisos: string[];
  opciones: { id: string; nombre: string; tareas: string[] }[];
  expira: string | null;
  verificado: string | null;
  ultimoError: string;
  ultimoErrorFecha: string | null;
  configFaltante: string[];
  redireccion: string | null;
  aviso: string;
};
type Fila = {
  canal: CanalConexion;
  estado: EstadoConexion;
  identidad: string;
  capacidades: string;
  permisos: string;
  opciones: string;
  token_cifrado: string | null;
  expira: string | null;
  verificado: string | null;
  ultimo_error: string;
  ultimo_error_fecha: string | null;
};
const fila = (canal: CanalConexion) => base().prepare("select * from conexiones where canal = ?").get(canal) as Fila | undefined;

export function leerConexion(canal: CanalConexion): Conexion {
  const adaptador = adaptadores[canal];
  const f = fila(canal);
  const configFaltante = adaptador.configuracion();
  const identidad = f ? json<Identidad & { aviso?: string }>(f.identidad, { id: "", nombre: "" }) : null;
  let estado: EstadoConexion = f?.estado ?? (configFaltante.length ? "sin_configurar" : "requiere_oauth");
  if (configFaltante.length && !f?.token_cifrado) estado = "sin_configurar";
  if (f?.expira && Date.parse(f.expira) < Date.now() && estado !== "sin_configurar") estado = "vencida";
  return {
    canal,
    estado,
    identidad: identidad?.id || identidad?.nombre ? { id: identidad.id, nombre: identidad.nombre, tipo: identidad.tipo } : null,
    capacidades: f ? json(f.capacidades, []) : [],
    permisos: f ? json(f.permisos, []) : [],
    opciones: f ? json(f.opciones, []) : [],
    expira: f?.expira ?? null,
    verificado: f?.verificado ?? null,
    ultimoError: f?.ultimo_error ?? "",
    ultimoErrorFecha: f?.ultimo_error_fecha ?? null,
    configFaltante,
    redireccion: adaptador.oauth ? redireccion(canal) : null,
    aviso: identidad?.aviso ?? "",
  };
}
export const listarConexiones = () => canalesConexion.map(leerConexion);

function guardarVerificacion(canal: CanalConexion, v: Verificacion) {
  base()
    .prepare(
      `insert into conexiones (canal, estado, identidad, capacidades, permisos, opciones, token_cifrado, expira, verificado, ultimo_error, ultimo_error_fecha, actualizado)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, '', null, ?)
       on conflict (canal) do update set estado = excluded.estado, identidad = excluded.identidad, capacidades = excluded.capacidades,
       permisos = excluded.permisos, opciones = excluded.opciones, token_cifrado = excluded.token_cifrado, expira = excluded.expira,
       verificado = excluded.verificado, ultimo_error = '', actualizado = excluded.actualizado`,
    )
    .run(
      canal,
      v.estado,
      JSON.stringify({ ...v.identidad, aviso: v.aviso ?? "" }),
      JSON.stringify(v.capacidades),
      JSON.stringify(v.permisos),
      JSON.stringify(v.opciones ?? []),
      cifrar(v.secreto),
      v.expira ?? null,
      ahoraIso(),
      ahoraIso(),
    );
}
function registrarError(canal: CanalConexion, mensaje: string, estado?: EstadoConexion) {
  const ahora = ahoraIso();
  base()
    .prepare(
      `insert into conexiones (canal, estado, ultimo_error, ultimo_error_fecha, actualizado) values (?, ?, ?, ?, ?)
       on conflict (canal) do update set ultimo_error = excluded.ultimo_error, ultimo_error_fecha = excluded.ultimo_error_fecha,
       actualizado = excluded.actualizado${estado ? ", estado = excluded.estado" : ""}`,
    )
    .run(canal, estado ?? "verificacion_fallida", mensaje.slice(0, 500), ahora, ahora);
}
/** Guarda un token renovado: Supabase invalida el refresh token anterior al usarlo. */
export function guardarSecretoRenovado(canal: CanalConexion, secreto: Secreto) {
  base()
    .prepare("update conexiones set token_cifrado = ?, expira = ?, actualizado = ? where canal = ?")
    .run(cifrar(secreto), secreto.expiraAcceso ?? null, ahoraIso(), canal);
}
export function secretoDe(canal: CanalConexion): Secreto {
  const f = fila(canal);
  if (!f?.token_cifrado) throw new WorkflowError("Esta cuenta no está conectada.", 409);
  return descifrar<Secreto>(f.token_cifrado);
}
function exigirConfiguracion(canal: CanalConexion) {
  const faltante = adaptadores[canal].configuracion();
  if (faltante.length)
    throw new WorkflowError(`Falta configuración local: ${faltante.join(", ")}. Revisa la guía de Conexiones.`, 503);
}

/** El estado OAuth es de un solo uso, caduca en 10 minutos y queda ligado a la sesión que lo pidió. */
export function iniciarOAuth(canal: CanalConexion, usuario: string, metricas = false) {
  const adaptador = adaptadores[canal];
  if (!adaptador.oauth || !adaptador.urlAutorizacion) throw new WorkflowError("Este canal no usa autorización externa.", 422);
  exigirConfiguracion(canal);
  const estado = randomBytes(32).toString("base64url");
  const ahora = Date.now();
  transaccion((db) => {
    db.prepare("delete from estados_oauth where expira < ?").run(new Date(ahora).toISOString());
    db.prepare("insert into estados_oauth (estado, canal, usuario, creado, expira) values (?, ?, ?, ?, ?)").run(
      estado,
      canal,
      usuario,
      new Date(ahora).toISOString(),
      new Date(ahora + 10 * 60000).toISOString(),
    );
  });
  auditar("conexion.oauth_inicio", canal);
  return adaptador.urlAutorizacion(estado, canal === "youtube" && metricas);
}
export async function completarOAuth(
  canal: CanalConexion,
  datos: { estado: string | null; codigo: string | null; error: string | null; usuario: string },
) {
  const registro = transaccion((db) => {
    const r = datos.estado
      ? (db.prepare("select * from estados_oauth where estado = ?").get(datos.estado) as { canal: string; usuario: string; expira: string } | undefined)
      : undefined;
    if (datos.estado) db.prepare("delete from estados_oauth where estado = ?").run(datos.estado);
    return r;
  });
  if (!registro || registro.canal !== canal || registro.usuario !== datos.usuario || Date.parse(registro.expira) < Date.now()) {
    registrarError(canal, "La respuesta de autorización no coincide con una solicitud vigente de esta sesión. No se guardó nada.");
    throw new WorkflowError("La autorización no es válida o venció. Vuelve a intentarlo desde Conexiones.", 400);
  }
  if (datos.error || !datos.codigo) {
    registrarError(canal, datos.error === "access_denied" ? "Cancelaste o negaste el permiso en la plataforma." : `La plataforma devolvió: ${(datos.error ?? "sin código").slice(0, 120)}.`);
    throw new WorkflowError("La plataforma no concedió la autorización.", 403);
  }
  exigirConfiguracion(canal);
  try {
    const verificacion = await adaptadores[canal].canjear!(datos.codigo, solicitar);
    guardarVerificacion(canal, verificacion);
    auditar("conexion.conectar", canal, { cuenta: verificacion.identidad.id, permisos: verificacion.permisos });
    return leerConexion(canal);
  } catch (error) {
    registrarError(canal, error instanceof Error ? error.message : "No se pudo completar la conexión.");
    throw error;
  }
}
/** Spotmi web usa la cuenta editorial configurada en el servidor, nunca la sesión de Clerk. */
export async function conectarDirecto(canal: CanalConexion) {
  const adaptador = adaptadores[canal];
  if (adaptador.oauth) throw new WorkflowError("Este canal se conecta con autorización externa.", 422);
  exigirConfiguracion(canal);
  try {
    const v = await adaptador.canjear!("", solicitar);
    guardarVerificacion(canal, v);
    auditar("conexion.conectar", canal, { cuenta: v.identidad.id });
    return leerConexion(canal);
  } catch (error) {
    registrarError(canal, error instanceof Error ? error.message : "No se pudo conectar.");
    throw error;
  }
}
export async function verificarConexion(canal: CanalConexion) {
  const f = fila(canal);
  if (!f?.token_cifrado) throw new WorkflowError("Conecta la cuenta antes de verificarla.", 409);
  try {
    const v = await adaptadores[canal].verificar(descifrar<Secreto>(f.token_cifrado), solicitar);
    guardarVerificacion(canal, v);
    auditar("conexion.verificar", canal, { estado: v.estado });
    return leerConexion(canal);
  } catch (error) {
    const vencido = error instanceof ErrorProveedor && error.tipo === "vencido";
    registrarError(canal, error instanceof Error ? error.message : "Falló la verificación.", vencido ? "vencida" : "verificacion_fallida");
    throw error;
  }
}
export async function seleccionarPagina(paginaId: string) {
  const secreto = secretoDe("facebook");
  if (!secreto.paginas?.[paginaId]) throw new WorkflowError("Esa Página no está entre las que administras.", 422);
  const v = await adaptadores.facebook.verificar({ ...secreto, paginaId }, solicitar);
  guardarVerificacion("facebook", v);
  auditar("conexion.pagina", "facebook", { pagina: paginaId });
  return leerConexion("facebook");
}
export async function desconectar(canal: CanalConexion) {
  const f = fila(canal);
  let aviso = "";
  if (f?.token_cifrado) {
    try {
      await adaptadores[canal].revocar(descifrar<Secreto>(f.token_cifrado), solicitar);
    } catch {
      aviso = "No se pudo confirmar la revocación en la plataforma; quita el acceso también desde su configuración.";
    }
  }
  transaccion((db) => {
    db.prepare("delete from conexiones where canal = ?").run(canal);
    // Una cuenta desconectada no puede recibir envíos pendientes.
    db.prepare("update autorizaciones set estado = 'revocada', motivo = 'Cuenta desconectada.' where estado = 'vigente' and destinos like ?").run(`%"canal":"${canal}"%`);
  });
  if (aviso) registrarError(canal, aviso, "requiere_oauth");
  auditar("conexion.desconectar", canal);
  return { conexion: leerConexion(canal), aviso };
}
export const capacidadRequerida = (canal: CanalConexion) => adaptadores[canal].capacidadPublicar;
export const guiaRedireccion = () => baseRedireccion();
