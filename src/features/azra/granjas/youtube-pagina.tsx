"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Eye, Heart, MessageCircle, Play, RefreshCw } from "lucide-react";
import type { MetricasYoutube } from "@/lib/granjas/youtube-metricas";
import type { CuentaApp } from "../produccion/apps";
import { pedir } from "./cliente";
import "./instagram-pagina.css";
import "./youtube-pagina.css";

type Datos = MetricasYoutube & { desdeCache: boolean };
const periodos = [7, 28, 90] as const;
const diaMs = 86_400_000;
const horaFecha = (dia: string) => Date.parse(`${dia}T12:00:00Z`);

export function PaginaYoutube({
  cuenta,
  locale,
  fecha,
}: {
  cuenta: CuentaApp;
  locale: string;
  fecha: (iso: string) => string;
}) {
  const t = (es: string, en: string) => (locale === "es" ? es : en);
  const codigo = t("es-SV", "en-US");
  const numero = new Intl.NumberFormat(codigo, { maximumFractionDigits: 1 });
  const formato = (v: number | null | undefined) => (v == null ? "—" : numero.format(v));
  const fechaDia = (iso: string) =>
    new Intl.DateTimeFormat(codigo, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(horaFecha(iso));
  const [datos, setDatos] = useState<Datos | null>(null);
  const [dias, setDias] = useState<(typeof periodos)[number]>(28);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const recurso = `/api/granjas/youtube?${new URLSearchParams({ conexion: cuenta.conexionId })}`;
  const canal = datos?.canal;
  const registro = datos?.analitica;
  const hasta = registro?.dias.at(-1)?.fecha;
  const serie = hasta
    ? Array.from({ length: dias }, (_, i) => {
        const dia = new Date(horaFecha(hasta) - (dias - 1 - i) * diaMs).toISOString().slice(0, 10);
        return { dia, valor: registro.dias.find((fila) => fila.fecha === dia) };
      })
    : [];
  const total = (leer: (d: (typeof serie)[number]["valor"]) => number | null | undefined) => {
    const valores = serie.map(({ valor }) => leer(valor)).filter((v) => v != null);
    return valores.length ? valores.reduce((s, n) => s + n, 0) : null;
  };
  const minutos = total((d) => d?.minutos);
  const suscriptoresNetos = total((d) =>
    d?.ganados != null && d.perdidos != null ? d.ganados - d.perdidos : null,
  );
  const maxVistas = Math.max(1, ...serie.map(({ valor }) => valor?.vistas ?? 0));

  useEffect(() => {
    let vigente = true;
    pedir<Datos>(recurso)
      .then((d) => vigente && setDatos(d))
      .catch((e: Error) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [recurso]);

  async function actualizar() {
    setCargando(true);
    try {
      setDatos(await pedir<Datos>(`${recurso}&forzar=1`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  const totalesCanal = [
    [t("suscriptores", "subscribers"), canal?.suscriptores],
    [t("visualizaciones totales", "total views"), canal?.vistas],
    [t("videos públicos", "public videos"), canal?.videos],
  ] as const;
  return (
    <div className="ez-ig-pagina ez-perfil ez-youtube" aria-busy={cargando || (!datos && !error)}>
      <section className="ez-perfil-cabeza" aria-label={t("Perfil del canal", "Channel profile")}>
        <span className="ez-perfil-foto ez-app-yt" aria-hidden="true">
          {canal?.foto ? (
            <img src={canal.foto} alt="" width={112} height={112} referrerPolicy="no-referrer" />
          ) : (
            <Play size={23} fill="currentColor" />
          )}
        </span>
        <div className="ez-perfil-datos">
          <div className="ez-perfil-titulo">
            <h2>{canal?.nombre ?? cuenta.nombre}</h2>
            <button
              type="button"
              className="ez-boton-blanco"
              disabled={cargando || (!datos && !error)}
              onClick={() => void actualizar()}
            >
              <RefreshCw
                size={15}
                aria-hidden="true"
                className={cargando ? "eg-girando" : undefined}
              />{" "}
              {t("Actualizar", "Refresh")}
            </button>
          </div>
          <a
            className="ez-perfil-red ez-yt-enlace"
            href={`https://www.youtube.com/channel/${encodeURIComponent(cuenta.id)}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {canal?.usuario || t("Ver canal en YouTube", "Open YouTube channel")}{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          {canal?.descripcion && <p className="ez-perfil-desc">{canal.descripcion}</p>}
          {canal && (
            <dl className="ez-perfil-numeros">
              {totalesCanal.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{formato(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {datos && (
            <p className="ez-perfil-leido">
              {t("Última lectura", "Last read")} · {fecha(datos.leido)}
              {datos.desdeCache ? ` · ${t("Lectura guardada", "Cached reading")}` : ""}
            </p>
          )}
        </div>
      </section>
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
          {datos
            ? ` ${t("Se conserva la última lectura de esta sesión.", "The last reading from this session is still shown.")}`
            : ""}
        </p>
      )}
      {!datos && !error && (
        <p role="status">{t("Leyendo el canal de YouTube…", "Reading the YouTube channel…")}</p>
      )}
      {registro && (
        <section className="ez-ig-metricas" aria-labelledby="ez-yt-metricas">
          <div className="ez-tablero-cabecera">
            <h3 className="ez-ig-h3" id="ez-yt-metricas">
              {t("Métricas del canal", "Channel metrics")}
            </h3>
            {hasta && (
              <div className="ez-segmentado" role="group" aria-label={t("Período", "Date range")}>
                {periodos.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={dias === d}
                    onClick={() => setDias(d)}
                  >
                    {d} {t("días", "days")}
                  </button>
                ))}
              </div>
            )}
          </div>
          {registro.estado === "permiso" && (
            <div className="ez-tarjeta ez-yt-aviso">
              <p>
                {t(
                  "Autorizá YouTube Analytics para ver visualizaciones, horas de reproducción y suscriptores del período.",
                  "Authorize YouTube Analytics to see views, watch hours and subscribers by date range.",
                )}
              </p>
              <a className="ez-boton-blanco" href={`/api/granjas/conexiones/youtube/autorizar?metricas=1&alcance=${cuenta.alcance}`}>
                {t("Autorizar métricas", "Authorize metrics")}{" "}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
          )}
          {registro.estado === "api" && (
            <div className="ez-tarjeta ez-yt-aviso">
              <p>
                {t(
                  "Habilitá YouTube Analytics API en el mismo proyecto de Google Cloud y después tocá Actualizar.",
                  "Enable YouTube Analytics API in the same Google Cloud project, then click Refresh.",
                )}
              </p>
              <a
                className="ez-boton-blanco"
                href="https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com"
                target="_blank"
                rel="noreferrer noopener"
              >
                {t("Abrir Google Cloud", "Open Google Cloud")}{" "}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
          )}
          {registro.estado === "error" && (
            <p className="ez-vacio">
              {t(
                "YouTube Analytics no respondió. Podés reintentar con Actualizar.",
                "YouTube Analytics did not respond. Use Refresh to try again.",
              )}
            </p>
          )}
          {registro.estado === "ok" && !hasta && (
            <p className="ez-vacio">
              {t(
                "YouTube aún no ha devuelto actividad para este canal.",
                "YouTube has not returned activity for this channel yet.",
              )}
            </p>
          )}
          {hasta && (
            <>
              <p className="ez-perfil-leido">
                {fechaDia(serie[0].dia)} — {fechaDia(hasta)} ·{" "}
                {t("Datos procesados por YouTube", "Data processed by YouTube")}
              </p>
              <div className="ez-kpis">
                {[
                  [t("Visualizaciones", "Views"), total((d) => d?.vistas)],
                  [
                    t("Horas de visualización", "Watch hours"),
                    minutos == null ? null : minutos / 60,
                  ],
                  [t("Suscriptores netos", "Net subscribers"), suscriptoresNetos],
                ].map(([k, v]) => (
                  <div className="ez-kpi" key={k}>
                    <strong>{formato(v as number | null)}</strong>
                    <span>{k}</span>
                  </div>
                ))}
              </div>
              {serie.some(({ valor }) => valor?.vistas != null) && (
                <div className="ez-tarjeta ez-yt-grafica">
                  <h4>{t("Visualizaciones por día", "Daily views")}</h4>
                  <div className="ez-yt-barras" aria-hidden="true">
                    {serie.map(({ dia, valor }) => (
                      <span key={dia} title={`${fechaDia(dia)} · ${formato(valor?.vistas)}`}>
                        <span
                          style={{ height: `${((valor?.vistas ?? 0) / maxVistas) * 100}%` }}
                          data-cero={valor?.vistas === 0 || undefined}
                        />
                      </span>
                    ))}
                  </div>
                  <details>
                    <summary>{t("Ver datos diarios", "Show daily data")}</summary>
                    <dl className="ez-yt-dias">
                      {serie.map(({ dia, valor }) => (
                        <div key={dia}>
                          <dt>
                            <time dateTime={dia}>{fechaDia(dia)}</time>
                          </dt>
                          <dd>{formato(valor?.vistas)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {datos && (
        <section aria-labelledby="ez-yt-videos">
          <h3 className="ez-ig-h3" id="ez-yt-videos">
            {t("Videos recientes", "Recent videos")}
          </h3>
          {datos.recientes?.length ? (
            <ul className="ez-yt-videos">
              {datos.recientes.map((video) => (
                <li key={video.id}>
                  <a
                    className="ez-tarjeta"
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <span className="ez-yt-miniatura">
                      {video.foto ? (
                        <img src={video.foto} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <Play size={28} aria-hidden="true" />
                      )}
                    </span>
                    <span className="ez-yt-video-texto">
                      <strong>{video.titulo}</strong>
                      {video.fecha && <small>{fecha(video.fecha)}</small>}
                      <span className="ez-yt-video-metricas">
                        <span title={t("Visualizaciones", "Views")}>
                          <Eye size={14} aria-hidden="true" /> {formato(video.vistas)}
                        </span>
                        <span title={t("Me gusta", "Likes")}>
                          <Heart size={14} aria-hidden="true" /> {formato(video.meGusta)}
                        </span>
                        <span title={t("Comentarios", "Comments")}>
                          <MessageCircle size={14} aria-hidden="true" />{" "}
                          {formato(video.comentarios)}
                        </span>
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ez-vacio">
              {datos.recientes
                ? t(
                    "El canal todavía no tiene videos públicos.",
                    "This channel does not have any public videos yet.",
                  )
                : t(
                    "No se pudieron leer los videos recientes.",
                    "Recent videos could not be read.",
                  )}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
