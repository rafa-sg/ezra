"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { Trazabilidad } from "@/lib/granjas/trazabilidad";
import { GEOGRAFIA, type Punto } from "@/lib/granjas/geografia-sv";
import "./trazabilidad.css";

type Tr = (c: string) => string;
type Datos = Trazabilidad & { leido: string };
type Evento = Datos["eventos"][number];
type Filtros = { departamento: string; fuente: string; estado: string; destino: string; desde: string; hasta: string; tipoFecha: "evento" | "descubrimiento" | "publicacion" };
type Seleccion =
  | { tipo: "departamento"; nombre: string }
  | { tipo: "evento"; id: string }
  | { tipo: "fuente"; clave: string }
  | { tipo: "contenido"; id: string }
  | { tipo: "conexion"; desde: string; hasta: string }
  | null;
const filtrosVacios: Filtros = { departamento: "", fuente: "", estado: "", destino: "", desde: "", hasta: "", tipoFecha: "evento" };
const CLAVE_FILTROS = "ezra:trazabilidad-filtros";
const nombresCanal: Record<string, string> = { spotmi: "Spotmi web", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const numero = new Intl.NumberFormat("es-SV");

/* ── Proyección equirrectangular corregida por latitud (a 13,7° la distorsión no se nota) ── */
const LNG0 = -90.16;
const LAT0 = 14.47;
const ESCALA = 340;
const proyectar = (p: Punto): [number, number] => [20 + (p.lng - LNG0) * ESCALA * Math.cos((13.7 * Math.PI) / 180), 18 + (LAT0 - p.lat) * ESCALA];
const camino = (anillos: Punto[][]) => anillos.map((a) => `M${a.map((p) => proyectar(p).map((v) => v.toFixed(1)).join(",")).join("L")}Z`).join("");
/** Centroide del anillo más grande (para el marcador agregado del departamento). */
function centroide(anillos: Punto[][]): [number, number] {
  const mayor = [...anillos].sort((a, b) => b.length - a.length)[0];
  let x = 0;
  let y = 0;
  let area = 0;
  const pts = mayor.map(proyectar);
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    area += f;
    x += (pts[j][0] + pts[i][0]) * f;
    y += (pts[j][1] + pts[i][1]) * f;
  }
  return area ? [x / (3 * area), y / (3 * area)] : pts[0];
}
const departamentosGeo = Object.values(GEOGRAFIA).map((d) => ({ nombre: d.nombre, d: camino(d.anillos), centro: centroide(d.anillos) }));

function leerFiltros(): Filtros {
  try {
    return { ...filtrosVacios, ...JSON.parse(window.sessionStorage.getItem(CLAVE_FILTROS) ?? "{}") };
  } catch {
    return filtrosVacios;
  }
}

/**
 * Datos y conexiones: «Geografía» (eventos por departamento) y «Trazabilidad» (fuente → evento →
 * contenido → destino), con filtros y selección compartidos. Todo sale de la API de trazabilidad.
 */
export function DatosYConexiones({ tr, fecha }: { tr: Tr; fecha: (iso: string) => string }) {
  const [pestana, setPestana] = useState<"geografia" | "trazabilidad">("geografia");
  const [filtros, setFiltrosEstado] = useState<Filtros>(filtrosVacios);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [recarga, setRecarga] = useState(0);
  // Los filtros sobreviven a abrir otra sección y volver (por pestaña del navegador).
  useEffect(() => {
    const guardados = leerFiltros();
    queueMicrotask(() => setFiltrosEstado(guardados));
  }, []);
  const setFiltros = (f: Filtros) => {
    setFiltrosEstado(f);
    setSeleccion(null);
    try {
      window.sessionStorage.setItem(CLAVE_FILTROS, JSON.stringify(f));
    } catch {
      /* sin almacenamiento: los filtros duran solo esta vista */
    }
  };
  useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][]);
    queueMicrotask(() => vivo && setCargando(true));
    fetch(`/api/granjas/trazabilidad?${q}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j as { error?: string }).error ?? "Error");
        if (vivo) {
          setDatos(j as Datos);
          setError("");
        }
      })
      .catch((e) => vivo && setError((e as Error).message))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [filtros, recarga]);
  const activos = Object.entries(filtros).filter(([k, v]) => v && k !== "tipoFecha").length;
  return (
    <section className="ez-dc" aria-labelledby="ez-dc-titulo">
      <header className="ez-dc-cabecera">
        <div>
          <h2 id="ez-dc-titulo" className="ez-titulo-seccion">
            {tr("ez_dc_l1")} <em>{tr("ez_dc_l2")}</em>
          </h2>
          <p className="ez-dc-sub">
            {datos ? `${tr("ez_dc_actualizado")} ${fecha(datos.leido)}` : ""}
            {cargando && ` · ${tr("p_cargando")}`}
          </p>
        </div>
        <div className="ez-segmentado" role="tablist" aria-label={tr("ez_dc_vistas")}>
          {(["geografia", "trazabilidad"] as const).map((p) => (
            <button key={p} role="tab" aria-selected={pestana === p} aria-controls={`ez-dc-${p}`} onClick={() => setPestana(p)}>
              {tr(`ez_dc_${p}`)}
            </button>
          ))}
        </div>
      </header>

      <Filtros datos={datos} filtros={filtros} setFiltros={setFiltros} tr={tr} activos={activos} />

      {error && (
        <p className="ep-alerta" role="alert">
          {error} <button onClick={() => setRecarga((x) => x + 1)}>{tr("p_reintentar")}</button>
        </p>
      )}
      {!datos && !error && <p role="status">{tr("p_cargando")}</p>}
      {datos && (
        <>
          <dl className="ez-dc-totales">
            <div>
              <dt>{tr("ez_dc_t_eventos")}</dt>
              <dd>{numero.format(datos.totales.eventos)}</dd>
            </div>
            <div>
              <dt>{tr("ez_dc_t_relaciones")}</dt>
              <dd>{numero.format(datos.totales.relacionesProcedencia)}</dd>
            </div>
            <div>
              <dt>{tr("ez_dc_t_contenidos")}</dt>
              <dd>{numero.format(datos.totales.contenidos)}</dd>
            </div>
            <div>
              <dt>{tr("ez_dc_t_entregas")}</dt>
              <dd>{numero.format(datos.totales.entregasRealizadas)}</dd>
            </div>
          </dl>
          <p className="ep-nota ez-dc-explica">{tr("ez_dc_explicaConteo")}</p>
          <div className="ez-dc-cuerpo">
            <div id={`ez-dc-${pestana}`} role="tabpanel" className="ez-dc-vista">
              {pestana === "geografia" ? <Geografia datos={datos} tr={tr} seleccion={seleccion} setSeleccion={setSeleccion} tipoFecha={filtros.tipoFecha} /> : <Traza datos={datos} tr={tr} seleccion={seleccion} setSeleccion={setSeleccion} />}
            </div>
            <PanelDetalle datos={datos} seleccion={seleccion} setSeleccion={setSeleccion} tr={tr} fecha={fecha} />
          </div>
        </>
      )}
    </section>
  );
}

function Filtros({ datos, filtros, setFiltros, tr, activos }: { datos: Datos | null; filtros: Filtros; setFiltros: (f: Filtros) => void; tr: Tr; activos: number }) {
  const cambiar = (k: keyof Filtros, v: string) => setFiltros({ ...filtros, [k]: v });
  return (
    <div className="ez-dc-filtros" role="group" aria-label={tr("ez_dc_filtros")}>
      <label>
        {tr("ez_dc_f_departamento")}
        <select value={filtros.departamento} onChange={(e) => cambiar("departamento", e.target.value)}>
          <option value="">{tr("ez_dc_todos")}</option>
          {departamentosGeo
            .map((d) => d.nombre)
            .sort((a, b) => a.localeCompare(b, "es"))
            .map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          <option value="sin_ubicacion">{tr("ez_mapa_sinUbicacion")}</option>
        </select>
      </label>
      <label>
        {tr("ez_dc_f_fuente")}
        <select value={filtros.fuente} onChange={(e) => cambiar("fuente", e.target.value)}>
          <option value="">{tr("ez_dc_todas")}</option>
          {(datos?.fuentes ?? []).map((f) => (
            <option key={f.clave} value={f.clave}>
              {f.etiqueta}
            </option>
          ))}
          {filtros.fuente && !datos?.fuentes.some((f) => f.clave === filtros.fuente) && <option value={filtros.fuente}>{filtros.fuente}</option>}
        </select>
      </label>
      <label>
        {tr("ez_dc_f_estado")}
        <select value={filtros.estado} onChange={(e) => cambiar("estado", e.target.value)}>
          <option value="">{tr("ez_dc_todos")}</option>
          {["nuevo", "aprobado", "descartado"].map((s) => (
            <option key={s} value={s}>
              {tr(`ez_evest_${s}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("ez_dc_f_destino")}
        <select value={filtros.destino} onChange={(e) => cambiar("destino", e.target.value)}>
          <option value="">{tr("ez_dc_todos")}</option>
          {["spotmi", "instagram", "tiktok", "facebook"].map((c) => (
            <option key={c} value={c}>
              {nombresCanal[c]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("ez_dc_f_fecha")}
        <select value={filtros.tipoFecha} onChange={(e) => cambiar("tipoFecha", e.target.value)}>
          {(["evento", "descubrimiento", "publicacion"] as const).map((t) => (
            <option key={t} value={t}>
              {tr(`ez_dc_fecha_${t}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("ez_dc_f_desde")}
        <input type="date" value={filtros.desde} onChange={(e) => cambiar("desde", e.target.value)} />
      </label>
      <label>
        {tr("ez_dc_f_hasta")}
        <input type="date" value={filtros.hasta} onChange={(e) => cambiar("hasta", e.target.value)} />
      </label>
      {activos > 0 && (
        <button className="ez-boton-blanco" onClick={() => setFiltros({ ...filtrosVacios, tipoFecha: filtros.tipoFecha })}>
          <X size={14} aria-hidden="true" /> {tr("ez_dc_limpiar")} ({activos})
        </button>
      )}
    </div>
  );
}

/* ── Geografía ── */
/* ── Geografía: mapa oscuro de puntos con los 14 departamentos reales, fuentes → ezrá → destinos ── */
const MA = 1200;
const MH = 640;
const MESC = 270;
const proyO = (p: Punto): [number, number] => [300 + (p.lng - LNG0) * MESC * Math.cos((13.7 * Math.PI) / 180), 230 + (LAT0 - p.lat) * MESC];
function dentroDe(x: number, y: number, anillo: [number, number][]) {
  let si = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
  }
  return si;
}
/** Matriz de puntos: cada punto sabe a qué departamento real pertenece (se calcula una vez). */
let puntosCache: { x: number; y: number; d: string }[] | null = null;
function puntosMapa() {
  if (puntosCache) return puntosCache;
  const deptos = Object.values(GEOGRAFIA).map((d) => ({ nombre: d.nombre, anillos: d.anillos.map((a) => a.map(proyO)) }));
  const todos = deptos.flatMap((d) => d.anillos.flat());
  const [x0, x1] = [Math.min(...todos.map((p) => p[0])), Math.max(...todos.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...todos.map((p) => p[1])), Math.max(...todos.map((p) => p[1]))];
  const lista: { x: number; y: number; d: string }[] = [];
  for (let y = y0; y <= y1; y += 7.5)
    for (let x = x0; x <= x1; x += 7.5) {
      const d = deptos.find((dep) => dep.anillos.some((a) => dentroDe(x, y, a)));
      if (d) lista.push({ x, y, d: d.nombre });
    }
  puntosCache = lista;
  return lista;
}
const centrosO = Object.fromEntries(
  Object.values(GEOGRAFIA).map((d) => {
    const [cx, cy] = centroide(d.anillos);
    // Del sistema del mapa claro al del panel oscuro (misma proyección, otra escala y origen).
    const lng = LNG0 + (cx - 20) / (ESCALA * Math.cos((13.7 * Math.PI) / 180));
    const lat = LAT0 - (cy - 18) / ESCALA;
    return [d.nombre, proyO({ lat, lng })];
  }),
) as Record<string, [number, number]>;
const curvaO = ([x1, y1]: [number, number], [x2, y2]: [number, number], alto = 0.22) => `M${x1.toFixed(1)},${y1.toFixed(1)} Q${((x1 + x2) / 2).toFixed(1)},${((y1 + y2) / 2 - Math.abs(x2 - x1) * alto).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
const reciente = (iso: string | null, horas = 48) => Boolean(iso && Date.now() - Date.parse(iso) < horas * 3_600_000);
function hace(iso: string | null, tr: Tr) {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  const h = Math.round(min / 60);
  const [clave, n] = min < 60 ? ["ez_hace_min", min] : h < 48 ? ["ez_hace_h", h] : ["ez_hace_dias", Math.round(h / 24)];
  return tr(clave).replace("{n}", String(n));
}
function useMovReducido() {
  const [r, setR] = useState(true);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setR(m.matches);
    queueMicrotask(f);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

function Geografia({ datos, tr, seleccion, setSeleccion, tipoFecha }: { datos: Datos; tr: Tr; seleccion: Seleccion; setSeleccion: (s: Seleccion) => void; tipoFecha: string }) {
  const [metrica, setMetrica] = useState<"eventos" | "contenidos">("eventos");
  const [vista, setVista] = useState({ x: 0, y: 0, z: 1 });
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const reducido = useMovReducido();
  const puntos = useMemo(() => puntosMapa(), []);
  const por = new Map(datos.departamentos.map((d) => [d.nombre, d]));
  const deptos = [...por.values()].filter((d) => d.nombre !== "sin_ubicacion" && d[metrica] > 0).sort((a, b) => b[metrica] - a[metrica]);
  const max = Math.max(1, ...deptos.map((d) => d[metrica]));
  const radio = (v: number) => 4 + Math.sqrt(v / max) * 13;
  const sinUbic = por.get("sin_ubicacion");
  const hub: [number, number] = [600, 70];
  const fuentes = datos.fuentes.slice(0, 5);
  const posF = (i: number): [number, number] => [110, 170 + i * (360 / Math.max(1, fuentes.length - 1 || 1))];
  // Destinos con lo que de verdad pasó (realizado) y lo que está pendiente o falló.
  const destinos = useMemo(() => {
    const m = new Map<string, { realizadas: number; pendientes: number; errores: number }>();
    const sumar = (canal: string, estado: string, realizado: boolean) => {
      if (estado === "no_enviado") return;
      const d = m.get(canal) ?? { realizadas: 0, pendientes: 0, errores: 0 };
      if (realizado) d.realizadas++;
      else if (estado === "envio_sin_confirmar") d.errores++;
      else d.pendientes++;
      m.set(canal, d);
    };
    for (const e of datos.eventos) sumar("spotmi", e.spotmi.estado, e.spotmi.realizado);
    for (const c of datos.contenidos) for (const d of c.destinos) sumar(d.canal, d.estado, d.realizado);
    const canales = [...new Set(["spotmi", "instagram", ...m.keys()])];
    return canales.map((canal, i) => ({ canal, ...(m.get(canal) ?? { realizadas: 0, pendientes: 0, errores: 0 }), pos: [1090, 200 + i * 130] as [number, number] }));
  }, [datos]);
  // Qué se ilumina según la selección (compartida con el panel y la vista de trazabilidad).
  const deptosActivos = new Set<string>();
  const fuentesActivas = new Set<string>();
  if (seleccion?.tipo === "departamento") {
    deptosActivos.add(seleccion.nombre);
    datos.eventos.filter((e) => (seleccion.nombre === "sin_ubicacion" ? !e.departamento : e.departamento === seleccion.nombre)).forEach((e) => e.registros.forEach((r) => fuentesActivas.add(r.clave)));
  }
  if (seleccion?.tipo === "fuente") {
    fuentesActivas.add(seleccion.clave);
    datos.eventos.filter((e) => e.registros.some((r) => r.clave === seleccion.clave)).forEach((e) => deptosActivos.add(e.departamento ?? "sin_ubicacion"));
  }
  if (seleccion?.tipo === "evento") {
    const e = datos.eventos.find((x) => x.id === seleccion.id);
    if (e) {
      deptosActivos.add(e.departamento ?? "sin_ubicacion");
      e.registros.forEach((r) => fuentesActivas.add(r.clave));
    }
  }
  if (seleccion?.tipo === "contenido") {
    const c = datos.contenidos.find((x) => x.id === seleccion.id);
    datos.eventos.filter((e) => c?.eventos.includes(e.id)).forEach((e) => {
      deptosActivos.add(e.departamento ?? "sin_ubicacion");
      e.registros.forEach((r) => fuentesActivas.add(r.clave));
    });
  }
  const hayFoco = deptosActivos.size > 0 || fuentesActivas.size > 0;
  // Etiquetas de departamento sin choques (las cabeceras de San Salvador, La Libertad y Cuscatlán están cerca).
  const etiquetas: { nombre: string; x: number; y: number; nx: number; ny: number; v: number }[] = [];
  for (const d of deptos.slice(0, 8)) {
    const [nx, ny] = centrosO[d.nombre];
    const texto = `${d.nombre} · ${d[metrica]}`;
    const w = texto.length * 7;
    const x = nx + radio(d[metrica]) + 8;
    let y = ny + 4;
    const choca = (yy: number) => etiquetas.some((o) => Math.abs(o.y - yy) < 17 && x < o.x + `${o.nombre} · ${o.v}`.length * 7 + 6 && o.x < x + w + 6);
    for (let i = 0; i < 12 && choca(y); i++) y += 18;
    etiquetas.push({ nombre: d.nombre, x, y, nx, ny, v: d[metrica] });
  }
  const zoom = (f: number) => setVista((v) => ({ ...v, z: Math.min(3, Math.max(0.6, v.z * f)) }));
  const resumen = `${tr("ez_dc_mapaAlt")}. ${deptos.map((d) => `${d.nombre} ${d[metrica]}`).join(", ")}.`;
  return (
    <div className="ez-geo">
      <div className="ez-geo-barra">
        <div className="ez-segmentado" role="radiogroup" aria-label={tr("ez_dc_metrica")}>
          {(["eventos", "contenidos"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={metrica === m} onClick={() => setMetrica(m)}>
              {tr(`ez_dc_m_${m}`)}
            </button>
          ))}
        </div>
        <span className="ep-nota">
          {tr("ez_dc_filtraPor")} {tr(`ez_dc_fecha_${tipoFecha}`).toLowerCase()}
        </span>
        <span className="ez-geo-zoom">
          <button className="ez-boton-blanco" onClick={() => zoom(1.2)} aria-label={tr("ez_dc_acercar")}>
            <Plus size={15} />
          </button>
          <button className="ez-boton-blanco" onClick={() => zoom(1 / 1.2)} aria-label={tr("ez_dc_alejar")}>
            <Minus size={15} />
          </button>
          <button className="ez-boton-blanco" onClick={() => setVista({ x: 0, y: 0, z: 1 })}>
            <RotateCcw size={14} aria-hidden="true" /> {tr("ez_dc_restablecer")}
          </button>
        </span>
      </div>
      <div
        className="ez-geo-oscuro"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-clic]")) return;
          arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const a = arrastre.current;
          if (a) setVista((v) => ({ ...v, x: a.vx + (e.clientX - a.x), y: a.vy + (e.clientY - a.y) }));
        }}
        onPointerUp={() => (arrastre.current = null)}
      >
        <svg viewBox={`0 0 ${MA} ${MH}`} role="img" aria-label={resumen}>
          <defs>
            <filter id="ez-brillo" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <linearGradient id="ez-arco-g" x1="0" x2="1">
              <stop offset="0" stopColor="#3b6cff" stopOpacity="0.25" />
              <stop offset="0.5" stopColor="#8fa8ff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#3b6cff" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.z})`}>
            {/* Puntos: más brillantes en departamentos con datos; el elegido, en azul. */}
            <g className="ez-geo-puntos">
              {puntos.map((p, i) => {
                const v = por.get(p.d)?.[metrica] ?? 0;
                const activo = deptosActivos.has(p.d);
                return <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={activo ? 2.1 : 1.7} className={activo ? "ez-p-activo" : v ? "ez-p-datos" : "ez-p-vacio"} onClick={() => setSeleccion({ tipo: "departamento", nombre: p.d })} />;
              })}
            </g>
            {/* Arcos: fuentes → ezrá (lecturas reales), ezrá → departamentos (dónde ocurren) y ezrá → destinos. */}
            {fuentes.map((f, i) => {
              const activo = !hayFoco || fuentesActivas.has(f.clave);
              return (
                <g key={f.clave} data-clic="" className={`ez-o-arco ${activo ? "" : "ez-atenuado"}`} onClick={() => setSeleccion({ tipo: "fuente", clave: f.clave })}>
                  <path id={`ez-af-${i}`} d={curvaO(posF(i), hub, 0.18)} stroke="url(#ez-arco-g)" strokeWidth={1.4 + Math.min(3, Math.sqrt(f.eventos) * 0.35)} />
                  <path className="ez-toque" d={curvaO(posF(i), hub, 0.18)} />
                </g>
              );
            })}
            {deptos.map((d) => {
              const activo = !hayFoco || deptosActivos.has(d.nombre);
              return <path key={`a-${d.nombre}`} className={`ez-o-arco-fino ${activo ? "" : "ez-atenuado"}`} d={curvaO(hub, centrosO[d.nombre], 0.1)} />;
            })}
            {destinos.map((d, i) => {
              const real = d.realizadas > 0;
              return (
                <g key={d.canal} data-clic="" className={`ez-o-arco ${real ? "" : "ez-o-punteado"} ${d.errores ? "ez-o-error" : ""}`} onClick={() => setSeleccion({ tipo: "conexion", desde: `d:${d.canal}`, hasta: `d:${d.canal}` })}>
                  <path id={`ez-ad-${i}`} d={curvaO(hub, d.pos, 0.16)} stroke={d.errores ? "#f97066" : "url(#ez-arco-g)"} strokeWidth={real ? 2.2 : 1.4} />
                  <path className="ez-toque" d={curvaO(hub, d.pos, 0.16)} />
                </g>
              );
            })}
            {/* Pulsos solo donde hubo actividad real: lecturas de las últimas 48 h y entregas realizadas. */}
            {!reducido && (
              <g className="ez-o-pulsos">
                {fuentes.map((f, i) =>
                  reciente(f.ultimaLectura) ? (
                    <circle key={f.clave} r="3.2">
                      <animateMotion dur={`${3.4 + i * 0.4}s`} repeatCount="indefinite" begin={`${i * 0.6}s`}>
                        <mpath href={`#ez-af-${i}`} />
                      </animateMotion>
                    </circle>
                  ) : null,
                )}
                {destinos.map((d, i) =>
                  d.realizadas > 0 ? (
                    <circle key={d.canal} r="3.2">
                      <animateMotion dur="3.6s" repeatCount="indefinite" begin={`${1 + i * 0.7}s`}>
                        <mpath href={`#ez-ad-${i}`} />
                      </animateMotion>
                    </circle>
                  ) : null,
                )}
              </g>
            )}
            {/* Marcadores agregados por departamento (no son la dirección de ningún evento). */}
            {deptos.map((d) => {
              const [x, y] = centrosO[d.nombre];
              const r = radio(d[metrica]);
              const activo = !hayFoco || deptosActivos.has(d.nombre);
              return (
                <g key={`n-${d.nombre}`} data-clic="" className={`ez-o-nodo ${activo ? "" : "ez-atenuado"} ${seleccion?.tipo === "departamento" && seleccion.nombre === d.nombre ? "ez-o-elegido" : ""}`} onClick={() => setSeleccion({ tipo: "departamento", nombre: d.nombre })}>
                  <circle cx={x} cy={y} r={r * 2.1} className="ez-o-halo" filter="url(#ez-brillo)" />
                  <circle cx={x} cy={y} r={r} className="ez-o-centro" />
                  <title>{`${d.nombre}: ${d[metrica]} ${tr(`ez_dc_m_${metrica}`).toLowerCase()}`}</title>
                </g>
              );
            })}
            {etiquetas.map((e) => (
              <g key={`t-${e.nombre}`} className={`ez-o-etiqueta ${!hayFoco || deptosActivos.has(e.nombre) ? "" : "ez-atenuado"}`}>
                {Math.abs(e.y - 4 - e.ny) > 6 && <path d={`M${e.nx},${e.ny} L${e.x - 3},${e.y - 4}`} className="ez-o-guia" />}
                <text x={e.x} y={e.y}>
                  {e.nombre} · {e.v}
                </text>
              </g>
            ))}
            {/* Fuentes (izquierda), destinos (derecha) y ezrá. */}
            {fuentes.map((f, i) => {
              const [x, y] = posF(i);
              const activo = !hayFoco || fuentesActivas.has(f.clave);
              return (
                <g key={`f-${f.clave}`} data-clic="" className={`ez-o-lado ${activo ? "" : "ez-atenuado"} ${seleccion?.tipo === "fuente" && seleccion.clave === f.clave ? "ez-o-elegido" : ""}`} onClick={() => setSeleccion({ tipo: "fuente", clave: f.clave })}>
                  <circle cx={x} cy={y} r="7" className="ez-o-centro" />
                  <text x={x} y={y - 16} textAnchor="middle" className="ez-o-titulo">
                    {f.etiqueta}
                  </text>
                  <text x={x} y={y + 24} textAnchor="middle" className="ez-o-texto">
                    {f.eventos} {tr("ez_dc_m_eventos").toLowerCase()}
                  </text>
                </g>
              );
            })}
            {destinos.map((d) => (
              <g key={`d-${d.canal}`} data-clic="" className={`ez-o-lado ${d.realizadas + d.pendientes + d.errores ? "" : "ez-o-apagado"}`} onClick={() => setSeleccion({ tipo: "conexion", desde: `d:${d.canal}`, hasta: `d:${d.canal}` })}>
                <circle cx={d.pos[0]} cy={d.pos[1]} r="7" className="ez-o-centro" />
                <text x={d.pos[0]} y={d.pos[1] - 16} textAnchor="middle" className="ez-o-titulo">
                  {nombresCanal[d.canal] ?? d.canal}
                </text>
                <text x={d.pos[0]} y={d.pos[1] + 24} textAnchor="middle" className="ez-o-texto">
                  {tr("ez_dc_destinoResumen").replace("{r}", String(d.realizadas)).replace("{p}", String(d.pendientes))}
                  {d.errores ? ` · ${d.errores} ${tr("ez_dc_sinConfirmar")}` : ""}
                </text>
              </g>
            ))}
            <g className="ez-o-hub">
              <circle cx={hub[0]} cy={hub[1]} r="26" filter="url(#ez-brillo)" className="ez-o-halo" />
              <rect x={hub[0] - 46} y={hub[1] - 18} width="92" height="36" rx="18" />
              <text x={hub[0]} y={hub[1] + 6} textAnchor="middle">
                ezrá
              </text>
            </g>
            {fuentes.slice(0, 3).map((f, i) => {
              const [x, y] = posF(i);
              const texto = `${f.etiqueta} → ${tr("ez_mapa_bandeja")} · ${f.eventos} ${tr(f.eventos === 1 ? "ez_mapa_evento" : "ez_mapa_eventos")}${f.ultimaLectura ? ` · ${hace(f.ultimaLectura, tr)}` : ""}`;
              const w = Math.min(360, texto.length * 6.6 + 26);
              const cx = (x + hub[0]) / 2 + 20;
              const cy = (y + hub[1]) / 2 - 22 + i * 8;
              return (
                <g key={`p-${f.clave}`} data-clic="" className={`ez-o-pastilla ${!hayFoco || fuentesActivas.has(f.clave) ? "" : "ez-atenuado"}`} transform={`translate(${(cx - w / 2).toFixed(1)},${(cy - 13).toFixed(1)})`} onClick={() => setSeleccion({ tipo: "fuente", clave: f.clave })}>
                  <rect width={w} height="26" rx="13" />
                  <circle cx="13" cy="13" r="3.5" />
                  <text x="24" y="17">
                    {texto}
                  </text>
                </g>
              );
            })}
            {sinUbic && sinUbic[metrica] > 0 && (
              <g data-clic="" className={`ez-o-sin ${seleccion?.tipo === "departamento" && seleccion.nombre === "sin_ubicacion" ? "ez-o-elegido" : ""}`} onClick={() => setSeleccion({ tipo: "departamento", nombre: "sin_ubicacion" })}>
                <rect x="470" y="590" width="260" height="32" rx="16" />
                <text x="600" y="611" textAnchor="middle">
                  {tr("ez_mapa_sinUbicacion")} · {sinUbic[metrica]}
                </text>
              </g>
            )}
          </g>
        </svg>
      </div>
      {/* Acceso por teclado: departamentos con datos como botones. */}
      <ul className="ez-geo-lista" aria-label={tr("ez_dc_departamentos")}>
        {deptos.map((d) => (
          <li key={d.nombre}>
            <button aria-pressed={seleccion?.tipo === "departamento" && seleccion.nombre === d.nombre} onClick={() => setSeleccion({ tipo: "departamento", nombre: d.nombre })}>
              {d.nombre} <span>{d[metrica]}</span>
            </button>
          </li>
        ))}
        {sinUbic && sinUbic[metrica] > 0 && (
          <li>
            <button className="ez-geo-sin" aria-pressed={seleccion?.tipo === "departamento" && seleccion.nombre === "sin_ubicacion"} onClick={() => setSeleccion({ tipo: "departamento", nombre: "sin_ubicacion" })}>
              {tr("ez_mapa_sinUbicacion")} <span>{sinUbic[metrica]}</span>
            </button>
          </li>
        )}
      </ul>
      <div className="ez-geo-leyenda">
        <span className="ez-geo-leyenda-circulos" aria-hidden="true">
          <i style={{ width: 10, height: 10 }} />
          <i style={{ width: 18, height: 18 }} />
          <i style={{ width: 28, height: 28 }} />
        </span>
        <span>
          {tr(metrica === "eventos" ? "ez_dc_leyendaEventos" : "ez_dc_leyendaContenidos")} {tr("ez_dc_leyendaAgregado")}
        </span>
        <span className="ez-traza-leyenda">
          <i className="ez-l-real" /> {tr("ez_dc_transferencia")}
          <i className="ez-l-dato" /> {tr("ez_dc_relacionDatos")}
          <i className="ez-l-error" /> {tr("ez_dc_errorPendiente")}
        </span>
      </div>
      <p className="ez-geo-atribucion">
        {tr("ez_dc_atribucion")} {tr("ez_dc_pulsosReales")}
      </p>
    </div>
  );
}

/* ── Trazabilidad (nodos y conexiones agrupados; el detalle se despliega al seleccionar) ── */
type Nodo = { id: string; columna: 0 | 1 | 2 | 3; etiqueta: string; valor: number; estado?: "error" | "pendiente" | "ok" };
type Arista = { desde: string; hasta: string; valor: number; realizada: boolean; error?: boolean };
function grafo(datos: Datos, tr: Tr) {
  const nodos: Nodo[] = [];
  const aristas = new Map<string, Arista>();
  const sumar = (desde: string, hasta: string, realizada = false, error = false) => {
    const k = `${desde}>${hasta}`;
    const a = aristas.get(k) ?? { desde, hasta, valor: 0, realizada, error };
    a.valor++;
    a.realizada = a.realizada || realizada;
    a.error = a.error || error;
    aristas.set(k, a);
  };
  for (const f of datos.fuentes) nodos.push({ id: `f:${f.clave}`, columna: 0, etiqueta: f.etiqueta, valor: f.eventos });
  const grupos = ["nuevo", "aprobado", "descartado"];
  for (const g of grupos) {
    const n = datos.eventos.filter((e) => e.estado === g).length;
    if (n) nodos.push({ id: `e:${g}`, columna: 1, etiqueta: `${tr(`ez_dc_eventos_${g}`)}`, valor: n, estado: datos.eventos.some((e) => e.estado === g && e.ejecucion?.pasos.some((p) => p.estado === "fallido" || p.estado === "bloqueado")) ? "error" : undefined });
  }
  for (const e of datos.eventos) for (const r of new Set(e.registros.map((x) => x.clave))) sumar(`f:${r}`, `e:${e.estado}`);
  const tiposC = ["post_ig", "encargo"] as const;
  for (const t of tiposC) {
    const n = datos.contenidos.filter((c) => c.tipo === t).length;
    if (n) nodos.push({ id: `c:${t}`, columna: 2, etiqueta: tr(`ez_dc_contenido_${t}`), valor: n });
  }
  for (const c of datos.contenidos) for (const id of c.eventos) {
    const e = datos.eventos.find((x) => x.id === id);
    if (e) sumar(`e:${e.estado}`, `c:${c.tipo}`);
  }
  const destinos = new Map<string, { n: number; realizadas: number; error: boolean; pendiente: boolean }>();
  const anotar = (canal: string, estado: string, realizado: boolean) => {
    const d = destinos.get(canal) ?? { n: 0, realizadas: 0, error: false, pendiente: false };
    d.n++;
    if (realizado) d.realizadas++;
    if (estado === "envio_sin_confirmar") d.error = true;
    if (estado === "pendiente_subida_manual" || estado === "lista_para_descargar") d.pendiente = true;
    destinos.set(canal, d);
  };
  for (const c of datos.contenidos)
    for (const d of c.destinos)
      if (d.estado !== "no_enviado") {
        anotar(d.canal, d.estado, d.realizado);
        sumar(`c:${c.tipo}`, `d:${d.canal}`, d.realizado, d.estado === "envio_sin_confirmar");
      }
  for (const e of datos.eventos)
    if (e.spotmi.estado !== "no_enviado") {
      anotar("spotmi", e.spotmi.estado, e.spotmi.realizado);
      sumar(`e:${e.estado}`, "d:spotmi", e.spotmi.realizado, e.spotmi.estado === "envio_sin_confirmar");
    }
  for (const [canal, d] of destinos) nodos.push({ id: `d:${canal}`, columna: 3, etiqueta: nombresCanal[canal] ?? canal, valor: d.n, estado: d.error ? "error" : d.pendiente ? "pendiente" : "ok" });
  return { nodos, aristas: [...aristas.values()] };
}
function Traza({ datos, tr, seleccion, setSeleccion }: { datos: Datos; tr: Tr; seleccion: Seleccion; setSeleccion: (s: Seleccion) => void }) {
  const { nodos, aristas } = useMemo(() => grafo(datos, tr), [datos, tr]);
  const [vista, setVista] = useState({ x: 0, y: 0, z: 1 });
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const ancho = 980;
  const porCol = [0, 1, 2, 3].map((c) => nodos.filter((n) => n.columna === c));
  const alto = Math.max(320, 70 + Math.max(...porCol.map((c) => c.length)) * 64);
  const pos = new Map<string, [number, number]>();
  porCol.forEach((col, c) => col.forEach((n, i) => pos.set(n.id, [70 + c * ((ancho - 260) / 3), 60 + i * 64 + (alto - 60 - col.length * 64) / 2])));
  // Qué se resalta: una fuente → sus eventos y lo que salió de ellos; un contenido → sus eventos y fuentes.
  const resaltados = new Set<string>();
  if (seleccion?.tipo === "fuente") {
    const evs = datos.eventos.filter((e) => e.registros.some((r) => r.clave === seleccion.clave));
    resaltados.add(`f:${seleccion.clave}`);
    for (const e of evs) {
      resaltados.add(`e:${e.estado}`);
      for (const cid of e.contenidos) {
        const c = datos.contenidos.find((x) => x.id === cid);
        if (c) {
          resaltados.add(`c:${c.tipo}`);
          c.destinos.filter((d) => d.estado !== "no_enviado").forEach((d) => resaltados.add(`d:${d.canal}`));
        }
      }
      if (e.spotmi.estado !== "no_enviado") resaltados.add("d:spotmi");
    }
  }
  if (seleccion?.tipo === "contenido") {
    const c = datos.contenidos.find((x) => x.id === seleccion.id);
    if (c) {
      resaltados.add(`c:${c.tipo}`);
      for (const id of c.eventos) {
        const e = datos.eventos.find((x) => x.id === id);
        if (e) {
          resaltados.add(`e:${e.estado}`);
          e.registros.forEach((r) => resaltados.add(`f:${r.clave}`));
        }
      }
      c.destinos.filter((d) => d.estado !== "no_enviado").forEach((d) => resaltados.add(`d:${d.canal}`));
    }
  }
  const atenuar = resaltados.size > 0;
  const zoom = (f: number) => setVista((v) => ({ ...v, z: Math.min(3, Math.max(0.5, v.z * f)) }));
  if (!nodos.length) return <p className="ez-vacio">{tr("ez_dc_sinDatos")}</p>;
  return (
    <div className="ez-traza">
      <div className="ez-traza-controles">
        <button className="ez-boton-blanco" onClick={() => zoom(1.2)} aria-label={tr("ez_dc_acercar")}>
          <Plus size={15} />
        </button>
        <button className="ez-boton-blanco" onClick={() => zoom(1 / 1.2)} aria-label={tr("ez_dc_alejar")}>
          <Minus size={15} />
        </button>
        <button className="ez-boton-blanco" onClick={() => setVista({ x: 0, y: 0, z: 1 })}>
          <RotateCcw size={14} aria-hidden="true" /> {tr("ez_dc_restablecer")}
        </button>
        <span className="ez-traza-leyenda">
          <i className="ez-l-dato" /> {tr("ez_dc_relacionDatos")}
          <i className="ez-l-real" /> {tr("ez_dc_transferencia")}
          <i className="ez-l-error" /> {tr("ez_dc_errorPendiente")}
        </span>
      </div>
      <div
        className="ez-traza-lienzo"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-nodo],[data-arista]")) return;
          arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const a = arrastre.current;
          if (a) setVista((v) => ({ ...v, x: a.vx + (e.clientX - a.x), y: a.vy + (e.clientY - a.y) }));
        }}
        onPointerUp={() => (arrastre.current = null)}
      >
        <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={tr("ez_dc_trazaAlt")}>
          <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.z})`}>
            {["ez_dc_col_fuentes", "ez_dc_col_eventos", "ez_dc_col_contenidos", "ez_dc_col_destinos"].map((c, i) => (
              <text key={c} x={70 + i * ((ancho - 260) / 3)} y={28} className="ez-traza-col">
                {tr(c)}
              </text>
            ))}
            {aristas.map((a) => {
              const p1 = pos.get(a.desde);
              const p2 = pos.get(a.hasta);
              if (!p1 || !p2) return null;
              const x1 = p1[0] + 170;
              const x2 = p2[0];
              const activa = !atenuar || (resaltados.has(a.desde) && resaltados.has(a.hasta));
              const elegida = seleccion?.tipo === "conexion" && seleccion.desde === a.desde && seleccion.hasta === a.hasta;
              return (
                <g key={`${a.desde}>${a.hasta}`} data-arista="" className={`ez-arista ${a.realizada ? "ez-real" : "ez-dato"} ${a.error ? "ez-error" : ""} ${activa ? "" : "ez-atenuado"} ${elegida ? "ez-elegida" : ""}`} onClick={() => setSeleccion({ tipo: "conexion", desde: a.desde, hasta: a.hasta })}>
                  <path d={`M${x1},${p1[1]} C${(x1 + x2) / 2},${p1[1]} ${(x1 + x2) / 2},${p2[1]} ${x2},${p2[1]}`} strokeWidth={Math.min(10, 1.5 + Math.sqrt(a.valor) * 1.4)} />
                  <path className="ez-arista-toque" d={`M${x1},${p1[1]} C${(x1 + x2) / 2},${p1[1]} ${(x1 + x2) / 2},${p2[1]} ${x2},${p2[1]}`} />
                  <text x={(x1 + x2) / 2} y={(p1[1] + p2[1]) / 2 - 6} textAnchor="middle">
                    {a.valor}
                  </text>
                </g>
              );
            })}
            {nodos.map((n) => {
              const [x, y] = pos.get(n.id)!;
              const activo = !atenuar || resaltados.has(n.id);
              return (
                <g
                  key={n.id}
                  data-nodo=""
                  className={`ez-nodo-t ${n.estado ? `ez-nodo-${n.estado}` : ""} ${activo ? "" : "ez-atenuado"}`}
                  transform={`translate(${x} ${y - 22})`}
                  onClick={() => {
                    if (n.id.startsWith("f:")) setSeleccion({ tipo: "fuente", clave: n.id.slice(2) });
                    else if (n.id.startsWith("e:")) setSeleccion({ tipo: "conexion", desde: n.id, hasta: n.id });
                    else if (n.id.startsWith("c:")) setSeleccion({ tipo: "conexion", desde: n.id, hasta: n.id });
                    else setSeleccion({ tipo: "conexion", desde: n.id, hasta: n.id });
                  }}
                >
                  <rect width="170" height="44" rx="12" />
                  <text x="14" y="19" className="ez-nodo-t-titulo">
                    {n.etiqueta.length > 22 ? `${n.etiqueta.slice(0, 21)}…` : n.etiqueta}
                  </text>
                  <text x="14" y="35" className="ez-nodo-t-valor">
                    {n.valor}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {/* Acceso por teclado y lector de pantalla: fuentes y contenidos como botones. */}
      <div className="ez-traza-botones">
        <span>{tr("ez_dc_col_fuentes")}:</span>
        {datos.fuentes.map((f) => (
          <button key={f.clave} aria-pressed={seleccion?.tipo === "fuente" && seleccion.clave === f.clave} onClick={() => setSeleccion({ tipo: "fuente", clave: f.clave })}>
            {f.etiqueta} ({f.eventos})
          </button>
        ))}
      </div>
      {datos.contenidos.length > 0 && (
        <div className="ez-traza-botones">
          <span>{tr("ez_dc_col_contenidos")}:</span>
          {datos.contenidos.slice(0, 30).map((c) => (
            <button key={c.id} aria-pressed={seleccion?.tipo === "contenido" && seleccion.id === c.id} onClick={() => setSeleccion({ tipo: "contenido", id: c.id })}>
              {c.titulo.length > 40 ? `${c.titulo.slice(0, 39)}…` : c.titulo}
            </button>
          ))}
        </div>
      )}
      <p className="ep-nota">{tr("ez_dc_trazaAyuda")}</p>
    </div>
  );
}

/* ── Panel de detalle compartido ── */
function FilaEvento({ e, tr, onClick }: { e: Evento; tr: Tr; onClick: () => void }) {
  return (
    <li>
      <button className="ez-dc-fila" onClick={onClick}>
        <strong>{e.titulo}</strong>
        <small>
          {[e.fecha ?? tr("ez_dc_sinFecha"), e.departamento ?? tr("ez_mapa_sinUbicacion"), tr(`ez_evest_${e.estado}`), `${e.registros.length} ${tr("ez_dc_fuentesN")}`, `${e.contenidos.length} ${tr("ez_dc_contenidosN")}`].join(" · ")}
        </small>
      </button>
    </li>
  );
}
function DestinoLinea({ d, tr }: { d: { canal: string; estado: string; enlace: string | null; fecha: string | null; realizado: boolean }; tr: Tr }) {
  return (
    <li className={d.estado === "envio_sin_confirmar" ? "ez-det-error" : ""}>
      {nombresCanal[d.canal] ?? d.canal} · {tr(`ez_dest_${d.estado}`)}
      {d.enlace && (
        <a href={d.enlace} target="_blank" rel="noreferrer noopener">
          {" "}
          {tr("ez_dc_verPublicacion")} <ArrowUpRight size={11} aria-hidden="true" />
        </a>
      )}
    </li>
  );
}
function PanelDetalle({ datos, seleccion, setSeleccion, tr, fecha }: { datos: Datos; seleccion: Seleccion; setSeleccion: (s: Seleccion) => void; tr: Tr; fecha: (iso: string) => string }) {
  if (!seleccion)
    return (
      <aside className="ez-dc-panel ez-dc-panel-vacio">
        <p>{tr("ez_dc_elige")}</p>
      </aside>
    );
  const cerrar = (
    <button className="ez-cerrar" onClick={() => setSeleccion(null)} aria-label={tr("p_cerrar")}>
      <X size={16} />
    </button>
  );
  const abrirEvento = (id: string) => setSeleccion({ tipo: "evento", id });
  if (seleccion.tipo === "departamento") {
    const lista = datos.eventos.filter((e) => (seleccion.nombre === "sin_ubicacion" ? !e.departamento : e.departamento === seleccion.nombre));
    const contenidos = new Set(lista.flatMap((e) => e.contenidos));
    return (
      <aside className="ez-dc-panel">
        <header>
          <h3>{seleccion.nombre === "sin_ubicacion" ? tr("ez_mapa_sinUbicacion") : seleccion.nombre}</h3>
          {cerrar}
        </header>
        <p className="ep-nota">
          {lista.length} {tr("ez_dc_m_eventos").toLowerCase()} · {contenidos.size} {tr("ez_dc_m_contenidos").toLowerCase()}
          {seleccion.nombre !== "sin_ubicacion" && ` · ${tr("ez_dc_agregadoNota")}`}
        </p>
        <ul className="ez-dc-lista">
          {lista.map((e) => (
            <FilaEvento key={e.id} e={e} tr={tr} onClick={() => abrirEvento(e.id)} />
          ))}
        </ul>
      </aside>
    );
  }
  if (seleccion.tipo === "evento") {
    const e = datos.eventos.find((x) => x.id === seleccion.id);
    if (!e) return <aside className="ez-dc-panel">{cerrar}</aside>;
    const contenidos = datos.contenidos.filter((c) => e.contenidos.includes(c.id));
    return (
      <aside className="ez-dc-panel">
        <header>
          <h3>{e.titulo}</h3>
          {cerrar}
        </header>
        <dl className="ez-det-datos">
          <div>
            <dt>{tr("ez_dc_ubicacion")}</dt>
            <dd>{e.departamento ? [e.lugar, e.municipio, e.departamento].filter(Boolean).join(", ") : tr("ez_mapa_sinUbicacion")}</dd>
          </div>
          <div>
            <dt>{tr("ez_dc_fechas")}</dt>
            <dd>
              {tr("ez_dc_fecha_evento")}: {e.fecha ?? tr("ez_dc_sinFecha")} · {tr("ez_dc_fecha_descubrimiento")}: {fecha(e.descubierto)}
            </dd>
          </div>
          <div>
            <dt>{tr("ez_dc_f_estado")}</dt>
            <dd>{tr(`ez_evest_${e.estado}`)}</dd>
          </div>
        </dl>
        <h4>
          {tr("ez_dc_procedencia")} ({e.registros.length})
        </h4>
        {e.registros.length ? (
          <ul className="ez-det-lista">
            {e.registros.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noreferrer noopener">
                  {r.etiqueta} <ArrowUpRight size={11} aria-hidden="true" />
                </a>
                <small>
                  {r.via === "web" ? tr("ez_dc_web") : r.via}
                  {r.leido ? ` · ${tr("ez_dc_leido")} ${fecha(r.leido)}` : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ez-vacio">{tr("ez_det_procedenciaNoRegistrada")}</p>
        )}
        <h4>{tr("ez_dc_agentes")}</h4>
        {e.ejecucion ? (
          <ul className="ez-det-lista">
            {e.ejecucion.pasos.map((p, i) => (
              <li key={`${p.agente}-${i}`} className={p.estado === "fallido" || p.estado === "bloqueado" ? "ez-det-error" : ""}>
                {p.titulo}
                <small>{e.ejecucion!.granja ?? ""}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ez-vacio">{tr("ez_dc_sinEjecucion")}</p>
        )}
        <h4>
          {tr("ez_dc_contenidoAsociado")} ({contenidos.length})
        </h4>
        {contenidos.length ? (
          <ul className="ez-det-lista">
            {contenidos.map((c) => (
              <li key={c.id}>
                <button className="ez-dc-enlace" onClick={() => setSeleccion({ tipo: "contenido", id: c.id })}>
                  {c.titulo}
                </button>
                <small>{c.destinos.map((d) => `${nombresCanal[d.canal] ?? d.canal}: ${tr(`ez_dest_${d.estado}`)}`).join(" · ")}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ez-vacio">{tr("ez_dc_sinContenido")}</p>
        )}
        <h4>Spotmi web</h4>
        <ul className="ez-det-lista">
          <DestinoLinea d={e.spotmi} tr={tr} />
        </ul>
      </aside>
    );
  }
  if (seleccion.tipo === "fuente") {
    const f = datos.fuentes.find((x) => x.clave === seleccion.clave);
    const lista = datos.eventos.filter((e) => e.registros.some((r) => r.clave === seleccion.clave));
    return (
      <aside className="ez-dc-panel">
        <header>
          <h3>{f?.etiqueta ?? seleccion.clave}</h3>
          {cerrar}
        </header>
        <p className="ep-nota">
          {f ? `${f.eventos} ${tr("ez_dc_m_eventos").toLowerCase()} · ${f.relaciones} ${tr("ez_dc_t_relaciones").toLowerCase()}${f.ultimaLectura ? ` · ${tr("ez_dc_leido")} ${fecha(f.ultimaLectura)}` : ""}` : ""}
        </p>
        <ul className="ez-dc-lista">
          {lista.map((e) => (
            <FilaEvento key={e.id} e={e} tr={tr} onClick={() => abrirEvento(e.id)} />
          ))}
        </ul>
      </aside>
    );
  }
  if (seleccion.tipo === "contenido") {
    const c = datos.contenidos.find((x) => x.id === seleccion.id);
    if (!c) return <aside className="ez-dc-panel">{cerrar}</aside>;
    const evs = datos.eventos.filter((e) => c.eventos.includes(e.id));
    return (
      <aside className="ez-dc-panel">
        <header>
          <h3>{c.titulo}</h3>
          {cerrar}
        </header>
        <p className="ep-nota">
          {tr(`ez_dc_contenido_${c.tipo}`)} · v{c.versiones}
        </p>
        <h4>{tr("ez_det_destinos")}</h4>
        <ul className="ez-det-lista">
          {c.destinos.map((d) => (
            <DestinoLinea key={d.canal} d={d} tr={tr} />
          ))}
        </ul>
        <h4>
          {tr("ez_dc_sustento")} ({evs.length})
        </h4>
        {evs.length ? (
          <ul className="ez-dc-lista">
            {evs.map((e) => (
              <FilaEvento key={e.id} e={e} tr={tr} onClick={() => abrirEvento(e.id)} />
            ))}
          </ul>
        ) : (
          <p className="ez-vacio">{tr("ez_det_procedenciaNoRegistrada")}</p>
        )}
      </aside>
    );
  }
  // Conexión o grupo: los registros que la componen.
  const [desde, hasta] = [seleccion.desde, seleccion.hasta];
  const eventosDe = (id: string) => (id.startsWith("e:") ? datos.eventos.filter((e) => e.estado === id.slice(2)) : id.startsWith("f:") ? datos.eventos.filter((e) => e.registros.some((r) => r.clave === id.slice(2))) : null);
  const contenidosDe = (id: string) => (id.startsWith("c:") ? datos.contenidos.filter((c) => c.tipo === id.slice(2)) : id.startsWith("d:") ? datos.contenidos.filter((c) => c.destinos.some((d) => d.canal === id.slice(2) && d.estado !== "no_enviado")) : null);
  let evs = desde === "d:spotmi" ? datos.eventos.filter((e) => e.spotmi.estado !== "no_enviado") : (eventosDe(desde) ?? datos.eventos);
  const otros = eventosDe(hasta);
  if (otros && desde !== hasta) evs = evs.filter((e) => otros.includes(e));
  let cons = contenidosDe(hasta) ?? (desde.startsWith("c:") ? contenidosDe(desde) : null);
  if (cons && desde.startsWith("e:")) cons = cons.filter((c) => c.eventos.some((id) => evs.some((e) => e.id === id)));
  const soloContenidos = desde.startsWith("c:") || (desde.startsWith("d:") && desde !== "d:spotmi");
  const etiqueta = (id: string) => {
    if (id.startsWith("f:")) return datos.fuentes.find((f) => f.clave === id.slice(2))?.etiqueta ?? id.slice(2);
    if (id.startsWith("e:")) return tr(`ez_dc_eventos_${id.slice(2)}`);
    if (id.startsWith("c:")) return tr(`ez_dc_contenido_${id.slice(2)}`);
    return nombresCanal[id.slice(2)] ?? id.slice(2);
  };
  return (
    <aside className="ez-dc-panel">
      <header>
        <h3>{desde === hasta ? etiqueta(desde) : `${etiqueta(desde)} → ${etiqueta(hasta)}`}</h3>
        {cerrar}
      </header>
      {!soloContenidos && (
        <>
          <h4>
            {tr("ez_dc_m_eventos")} ({evs.length})
          </h4>
          <ul className="ez-dc-lista">
            {evs.slice(0, 80).map((e) => (
              <FilaEvento key={e.id} e={e} tr={tr} onClick={() => abrirEvento(e.id)} />
            ))}
          </ul>
        </>
      )}
      {cons && (
        <>
          <h4>
            {tr("ez_dc_m_contenidos")} ({cons.length})
          </h4>
          <ul className="ez-det-lista">
            {cons.map((c) => (
              <li key={c.id}>
                <button className="ez-dc-enlace" onClick={() => setSeleccion({ tipo: "contenido", id: c.id })}>
                  {c.titulo}
                </button>
                <small>{c.destinos.map((d) => `${nombresCanal[d.canal] ?? d.canal}: ${tr(`ez_dest_${d.estado}`)}`).join(" · ")}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
