"use client";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Camera, Clock } from "lucide-react";
import type { Panorama } from "@/lib/granjas/panorama";
import { Pixel } from "./pixel";
import { pedir } from "./cliente";
import "./panorama.css";

type Tr = (clave: string) => string;
const numero = new Intl.NumberFormat("es-SV");
const compacto = new Intl.NumberFormat("es-SV", { notation: "compact", maximumFractionDigits: 1 });

/** Movimiento reducido (para no montar las animaciones SVG). */
function useMovimientoReducido() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}
/** «hace 2 h», «hace 3 días». */
function hace(iso: string | null, tr: Tr) {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  const h = Math.round(min / 60);
  const [clave, n] = min < 60 ? ["ez_hace_min", min] : h < 48 ? ["ez_hace_h", h] : ["ez_hace_dias", Math.round(h / 24)];
  return tr(clave).replace("{n}", String(n));
}

/* ── Geometría estilizada de El Salvador (contorno simplificado y cabeceras aproximadas) ── */
const contorno: [number, number][] = [
  [-90.1, 13.74], [-89.95, 13.9], [-89.7, 14.05], [-89.55, 14.2], [-89.48, 14.3], [-89.36, 14.42], [-89.2, 14.38], [-89.05, 14.33], [-88.85, 14.2],
  [-88.7, 14.1], [-88.5, 14.0], [-88.3, 13.95], [-88.1, 13.98], [-87.95, 13.9], [-87.8, 13.85], [-87.75, 13.7], [-87.8, 13.55], [-87.7, 13.4],
  [-87.75, 13.35], [-87.82, 13.25], [-87.95, 13.17], [-88.2, 13.16], [-88.5, 13.17], [-88.8, 13.25], [-89.05, 13.38], [-89.35, 13.48],
  [-89.6, 13.52], [-89.85, 13.55],
];
const cabeceras: Record<string, [number, number]> = {
  Ahuachapán: [-89.845, 13.921],
  "Santa Ana": [-89.559, 13.994],
  Sonsonate: [-89.724, 13.719],
  Chalatenango: [-88.935, 14.039],
  "La Libertad": [-89.279, 13.673],
  "San Salvador": [-89.191, 13.699],
  Cuscatlán: [-88.935, 13.716],
  "La Paz": [-88.869, 13.508],
  Cabañas: [-88.63, 13.88],
  "San Vicente": [-88.785, 13.641],
  Usulután: [-88.435, 13.344],
  "San Miguel": [-88.177, 13.483],
  Morazán: [-88.104, 13.695],
  "La Unión": [-87.844, 13.336],
};
const ANCHO = 1000;
const ALTO = 540;
const ESCALA = 230;
const LON0 = -90.2;
const LAT0 = 14.5;
const X0 = 230;
const Y0 = 150;
const proyectar = ([lon, lat]: [number, number]): [number, number] => [X0 + (lon - LON0) * ESCALA * 0.971, Y0 + (LAT0 - lat) * ESCALA];
function dentro([x, y]: [number, number], poli: [number, number][]) {
  let si = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i];
    const [xj, yj] = poli[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
  }
  return si;
}
const curva = ([x1, y1]: [number, number], [x2, y2]: [number, number], alto = 0.25) => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - Math.abs(x2 - x1) * alto;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
};

function Etiqueta({ x, y, texto }: { x: number; y: number; texto: string }) {
  const ancho = Math.min(320, texto.length * 6.3 + 22);
  return (
    <g className="ez-mapa-etiqueta" transform={`translate(${(x - ancho / 2).toFixed(1)},${(y - 12).toFixed(1)})`}>
      <rect width={ancho} height="24" rx="12" />
      <circle cx="12" cy="12" r="3.5" />
      <text x="22" y="16">
        {texto}
      </text>
    </g>
  );
}

export function MapaConexiones({ datos, tr }: { datos: Panorama["mapa"]; tr: Tr }) {
  const id = useId().replace(/:/g, "");
  const reducido = useMovimientoReducido();
  const puntos = useMemo(() => {
    const poli = contorno.map(proyectar);
    const lista: [number, number][] = [];
    for (let lat = 13.12; lat <= 14.46; lat += 0.032)
      for (let lon = -90.15; lon <= -87.66; lon += 0.032) {
        const p = proyectar([lon, lat]);
        if (dentro(p, poli)) lista.push(p);
      }
    return lista;
  }, []);
  const hub: [number, number] = [500, 70];
  const fuentes = datos.fuentes.slice(0, 5);
  const posFuente = (i: number): [number, number] => [105, 150 + i * (300 / Math.max(1, fuentes.length - 1))];
  const destinos = [
    { clave: "spotmi", etiqueta: "Spotmi web", texto: `${datos.destinos.spotmi.aprobados} ${tr("ez_mapa_aprobados")} · ${datos.destinos.spotmi.enviados} ${tr("ez_mapa_enviados")}`, pos: [895, 200] as [number, number], activo: true },
    {
      clave: "instagram",
      etiqueta: datos.destinos.instagram.cuenta ?? "Instagram",
      texto: datos.destinos.instagram.cuenta ? `${datos.destinos.instagram.listos} ${tr("ez_mapa_listos")} · ${datos.destinos.instagram.subidos} ${tr("ez_kpi_subidos")}` : tr("ez_ig_sinConectar"),
      pos: [895, 330] as [number, number],
      activo: Boolean(datos.destinos.instagram.cuenta),
    },
  ];
  const deptos = datos.departamentos.filter((d) => d.eventos > 0).sort((a, b) => b.eventos - a.eventos);
  const max = Math.max(1, ...deptos.map((d) => d.eventos));
  const radio = (n: number) => 3.5 + (n / max) * 7;
  // Etiquetas de los 6 departamentos con más eventos, sin choques: si una se encima con otra, baja
  // y una línea guía la une con su nodo (las cabeceras de San Salvador, La Libertad y Cuscatlán están muy cerca).
  const etiquetas = (() => {
    const puestas: { nombre: string; x: number; y: number; w: number; nx: number; ny: number }[] = [];
    for (const d of deptos.slice(0, 6)) {
      const [nx, ny] = proyectar(cabeceras[d.nombre]);
      const texto = `${d.nombre} · ${d.eventos}`;
      const w = texto.length * 6.6;
      const x = nx + radio(d.eventos) + 8;
      let y = ny + 4;
      const choca = (yy: number) => puestas.some((o) => Math.abs(o.y - yy) < 16 && x < o.x + o.w + 6 && o.x < x + w + 6);
      for (let i = 0; i < 12 && choca(y); i++) y += 17;
      puestas.push({ nombre: d.nombre, x, y, w, nx, ny });
    }
    return puestas;
  })();
  const resumen = `${tr("ez_mapa_resumen")}: ${deptos.map((d) => `${d.nombre} ${d.eventos}`).join(", ")}. ${tr("ez_mapa_fuentes")}: ${fuentes.map((f) => `${f.etiqueta} ${f.eventos}`).join(", ")}.`;
  return (
    <figure className="ez-mapa">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={resumen}>
        <defs>
          <filter id={`${id}-brillo`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <linearGradient id={`${id}-arco`} x1="0" x2="1">
            <stop offset="0" stopColor="#3b6cff" stopOpacity="0.15" />
            <stop offset="0.5" stopColor="#7c9bff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#3b6cff" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <g className="ez-mapa-puntos">
          {puntos.map(([x, y], i) => (
            <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="1.6" />
          ))}
        </g>
        {/* Arcos: fuentes → Ezra → destinos, y Ezra → departamentos con eventos. */}
        {fuentes.map((f, i) => (
          <path key={f.clave} id={`${id}-f${i}`} className="ez-arco" d={curva(posFuente(i), hub, 0.18)} stroke={`url(#${id}-arco)`} />
        ))}
        {destinos.map((d, i) => (
          <path key={d.clave} id={`${id}-d${i}`} className={`ez-arco ${d.activo ? "" : "ez-arco-apagado"}`} d={curva(hub, d.pos, 0.18)} stroke={`url(#${id}-arco)`} />
        ))}
        {deptos.map((d, i) => (
          <path key={d.nombre} id={`${id}-m${i}`} className="ez-arco ez-arco-fino" d={curva(hub, proyectar(cabeceras[d.nombre]), 0.12)} />
        ))}
        {!reducido && (
          <g className="ez-pulsos">
            {fuentes.map((f, i) => (
              <circle key={f.clave} r="3.2">
                <animateMotion dur={`${3.2 + i * 0.4}s`} repeatCount="indefinite" begin={`${i * 0.5}s`}>
                  <mpath href={`#${id}-f${i}`} />
                </animateMotion>
              </circle>
            ))}
            {destinos
              .filter((d) => d.activo)
              .map((d, i) => (
                <circle key={d.clave} r="3.2">
                  <animateMotion dur="3.6s" repeatCount="indefinite" begin={`${1 + i * 0.8}s`}>
                    <mpath href={`#${id}-d${destinos.indexOf(d)}`} />
                  </animateMotion>
                </circle>
              ))}
            {deptos.slice(0, 6).map((d, i) => (
              <circle key={d.nombre} r="2.2" className="ez-pulso-fino">
                <animateMotion dur={`${2.6 + i * 0.3}s`} repeatCount="indefinite" begin={`${0.3 * i}s`}>
                  <mpath href={`#${id}-m${i}`} />
                </animateMotion>
              </circle>
            ))}
          </g>
        )}
        {/* Departamentos: el tamaño del nodo depende de cuántos eventos vigentes tiene. */}
        {deptos.map((d) => {
          const [x, y] = proyectar(cabeceras[d.nombre]);
          const r = radio(d.eventos);
          return (
            <g key={d.nombre} className="ez-nodo">
              <circle cx={x} cy={y} r={r * 2.2} className="ez-nodo-halo" filter={`url(#${id}-brillo)`} />
              <circle cx={x} cy={y} r={r} className="ez-nodo-centro" />
              <title>{`${d.nombre}: ${d.eventos} ${tr(d.eventos === 1 ? "ez_mapa_evento" : "ez_mapa_eventos")}`}</title>
            </g>
          );
        })}
        {etiquetas.map((e) => (
          <g key={e.nombre} className="ez-nodo-etiqueta">
            {Math.abs(e.y - 4 - e.ny) > 6 && <path d={`M${e.nx},${e.ny} L${e.x - 3},${e.y - 4}`} className="ez-guia" />}
            <text x={e.x} y={e.y} className="ez-nodo-texto">
              {e.nombre} · {deptos.find((d) => d.nombre === e.nombre)!.eventos}
            </text>
          </g>
        ))}
        {/* Nodos de fuentes y destinos, y Ezra en el centro. */}
        {fuentes.map((f, i) => {
          const [x, y] = posFuente(i);
          return (
            <g key={f.clave} className="ez-nodo ez-nodo-lado">
              <circle cx={x} cy={y} r="6" className="ez-nodo-centro" />
              <text x={x} y={y - 14} textAnchor="middle" className="ez-nodo-titulo">
                {f.etiqueta}
              </text>
            </g>
          );
        })}
        {destinos.map((d) => (
          <g key={d.clave} className={`ez-nodo ez-nodo-lado ${d.activo ? "" : "ez-nodo-apagado"}`}>
            <circle cx={d.pos[0]} cy={d.pos[1]} r="6" className="ez-nodo-centro" />
            <text x={d.pos[0]} y={d.pos[1] - 14} textAnchor="middle" className="ez-nodo-titulo">
              {d.etiqueta}
            </text>
            <text x={d.pos[0]} y={d.pos[1] + 22} textAnchor="middle" className="ez-nodo-texto">
              {d.texto}
            </text>
          </g>
        ))}
        <g className="ez-hub">
          <circle cx={hub[0]} cy={hub[1]} r="26" filter={`url(#${id}-brillo)`} className="ez-nodo-halo" />
          <rect x={hub[0] - 40} y={hub[1] - 16} width="80" height="32" rx="16" />
          <text x={hub[0]} y={hub[1] + 5} textAnchor="middle">
            ezrá
          </text>
        </g>
        {fuentes.slice(0, 3).map((f, i) => {
          const [x, y] = posFuente(i);
          return <Etiqueta key={f.clave} x={(x + hub[0]) / 2 + 30} y={(y + hub[1]) / 2 - 18 + i * 6} texto={`${f.etiqueta} → ${tr("ez_mapa_bandeja")} · ${numero.format(f.eventos)} ${tr(f.eventos === 1 ? "ez_mapa_evento" : "ez_mapa_eventos")}${f.ultimo ? ` · ${hace(f.ultimo, tr)}` : ""}`} />;
        })}
      </svg>
      <figcaption>
        {datos.sinDepartamento > 0 && `${datos.sinDepartamento} ${tr("ez_mapa_sinDepto")} · `}
        {tr("ez_mapa_estilizado")}
      </figcaption>
    </figure>
  );
}

const trabajando = (e: string | null) => e === "recolectando" || e === "generando" || e === "en_cola";
const indicePixel: Record<string, number> = { cazador: 0, verificador: 3, imagen_evento: 2, redactor_ig: 1, disenador_post: 4 };
export function FlujoAgentes({ flujo, instagram, tr, g }: { flujo: Panorama["flujo"]; instagram: string | null; tr: Tr; g: Tr }) {
  if (!flujo.length) return <p className="ez-vacio">{tr("ez_flujo_vacio")}</p>;
  return (
    <ol className="ez-flujo">
      {flujo.map((p, i) => (
        <li key={`${p.granjaId}-${p.agente}-${i}`} className={`ez-flujo-paso ${trabajando(p.estado) ? "ez-trabajando" : ""}`}>
          <span className="ez-flujo-avatar">
            <Pixel indice={indicePixel[p.agente] ?? i} />
          </span>
          <strong>{p.titulo}</strong>
          <small>{p.granja}</small>
          <span className={`ez-chip ${trabajando(p.estado) ? "ez-chip-vivo" : p.estado === "fallido" || p.estado === "bloqueado" ? "ez-chip-error" : ""}`}>{p.estado ? g(`estado_${p.estado}`) : g("sinEjecutar")}</span>
        </li>
      ))}
      <li className="ez-flujo-paso ez-flujo-final">
        <span className="ez-flujo-avatar ez-flujo-ig" aria-hidden="true">
          <Camera size={22} />
        </span>
        <strong>{instagram ?? "Instagram"}</strong>
        <small>{tr("ez_flujo_subesAMano")}</small>
      </li>
    </ol>
  );
}

/** Panorama de Granjas: tarjetas, mapa de conexiones (oscuro) y flujo de agentes. */
export function PanoramaGranjas({ g, tr, fecha, onAbrir }: { g: Tr; tr: Tr; fecha: (iso: string) => string; onAbrir: (id: string) => void }) {
  const [datos, setDatos] = useState<Panorama | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    const cargar = () =>
      pedir<Panorama>("/api/granjas/panorama")
        .then((d) => vivo && (setDatos(d), setError("")))
        .catch((e) => vivo && setError((e as Error).message));
    void cargar();
    // Mientras alguna granja trabaja, el flujo se refresca solo.
    const reloj = setInterval(() => void cargar(), 15_000);
    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, []);
  if (error && !datos) return <p className="ep-alerta">{error}</p>;
  if (!datos) return <p role="status">{g("cargando")}</p>;
  return (
    <div className="ez-panorama">
      <header className="ez-panorama-cabecera">
        <h2 className="ez-titulo-seccion">
          {tr("ez_granjas_l1")} <em>{tr("ez_granjas_l2")}</em>
        </h2>
        <p>{tr("ez_granjas_sub")}</p>
      </header>
      <div className="ez-granjas-tarjetas">
        {datos.granjas.map((gr) => (
          <button key={gr.id} className="ez-tarjeta ez-granja" onClick={() => onAbrir(gr.id)}>
            <span className="ez-granja-cabecera">
              <strong>{gr.nombre}</strong>
              {gr.trabajando ? <span className="ez-chip ez-chip-vivo">{tr("ez_trabajandoAhora")}</span> : <span className="ez-chip">{g(`granja_${gr.estado}`)}</span>}
            </span>
            <span className="ez-granja-meta">
              <Clock size={13} aria-hidden="true" />
              {gr.horario?.activa ? `${tr("ez_diario")} ${gr.horario.hora}` : tr("ez_sinHorario")}
              {" · "}
              {gr.ultima ? `${tr(`ez_ej_${gr.ultima.estado}`)} ${fecha(gr.ultima.creado)}` : tr("ez_sinEjecuciones")}
            </span>
            <span className="ez-granja-numeros">
              <span>
                <strong>{numero.format(gr.eventos30)}</strong>
                <small>{tr("ez_ag_eventos30")}</small>
              </span>
              <span>
                <strong>{numero.format(gr.posts30)}</strong>
                <small>{tr("ez_ag_posts30")}</small>
              </span>
              <span>
                <strong>{compacto.format(gr.tokensMes)}</strong>
                <small>{tr("ez_tokensMes")}</small>
              </span>
            </span>
            <span className="ez-granja-abrir">
              {tr("ez_abrirGranja")} <ArrowUpRight size={14} aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
      <section className="ez-conexiones" data-tema="oscuro" aria-labelledby="ez-conexiones-titulo">
        <div className="ez-conexiones-cabecera">
          <span className="ez-pill">{tr("p_conexiones")}</span>
          <h2 id="ez-conexiones-titulo" className="ez-titulo-seccion">
            {tr("ez_mapa_l1")} <em>{tr("ez_mapa_l2")}</em>
          </h2>
        </div>
        <MapaConexiones datos={datos.mapa} tr={tr} />
        <h3 className="ez-flujo-titulo">{tr("ez_flujo_titulo")}</h3>
        <FlujoAgentes flujo={datos.flujo} instagram={datos.mapa.destinos.instagram.cuenta} tr={tr} g={g} />
      </section>
    </div>
  );
}
