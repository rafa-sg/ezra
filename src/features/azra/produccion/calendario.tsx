"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Plus } from "lucide-react";
import type { Agenda, TipoAgenda } from "@/lib/produccion/agenda";
import "./calendario.css";

type Entrada = Agenda["entradas"][number];
type Vista = "mes" | "semana" | "dia";
const tipos: TipoAgenda[] = ["prevista", "autorizada", "publicada", "subida_manual", "evento"];
const vistas: Vista[] = ["mes", "semana", "dia"];

/* Fechas en días locales «AAAA-MM-DD» (a mediodía UTC para no cruzar de día). */
const aFecha = (d: string) => new Date(`${d}T12:00:00Z`);
const aDia = (f: Date) => f.toISOString().slice(0, 10);
const sumar = (d: string, n: number) => aDia(new Date(aFecha(d).getTime() + n * 86_400_000));
const lunesDe = (d: string) => sumar(d, -((aFecha(d).getUTCDay() + 6) % 7));
const primeroDeMes = (d: string) => `${d.slice(0, 7)}-01`;
function rango(vista: Vista, cursor: string) {
  if (vista === "dia") return { desde: cursor, hasta: cursor };
  if (vista === "semana") {
    const l = lunesDe(cursor);
    return { desde: l, hasta: sumar(l, 6) };
  }
  // Mes: 6 semanas completas que empiezan el lunes antes del día 1.
  const desde = lunesDe(primeroDeMes(cursor));
  return { desde, hasta: sumar(desde, 41) };
}

/**
 * Calendario por mes, semana y día. Cada entrada lleva el color de su tipo de fecha. Clic en «+» de
 * un día crea un encargo con esa fecha; arrastrar mueve la fecha prevista de un encargo. Los eventos,
 * publicaciones y autorizaciones son hechos: no se arrastran.
 */
export function CalendarioVistas({
  tr,
  locale,
  version,
  onAbrirEncargo,
  onNuevoEnDia,
  onMoverEncargo,
}: {
  tr: (c: string) => string;
  locale: string;
  version: number;
  onAbrirEncargo: (id: string) => void;
  onNuevoEnDia: (dia: string) => void;
  onMoverEncargo: (id: string, dia: string) => Promise<void> | void;
}) {
  const [vista, setVista] = useState<Vista>("mes");
  const [cursor, setCursor] = useState<string | null>(null);
  const [datos, setDatos] = useState<Agenda | null>(null);
  const [error, setError] = useState("");
  const [visibles, setVisibles] = useState<TipoAgenda[]>(tipos);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const hoy = datos?.hoy ?? null;
  const actual = cursor ?? hoy;
  const { desde, hasta } = actual ? rango(vista, actual) : { desde: "", hasta: "" };
  useEffect(() => {
    let vivo = true;
    const url = actual ? `/api/produccion/agenda?desde=${desde}&hasta=${hasta}` : "/api/produccion/agenda";
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j as { error?: string }).error ?? "Error");
        if (vivo) {
          setDatos(j as Agenda);
          setError("");
        }
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [actual, desde, hasta, version, recarga]);
  const porDia = useMemo(() => {
    const m = new Map<string, Entrada[]>();
    for (const e of datos?.entradas ?? []) if (visibles.includes(e.tipo)) m.set(e.dia, [...(m.get(e.dia) ?? []), e]);
    return m;
  }, [datos, visibles]);
  const idioma = locale === "es" ? "es-SV" : "en-US";
  const formato = (o: Intl.DateTimeFormatOptions) => (d: string) => new Intl.DateTimeFormat(idioma, { ...o, timeZone: "UTC" }).format(aFecha(d));
  const nombreMes = formato({ month: "long", year: "numeric" });
  const nombreDia = formato({ weekday: "long", day: "numeric", month: "long" });
  const diaSemana = formato({ weekday: "short" });
  const hora = (e: Entrada) => (e.fecha.length > 10 && (e.tipo === "prevista" || e.tipo === "evento") ? e.fecha.slice(11, 16) : "");

  if (error && !datos)
    return (
      <div className="ep-alerta" role="alert">
        {error}
        <button onClick={() => setRecarga((x) => x + 1)}>{tr("p_reintentar")}</button>
      </div>
    );
  if (!datos || !actual || !hoy) return <p role="status">{tr("p_cargando")}</p>;

  const mover = (paso: number) => {
    if (vista === "dia") setCursor(sumar(actual, paso));
    else if (vista === "semana") setCursor(sumar(actual, 7 * paso));
    else {
      const f = aFecha(primeroDeMes(actual));
      f.setUTCMonth(f.getUTCMonth() + paso);
      setCursor(aDia(f));
    }
  };
  const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const titulo = mayuscula(vista === "mes" ? nombreMes(actual) : vista === "semana" ? `${nombreDia(desde)} – ${nombreDia(hasta)}` : nombreDia(actual));
  const soltar = async (dia: string) => {
    const id = arrastrando;
    setArrastrando(null);
    setSobre(null);
    if (id) await onMoverEncargo(id, dia);
  };
  const chip = (e: Entrada, completo = false) => {
    const movible = e.tipo === "prevista" && Boolean(e.encargoId);
    const contenido = (
      <>
        {hora(e) && <time>{hora(e)}</time>}
        <span className="ez-cal-chip-titulo">{e.titulo}</span>
        {completo && <small>{e.detalle}</small>}
      </>
    );
    const comun = { className: `ez-cal-chip ez-cal-${e.tipo} ${arrastrando === e.encargoId ? "ez-cal-arrastrando" : ""}`, title: `${tr(`p_ag_${e.tipo}`)} · ${e.titulo}` };
    if (e.encargoId)
      return (
        <button
          key={e.id}
          {...comun}
          draggable={movible}
          onDragStart={(ev) => {
            setArrastrando(e.encargoId!);
            ev.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setArrastrando(null);
            setSobre(null);
          }}
          onClick={() => onAbrirEncargo(e.encargoId!)}
        >
          {contenido}
        </button>
      );
    if (e.enlace)
      return (
        <a key={e.id} {...comun} href={e.enlace} target="_blank" rel="noreferrer noopener">
          {contenido}
          {completo && <ExternalLink size={12} aria-hidden="true" />}
        </a>
      );
    return (
      <span key={e.id} {...comun}>
        {contenido}
      </span>
    );
  };
  const celda = (dia: string, opciones: { max?: number; fuera?: boolean; completo?: boolean } = {}) => {
    const lista = porDia.get(dia) ?? [];
    const max = opciones.max ?? lista.length;
    return (
      <div
        key={dia}
        className={`ez-cal-celda ${dia === hoy ? "ez-cal-hoy" : ""} ${dia < hoy ? "ez-cal-pasado" : ""} ${opciones.fuera ? "ez-cal-fuera" : ""} ${sobre === dia ? "ez-cal-sobre" : ""}`}
        onDragOver={(ev) => {
          if (!arrastrando) return;
          ev.preventDefault();
          setSobre(dia);
        }}
        onDragLeave={() => setSobre((s) => (s === dia ? null : s))}
        onDrop={(ev) => {
          ev.preventDefault();
          void soltar(dia);
        }}
      >
        <div className="ez-cal-celda-cabecera">
          <button className="ez-cal-numero" onClick={() => (setCursor(dia), setVista("dia"))} aria-label={nombreDia(dia)}>
            {Number(dia.slice(8))}
          </button>
          <button className="ez-cal-mas" onClick={() => onNuevoEnDia(dia)} aria-label={`${tr("ez_cal_nuevoEn")} ${nombreDia(dia)}`}>
            <Plus size={13} />
          </button>
        </div>
        <div className="ez-cal-entradas">
          {lista.slice(0, max).map((e) => chip(e, opciones.completo))}
          {lista.length > max && (
            <button className="ez-cal-masn" onClick={() => (setCursor(dia), setVista("dia"))}>
              +{lista.length - max} {tr("ez_cal_mas")}
            </button>
          )}
        </div>
      </div>
    );
  };
  const semana = Array.from({ length: 7 }, (_, i) => sumar(desde, i));
  return (
    <section className="ez-cal" aria-label={tr("p_calendario")}>
      <div className="ez-cal-barra">
        <div className="ez-cal-navegar">
          <button className="ez-boton-blanco" onClick={() => mover(-1)} aria-label={tr("ez_cal_anterior")}>
            <ChevronLeft size={16} />
          </button>
          <button className="ez-boton-blanco" onClick={() => setCursor(hoy)}>
            {tr("ez_cal_hoy")}
          </button>
          <button className="ez-boton-blanco" onClick={() => mover(1)} aria-label={tr("ez_cal_siguiente")}>
            <ChevronRight size={16} />
          </button>
          <h2 className="ez-cal-titulo" aria-live="polite">
            {titulo}
          </h2>
        </div>
        <div className="ez-segmentado" role="radiogroup" aria-label={tr("ez_cal_vista")}>
          {vistas.map((v) => (
            <button key={v} role="radio" aria-checked={vista === v} onClick={() => setVista(v)}>
              {tr(`ez_cal_${v}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="ez-cal-filtros" role="group" aria-label={tr("p_agendaFiltro")}>
        {tipos.map((t) => (
          <label key={t} className={`ez-cal-filtro ez-cal-${t}`} title={tr(`p_ag_${t}_ayuda`)}>
            <input type="checkbox" checked={visibles.includes(t)} onChange={(ev) => setVisibles(ev.target.checked ? [...visibles, t] : visibles.filter((x) => x !== t))} />
            <i aria-hidden="true" />
            {tr(`p_ag_${t}`)}
          </label>
        ))}
        <span className="ez-cal-ayuda">{tr("ez_cal_ayuda")}</span>
      </div>
      {vista === "mes" && (
        <div className="ez-cal-mes" role="grid" aria-label={titulo}>
          {semana.map((d) => (
            <div key={d} className="ez-cal-dia-semana" role="columnheader">
              {diaSemana(d)}
            </div>
          ))}
          {Array.from({ length: 42 }, (_, i) => sumar(desde, i)).map((d) => celda(d, { max: 3, fuera: d.slice(0, 7) !== actual.slice(0, 7) }))}
        </div>
      )}
      {vista === "semana" && (
        <div className="ez-cal-semana">
          {semana.map((d) => (
            <div key={d} className="ez-cal-columna">
              <div className="ez-cal-dia-semana">
                {diaSemana(d)} {Number(d.slice(8))}
              </div>
              {celda(d, { completo: true })}
            </div>
          ))}
        </div>
      )}
      {vista === "dia" && (
        <div className="ez-cal-dia">
          {celda(actual, { completo: true })}
          {!(porDia.get(actual) ?? []).length && <p className="ez-vacio">{tr("ez_cal_vacio")}</p>}
        </div>
      )}
    </section>
  );
}
