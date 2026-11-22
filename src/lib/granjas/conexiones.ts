import { randomBytes, randomUUID } from "node:crypto";
import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json, transaccion } from "./db";
import { cifrar, descifrar } from "./cripto";
import { ESPACIO_SPOTMI, type Equipo } from "../equipo/modelo";
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

/**
 * Conexiones con las redes. Puede haber varias cuentas por red, en dos niveles:
 * - compartidas del espacio Spotmi: las ven y usan el propietario y los socios; solo el propietario
 *   las conecta, reconecta o desconecta;
 * - personales: solo las ve y usa quien las conectó (ni siquiera el propietario ve las de otros).
 * Los tokens viven cifrados en la base y nunca salen del servidor: ninguna vista los incluye.
 * Los servicios de fondo de Spotmi (lectura de redes, imagen original, propuestas a Spotmi web) usan la
 * cuenta compartida principal de cada red (`leerConexion(canal)`, `secretoDe(canal)`).
 */
export const canalesConexion: CanalConexion[] = ["instagram", "facebook", "tiktok", "youtube", "spotmi"];
export type Alcance = "compartida" | "personal";
const globales = globalThis as typeof globalThis & { ezraSolicitar?: Solicitar };
/** Las pruebas sustituyen la red; en uso normal es fetch. */
export const solicitar: Solicitar = (url, init) => (globales.ezraSolicitar ?? fetch)(url, init);
export function usarRedDePrueba(funcion: Solicitar | undefined) {
  globales.ezraSolicitar = funcion;
}

export type Conexion = {
  /** null: todavía no hay ninguna cuenta compartida de esta red (tarjeta vacía). */
  id: string | null;
  canal: CanalConexion;
  alcance: Alcance;
  /** Esta sesión conectó la cuenta (personal propia). Lo calcula `listarConexiones`. */
  propia: boolean;
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
  id: string;
  espacio_id: string;
  canal: CanalConexion;
  alcance: Alcance;
  dueno_id: string | null;
  conectado_por: string | null;
  cuenta_id: string;
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
  creado: string;
};
const esCanal = (v: string): v is CanalConexion => (canalesConexion as string[]).includes(v);
const filaId = (id: string) =>
  base().prepare("select * from conexiones where id = ? and espacio_id = ?").get(id, ESPACIO_SPOTMI) as Fila | undefined;
/** La cuenta compartida principal de una red: la primera que se conectó (con token, si hay). */
const compartidaDe = (canal: CanalConexion) =>
  base()
    .prepare(
      "select * from conexiones where espacio_id = ? and canal = ? and alcance = 'compartida' order by token_cifrado is null, creado limit 1",
    )
    .get(ESPACIO_SPOTMI, canal) as Fila | undefined;
const ambito = (alcance: Alcance, miembroId: string | null) => (alcance === "compartida" ? "compartida" : `miembro:${miembroId}`);
const errorOAuth = (amb: string, canal: CanalConexion) =>
  base().prepare("select mensaje, fecha from oauth_errores where ambito = ? and canal = ?").get(amb, canal) as
    | { mensaje: string; fecha: string }
    | undefined;

function vista(canal: CanalConexion, f: Fila | undefined, propia = false, amb = "compartida"): Conexion {
  const adaptador = adaptadores[canal];
  const configFaltante = adaptador.configuracion();
  const identidad = f ? json<Identidad & { aviso?: string }>(f.identidad, { id: "", nombre: "" }) : null;
  let estado: EstadoConexion = f?.estado ?? (configFaltante.length ? "sin_configurar" : "requiere_oauth");
  if (configFaltante.length && !f?.token_cifrado) estado = "sin_configurar";
  if (f?.expira && Date.parse(f.expira) < Date.now() && estado !== "sin_configurar") estado = "vencida";
  // El último error al autorizar (que pudo no crear ninguna cuenta) se muestra si es más reciente.
  const oauthCrudo = errorOAuth(f ? ambito(f.alcance, f.dueno_id) : amb, canal);
  const oauth =
    oauthCrudo && (!f?.ultimo_error_fecha || oauthCrudo.fecha > f.ultimo_error_fecha) ? oauthCrudo : undefined;
  let redir: string | null = null;
  try {
    redir = adaptador.oauth ? redireccion(canal) : null;
  } catch {
    redir = null;
  }
  return {
    id: f?.id ?? null,
    canal,
    alcance: f?.alcance ?? "compartida",
    propia,
    estado,
    identidad: identidad?.id || identidad?.nombre ? { id: identidad.id, nombre: identidad.nombre, tipo: identidad.tipo } : null,
    capacidades: f ? json(f.capacidades, []) : [],
    permisos: f ? json(f.permisos, []) : [],
    opciones: f ? json(f.opciones, []) : [],
    expira: f?.expira ?? null,
    verificado: f?.verificado ?? null,
    ultimoError: oauth?.mensaje ?? f?.ultimo_error ?? "",
    ultimoErrorFecha: oauth?.fecha ?? f?.ultimo_error_fecha ?? null,
    configFaltante,
    redireccion: redir,
    aviso: identidad?.aviso ?? "",
  };
}

/** Cuenta compartida principal de la red (o una tarjeta vacía). Para los servicios de fondo de Spotmi. */
export function leerConexion(canal: CanalConexion): Conexion {
  return vista(canal, compartidaDe(canal));
}
/** Una conexión por id, sin comprobar acceso: solo para el trabajador y funciones internas. */
export function leerConexionId(id: string): Conexion {
  const f = filaId(id);
  if (!f) throw new WorkflowError("Esa cuenta ya no está conectada.", 404);
  return vista(f.canal, f);
}
export const canalDe = (id: string) => filaId(id)?.canal ?? null;

/** Filas que esta sesión puede ver: compartidas (propietario y socios) y sus personales. */
function filasVisibles(equipo: Equipo): Fila[] {
  return base()
    .prepare(
      `select * from conexiones where espacio_id = ? and (
         (alcance = 'compartida' and ? <> 'invitado') or (alcance = 'personal' and dueno_id = ?)
       ) order by canal, alcance, creado`,
    )
    .all(ESPACIO_SPOTMI, equipo.rol, equipo.miembroId) as Fila[];
}
export function listarConexiones(equipo: Equipo): Conexion[] {
  return filasVisibles(equipo).map((f) => vista(f.canal, f, f.alcance === "personal" && f.dueno_id === equipo.miembroId));
}
/** Estado de cada red para esta sesión: configuración, OAuth y el último error al conectar. */
export function estadoCanales(equipo: Equipo) {
  return canalesConexion.map((canal) => {
    const vacia = vista(canal, undefined, false, ambito("personal", equipo.miembroId));
    const compartida = equipo.rol === "invitado" ? undefined : errorOAuth("compartida", canal);
    return {
      canal,
      oauth: adaptadores[canal].oauth,
      configFaltante: vacia.configFaltante,
      redireccion: vacia.redireccion,
      errorPersonal: vacia.ultimoError,
      errorCompartida: compartida?.mensaje ?? "",
      puedeCompartida: equipo.rol === "propietario",
      puedePersonal: canal !== "spotmi",
    };
  });
}
/** Resumen por red (Inicio y guía): el mejor estado entre las cuentas visibles. */
export function resumenCanales(equipo: Equipo) {
  const visibles = listarConexiones(equipo);
  const orden: EstadoConexion[] = ["conectada_publicacion", "restringida", "conectada_lectura", "vencida", "verificacion_fallida", "requiere_oauth", "sin_configurar"];
  return canalesConexion.map((canal) => {
    const propias = visibles.filter((c) => c.canal === canal);
    const mejor = [...propias].sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado))[0] ?? vista(canal, undefined);
    return { ...mejor, canal, cuentas: propias.length };
  });
}

/**
 * Acceso a una conexión por id para esta sesión. Una cuenta personal ajena responde igual que una que no
 * existe (404): no se revela ni su existencia. `administrar` (reconectar, desconectar, elegir Página)
 * exige además ser el propietario para las compartidas o el dueño para las personales.
 */
export function conexionDe(id: string, equipo: Equipo, uso: "usar" | "administrar" = "usar"): Conexion {
  const f = filaId(id);
  const visible =
    f && ((f.alcance === "compartida" && equipo.rol !== "invitado") || (f.alcance === "personal" && f.dueno_id === equipo.miembroId));
  if (!f || !visible) throw new WorkflowError("Esa cuenta no está conectada o no tienes acceso.", 404);
  if (uso === "administrar" && f.alcance === "compartida" && equipo.rol !== "propietario")
    throw new WorkflowError("Solo el propietario administra las cuentas compartidas de Spotmi.", 403);
  return vista(f.canal, f, f.alcance === "personal");
}

/** Id de la conexión: acepta un id o el nombre de una red (= su cuenta compartida principal). */
function resolver(ref: string): Fila | undefined {
  return esCanal(ref) ? compartidaDe(ref) : filaId(ref);
}

function guardarVerificacion(
  canal: CanalConexion,
  v: Verificacion,
  destino: { alcance: Alcance; miembroId: string | null; por: string | null; id?: string },
): string {
  return transaccion((db) => {
    const ahora = ahoraIso();
    const cuentaId = v.identidad.id ?? "";
    // La misma cuenta en el mismo nivel y del mismo dueño se actualiza (reconectar); otra cuenta, fila nueva.
    const existente = (
      destino.id
        ? db.prepare("select id from conexiones where id = ?").get(destino.id)
        : db
            .prepare(
              "select id from conexiones where espacio_id = ? and canal = ? and alcance = ? and coalesce(dueno_id, '') = ? and cuenta_id = ?",
            )
            .get(ESPACIO_SPOTMI, canal, destino.alcance, destino.miembroId ?? "", cuentaId)
    ) as { id: string } | undefined;
    const valores = [
      v.estado,
      JSON.stringify({ ...v.identidad, aviso: v.aviso ?? "" }),
      JSON.stringify(v.capacidades),
      JSON.stringify(v.permisos),
      JSON.stringify(v.opciones ?? []),
      cifrar(v.secreto),
      v.expira ?? null,
      ahora,
    ];
    if (existente) {
      const choque = db
        .prepare(
          "select id from conexiones where id <> ? and espacio_id = ? and canal = ? and alcance = ? and coalesce(dueno_id, '') = ? and cuenta_id = ?",
        )
        .get(existente.id, ESPACIO_SPOTMI, canal, destino.alcance, destino.miembroId ?? "", cuentaId) as { id: string } | undefined;
      if (choque) throw new WorkflowError("Esa cuenta ya está conectada en otra tarjeta.", 409);
      db.prepare(
        `update conexiones set cuenta_id = ?, estado = ?, identidad = ?, capacidades = ?, permisos = ?, opciones = ?, token_cifrado = ?, expira = ?,
         verificado = ?, ultimo_error = '', ultimo_error_fecha = null, actualizado = ? where id = ?`,
      ).run(cuentaId, ...valores, ahora, existente.id);
      return existente.id;
    }
    const id = randomUUID();
    db.prepare(
      `insert into conexiones (id, espacio_id, canal, alcance, dueno_id, conectado_por, cuenta_id, estado, identidad, capacidades, permisos, opciones,
       token_cifrado, expira, verificado, ultimo_error, ultimo_error_fecha, creado, actualizado)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', null, ?, ?)`,
    ).run(
      id,
      ESPACIO_SPOTMI,
      canal,
      destino.alcance,
      destino.alcance === "personal" ? destino.miembroId : null,
      destino.por,
      cuentaId,
      ...valores,
      ahora,
      ahora,
    );
    db.prepare("delete from oauth_errores where ambito = ? and canal = ?").run(ambito(destino.alcance, destino.miembroId), canal);
    return id;
  });
}
function registrarError(f: Fila, mensaje: string, estado?: EstadoConexion) {
  const ahora = ahoraIso();
  base()
    .prepare(`update conexiones set ultimo_error = ?, ultimo_error_fecha = ?, actualizado = ?${estado ? ", estado = ?" : ""} where id = ?`)
    .run(...([mensaje.slice(0, 500), ahora, ahora, ...(estado ? [estado] : []), f.id] as string[]));
}
function registrarErrorOAuth(amb: string, canal: CanalConexion, mensaje: string) {
  base()
    .prepare(
      `insert into oauth_errores (ambito, canal, mensaje, fecha) values (?, ?, ?, ?)
       on conflict (ambito, canal) do update set mensaje = excluded.mensaje, fecha = excluded.fecha`,
    )
    .run(amb, canal, mensaje.slice(0, 500), ahoraIso());
}
/** Guarda un token renovado (Supabase y Google pueden cambiarlo al usarlo). Acepta id o red (compartida). */
export function guardarSecretoRenovado(ref: string, secreto: Secreto) {
  const f = resolver(ref);
  if (!f) return;
  base()
    .prepare("update conexiones set token_cifrado = ?, expira = ?, actualizado = ? where id = ?")
    .run(cifrar(secreto), secreto.expiraAcceso ?? null, ahoraIso(), f.id);
}
/** Secreto descifrado. Solo para adaptadores del servidor; nunca se envía al navegador. Acepta id o red. */
export function secretoDe(ref: string): Secreto {
  const f = resolver(ref);
  if (!f?.token_cifrado) throw new WorkflowError("Esta cuenta no está conectada.", 409);
  return descifrar<Secreto>(f.token_cifrado);
}
function exigirConfiguracion(canal: CanalConexion) {
  const faltante = adaptadores[canal].configuracion();
  if (faltante.length)
    throw new WorkflowError(`Falta configuración local: ${faltante.join(", ")}. Revisa la guía de Conexiones.`, 503);
}

/**
 * Inicia el permiso en la plataforma. El estado es de un solo uso, caduca en 10 minutos y queda ligado a
 * la sesión de Clerk que lo pidió y al nivel elegido (compartida o personal de ese miembro).
 */
export function iniciarOAuth(
  canal: CanalConexion,
  usuario: string,
  metricas = false,
  destino: { alcance: Alcance; miembroId: string | null } = { alcance: "compartida", miembroId: null },
) {
  const adaptador = adaptadores[canal];
  if (!adaptador.oauth || !adaptador.urlAutorizacion) throw new WorkflowError("Este canal no usa autorización externa.", 422);
  if (destino.alcance === "personal" && !destino.miembroId) throw new WorkflowError("Falta el dueño de la cuenta personal.", 422);
  exigirConfiguracion(canal);
  const estado = randomBytes(32).toString("base64url");
  const ahora = Date.now();
  transaccion((db) => {
    db.prepare("delete from estados_oauth where expira < ?").run(new Date(ahora).toISOString());
    db.prepare("insert into estados_oauth (estado, canal, usuario, creado, expira, alcance, miembro_id) values (?, ?, ?, ?, ?, ?, ?)").run(
      estado,
      canal,
      usuario,
      new Date(ahora).toISOString(),
      new Date(ahora + 10 * 60000).toISOString(),
      destino.alcance,
      destino.miembroId,
    );
  });
  auditar("conexion.oauth_inicio", canal, { alcance: destino.alcance });
  return adaptador.urlAutorizacion(estado, canal === "youtube" && metricas);
}
export async function completarOAuth(
  canal: CanalConexion,
  datos: { estado: string | null; codigo: string | null; error: string | null; usuario: string },
): Promise<Conexion> {
  const registro = transaccion((db) => {
    const r = datos.estado
      ? (db.prepare("select * from estados_oauth where estado = ?").get(datos.estado) as
          | { canal: string; usuario: string; expira: string; alcance: Alcance; miembro_id: string | null }
          | undefined)
      : undefined;
    if (datos.estado) db.prepare("delete from estados_oauth where estado = ?").run(datos.estado);
    return r;
  });
  if (!registro || registro.canal !== canal || registro.usuario !== datos.usuario || Date.parse(registro.expira) < Date.now()) {
    // Sin un estado válido no se sabe de quién es el intento: el error no se guarda en ninguna cuenta.
    throw new WorkflowError("La autorización no es válida o venció. Vuelve a intentarlo desde Conexiones.", 400);
  }
  const amb = ambito(registro.alcance, registro.miembro_id);
  if (datos.error || !datos.codigo) {
    registrarErrorOAuth(
      amb,
      canal,
      datos.error === "access_denied" ? "Cancelaste o negaste el permiso en la plataforma." : `La plataforma devolvió: ${(datos.error ?? "sin código").slice(0, 120)}.`,
    );
    throw new WorkflowError("La plataforma no concedió la autorización.", 403);
  }
  exigirConfiguracion(canal);
  try {
    const verificacion = await adaptadores[canal].canjear!(datos.codigo, solicitar);
    const id = guardarVerificacion(canal, verificacion, {
      alcance: registro.alcance,
      miembroId: registro.miembro_id,
      por: registro.miembro_id,
    });
    auditar("conexion.conectar", canal, { conexion: id, alcance: registro.alcance, cuenta: verificacion.identidad.id, permisos: verificacion.permisos });
    return { ...leerConexionId(id), propia: registro.alcance === "personal" };
  } catch (error) {
    registrarErrorOAuth(amb, canal, error instanceof Error ? error.message : "No se pudo completar la conexión.");
    throw error;
  }
}
/** Spotmi web usa la cuenta editorial configurada en el servidor, nunca la sesión de Clerk. Siempre compartida. */
export async function conectarDirecto(canal: CanalConexion) {
  const adaptador = adaptadores[canal];
  if (adaptador.oauth) throw new WorkflowError("Este canal se conecta con autorización externa.", 422);
  exigirConfiguracion(canal);
  const actual = compartidaDe(canal);
  try {
    const v = await adaptador.canjear!("", solicitar);
    const id = guardarVerificacion(canal, v, { alcance: "compartida", miembroId: null, por: null, id: actual?.id });
    auditar("conexion.conectar", canal, { conexion: id, cuenta: v.identidad.id });
    return leerConexionId(id);
  } catch (error) {
    if (actual) registrarError(actual, error instanceof Error ? error.message : "No se pudo conectar.");
    else registrarErrorOAuth("compartida", canal, error instanceof Error ? error.message : "No se pudo conectar.");
    throw error;
  }
}
/** Vuelve a leer la cuenta con su token. Acepta id o red (compartida principal). */
export async function verificarConexion(ref: string) {
  const f = resolver(ref);
  if (!f?.token_cifrado) throw new WorkflowError("Conecta la cuenta antes de verificarla.", 409);
  try {
    const v = await adaptadores[f.canal].verificar(descifrar<Secreto>(f.token_cifrado), solicitar);
    guardarVerificacion(f.canal, v, { alcance: f.alcance, miembroId: f.dueno_id, por: f.conectado_por, id: f.id });
    auditar("conexion.verificar", f.canal, { conexion: f.id, estado: v.estado });
    return leerConexionId(f.id);
  } catch (error) {
    const vencido = error instanceof ErrorProveedor && error.tipo === "vencido";
    registrarError(f, error instanceof Error ? error.message : "Falló la verificación.", vencido ? "vencida" : "verificacion_fallida");
    throw error;
  }
}
/** Facebook: elige la Página de esta conexión. Acepta id o «facebook» (compartida principal). */
export async function seleccionarPagina(paginaId: string, ref = "facebook") {
  const f = resolver(ref);
  if (!f || f.canal !== "facebook") throw new WorkflowError("Esa conexión no es de Facebook.", 422);
  const secreto = secretoDe(f.id);
  if (!secreto.paginas?.[paginaId]) throw new WorkflowError("Esa Página no está entre las que administras.", 422);
  const v = await adaptadores.facebook.verificar({ ...secreto, paginaId }, solicitar);
  guardarVerificacion("facebook", v, { alcance: f.alcance, miembroId: f.dueno_id, por: f.conectado_por, id: f.id });
  auditar("conexion.pagina", "facebook", { conexion: f.id, pagina: paginaId });
  return leerConexionId(f.id);
}
/** Desconecta una cuenta (revoca en la plataforma si se puede). Acepta id o red (compartida principal). */
export async function desconectar(ref: string) {
  const f = resolver(ref);
  const canal = f?.canal ?? (esCanal(ref) ? ref : null);
  if (!canal) throw new WorkflowError("Esa cuenta no está conectada.", 404);
  let aviso = "";
  if (f?.token_cifrado) {
    try {
      await adaptadores[canal].revocar(descifrar<Secreto>(f.token_cifrado), solicitar);
    } catch {
      aviso = "No se pudo confirmar la revocación en la plataforma; quita el acceso también desde su configuración.";
    }
  }
  if (f)
    transaccion((db) => {
      db.prepare("delete from conexiones where id = ?").run(f.id);
      // Una cuenta desconectada no puede recibir envíos pendientes.
      db.prepare(
        "update autorizaciones set estado = 'revocada', motivo = 'Cuenta desconectada.' where estado = 'vigente' and (destinos like ? or (destinos not like '%conexionId%' and destinos like ?))",
      ).run(`%"conexionId":"${f.id}"%`, `%"canal":"${canal}"%`);
    });
  // YouTube (Developer Policies III.D.2): al revocar no queda nada de la API. Las métricas solo viven en
  // memoria y se olvidan; del registro de envíos se borran el id del video y el enlace a YouTube Studio.
  if (canal === "youtube" && f) {
    (await import("./youtube-metricas")).olvidarMetricasYoutube(f.id);
    base()
      .prepare("update recibos set remoto_id = null, contenedor_id = null, enlace = null, actualizado = ? where canal = 'youtube' and (conexion_id = ? or conexion_id is null)")
      .run(new Date().toISOString(), f.id);
  }
  if (canal === "instagram" && f) base().prepare("delete from ajustes_estudio where clave = ?").run(`instagram_metricas:${f.id}`);
  if (aviso && f) registrarErrorOAuth(ambito(f.alcance, f.dueno_id), canal, aviso);
  auditar("conexion.desconectar", canal, { conexion: f?.id ?? null });
  return { conexion: f?.alcance === "compartida" || !f ? leerConexion(canal) : vista(canal, undefined), aviso };
}
/** Al quitarle el acceso a alguien, sus cuentas personales se desconectan (no quedan tokens huérfanos). */
export async function borrarConexionesPersonales(miembroId: string) {
  const filas = base()
    .prepare("select id from conexiones where espacio_id = ? and alcance = 'personal' and dueno_id = ?")
    .all(ESPACIO_SPOTMI, miembroId) as { id: string }[];
  const avisos: string[] = [];
  for (const { id } of filas) {
    const r = await desconectar(id);
    if (r.aviso) avisos.push(r.aviso);
  }
  base().prepare("delete from oauth_errores where ambito = ?").run(`miembro:${miembroId}`);
  return avisos.length
    ? "Algunas cuentas personales no confirmaron la revocación: pídele que quite el acceso desde cada red."
    : "";
}
export const capacidadRequerida = (canal: CanalConexion) => adaptadores[canal].capacidadPublicar;
export const guiaRedireccion = () => baseRedireccion();
