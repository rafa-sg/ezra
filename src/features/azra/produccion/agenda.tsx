"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import type { Agenda, TipoAgenda } from "@/lib/produccion/agenda";

const tipos: TipoAgenda[] = ["prevista", "autorizada", "publicada", "subida_manual", "evento"];
const claseTipo: Record<TipoAgenda, string> = {
  prevista: "ep-chip-neutro",
  autorizada: "ep-chip-atencion",
  publicada: "ep-chip-hecho",
  subida_manual: "ep-chip-hecho",
  evento: "ep-chip-proceso",
};

/**
 * Calendario por día. Cada entrada lleva su clase de fecha (prevista, autorizada, publicada…) para no
 * confundir una fecha local con una programación remota. Lo pasado se oculta salvo que lo pidas.
 */
export function AgendaCalendario({
  tr,
  fecha,
  locale,
  version,
  onAbrirEncargo,
}: {
  tr: (clave: string) => string;
  fecha: (iso: string) => string;
  locale: string;
  version: number;
  onAbrirEncargo: (id: string) => void;
}) {
  const [datos, setDatos] = useState<Agenda | null>(null);
  const [error, setError] = useState("");
  const [visibles, setVisibles] = useState<TipoAgenda[]>(tipos);
  const [pasado, setPasado] = useState(false);
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let vivo = true;
    fetch("/api/produccion/agenda", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Error");
        if (vivo) {
          setDatos(j as Agenda);
          setError("");
        }
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [version, recarga]);
  if (error)
    return (
      <div className="ep-alerta" role="alert">
        {error}
        <button onClick={() => setRecarga((x) => x + 1)}>{tr("p_reintentar")}</button>
      </div>
    );
  if (!datos) return <p role="status">{tr("p_cargando")}</p>;
  const lista = datos.entradas.filter((x) => visibles.includes(x.tipo) && (pasado || x.dia >= datos.hoy));
  const dias = [...new Set(lista.map((x) => x.dia))];
  const nombreDia = (d: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return (
    <section className="ep-agenda2" aria-label={tr("p_calendario")}>
      <div className="ep-agenda2-filtros" role="group" aria-label={tr("p_agendaFiltro")}>
        {tipos.map((t) => (
          <label key={t} className="ep-agenda2-filtro">
            <input type="checkbox" checked={visibles.includes(t)} onChange={(e) => setVisibles(e.target.checked ? [...visibles, t] : visibles.filter((x) => x !== t))} />
            <span className={`ep-chip ${claseTipo[t]}`}>{tr(`p_ag_${t}`)}</span>
          </label>
        ))}
        <label className="ep-agenda2-filtro">
          <input type="checkbox" checked={pasado} onChange={(e) => setPasado(e.target.checked)} />
          {tr("p_agendaPasado")}
        </label>
      </div>
      <dl className="ep-agenda2-leyenda">
        {tipos.map((t) => (
          <div key={t}>
            <dt>
              <span className={`ep-chip ${claseTipo[t]}`}>{tr(`p_ag_${t}`)}</span>
            </dt>
            <dd>{tr(`p_ag_${t}_ayuda`)}</dd>
          </div>
        ))}
      </dl>
      {!dias.length ? (
        <div className="ep-vacio">
          <CalendarDays size={28} aria-hidden="true" />
          <p>{tr("p_agendaVacia")}</p>
        </div>
      ) : (
        <ol className="ep-agenda2-dias">
          {dias.map((d) => (
            <li key={d} className={d === datos.hoy ? "ep-hoy" : d < datos.hoy ? "ep-pasado" : ""}>
              <h3>
                {nombreDia(d)}
                {d === datos.hoy ? ` · ${tr("p_hoy")}` : ""}
              </h3>
              <ul>
                {lista
                  .filter((x) => x.dia === d)
                  .map((x) => (
                    <li key={x.id}>
                      <span className={`ep-chip ${claseTipo[x.tipo]}`}>{tr(`p_ag_${x.tipo}`)}</span>
                      <span className="ep-agenda2-texto">
                        {x.encargoId ? (
                          <button className="ep-enlace" onClick={() => onAbrirEncargo(x.encargoId!)}>
                            {x.titulo}
                          </button>
                        ) : (
                          <strong>{x.titulo}</strong>
                        )}
                        <small>
                          {x.fecha.length > 10 ? `${fecha(x.fecha)} · ` : ""}
                          {x.detalle}
                          {x.tipo === "prevista" ? ` · ${tr(`p_${x.estado}`)}` : ""}
                        </small>
                      </span>
                      {x.enlace && (
                        <a className="ep-agenda2-enlace" href={x.enlace} target="_blank" rel="noreferrer noopener" aria-label={`${tr("p_abrirEnlace")}: ${x.titulo}`}>
                          <ArrowUpRight size={15} aria-hidden="true" />
                        </a>
                      )}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
