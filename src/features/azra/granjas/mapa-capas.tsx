"use client";
/**
 * Capas del mapa de Inicio: selector de vista (Eventos · Ingresos · Población), recorridos de
 * llegada al país, panel lateral o inferior y el campo magnético de los puntos decorativos.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as EventoPuntero,
  type ReactNode,
} from "react";
import { ArrowUpRight, Play, X } from "lucide-react";
import {
  FUENTE_CEPA,
  FUENTE_DGME,
  POBLACION_2024,
  type Acceso,
  type Cifra,
} from "@/lib/granjas/datos-pais";
import type { EventoMapa } from "@/lib/granjas/agenda-mapa";
import { geo, type AccesoGeo } from "./mapa-geo";
import "./mapa-capas.css";

type Tr = (c: string) => string;
export type Vista = "eventos" | "ingresos" | "poblacion";
export const VISTAS: Vista[] = ["eventos", "ingresos", "poblacion"];
export type Panel =
  | { tipo: "depto"; nombre: string }
  | { tipo: "acceso"; id: Acceso["id"] }
  | { tipo: "poblacion"; nombre: string }
  | null;

const numero = new Intl.NumberFormat("es-SV");

/** Selector compacto arriba a la derecha (flechas para moverse, como un grupo de radio). */
export function SelectorVista({
  vista,
  setVista,
  tr,
}: {
  vista: Vista;
  setVista: (v: Vista) => void;
  tr: Tr;
}) {
  const grupo = useRef<HTMLDivElement>(null);
  const mover = (e: KeyboardEvent, i: number) => {
    const paso =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!paso) return;
    e.preventDefault();
    const sig = VISTAS[(i + paso + VISTAS.length) % VISTAS.length];
    setVista(sig);
    grupo.current?.querySelector<HTMLButtonElement>(`[data-vista="${sig}"]`)?.focus();
  };
  return (
    <div ref={grupo} className="ez-mpv-selector" role="radiogroup" aria-label={tr("ez_mpv_vista")}>
      {VISTAS.map((v, i) => (
        <button
          key={v}
          type="button"
          role="radio"
          data-vista={v}
          aria-checked={vista === v}
          tabIndex={vista === v ? 0 : -1}
          onClick={() => setVista(v)}
          onKeyDown={(e) => mover(e, i)}
        >
          {tr(`ez_mpv_${v}`)}
        </button>
      ))}
    </div>
  );
}

/* ── Ingresos: puestos, etiquetas y pulsos ── */

const siglas: Record<Acceso["id"], string> = { aeropuerto: "✈", guatemala: "GT", honduras: "HN" };

/** Puntos reales de entrada y la etiqueta (botón) de cada acceso, con guías tenues a sus puestos. */
export function CapaAccesos({
  geos,
  escala,
  elegido,
  explorable,
}: {
  geos: AccesoGeo[];
  escala: number;
  elegido: Acceso["id"] | null;
  explorable: (g: AccesoGeo) => Record<string, unknown>;
}) {
  return (
    <g className="ez-mpi-capa">
      {geos.map((g) => {
        const [x, y] = g.etiqueta;
        const ancho = (g.acceso.nombre.length * 7.4 + 44) / escala;
        const alto = 26 / escala;
        return (
          <g
            key={g.acceso.id}
            className={`ez-mpi-acceso ez-mpi-${g.acceso.id} ${elegido === g.acceso.id ? "ez-mp-elegido" : ""} ${elegido && elegido !== g.acceso.id ? "ez-mp-tenue" : ""}`}
            data-foco={`a:${g.acceso.id}`}
            {...explorable(g)}
          >
            {g.puestos.map((p) => (
              <g key={p.id} aria-hidden="true">
                <circle
                  cx={p.punto[0]}
                  cy={p.punto[1]}
                  r={(g.acceso.tipo === "aereo" ? 9 : 6) / escala}
                  className="ez-mpi-anillo"
                />
                <circle
                  cx={p.punto[0]}
                  cy={p.punto[1]}
                  r={(g.acceso.tipo === "aereo" ? 5 : 3.4) / escala}
                  className="ez-mpi-puesto"
                />
              </g>
            ))}
            <rect
              x={x - ancho / 2}
              y={y - alto / 2}
              width={ancho}
              height={alto}
              rx={alto / 2}
              className="ez-mpi-chip"
              strokeWidth={1 / escala}
            />
            <circle
              cx={x - ancho / 2 + 13 / escala}
              cy={y}
              r={9 / escala}
              className="ez-mpi-sigla-fondo"
            />
            <text
              x={x - ancho / 2 + 13 / escala}
              y={y}
              dy="0.36em"
              textAnchor="middle"
              fontSize={(g.acceso.id === "aeropuerto" ? 10.5 : 8) / escala}
              className="ez-mpi-sigla"
              aria-hidden="true"
            >
              {siglas[g.acceso.id]}
            </text>
            <text
              x={x - ancho / 2 + 28 / escala}
              y={y}
              dy="0.36em"
              fontSize={12.5 / escala}
              className="ez-mpi-nombre"
              aria-hidden="true"
            >
              {g.acceso.nombre}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Duración de cada recorrido y separación entre uno y el siguiente (aparecen de a uno). */
const PULSO_S = 2.3;
/**
 * Un pulso por puesto, por turnos. Estela muy fina que se desvanece, punto que indica la dirección y
 * un halo tenue al llegar. Por tierra se disuelve apenas dentro; por aire termina en el aeropuerto.
 * Se monta con una `key` nueva para repetirlo.
 */
export function PulsosIngreso({
  geos,
  solo,
  escala,
}: {
  geos: AccesoGeo[];
  solo: Acceso["id"] | null;
  escala: number;
}) {
  const lista = geos.flatMap((g) =>
    solo && g.acceso.id !== solo ? [] : g.puestos.map((p) => ({ p, tipo: g.acceso.tipo })),
  );
  return (
    <g className="ez-mpi-pulsos" aria-hidden="true">
      {lista.map(({ p, tipo }, i) => (
        <g
          key={p.id}
          className={`ez-mpi-pulso ez-mpi-${tipo}`}
          style={{ ["--t" as string]: `${i * PULSO_S}s` }}
        >
          <path d={p.camino} pathLength={1} className="ez-mpi-estela" strokeWidth={1.1 / escala} />
          <path d={p.camino} pathLength={1} className="ez-mpi-punto ez-mpi-brillo" strokeWidth={18 / escala} />
          <path d={p.camino} pathLength={1} className="ez-mpi-punto" strokeWidth={7 / escala} />
          <circle
            cx={p.fin[0]}
            cy={p.fin[1]}
            r={11 / escala}
            className="ez-mpi-halo"
            strokeWidth={1.2 / escala}
          />
        </g>
      ))}
    </g>
  );
}

/* ── Panel lateral (escritorio) o inferior (móvil) ── */

export function PanelMapa({
  abierto,
  clave,
  titulo,
  subtitulo,
  onCerrar,
  tr,
  children,
}: {
  abierto: boolean;
  clave: string;
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  tr: Tr;
  children: ReactNode;
}) {
  const cabeza = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (abierto) cabeza.current?.focus({ preventScroll: true });
  }, [abierto, clave]);
  return (
    <aside
      className="ez-mpv-panel"
      data-abierto={abierto ? "" : undefined}
      aria-hidden={!abierto}
      inert={!abierto}
      aria-labelledby="ez-mpv-panel-titulo"
    >
      <header>
        <div>
          <h3 id="ez-mpv-panel-titulo" ref={cabeza} tabIndex={-1}>
            {titulo}
          </h3>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        <button type="button" className="ez-cerrar" onClick={onCerrar} aria-label={tr("p_cerrar")}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="ez-mpv-panel-cuerpo">{children}</div>
    </aside>
  );
}

const fechaCorta = new Intl.DateTimeFormat("es-SV", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dia = (iso: string) => fechaCorta.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Agenda de un departamento: por fecha, con título, fecha, lugar, hora (si está confirmada) y origen. */
export function AgendaDepto({ eventos, tr }: { eventos: EventoMapa[]; tr: Tr }) {
  if (!eventos.length) return <p className="ez-mpv-vacio">{tr("ez_mpv_sinVigentes")}</p>;
  return (
    <ol className="ez-mpv-agenda">
      {eventos.map((e) => (
        <li key={e.id}>
          <p className="ez-mpv-cuando">
            <time dateTime={e.fecha ?? undefined}>
              {e.fecha ? dia(e.fecha) : ""}
              {e.fechaFin && e.fechaFin !== e.fecha ? ` – ${dia(e.fechaFin)}` : ""}
            </time>
            {e.hora && <span>{e.hora.slice(0, 5)}</span>}
          </p>
          <strong>{e.titulo}</strong>
          {(e.lugar || e.municipio) && (
            <span className="ez-mpv-lugar">
              {[e.lugar, e.municipio].filter(Boolean).join(" · ")}
            </span>
          )}
          {e.fuenteUrl && (
            <a href={e.fuenteUrl} target="_blank" rel="noreferrer noopener">
              {host(e.fuenteUrl)}
              <ArrowUpRight size={13} aria-hidden="true" />
              <span className="ez-oculto"> ({tr("ez_mpv_abreOrigen")})</span>
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

function Metrica({
  titulo,
  cifra,
  fuente,
  tr,
}: {
  titulo: string;
  cifra: Cifra;
  fuente: string;
  tr: Tr;
}) {
  return (
    <div className="ez-mpv-metrica">
      <span>{titulo}</span>
      {cifra ? (
        <>
          <strong>{numero.format(cifra.valor)}</strong>
          <small>
            {cifra.periodo} ·{" "}
            <a href={cifra.url} target="_blank" rel="noreferrer noopener">
              {cifra.fuente}
            </a>
          </small>
        </>
      ) : (
        <>
          <strong className="ez-mpv-nd">{tr("ez_mpv_sinDatos")}</strong>
          <small>
            {tr("ez_mpv_fuente")}: {fuente}
          </small>
        </>
      )}
    </div>
  );
}

/** Detalle de un acceso: entradas migratorias (DGME) para comparar; en el aeropuerto, además, CEPA. */
export function DetalleAcceso({
  acceso,
  verRecorrido,
  tr,
}: {
  acceso: Acceso;
  verRecorrido: () => void;
  tr: Tr;
}) {
  const [periodo, setPeriodo] = useState<"total" | "diario">("total");
  const hayDiario = Boolean(acceso.entradas?.porDia?.length);
  const sinDatos = !acceso.entradas && acceso.puestos.every((p) => !p.entradas);
  return (
    <div className="ez-mpv-acceso">
      <div
        className="ez-segmentado ez-mpv-periodo"
        role="radiogroup"
        aria-label={tr("ez_mpv_periodo")}
      >
        <button
          type="button"
          role="radio"
          aria-checked={periodo === "total"}
          onClick={() => setPeriodo("total")}
        >
          {tr("ez_mpv_periodoTotal")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={periodo === "diario"}
          disabled={!hayDiario}
          title={hayDiario ? undefined : tr("ez_mpv_sinDiario")}
          onClick={() => setPeriodo("diario")}
        >
          {tr("ez_mpv_periodoDiario")}
        </button>
      </div>
      <Metrica
        titulo={tr("ez_mpv_entradas")}
        cifra={acceso.entradas}
        fuente={FUENTE_DGME}
        tr={tr}
      />
      {acceso.tipo === "aereo" && (
        <Metrica
          titulo={tr("ez_mpv_pasajeros")}
          cifra={acceso.pasajerosLlegada ?? null}
          fuente={FUENTE_CEPA}
          tr={tr}
        />
      )}
      <ul className="ez-mpv-puestos">
        {acceso.puestos.map((p) => (
          <li key={p.id}>
            <strong>{p.nombre}</strong>
            <span>{p.lugar}</span>
            <small>
              {p.entradas
                ? `${numero.format(p.entradas.valor)} · ${p.entradas.periodo}`
                : tr("ez_mpv_sinDatos")}
            </small>
          </li>
        ))}
      </ul>
      <div className="ez-mpv-recorrido">
        <button type="button" className="ez-boton-blanco" onClick={verRecorrido}>
          <Play size={14} aria-hidden="true" />
          {tr("ez_mpv_verRecorrido")}
        </button>
        {sinDatos && <span className="ez-mpv-ilustrativa">{tr("ez_mpv_ilustrativa")}</span>}
      </div>
    </div>
  );
}

export function DetallePoblacion({ nombre, tr }: { nombre: string; tr: Tr }) {
  const v = POBLACION_2024.departamentos[nombre];
  return (
    <div className="ez-mpv-acceso">
      <div className="ez-mpv-metrica">
        <span>{POBLACION_2024.etiqueta}</span>
        {v ? (
          <>
            <strong>
              {numero.format(v)} <em>{tr("ez_mpv_habitantes")}</em>
            </strong>
            <small>
              {((v / POBLACION_2024.total) * 100).toFixed(1)} % {tr("ez_mpv_delPais")} (
              {numero.format(POBLACION_2024.total)})
            </small>
          </>
        ) : (
          <strong className="ez-mpv-nd">{tr("ez_mpv_sinDatos")}</strong>
        )}
      </div>
      <p className="ez-mpv-fuente">
        {tr("ez_mpv_fuente")}:{" "}
        <a href={POBLACION_2024.url} target="_blank" rel="noreferrer noopener">
          {POBLACION_2024.fuente}
        </a>
      </p>
    </div>
  );
}

/** Nivel de intensidad (1–5) de cada departamento según su población censada. */
export function nivelesPoblacion() {
  const max = Math.max(...Object.values(POBLACION_2024.departamentos));
  return Object.entries(POBLACION_2024.departamentos)
    .map(([n, v]) => `${n}:${1 + Math.round(4 * Math.sqrt(v / max))}`)
    .join("|");
}

/* ── Campo magnético: los puntos cercanos se apartan apenas y brillan; los marcadores no se mueven ── */

export function useImanes(escala: number, reducido: boolean) {
  // El SVG y la capa de puntos se toman del evento: el hook no expone refs al render.
  const capa = useRef<SVGGElement | null>(null);
  const tocados = useRef(new Set<number>());
  const cuadro = useRef(0);
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const [halo, setHalo] = useState<{ x: number; y: number; k: number } | null>(null);
  const aSvg = useCallback((e: EventoPuntero) => {
    const svg = e.currentTarget as SVGSVGElement;
    capa.current = svg.querySelector<SVGGElement>(".ez-mp-puntos");
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);
  const aplicar = useCallback(() => {
    cuadro.current = 0;
    const g = capa.current;
    if (!g) return;
    const { puntos } = geo();
    const hijos = g.children;
    const R = 64 / escala;
    const empuje = 6 / escala;
    const p = cursor.current;
    const nuevos = new Set<number>();
    if (p)
      for (let i = 0; i < puntos.length; i++) {
        const dx = puntos[i].x - p.x;
        const dy = puntos[i].y - p.y;
        if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        const k = (1 - d / R) ** 2;
        const c = hijos[i] as SVGCircleElement | undefined;
        if (!c) continue;
        if (!reducido)
          c.style.transform = `translate(${((dx / (d || 1)) * empuje * k).toFixed(2)}px, ${((dy / (d || 1)) * empuje * k).toFixed(2)}px)`;
        c.style.fill = `rgba(104, 92, 255, ${(0.3 + 0.65 * k).toFixed(2)})`;
        nuevos.add(i);
      }
    for (const i of tocados.current)
      if (!nuevos.has(i)) {
        const c = hijos[i] as SVGCircleElement | undefined;
        if (c) {
          c.style.transform = "";
          c.style.fill = "";
        }
      }
    tocados.current = nuevos;
  }, [escala, reducido]);
  const pedir = () => {
    if (!cuadro.current) cuadro.current = requestAnimationFrame(aplicar);
  };
  useEffect(() => () => cancelAnimationFrame(cuadro.current), []);
  return {
    halo,
    terminarHalo: () => setHalo(null),
    manejadores: {
      onPointerMove: (e: EventoPuntero<SVGSVGElement>) => {
        if (e.pointerType === "touch") return;
        cursor.current = aSvg(e);
        capa.current?.classList.add("ez-mp-iman");
        pedir();
      },
      onPointerLeave: () => {
        cursor.current = null;
        capa.current?.classList.remove("ez-mp-iman");
        pedir();
      },
      onPointerDown: (e: EventoPuntero<SVGSVGElement>) => {
        if (e.pointerType === "mouse" || reducido) return;
        const p = aSvg(e);
        if (p) setHalo({ ...p, k: e.timeStamp });
      },
    },
  };
}
