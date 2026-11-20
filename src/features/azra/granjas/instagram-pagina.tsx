"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Heart, MessageCircle, RefreshCw } from "lucide-react";
import type { MetricaCuenta, MetricasInstagram } from "@/lib/granjas/instagram-metricas";
import { pedir } from "./cliente";
import { ListaPosts } from "./posts";
import "./instagram-pagina.css";

type Tr = (clave: string) => string;
type Datos = MetricasInstagram & { desdeCache: boolean };
const numero = new Intl.NumberFormat("es-SV");
const tarjetas: MetricaCuenta[] = ["reach", "views", "accounts_engaged", "total_interactions"];
const interacciones: MetricaCuenta[] = ["likes", "comments", "shares", "saves"];

/**
 * Instagram: la cuenta conectada con sus números reales (API de Instagram, solo lectura), el feed
 * reciente y los posts que prepara Ezra para subir a mano.
 */
export function PaginaInstagram({ g, tr, fecha }: { g: Tr; tr: Tr; fecha: (iso: string) => string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [dias, setDias] = useState<7 | 30>(30);
  const cargar = useCallback(async (forzar = false) => {
    setCargando(true);
    try {
      setDatos(await pedir<Datos>(`/api/granjas/instagram${forzar ? "?forzar=1" : ""}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    let vivo = true;
    pedir<Datos>("/api/granjas/instagram")
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);
  const periodo = datos?.periodos.find((p) => p.dias === dias) ?? null;
  const maxInter = Math.max(1, ...interacciones.map((m) => periodo?.valores[m] ?? 0));
  return (
    <div className="ez-ig-pagina">
      <header className="ez-panorama-cabecera">
        <h2 className="ez-titulo-seccion">
          {tr("ez_igp_l1")} <em>{tr("ez_igp_l2")}</em>
        </h2>
        <p>{tr("ez_igp_sub")}</p>
      </header>
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
        </p>
      )}
      {!datos && !error && <p role="status">{g("cargando")}</p>}
      {datos && (
        <>
          {datos.avisos.length > 0 && (
            <ul className="ez-ig-avisos" role="status">
              {datos.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          {datos.cuenta ? (
            <section className="ez-tarjeta ez-ig-perfil ez-con-halo" aria-label={tr("ez_igp_cuenta")}>
              {datos.cuenta.foto ? <img src={datos.cuenta.foto} alt="" width={72} height={72} referrerPolicy="no-referrer" /> : <span className="ez-ig-foto-vacia" aria-hidden="true" />}
              <div className="ez-ig-perfil-texto">
                <strong>{datos.cuenta.usuario}</strong>
                <span>{datos.cuenta.nombre}</span>
                <small>
                  {tr("ez_igp_leido")} {fecha(datos.leido)}
                  {datos.desdeCache ? ` · ${tr("ez_igp_cache")}` : ""}
                </small>
              </div>
              <dl className="ez-ig-perfil-numeros">
                {(
                  [
                    ["seguidores", datos.cuenta.seguidores],
                    ["siguiendo", datos.cuenta.siguiendo],
                    ["publicaciones", datos.cuenta.publicaciones],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt>{tr(`ez_igp_${k}`)}</dt>
                    <dd>{v === null ? "—" : numero.format(v)}</dd>
                  </div>
                ))}
              </dl>
              <button className="ez-boton-blanco" disabled={cargando} onClick={() => void cargar(true)}>
                <RefreshCw size={15} className={cargando ? "eg-girando" : undefined} aria-hidden="true" />
                {tr("p_actualizar")}
              </button>
            </section>
          ) : (
            <section className="ez-tarjeta ez-ig-perfil">
              <p className="ez-vacio">{tr("ez_ig_conectarAyuda")}</p>
            </section>
          )}

          {datos.periodos.length > 0 && (
            <section className="ez-ig-metricas" aria-labelledby="ez-igp-metricas">
              <div className="ez-tablero-cabecera">
                <h3 id="ez-igp-metricas" className="ez-ig-h3">
                  {tr("ez_igp_metricas")}
                </h3>
                <div className="ez-segmentado" role="radiogroup" aria-label={tr("ez_igp_periodo")}>
                  {([7, 30] as const).map((d) => (
                    <button key={d} role="radio" aria-checked={dias === d} onClick={() => setDias(d)}>
                      {d} {tr("ez_igp_dias")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ez-kpis">
                {tarjetas.map((m) => (
                  <div key={m} className="ez-kpi">
                    <strong>{periodo?.valores[m] == null ? "—" : numero.format(periodo.valores[m]!)}</strong>
                    <span>{tr(`ez_igm_${m}`)}</span>
                    <small>{tr(`ez_igm_${m}_ayuda`)}</small>
                  </div>
                ))}
              </div>
              <div className="ez-tarjeta ez-ig-barras">
                <h4>{tr("ez_igp_interacciones")}</h4>
                <ul>
                  {interacciones.map((m) => {
                    const v = periodo?.valores[m];
                    return (
                      <li key={m}>
                        <span>{tr(`ez_igm_${m}`)}</span>
                        <span className="ez-barra" aria-hidden="true">
                          <span style={{ width: `${((v ?? 0) / maxInter) * 100}%` }} />
                        </span>
                        <strong>{v == null ? "—" : numero.format(v)}</strong>
                      </li>
                    );
                  })}
                </ul>
                {periodo && (periodo.valores.reach ?? 0) > 0 && (
                  <p className="ez-ig-insight">
                    <strong>{tr("ez_igp_dato")}</strong>{" "}
                    {tr("ez_igp_tasa")
                      .replace("{tasa}", (((periodo.valores.accounts_engaged ?? 0) / (periodo.valores.reach ?? 1)) * 100).toFixed(1))
                      .replace("{dias}", String(dias))}
                  </p>
                )}
              </div>
            </section>
          )}

          {datos.recientes.length > 0 && (
            <section aria-labelledby="ez-igp-feed">
              <h3 id="ez-igp-feed" className="ez-ig-h3">
                {tr("ez_igp_feed")}
              </h3>
              <ul className="ez-ig-feed">
                {datos.recientes.map((p) => (
                  <li key={p.id}>
                    <a href={p.enlace ?? undefined} target="_blank" rel="noreferrer noopener" aria-label={`${tr("ez_igp_verPost")}${p.fecha ? ` · ${fecha(p.fecha)}` : ""}`}>
                      {p.miniatura ? <img src={p.miniatura} alt={p.texto.slice(0, 120)} loading="lazy" referrerPolicy="no-referrer" /> : <span className="ez-ig-foto-vacia" />}
                      <span className="ez-ig-feed-pie">
                        <span>
                          <Heart size={13} aria-hidden="true" /> {p.meGusta ?? "—"}
                        </span>
                        <span>
                          <MessageCircle size={13} aria-hidden="true" /> {p.comentarios ?? "—"}
                        </span>
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <section aria-labelledby="ez-igp-ezra">
        <h3 id="ez-igp-ezra" className="ez-ig-h3">
          {tr("ez_igp_preparados")}
        </h3>
        <ListaPosts g={g} fecha={fecha} />
      </section>
    </div>
  );
}
