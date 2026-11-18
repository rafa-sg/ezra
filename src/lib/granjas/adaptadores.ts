import { WorkflowError } from "../workflow";
import type { Medio } from "./medios";
import type { ContenidoPieza } from "./pieza";

/**
 * Adaptadores directos a las API oficiales. Cada uno distingue leer la identidad,
 * tener permiso y haber publicado de verdad. Nada aquí elige cuenta ni aprueba.
 */
export type CanalConexion = "instagram" | "facebook" | "tiktok" | "spotmi";
export type EstadoConexion =
  | "sin_configurar"
  | "requiere_oauth"
  | "conectada_lectura"
  | "conectada_publicacion"
  | "vencida"
  | "restringida"
  | "verificacion_fallida";
export type Capacidad =
  "leer_identidad" | "leer_catalogo" | "publicar" | "subir_borrador" | "proponer_borrador";
export type Identidad = { id: string; nombre: string; tipo?: string };
export type Secreto = {
  acceso: string;
  refresco?: string;
  expiraAcceso?: string;
  expiraRefresco?: string;
  usuario?: string;
  paginas?: Record<string, string>;
  paginaId?: string;
};
export type Verificacion = {
  estado: EstadoConexion;
  identidad: Identidad;
  permisos: string[];
  capacidades: Capacidad[];
  opciones?: { id: string; nombre: string; tareas: string[] }[];
  expira?: string | null;
  secreto: Secreto;
  aviso?: string;
};
export type EstadoRecibo =
  | "pendiente"
  | "enviando"
  | "procesando"
  | "publicado"
  | "borrador_subido"
  | "propuesta_enviada"
  | "fallido"
  | "desconocido"
  | "cancelado";
export type ResultadoEnvio = {
  estado: EstadoRecibo;
  remotoId?: string | null;
  contenedorId?: string | null;
  enlace?: string | null;
  error?: string;
};
export type Solicitar = (url: string, init?: RequestInit) => Promise<Response>;
export type Envio = {
  contenido: ContenidoPieza;
  medios: Medio[];
  bytes: (m: Medio) => Promise<Buffer>;
  secreto: Secreto;
  identidad: Identidad;
  clave: string;
};
export type Adaptador = {
  canal: CanalConexion;
  configuracion: () => string[];
  oauth: boolean;
  capacidadPublicar: Capacidad;
  urlAutorizacion?: (estado: string) => string;
  canjear?: (codigo: string, solicitar: Solicitar) => Promise<Verificacion>;
  verificar: (secreto: Secreto, solicitar: Solicitar) => Promise<Verificacion>;
  revocar: (secreto: Secreto, solicitar: Solicitar) => Promise<void>;
  validar: (contenido: ContenidoPieza, medios: Medio[]) => string[];
  plan: (contenido: ContenidoPieza, medios: Medio[], identidad: Identidad) => string[];
  publicar: (envio: Envio, solicitar: Solicitar) => Promise<ResultadoEnvio>;
  confirmar: (
    recibo: { remotoId: string | null; contenedorId: string | null },
    envio: Envio,
    solicitar: Solicitar,
  ) => Promise<ResultadoEnvio>;
};

export const versionGraph = () => process.env.META_GRAPH_VERSION?.trim() || "v26.0";
export const baseRedireccion = () =>
  (process.env.EZRA_OAUTH_REDIRECT_BASE?.trim() || "http://127.0.0.1:3000").replace(/\/$/, "");
export const redireccion = (canal: CanalConexion) => {
  const configurada =
    canal === "instagram"
      ? process.env.INSTAGRAM_REDIRECT_URI
      : canal === "facebook"
        ? process.env.META_REDIRECT_URI
        : undefined;
  if (configurada?.trim()) {
    const esperada = `https://spotmi.app.n8n.cloud/webhook/ezra-oauth-${canal}`;
    if (configurada.trim() !== esperada)
      throw new WorkflowError(
        "La dirección de retorno de Meta no coincide con el puente OAuth de n8n.",
        503,
      );
    return esperada;
  }
  return `${baseRedireccion()}/conexiones/${canal}/callback`;
};
const faltan = (...nombres: string[]) => nombres.filter((n) => !process.env[n]?.trim());
const exigeHttps = () =>
  redireccion("instagram").startsWith("https://")
    ? []
    : ["INSTAGRAM_REDIRECT_URI (https) o EZRA_OAUTH_REDIRECT_BASE (https)"];
const conTokenKey = (lista: string[]) => [...lista, ...faltan("EZRA_TOKEN_KEY")];

export class ErrorProveedor extends WorkflowError {
  constructor(
    mensaje: string,
    public tipo: "vencido" | "permiso" | "red" | "ambiguo" | "rechazo",
    status = 502,
  ) {
    super(mensaje, status);
  }
}
async function leerJson(solicitar: Solicitar, url: string, init: RequestInit = {}, tiempo = 30000) {
  let respuesta: Response;
  try {
    respuesta = await solicitar(url, {
      ...init,
      signal: AbortSignal.timeout(tiempo),
      redirect: "error",
    });
  } catch {
    throw new ErrorProveedor(
      "La red no respondió a tiempo. El resultado es desconocido.",
      "ambiguo",
      504,
    );
  }
  const texto = await respuesta.text();
  let datos: Record<string, unknown> = {};
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = {};
  }
  if (!respuesta.ok) {
    const error = (datos.error ?? {}) as {
      code?: number | string;
      message?: string;
      type?: string;
    };
    const codigo = Number(error.code);
    if (respuesta.status === 401 || codigo === 190 || error.code === "access_token_invalid")
      throw new ErrorProveedor(
        "El token venció o fue revocado. Vuelve a conectar la cuenta.",
        "vencido",
        401,
      );
    if (
      respuesta.status === 403 ||
      [10, 200, 230, 3, 100].includes(codigo) ||
      error.code === "scope_not_authorized"
    )
      throw new ErrorProveedor(
        `La plataforma negó el permiso: ${String(error.message ?? respuesta.status).slice(0, 200)}`,
        "permiso",
        403,
      );
    if (respuesta.status >= 500)
      throw new ErrorProveedor(
        "La plataforma falló temporalmente. El resultado es desconocido.",
        "ambiguo",
        502,
      );
    throw new ErrorProveedor(
      `La plataforma rechazó la solicitud: ${String(error.message ?? respuesta.status).slice(0, 200)}`,
      "rechazo",
      422,
    );
  }
  return datos;
}
const texto = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const lista = (v: unknown) =>
  (Array.isArray(v) ? v.map(texto) : texto(v).split(",")).map((s) => s.trim()).filter(Boolean);
const enSegundos = (s: unknown) =>
  Number(s) > 0 ? new Date(Date.now() + Number(s) * 1000).toISOString() : undefined;
const hashtags = (t: string) => (t.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
const textoDe = (c: ContenidoPieza, canal: CanalConexion) => (c.textos[canal] ?? "").trim();

/* ── Instagram (Instagram API con inicio de sesión de Instagram) ── */
const permisosInstagram = ["instagram_business_basic", "instagram_business_content_publish"];
const graphIg = () => `https://graph.instagram.com/${versionGraph()}`;
async function verificarInstagram(
  secreto: Secreto,
  solicitar: Solicitar,
  permisos: string[],
): Promise<Verificacion> {
  let actual = secreto;
  // Los tokens de larga duración se renuevan antes de vencer; un token de más de 24 h es renovable.
  if (actual.expiraAcceso && Date.parse(actual.expiraAcceso) - Date.now() < 7 * 86400000) {
    const r = await leerJson(
      solicitar,
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(actual.acceso)}`,
    );
    actual = { ...actual, acceso: texto(r.access_token), expiraAcceso: enSegundos(r.expires_in) };
  }
  const yo = await leerJson(
    solicitar,
    `${graphIg()}/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(actual.acceso)}`,
  );
  const identidad = {
    id: texto(yo.user_id),
    nombre: `@${texto(yo.username)}`,
    tipo: texto(yo.account_type),
  };
  const profesional = ["BUSINESS", "MEDIA_CREATOR"].includes(identidad.tipo);
  const publica = permisos.includes("instagram_business_content_publish");
  return {
    estado: !profesional ? "restringida" : publica ? "conectada_publicacion" : "conectada_lectura",
    identidad,
    permisos,
    capacidades: profesional && publica ? ["leer_identidad", "publicar"] : ["leer_identidad"],
    expira: actual.expiraAcceso ?? null,
    secreto: actual,
    aviso: !profesional
      ? "La cuenta no es profesional (empresa o creador). Instagram no permite publicar por API desde cuentas personales."
      : publica
        ? "Instagram descarga las imágenes desde un enlace público; desde esta Mac solo se envían videos (Reels) por subida directa."
        : "Falta el permiso instagram_business_content_publish.",
  };
}
async function confirmarContenedorIg(
  id: string,
  envio: Envio,
  solicitar: Solicitar,
): Promise<ResultadoEnvio> {
  const token = encodeURIComponent(envio.secreto.acceso);
  const estado = await leerJson(
    solicitar,
    `${graphIg()}/${id}?fields=status_code,status&access_token=${token}`,
  );
  const codigo = texto(estado.status_code);
  if (codigo === "IN_PROGRESS") return { estado: "procesando", contenedorId: id };
  if (codigo === "ERROR" || codigo === "EXPIRED")
    return {
      estado: "fallido",
      contenedorId: id,
      error: `Instagram no procesó el archivo (${codigo}).`,
    };
  if (codigo === "PUBLISHED") {
    // Ya publicado (por ejemplo, tras un corte): se busca la publicación en lugar de repetirla.
    const recientes = await leerJson(
      solicitar,
      `${graphIg()}/${envio.identidad.id}/media?fields=id,caption,permalink&limit=10&access_token=${token}`,
    );
    const encontrada = ((recientes.data as Record<string, unknown>[]) ?? []).find(
      (m) => texto(m.caption).trim() === textoDe(envio.contenido, "instagram"),
    );
    return encontrada
      ? {
          estado: "publicado",
          contenedorId: id,
          remotoId: texto(encontrada.id),
          enlace: texto(encontrada.permalink),
        }
      : {
          estado: "desconocido",
          contenedorId: id,
          error:
            "Instagram indica que el contenedor se publicó, pero no se encontró la publicación. Revísalo en la app.",
        };
  }
  if (codigo !== "FINISHED")
    return {
      estado: "desconocido",
      contenedorId: id,
      error: `Estado del contenedor no reconocido: ${codigo || "vacío"}.`,
    };
  const publicado = await leerJson(solicitar, `${graphIg()}/${envio.identidad.id}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: id, access_token: envio.secreto.acceso }),
  });
  const remotoId = texto(publicado.id);
  const datos = await leerJson(
    solicitar,
    `${graphIg()}/${remotoId}?fields=permalink&access_token=${token}`,
  );
  return {
    estado: "publicado",
    contenedorId: id,
    remotoId,
    enlace: texto(datos.permalink) || null,
  };
}
export const instagram: Adaptador = {
  canal: "instagram",
  oauth: true,
  capacidadPublicar: "publicar",
  configuracion: () =>
    conTokenKey([...faltan("INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"), ...exigeHttps()]),
  urlAutorizacion: (estado) =>
    `https://www.instagram.com/oauth/authorize?${new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      redirect_uri: redireccion("instagram"),
      response_type: "code",
      scope: permisosInstagram.join(","),
      state: estado,
    })}`,
  async canjear(codigo, solicitar) {
    const corto = await leerJson(solicitar, "https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.INSTAGRAM_APP_ID!,
        client_secret: process.env.INSTAGRAM_APP_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: redireccion("instagram"),
        code: codigo,
      }),
    });
    const permisos = lista(corto.permissions);
    const largo = await leerJson(
      solicitar,
      `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: process.env.INSTAGRAM_APP_SECRET!, access_token: texto(corto.access_token) })}`,
    );
    return verificarInstagram(
      {
        acceso: texto(largo.access_token),
        expiraAcceso: enSegundos(largo.expires_in),
        usuario: permisos.join(","),
      },
      solicitar,
      permisos,
    );
  },
  verificar: (secreto, solicitar) => verificarInstagram(secreto, solicitar, lista(secreto.usuario)),
  // Instagram no ofrece revocación por API con este inicio de sesión: se borra el token local y se indica quitar la app en Instagram.
  revocar: async () => {},
  validar(contenido, medios) {
    const problemas: string[] = [];
    const t = textoDe(contenido, "instagram");
    if (t.length > 2200) problemas.push("Instagram admite hasta 2200 caracteres.");
    if (hashtags(t) > 30) problemas.push("Instagram admite hasta 30 hashtags.");
    if (!medios.length) problemas.push("Instagram necesita una imagen o un video.");
    if (medios.length > 1)
      problemas.push(
        "Los carruseles de Instagram necesitan enlaces públicos de cada imagen; esta versión local no los envía.",
      );
    const [medio] = medios;
    if (medio && medio.mime.startsWith("image/"))
      problemas.push(
        "Instagram descarga las imágenes desde un enlace público y esta Mac no lo expone. Usa un video (Reels) o publica la imagen manualmente.",
      );
    if (medio && medio.mime === "video/webm")
      problemas.push("Instagram necesita MP4; usa el paso de render para convertirlo.");
    if (
      medio?.mime.startsWith("video/") &&
      medio.duracion &&
      (medio.duracion < 3 || medio.duracion > 900)
    )
      problemas.push("Los Reels deben durar entre 3 segundos y 15 minutos.");
    return problemas;
  },
  plan: (contenido, medios, identidad) => [
    `POST graph.instagram.com/${versionGraph()}/${identidad.id}/media · media_type=REELS, upload_type=resumable, caption de ${textoDe(contenido, "instagram").length} caracteres`,
    `POST rupload.facebook.com/ig-api-upload/${versionGraph()}/<contenedor> · ${medios[0]?.bytes ?? 0} bytes (${medios[0]?.sha256.slice(0, 12) ?? "sin archivo"})`,
    `GET <contenedor>?fields=status_code hasta FINISHED`,
    `POST ${identidad.id}/media_publish · creation_id=<contenedor> y lectura del enlace permanente`,
  ],
  async publicar(envio, solicitar) {
    const [medio] = envio.medios;
    if (!medio || !medio.mime.startsWith("video/"))
      throw new ErrorProveedor(
        "Instagram necesita un video MP4 para la subida directa desde esta Mac.",
        "rechazo",
        422,
      );
    const contenedor = await leerJson(solicitar, `${graphIg()}/${envio.identidad.id}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "REELS",
        upload_type: "resumable",
        caption: textoDe(envio.contenido, "instagram"),
        access_token: envio.secreto.acceso,
      }),
    });
    const id = texto(contenedor.id);
    const bytes = await envio.bytes(medio);
    await leerJson(
      solicitar,
      `https://rupload.facebook.com/ig-api-upload/${versionGraph()}/${id}`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${envio.secreto.acceso}`,
          offset: "0",
          file_size: String(bytes.length),
        },
        body: new Uint8Array(bytes),
      },
      300000,
    );
    return { estado: "procesando", contenedorId: id };
  },
  confirmar: (recibo, envio, solicitar) =>
    recibo.contenedorId
      ? confirmarContenedorIg(recibo.contenedorId, envio, solicitar)
      : Promise.resolve({ estado: "desconocido", error: "No hay contenedor que consultar." }),
};

/* ── Facebook (inicio de sesión de Facebook para Páginas) ── */
const permisosFacebook = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
const graphFb = () => `https://graph.facebook.com/${versionGraph()}`;
async function verificarFacebook(secreto: Secreto, solicitar: Solicitar): Promise<Verificacion> {
  const token = encodeURIComponent(secreto.acceso);
  const permisos = (
    ((await leerJson(solicitar, `${graphFb()}/me/permissions?access_token=${token}`)).data as {
      permission: string;
      status: string;
    }[]) ?? []
  )
    .filter((p) => p.status === "granted")
    .map((p) => p.permission);
  const cuentas =
    ((
      await leerJson(
        solicitar,
        `${graphFb()}/me/accounts?fields=id,name,tasks,access_token&limit=100&access_token=${token}`,
      )
    ).data as {
      id: string;
      name: string;
      tasks?: string[];
      access_token: string;
    }[]) ?? [];
  const opciones = cuentas.map((c) => ({ id: c.id, nombre: c.name, tareas: c.tasks ?? [] }));
  const paginas = Object.fromEntries(cuentas.map((c) => [c.id, c.access_token]));
  const elegida = secreto.paginaId ?? (cuentas.length === 1 ? cuentas[0].id : undefined);
  const pagina = opciones.find((o) => o.id === elegida);
  const puedePublicar = Boolean(
    pagina?.tareas.includes("CREATE_CONTENT") && permisos.includes("pages_manage_posts"),
  );
  return {
    estado: !pagina ? "conectada_lectura" : puedePublicar ? "conectada_publicacion" : "restringida",
    identidad: pagina
      ? { id: pagina.id, nombre: pagina.nombre, tipo: "Página" }
      : { id: "", nombre: "Elige una Página", tipo: "usuario" },
    permisos,
    capacidades: puedePublicar ? ["leer_identidad", "publicar"] : ["leer_identidad"],
    opciones,
    expira: null,
    secreto: { ...secreto, paginas, paginaId: pagina?.id },
    aviso: !opciones.length
      ? "Esta cuenta no administra ninguna Página. Publicar en un perfil personal no es publicar en una Página."
      : !pagina
        ? "Elige la Página de Spotmi en la que se publicará."
        : puedePublicar
          ? ""
          : "Tu rol en la Página no incluye crear contenido o falta pages_manage_posts.",
  };
}
async function postFacebook(envio: Envio, solicitar: Solicitar): Promise<ResultadoEnvio> {
  const paginaId = envio.identidad.id;
  const token = envio.secreto.paginas?.[paginaId];
  if (!token)
    throw new ErrorProveedor(
      "No hay token de la Página elegida. Vuelve a verificar la conexión.",
      "vencido",
      401,
    );
  const mensaje = textoDe(envio.contenido, "facebook");
  const [medio] = envio.medios;
  if (!medio) {
    const r = await leerJson(solicitar, `${graphFb()}/${paginaId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        message: mensaje,
        ...(envio.contenido.enlaces[0] ? { link: envio.contenido.enlaces[0] } : {}),
        access_token: token,
      }),
    });
    return { estado: "procesando", remotoId: texto(r.id) };
  }
  const formulario = new FormData();
  const bytes = await envio.bytes(medio);
  formulario.set("access_token", token);
  formulario.set("source", new Blob([new Uint8Array(bytes)], { type: medio.mime }), medio.archivo);
  if (medio.mime.startsWith("video/")) {
    formulario.set("description", mensaje);
    const r = await leerJson(
      solicitar,
      `https://graph-video.facebook.com/${versionGraph()}/${paginaId}/videos`,
      { method: "POST", body: formulario },
      300000,
    );
    return { estado: "procesando", remotoId: texto(r.id), contenedorId: "video" };
  }
  formulario.set("message", mensaje);
  const r = await leerJson(
    solicitar,
    `${graphFb()}/${paginaId}/photos`,
    { method: "POST", body: formulario },
    120000,
  );
  return { estado: "procesando", remotoId: texto(r.post_id || r.id) };
}
export const facebook: Adaptador = {
  canal: "facebook",
  oauth: true,
  capacidadPublicar: "publicar",
  configuracion: () => conTokenKey(faltan("META_APP_ID", "META_APP_SECRET")),
  urlAutorizacion: (estado) =>
    `https://www.facebook.com/${versionGraph()}/dialog/oauth?${new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      redirect_uri: redireccion("facebook"),
      response_type: "code",
      scope: permisosFacebook.join(","),
      state: estado,
    })}`,
  async canjear(codigo, solicitar) {
    const corto = await leerJson(
      solicitar,
      `${graphFb()}/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: redireccion("facebook"), code: codigo })}`,
    );
    const largo = await leerJson(
      solicitar,
      `${graphFb()}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, fb_exchange_token: texto(corto.access_token) })}`,
    );
    return verificarFacebook(
      { acceso: texto(largo.access_token), expiraAcceso: enSegundos(largo.expires_in) },
      solicitar,
    );
  },
  verificar: verificarFacebook,
  async revocar(secreto, solicitar) {
    await leerJson(
      solicitar,
      `${graphFb()}/me/permissions?access_token=${encodeURIComponent(secreto.acceso)}`,
      { method: "DELETE" },
    );
  },
  validar(contenido, medios) {
    const problemas: string[] = [];
    const t = textoDe(contenido, "facebook");
    if (!t && !medios.length) problemas.push("Facebook necesita texto o un archivo.");
    if (t.length > 63206) problemas.push("El texto de Facebook es demasiado largo.");
    if (medios.length > 1)
      problemas.push("Esta versión publica un solo archivo por publicación de Facebook.");
    return problemas;
  },
  plan: (contenido, medios, identidad) => [
    medios[0]
      ? `POST ${medios[0].mime.startsWith("video/") ? "graph-video" : "graph"}.facebook.com/${versionGraph()}/${identidad.id}/${medios[0].mime.startsWith("video/") ? "videos" : "photos"} · archivo ${medios[0].sha256.slice(0, 12)} y texto de ${textoDe(contenido, "facebook").length} caracteres`
      : `POST graph.facebook.com/${versionGraph()}/${identidad.id}/feed · texto de ${textoDe(contenido, "facebook").length} caracteres`,
    "GET <publicación>?fields=permalink_url para confirmar",
  ],
  publicar: postFacebook,
  async confirmar(recibo, envio, solicitar) {
    const token = envio.secreto.paginas?.[envio.identidad.id];
    if (!token) throw new ErrorProveedor("No hay token de la Página elegida.", "vencido", 401);
    if (!recibo.remotoId) {
      // Conciliación tras un corte: se busca el mismo texto en las publicaciones recientes.
      const recientes = await leerJson(
        solicitar,
        `${graphFb()}/${envio.identidad.id}/posts?fields=id,message,permalink_url&limit=10&access_token=${encodeURIComponent(token)}`,
      );
      const encontrada = ((recientes.data as Record<string, unknown>[]) ?? []).find(
        (p) => texto(p.message).trim() === textoDe(envio.contenido, "facebook"),
      );
      return encontrada
        ? {
            estado: "publicado",
            remotoId: texto(encontrada.id),
            enlace: texto(encontrada.permalink_url),
          }
        : {
            estado: "desconocido",
            error: "No se encontró la publicación. Revisa la Página antes de reintentar.",
          };
    }
    if (recibo.contenedorId === "video") {
      const v = await leerJson(
        solicitar,
        `${graphFb()}/${recibo.remotoId}?fields=status,permalink_url&access_token=${encodeURIComponent(token)}`,
      );
      const estado = texto((v.status as { video_status?: string } | undefined)?.video_status);
      if (estado === "ready")
        return {
          estado: "publicado",
          remotoId: recibo.remotoId,
          enlace: v.permalink_url ? `https://www.facebook.com${texto(v.permalink_url)}` : null,
        };
      if (estado === "error")
        return {
          estado: "fallido",
          remotoId: recibo.remotoId,
          error: "Facebook no pudo procesar el video.",
        };
      return { estado: "procesando", remotoId: recibo.remotoId, contenedorId: "video" };
    }
    const p = await leerJson(
      solicitar,
      `${graphFb()}/${recibo.remotoId}?fields=permalink_url,is_published&access_token=${encodeURIComponent(token)}`,
    );
    if (p.is_published === false) return { estado: "procesando", remotoId: recibo.remotoId };
    return {
      estado: "publicado",
      remotoId: recibo.remotoId,
      enlace: texto(p.permalink_url) || null,
    };
  },
};

/* ── TikTok: la publicación directa no aplica a herramientas internas; solo borradores ── */
const tiktokApi = "https://open.tiktokapis.com/v2";
async function renovarTiktok(secreto: Secreto, solicitar: Solicitar): Promise<Secreto> {
  if (!secreto.expiraAcceso || Date.parse(secreto.expiraAcceso) - Date.now() > 5 * 60000)
    return secreto;
  if (
    !secreto.refresco ||
    (secreto.expiraRefresco && Date.parse(secreto.expiraRefresco) < Date.now())
  )
    throw new ErrorProveedor(
      "La autorización de TikTok venció. Vuelve a conectar.",
      "vencido",
      401,
    );
  const r = await leerJson(solicitar, `${tiktokApi}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: secreto.refresco,
    }),
  });
  return {
    acceso: texto(r.access_token),
    refresco: texto(r.refresh_token) || secreto.refresco,
    expiraAcceso: enSegundos(r.expires_in),
    expiraRefresco: enSegundos(r.refresh_expires_in) ?? secreto.expiraRefresco,
    usuario: texto(r.scope) || secreto.usuario,
  };
}
async function verificarTiktok(secreto: Secreto, solicitar: Solicitar): Promise<Verificacion> {
  const actual = await renovarTiktok(secreto, solicitar);
  const r = await leerJson(solicitar, `${tiktokApi}/user/info/?fields=open_id,display_name`, {
    headers: { Authorization: `Bearer ${actual.acceso}` },
  });
  const usuario = ((r.data as { user?: Record<string, unknown> } | undefined)?.user ??
    {}) as Record<string, unknown>;
  const permisos = lista(actual.usuario);
  const borrador = permisos.includes("video.upload");
  return {
    estado: "restringida",
    identidad: {
      id: texto(usuario.open_id),
      nombre: texto(usuario.display_name) || "Cuenta de TikTok",
    },
    permisos,
    capacidades: borrador ? ["leer_identidad", "subir_borrador"] : ["leer_identidad"],
    expira: actual.expiraRefresco ?? null,
    secreto: actual,
    aviso: `Publicación directa bloqueada: TikTok no acepta herramientas internas para cuentas propias, y sin auditoría todo queda privado. ${borrador ? "Puedes subir borradores y terminarlos en la app." : "Falta el permiso video.upload para subir borradores."}`,
  };
}
export const tiktok: Adaptador = {
  canal: "tiktok",
  oauth: true,
  capacidadPublicar: "subir_borrador",
  configuracion: () =>
    conTokenKey([...faltan("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"), ...exigeHttps()]),
  urlAutorizacion: (estado) =>
    `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      scope: "user.info.basic,video.upload",
      response_type: "code",
      redirect_uri: redireccion("tiktok"),
      state: estado,
    })}`,
  async canjear(codigo, solicitar) {
    const r = await leerJson(solicitar, `${tiktokApi}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        code: codigo,
        grant_type: "authorization_code",
        redirect_uri: redireccion("tiktok"),
      }),
    });
    return verificarTiktok(
      {
        acceso: texto(r.access_token),
        refresco: texto(r.refresh_token),
        expiraAcceso: enSegundos(r.expires_in),
        expiraRefresco: enSegundos(r.refresh_expires_in),
        usuario: texto(r.scope),
      },
      solicitar,
    );
  },
  verificar: verificarTiktok,
  async revocar(secreto, solicitar) {
    await leerJson(solicitar, `${tiktokApi}/oauth/revoke/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        token: secreto.acceso,
      }),
    });
  },
  validar(_contenido, medios) {
    const problemas: string[] = [];
    if (medios.length !== 1 || !medios[0].mime.startsWith("video/"))
      problemas.push("TikTok necesita exactamente un video.");
    else if (medios[0].mime !== "video/mp4")
      problemas.push("TikTok necesita MP4; usa el paso de render.");
    return problemas;
  },
  plan: (_contenido, medios) => [
    `POST open.tiktokapis.com/v2/post/publish/inbox/video/init/ · FILE_UPLOAD de ${medios[0]?.bytes ?? 0} bytes`,
    "PUT <upload_url> por partes con Content-Range",
    "POST /v2/post/publish/status/fetch/ hasta SEND_TO_USER_INBOX (borrador, no publicación)",
    "La privacidad, música y divulgación comercial se eligen en la app de TikTok al terminar el borrador.",
  ],
  async publicar(envio, solicitar) {
    const secreto = await renovarTiktok(envio.secreto, solicitar);
    const [medio] = envio.medios;
    const bytes = await envio.bytes(medio);
    const MB = 1024 * 1024;
    const tamano = bytes.length < 5 * MB ? bytes.length : 10 * MB;
    const partes = Math.max(1, Math.floor(bytes.length / tamano));
    const inicio = await leerJson(solicitar, `${tiktokApi}/post/publish/inbox/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secreto.acceso}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        source_info: {
          source: "FILE_UPLOAD",
          video_size: bytes.length,
          chunk_size: tamano,
          total_chunk_count: partes,
        },
      }),
    });
    const datos = (inicio.data ?? {}) as { publish_id?: string; upload_url?: string };
    if (!datos.publish_id || !datos.upload_url)
      throw new ErrorProveedor("TikTok no devolvió la dirección de subida.", "rechazo", 502);
    for (let i = 0; i < partes; i++) {
      const desde = i * tamano;
      const hasta = i === partes - 1 ? bytes.length : desde + tamano;
      let r: Response;
      try {
        r = await solicitar(datos.upload_url, {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
            "Content-Range": `bytes ${desde}-${hasta - 1}/${bytes.length}`,
          },
          body: new Uint8Array(bytes.subarray(desde, hasta)),
          signal: AbortSignal.timeout(300000),
        });
      } catch {
        throw new ErrorProveedor(
          "La subida a TikTok se interrumpió. El resultado es desconocido.",
          "ambiguo",
          504,
        );
      }
      if (!r.ok && r.status !== 206)
        throw new ErrorProveedor(
          `TikTok rechazó una parte del video (${r.status}).`,
          "rechazo",
          422,
        );
    }
    return { estado: "procesando", remotoId: datos.publish_id };
  },
  async confirmar(recibo, envio, solicitar) {
    if (!recibo.remotoId)
      return {
        estado: "desconocido",
        error: "No hay identificador de TikTok que consultar. Revisa los borradores en la app.",
      };
    const secreto = await renovarTiktok(envio.secreto, solicitar);
    const r = await leerJson(solicitar, `${tiktokApi}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secreto.acceso}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: recibo.remotoId }),
    });
    const d = (r.data ?? {}) as { status?: string; fail_reason?: string };
    if (d.status === "SEND_TO_USER_INBOX")
      return { estado: "borrador_subido", remotoId: recibo.remotoId };
    if (d.status === "PUBLISH_COMPLETE") return { estado: "publicado", remotoId: recibo.remotoId };
    if (d.status === "FAILED")
      return {
        estado: "fallido",
        remotoId: recibo.remotoId,
        error: `TikTok: ${d.fail_reason || "falló el procesamiento"}.`,
      };
    return { estado: "procesando", remotoId: recibo.remotoId };
  },
};

/* ── Spotmi web: propuesta revisable por el equipo, nunca una ficha pública directa ── */
export const supabase = () => (process.env.SPOTMI_SUPABASE_URL?.trim() || "").replace(/\/$/, "");
export function clavePublicaSegura(clave: string) {
  if (clave.startsWith("sb_publishable_")) return true;
  try {
    const carga = JSON.parse(Buffer.from(clave.split(".")[1] ?? "", "base64url").toString("utf8"));
    return carga.role === "anon";
  } catch {
    return false;
  }
}
async function rpcSpotmi(solicitar: Solicitar, acceso: string, funcion: string, cuerpo: object) {
  return leerJson(solicitar, `${supabase()}/rest/v1/rpc/${funcion}`, {
    method: "POST",
    headers: {
      apikey: process.env.SPOTMI_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${acceso}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpo),
  });
}
/** Renueva la sesión editorial si vence en menos de un minuto (Supabase rota el refresh token). */
export async function sesionSpotmi(secreto: Secreto, solicitar: Solicitar): Promise<Secreto> {
  if (secreto.expiraAcceso && Date.parse(secreto.expiraAcceso) - Date.now() > 60000) return secreto;
  if (!secreto.refresco)
    throw new ErrorProveedor(
      "La sesión editorial de Spotmi venció. Vuelve a conectar.",
      "vencido",
      401,
    );
  const r = await leerJson(solicitar, `${supabase()}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: process.env.SPOTMI_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: secreto.refresco }),
  });
  return {
    acceso: texto(r.access_token),
    refresco: texto(r.refresh_token),
    expiraAcceso: enSegundos(r.expires_in),
  };
}
async function verificarSpotmi(secreto: Secreto, solicitar: Solicitar): Promise<Verificacion> {
  const actual = await sesionSpotmi(secreto, solicitar);
  let identidad: Record<string, unknown>;
  try {
    identidad = await rpcSpotmi(solicitar, actual.acceso, "ezra_identidad_editorial", {});
  } catch (error) {
    if (error instanceof ErrorProveedor && error.tipo === "rechazo")
      throw new ErrorProveedor(
        "Spotmi todavía no tiene la función de propuestas de Ezra (migración 20261103 sin aplicar).",
        "rechazo",
        422,
      );
    throw error;
  }
  const activo = identidad.activo === true;
  return {
    estado: activo ? "conectada_publicacion" : "restringida",
    identidad: {
      id: texto(identidad.usuario),
      nombre: texto(identidad.correo) || "Cuenta editorial",
      tipo: "propuestas",
    },
    permisos: activo ? ["ezra_proponer_evento"] : [],
    capacidades: activo ? ["leer_catalogo", "proponer_borrador"] : ["leer_catalogo"],
    expira: actual.expiraAcceso ?? null,
    secreto: actual,
    aviso: activo
      ? "Ezra crea propuestas pendientes. Solo el equipo de Spotmi puede publicarlas."
      : "La cuenta no está habilitada como cliente editorial en Spotmi.",
  };
}
export const spotmi: Adaptador = {
  canal: "spotmi",
  oauth: false,
  capacidadPublicar: "proponer_borrador",
  configuracion: () => {
    const lista = conTokenKey(
      faltan(
        "SPOTMI_SUPABASE_URL",
        "SPOTMI_SUPABASE_ANON_KEY",
        "SPOTMI_EDITORIAL_EMAIL",
        "SPOTMI_EDITORIAL_PASSWORD",
      ),
    );
    const clave = process.env.SPOTMI_SUPABASE_ANON_KEY?.trim();
    if (clave && !clavePublicaSegura(clave))
      lista.push("SPOTMI_SUPABASE_ANON_KEY (debe ser la clave pública anónima)");
    return lista;
  },
  async canjear(_codigo, solicitar) {
    const r = await leerJson(solicitar, `${supabase()}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: process.env.SPOTMI_SUPABASE_ANON_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: process.env.SPOTMI_EDITORIAL_EMAIL,
        password: process.env.SPOTMI_EDITORIAL_PASSWORD,
      }),
    });
    return verificarSpotmi(
      {
        acceso: texto(r.access_token),
        refresco: texto(r.refresh_token),
        expiraAcceso: enSegundos(r.expires_in),
      },
      solicitar,
    );
  },
  verificar: verificarSpotmi,
  async revocar(secreto, solicitar) {
    await leerJson(solicitar, `${supabase()}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: process.env.SPOTMI_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${secreto.acceso}`,
      },
    });
  },
  validar(contenido) {
    const s = contenido.spotmi;
    const problemas: string[] = [];
    if (!s.titulo.trim()) problemas.push("Spotmi necesita el nombre del evento.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.fecha))
      problemas.push("Spotmi necesita la fecha confirmada del evento (AAAA-MM-DD).");
    if (!s.lugar.trim()) problemas.push("Spotmi necesita el lugar.");
    if (!s.fuente) problemas.push("Spotmi necesita el enlace de la fuente original.");
    return problemas;
  },
  plan: (contenido) => [
    `POST ${supabase() || "<SPOTMI_SUPABASE_URL>"}/rest/v1/rpc/ezra_proponer_evento · «${contenido.spotmi.titulo}» ${contenido.spotmi.fecha}`,
    "Crea una propuesta pendiente en la bandeja del equipo. No crea una ficha pública ni la verifica.",
  ],
  async publicar(envio, solicitar) {
    const secreto = await sesionSpotmi(envio.secreto, solicitar);
    const s = envio.contenido.spotmi;
    const r = await rpcSpotmi(solicitar, secreto.acceso, "ezra_proponer_evento", {
      datos: {
        titulo: s.titulo,
        fecha: s.fecha,
        lugar: s.lugar,
        departamento: s.departamento,
        descripcion: textoDe(envio.contenido, "spotmi"),
      },
      fuente_url: s.fuente,
      clave: envio.clave,
    });
    return { estado: "propuesta_enviada", remotoId: texto(r.id) || texto(r) };
  },
  async confirmar(recibo, envio, solicitar) {
    if (!recibo.remotoId)
      return { estado: "desconocido", error: "No hay propuesta que consultar." };
    const secreto = await sesionSpotmi(envio.secreto, solicitar);
    const r = await rpcSpotmi(solicitar, secreto.acceso, "ezra_estado_propuesta", {
      propuesta: recibo.remotoId,
    });
    const estado = texto(r.estado ?? r);
    return {
      estado:
        estado === "approved"
          ? "publicado"
          : estado === "discarded" || estado === "duplicate"
            ? "fallido"
            : "propuesta_enviada",
      remotoId: recibo.remotoId,
      error: estado === "discarded" ? "El equipo de Spotmi descartó la propuesta." : undefined,
    };
  },
};

export const adaptadores: Record<CanalConexion, Adaptador> = {
  instagram,
  facebook,
  tiktok,
  spotmi,
};
