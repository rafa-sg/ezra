"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import type { VideoViral } from "@/lib/produccion/modelo";
import { cifra, duracionTexto, urlVideo } from "@/lib/produccion/virales-texto";

type Tr = (c: string) => string;
const ordenes = ["vistas", "vistasDia", "interaccion"] as const;
type Orden = (typeof ordenes)[number];
const valor = (v: VideoViral, o: Orden) => (o === "interaccion" ? (v.interaccion ?? -1) : v[o]);

/**
 * Ranking de «Videos virales»: miniatura, enlace y métricas públicas, ordenable por vistas, vistas por
 * día (lo que está pegando ahora) o interacción (me gusta + comentarios por vista).
 */
export function RankingVirales({ videos, consultado, caduca, tr }: { videos: VideoViral[]; consultado: string; caduca: string; tr: Tr }) {
  const dia = (iso: string) => new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeStyle: "short", timeZone: "America/El_Salvador" }).format(new Date(iso));
  const [orden, setOrden] = useState<Orden>("vistas");
  const lista = useMemo(() => [...videos].sort((a, b) => valor(b, orden) - valor(a, orden)), [videos, orden]);
  return (
    <div className="ez-virales">
      <div className="ez-virales-orden" role="radiogroup" aria-label={tr("ez_virales_ordenar")}>
        {ordenes.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={orden === o} onClick={() => setOrden(o)}>
            {tr(`ez_virales_orden_${o}`)}
          </button>
        ))}
      </div>
      <ol className="ez-virales-lista">
        {lista.map((v, i) => (
          <li key={v.id}>
            <span className="ez-virales-puesto">{i + 1}</span>
            <a className="ez-virales-miniatura" href={urlVideo(v.id)} target="_blank" rel="noreferrer noopener" tabIndex={-1} aria-hidden="true">
              {v.miniatura ? <img src={v.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Play size={22} />}
              {v.duracion !== null && <small>{duracionTexto(v.duracion)}</small>}
            </a>
            <div className="ez-virales-texto">
              <a href={urlVideo(v.id)} target="_blank" rel="noreferrer noopener">
                <strong>{v.titulo}</strong> <ArrowUpRight size={12} aria-hidden="true" />
              </a>
              <span>
                {v.canal} · {v.publicado.slice(0, 10)}
              </span>
              <dl>
                <div className={orden === "vistas" ? "ez-virales-activo" : ""}>
                  <dt>{tr("ez_virales_orden_vistas")}</dt>
                  <dd>{cifra(v.vistas)}</dd>
                </div>
                <div className={orden === "vistasDia" ? "ez-virales-activo" : ""}>
                  <dt>{tr("ez_virales_orden_vistasDia")}</dt>
                  <dd>{cifra(v.vistasDia)}</dd>
                </div>
                <div className={orden === "interaccion" ? "ez-virales-activo" : ""}>
                  <dt>{tr("ez_virales_orden_interaccion")}</dt>
                  <dd>{v.interaccion === null ? "—" : `${(v.interaccion * 100).toFixed(1)} %`}</dd>
                </div>
                <div>
                  <dt>{tr("ez_virales_meGusta")}</dt>
                  <dd>{v.meGusta === null ? "—" : cifra(v.meGusta)}</dd>
                </div>
                <div>
                  <dt>{tr("ez_virales_comentarios")}</dt>
                  <dd>{v.comentarios === null ? "—" : cifra(v.comentarios)}</dd>
                </div>
              </dl>
            </div>
          </li>
        ))}
      </ol>
      <p className="ep-nota">{tr("ez_virales_derechos")}</p>
      <p className="ep-nota ez-virales-consulta">
        {tr("ez_virales_consultado").replace("{fecha}", dia(consultado))} {tr("ez_virales_caduca").replace("{fecha}", dia(caduca))}
      </p>
    </div>
  );
}
