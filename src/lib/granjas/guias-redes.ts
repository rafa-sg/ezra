import type { Equipo } from "../equipo/modelo";
import {
  adaptadores,
  permisoYoutubeAnalytics,
  permisosFacebook,
  permisosInstagram,
  permisosYoutube,
  type CanalConexion,
} from "./adaptadores";
import { listarConexiones, type Conexion } from "./conexiones";

/**
 * Guía paso a paso para conectar cada red. Cada paso dice si ya está hecho según lo que Ezra puede
 * comprobar (variables configuradas, permisos concedidos, conexión verificada) o si te toca confirmarlo
 * en la consola de la red (Ezra no puede ver tu app de desarrollador ni su revisión).
 *
 * Enlaces comprobados el 21 nov 2026 en la documentación oficial (ver DECISIONS). Las consolas de
 * Google piden iniciar sesión; la de Meta solo se abre con sesión, por eso se enlaza su guía.
 */
export type EstadoPaso = "hecho" | "falta" | "confirmar";
export type Paso = { id: string; estado: EstadoPaso; enlaces: { url: string; etiqueta: string }[]; detalle?: string };
export type GuiaRed = { canal: CanalConexion; pasos: Paso[]; listo: boolean };

const META = {
  crearApp: "https://developers.facebook.com/docs/development/create-an-app",
  instagramLogin: "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login",
  publicarInstagram: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  paginas: "https://developers.facebook.com/docs/pages-api/getting-started",
  roles: "https://developers.facebook.com/docs/development/build-and-test/app-roles",
  niveles: "https://developers.facebook.com/docs/graph-api/overview/access-levels",
  revision: "https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review",
  permisos: "https://developers.facebook.com/docs/permissions",
};
const TIKTOK = {
  crearApp: "https://developers.tiktok.com/doc/getting-started-create-an-app",
  loginKit: "https://developers.tiktok.com/doc/login-kit-web",
  subir: "https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content",
  directo: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  sandbox: "https://developers.tiktok.com/doc/add-a-sandbox",
  revision: "https://developers.tiktok.com/doc/app-review-guidelines",
  reglas: "https://developers.tiktok.com/doc/content-sharing-guidelines",
};
const GOOGLE = {
  consentimiento: "https://console.cloud.google.com/auth/overview",
  clientes: "https://console.cloud.google.com/auth/clients",
  audiencia: "https://console.cloud.google.com/auth/audience",
  dataApi: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
  analyticsApi: "https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com",
  guiaOAuth: "https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps",
  ayudaAudiencia: "https://support.google.com/cloud/answer/15549945",
  verificacion: "https://support.google.com/cloud/answer/13463073",
  auditoria: "https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits",
  formulario: "https://support.google.com/youtube/contact/yt_api_form",
};

const hay = (...nombres: string[]) => nombres.every((n) => Boolean(process.env[n]?.trim()));
const estado = (ok: boolean, sinoConfirmar = false): EstadoPaso => (ok ? "hecho" : sinoConfirmar ? "confirmar" : "falta");
const enlace = (url: string, etiqueta: string) => ({ url, etiqueta });
const activas = (cuentas: Conexion[]) =>
  cuentas.filter((c) => ["conectada_publicacion", "conectada_lectura", "restringida"].includes(c.estado));
const conPermisos = (cuentas: Conexion[], permisos: string[]) =>
  activas(cuentas).some((c) => permisos.every((p) => c.permisos.includes(p)));

export function guiaRed(canal: CanalConexion, cuentas: Conexion[]): GuiaRed {
  const faltante = adaptadores[canal].configuracion();
  const sinHttps = faltante.some((f) => f.includes("https"));
  const tokenKey = !faltante.includes("EZRA_TOKEN_KEY");
  const conectada = activas(cuentas).length > 0;
  let pasos: Paso[];
  if (canal === "instagram")
    pasos = [
      { id: "app", estado: estado(hay("INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET")), enlaces: [enlace(META.crearApp, "gp_meta_crear")] },
      { id: "producto", estado: estado(!sinHttps && hay("INSTAGRAM_APP_ID")), enlaces: [enlace(META.instagramLogin, "gp_ig_login")] },
      { id: "clave", estado: estado(tokenKey), enlaces: [] },
      { id: "probadores", estado: estado(conectada, true), enlaces: [enlace(META.roles, "gp_meta_roles")] },
      {
        id: "permisos",
        estado: estado(conPermisos(cuentas, permisosInstagram)),
        enlaces: [enlace(META.publicarInstagram, "gp_ig_publicar")],
        detalle: permisosInstagram.join(", "),
      },
      { id: "revision", estado: "confirmar", enlaces: [enlace(META.niveles, "gp_meta_niveles"), enlace(META.revision, "gp_meta_revision")] },
    ];
  else if (canal === "facebook")
    pasos = [
      { id: "app", estado: estado(hay("META_APP_ID", "META_APP_SECRET")), enlaces: [enlace(META.crearApp, "gp_meta_crear")] },
      { id: "producto", estado: estado(hay("META_APP_ID")), enlaces: [enlace(META.paginas, "gp_fb_paginas")] },
      { id: "clave", estado: estado(tokenKey), enlaces: [] },
      { id: "probadores", estado: estado(conectada, true), enlaces: [enlace(META.roles, "gp_meta_roles")] },
      {
        id: "permisos",
        estado: estado(conPermisos(cuentas, permisosFacebook)),
        enlaces: [enlace(META.permisos, "gp_meta_permisos")],
        detalle: permisosFacebook.join(", "),
      },
      {
        id: "pagina",
        estado: estado(activas(cuentas).some((c) => Boolean(c.identidad?.id) && c.capacidades.includes("publicar"))),
        enlaces: [],
      },
      { id: "revision", estado: "confirmar", enlaces: [enlace(META.niveles, "gp_meta_niveles"), enlace(META.revision, "gp_meta_revision")] },
    ];
  else if (canal === "tiktok")
    pasos = [
      { id: "app", estado: estado(hay("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET")), enlaces: [enlace(TIKTOK.crearApp, "gp_tt_crear")] },
      { id: "login", estado: estado(!sinHttps && hay("TIKTOK_CLIENT_KEY")), enlaces: [enlace(TIKTOK.loginKit, "gp_tt_login")] },
      { id: "subir", estado: estado(conPermisos(cuentas, ["video.upload"]), true), enlaces: [enlace(TIKTOK.subir, "gp_tt_subir")] },
      { id: "clave", estado: estado(tokenKey), enlaces: [] },
      { id: "sandbox", estado: estado(conectada, true), enlaces: [enlace(TIKTOK.sandbox, "gp_tt_sandbox")] },
      {
        id: "permisos",
        estado: estado(conPermisos(cuentas, ["user.info.basic", "video.upload"])),
        enlaces: [],
        detalle: "user.info.basic, video.upload",
      },
      { id: "revision", estado: "confirmar", enlaces: [enlace(TIKTOK.revision, "gp_tt_revision"), enlace(TIKTOK.reglas, "gp_tt_reglas")] },
    ];
  else if (canal === "youtube")
    pasos = [
      { id: "consentimiento", estado: estado(hay("YOUTUBE_CLIENT_ID"), true), enlaces: [enlace(GOOGLE.consentimiento, "gp_g_consentimiento")] },
      {
        id: "credenciales",
        estado: estado(hay("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET")),
        enlaces: [enlace(GOOGLE.clientes, "gp_g_clientes"), enlace(GOOGLE.guiaOAuth, "gp_g_guia")],
      },
      { id: "clave", estado: estado(tokenKey), enlaces: [] },
      { id: "dataApi", estado: estado(conectada, true), enlaces: [enlace(GOOGLE.dataApi, "gp_g_dataApi")] },
      {
        id: "analyticsApi",
        estado: estado(conPermisos(cuentas, [permisoYoutubeAnalytics]), true),
        enlaces: [enlace(GOOGLE.analyticsApi, "gp_g_analyticsApi")],
      },
      { id: "probadores", estado: estado(conectada, true), enlaces: [enlace(GOOGLE.audiencia, "gp_g_audiencia"), enlace(GOOGLE.ayudaAudiencia, "gp_g_ayudaAudiencia")] },
      {
        id: "permisos",
        estado: estado(conPermisos(cuentas, permisosYoutube)),
        enlaces: [],
        detalle: permisosYoutube.map((p) => p.split("/").pop()).join(", "),
      },
      { id: "publicar", estado: "confirmar", enlaces: [enlace(GOOGLE.audiencia, "gp_g_audiencia"), enlace(GOOGLE.verificacion, "gp_g_verificacion")] },
      { id: "auditoria", estado: "confirmar", enlaces: [enlace(GOOGLE.auditoria, "gp_g_auditoria"), enlace(GOOGLE.formulario, "gp_g_formulario")] },
    ];
  else
    pasos = [
      {
        id: "variables",
        estado: estado(!faltante.some((f) => f.startsWith("SPOTMI_"))),
        enlaces: [],
        detalle: faltante.filter((f) => f.startsWith("SPOTMI_")).join(", "),
      },
      { id: "clave", estado: estado(tokenKey), enlaces: [] },
      { id: "migracion", estado: estado(conectada, true), enlaces: [] },
      { id: "conectar", estado: estado(conectada), enlaces: [] },
    ];
  return { canal, pasos, listo: pasos.every((p) => p.estado === "hecho") };
}

/** Guías de todas las redes con las cuentas que esta sesión puede ver (compartidas y propias). */
export function guiasRedes(equipo: Equipo): GuiaRed[] {
  const cuentas = listarConexiones(equipo);
  return (["instagram", "facebook", "tiktok", "youtube", "spotmi"] as const).map((canal) =>
    guiaRed(
      canal,
      cuentas.filter((c) => c.canal === canal),
    ),
  );
}
