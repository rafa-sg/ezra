"use client";
import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import type { Trazabilidad } from "@/lib/granjas/trazabilidad";
import { GEOGRAFIA, type Punto } from "@/lib/granjas/geografia-sv";
import "./mapa-procedencia.css";

type Tr = (c: string) => string;
type Datos = Trazabilidad & { leido: string };
export type Metrica = "eventos" | "contenidos";
export type Seleccion =
  | { tipo: "departamento"; nombre: string }
  | { tipo: "evento"; id: string }
  | { tipo: "fuente"; clave: string }
  | { tipo: "contenido"; id: string }
  | { tipo: "conexion"; desde: string; hasta: string }
  | null;
/** Lo que el mapa resalta y describe: una fuente, un departamento (o «sin ubicación») o un destino. */
type Foco =
  | { tipo: "fuente"; clave: string }
  | { tipo: "departamento"; nombre: string }
  | { tipo: "destino"; canal: string };

export const nombresCanal: Record<string, string> = {
  spotmi: "Spotmi web",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
};
const SIN = "sin_ubicacion";

/* ── Proyección (equirrectangular corregida por latitud; a 13,7° la distorsión no se nota) ── */
const LNG0 = -90.16;
const LAT0 = 14.47;
const ESC = 270;
const COS = Math.cos((13.7 * Math.PI) / 180);
const proyectar = (p: Punto): [number, number] => [
  300 + (p.lng - LNG0) * ESC * COS,
  230 + (LAT0 - p.lat) * ESC,
];
function dentroDe(x: number, y: number, anillo: [number, number][]) {
  let si = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
  }
  return si;
}
function centroide(anillos: [number, number][][]): [number, number] {
  const pts = [...anillos].sort((a, b) => b.length - a.length)[0];
  let [x, y, area] = [0, 0, 0];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    area += f;
    x += (pts[j][0] + pts[i][0]) * f;
    y += (pts[j][1] + pts[i][1]) * f;
  }
  return area ? [x / (3 * area), y / (3 * area)] : pts[0];
}
/** Matriz de puntos (cada punto sabe a qué departamento real pertenece) y el centro de cada departamento. */
let geoCache: {
  puntos: { x: number; y: number; d: string }[];
  centros: Record<string, [number, number]>;
} | null = null;
function geo() {
  if (geoCache) return geoCache;
  const deptos = Object.values(GEOGRAFIA).map((d) => ({
    nombre: d.nombre,
    anillos: d.anillos.map((a) => a.map(proyectar)),
  }));
  const todos = deptos.flatMap((d) => d.anillos.flat());
  const [x0, x1] = [Math.min(...todos.map((p) => p[0])), Math.max(...todos.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...todos.map((p) => p[1])), Math.max(...todos.map((p) => p[1]))];
  const puntos: { x: number; y: number; d: string }[] = [];
  for (let y = y0; y <= y1; y += 7.5)
    for (let x = x0; x <= x1; x += 7.5) {
      const d = deptos.find((dep) => dep.anillos.some((a) => dentroDe(x, y, a)));
      if (d) puntos.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, d: d.nombre });
    }
  geoCache = {
    puntos,
    centros: Object.fromEntries(deptos.map((d) => [d.nombre, centroide(d.anillos)])),
  };
  return geoCache;
}
/** El país con espacio arriba para ezrá. */
const VB: [number, number, number, number] = [292, 112, 676, 490];
const HUB: [number, number] = [630, 150];
const X_PAIS: [number, number] = [308, 951];
/** Con este ancho o más, el listado va abierto debajo del mapa; si no, se pliega. */
const ANCHO_AMPLIO = 760;

const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const reciente = (iso: string | null, horas = 48) =>
  Boolean(iso && Date.now() - Date.parse(iso) < horas * 3_600_000);
export function hace(iso: string | null, tr: Tr) {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  const h = Math.round(min / 60);
  const [clave, n] =
    min < 60
      ? ["ez_hace_min", min]
      : h < 48
        ? ["ez_hace_h", h]
        : ["ez_hace_dias", Math.round(h / 24)];
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
/** Ancho real de un elemento (la barra lateral plegada o expandida lo cambia). */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}
/** Conteo que pasa de un valor al siguiente en su lugar, sin mover la pantalla. */
function Conteo({ valor, reducido }: { valor: number; reducido: boolean }) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);
  useEffect(() => {
    const inicio = desde.current;
    if (reducido || inicio === valor) {
      desde.current = valor;
      queueMicrotask(() => setMostrado(valor));
      return;
    }
    let cuadro = 0;
    const t0 = performance.now();
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / 380);
      const v = Math.round(inicio + (valor - inicio) * (1 - (1 - p) ** 3));
      setMostrado(v);
      desde.current = v;
      if (p < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor, reducido]);
  return <>{mostrado}</>;
}
/** De ezrá a un departamento: sale hacia abajo y llega en curva suave. */
const curva = ([x1, y1]: [number, number], [x2, y2]: [number, number]) => {
  const c = (y2 - y1) * 0.55;
  const f = (v: number) => v.toFixed(1);
  return `M${f(x1)},${f(y1)} C${f(x1 + (x2 - x1) * 0.15)},${f(y1 + c)} ${f(x2)},${f(y2 - c)} ${f(x2)},${f(y2)}`;
};

const focoDeSeleccion = (s: Seleccion): Foco | null =>
  s?.tipo === "fuente"
    ? s
    : s?.tipo === "departamento"
      ? s
      : s?.tipo === "conexion" && s.desde === s.hasta && s.desde.startsWith("d:")
        ? { tipo: "destino", canal: s.desde.slice(2) }
        : null;
const claveFoco = (f: Foco | null) =>
  !f
    ? ""
    : f.tipo === "fuente"
      ? `f:${f.clave}`
      : f.tipo === "destino"
        ? `d:${f.canal}`
        : `p:${f.nombre}`;
const seleccionDe = (f: Foco): Seleccion =>
  f.tipo === "destino" ? { tipo: "conexion", desde: `d:${f.canal}`, hasta: `d:${f.canal}` } : f;
/** El foco solo muestra la vista previa cuando viene del teclado (al tocar, la elección ya muestra el detalle). */
const porTeclado = (e: FocusEvent<Element>) => e.currentTarget.matches(":focus-visible");

/** Relaciones reales entre fuentes, departamentos y destinos (todas salen de vínculos guardados). */
function relaciones(datos: Datos) {
  const deptoDe = (e: Datos["eventos"][number]) => e.departamento ?? SIN;
  const contenidoPorId = new Map(datos.contenidos.map((c) => [c.id, c]));
  const destinosDe = (e: Datos["eventos"][number]) => {
    const s = new Set<string>();
    if (e.spotmi.estado !== "no_enviado") s.add("spotmi");
    for (const id of e.contenidos)
      contenidoPorId.get(id)?.destinos.forEach((d) => d.estado !== "no_enviado" && s.add(d.canal));
    return s;
  };
  const m = new Map<
    string,
    { realizadas: number; pendientes: number; errores: number; ultima: string | null }
  >();
  const sumar = (canal: string, estado: string, realizado: boolean, fecha: string | null) => {
    if (estado === "no_enviado") return;
    const d = m.get(canal) ?? { realizadas: 0, pendientes: 0, errores: 0, ultima: null };
    if (realizado) d.realizadas++;
    else if (estado === "envio_sin_confirmar") d.errores++;
    else d.pendientes++;
    if (realizado && fecha && (!d.ultima || fecha > d.ultima)) d.ultima = fecha;
    m.set(canal, d);
  };
  for (const e of datos.eventos)
    sumar("spotmi", e.spotmi.estado, e.spotmi.realizado, e.spotmi.fecha);
  for (const c of datos.contenidos)
    for (const d of c.destinos) sumar(d.canal, d.estado, d.realizado, d.fecha);
  const destinos = [...new Set(["spotmi", "instagram", ...m.keys()])].map((canal) => ({
    canal,
    ...(m.get(canal) ?? { realizadas: 0, pendientes: 0, errores: 0, ultima: null }),
  }));
  return { deptoDe, destinosDe, destinos };
}
type Rel = ReturnType<typeof relaciones>;

/** Lo asociado a la selección: departamentos, fuentes y destinos, con cuántos eventos los unen. */
function alcance(datos: Datos, rel: Rel, foco: Foco | null, seleccion: Seleccion) {
  let eventos: Datos["eventos"] = [];
  if (foco?.tipo === "fuente")
    eventos = datos.eventos.filter((e) => e.registros.some((r) => r.clave === foco.clave));
  else if (foco?.tipo === "departamento")
    eventos = datos.eventos.filter((e) => rel.deptoDe(e) === foco.nombre);
  else if (foco?.tipo === "destino")
    eventos = datos.eventos.filter((e) => rel.destinosDe(e).has(foco.canal));
  else if (seleccion?.tipo === "evento")
    eventos = datos.eventos.filter((e) => e.id === seleccion.id);
  else if (seleccion?.tipo === "contenido") {
    const c = datos.contenidos.find((x) => x.id === seleccion.id);
    eventos = datos.eventos.filter((e) => c?.eventos.includes(e.id));
  }
  const hay = Boolean(foco) || seleccion?.tipo === "evento" || seleccion?.tipo === "contenido";
  const deptos = new Map<string, number>();
  const fuentes = new Map<string, number>();
  const destinos = new Map<string, number>();
  let ultimo: string | null = null;
  for (const e of eventos) {
    const d = rel.deptoDe(e);
    deptos.set(d, (deptos.get(d) ?? 0) + 1);
    for (const clave of new Set(e.registros.map((r) => r.clave)))
      fuentes.set(clave, (fuentes.get(clave) ?? 0) + 1);
    for (const c of rel.destinosDe(e)) destinos.set(c, (destinos.get(c) ?? 0) + 1);
    if (!ultimo || e.descubierto > ultimo) ultimo = e.descubierto;
  }
  let compartidas = new Map<string, number>();
  if (foco?.tipo === "fuente") {
    // Una fuente resalta solo su propio recorrido; las que comparten eventos se nombran en el detalle.
    compartidas = new Map(fuentes);
    compartidas.delete(foco.clave);
    fuentes.clear();
    fuentes.set(foco.clave, eventos.length);
  }
  if (foco?.tipo === "departamento") deptos.set(foco.nombre, deptos.get(foco.nombre) ?? 0);
  if (foco?.tipo === "destino") destinos.set(foco.canal, destinos.get(foco.canal) ?? 0);
  return { hay, eventos: eventos.length, deptos, fuentes, destinos, ultimo, compartidas };
}
type Alcance = ReturnType<typeof alcance>;

/**
 * Mapa de Inicio. Arriba no hay texto: ezrá en el centro y una conexión a cada departamento con
 * eventos, con su conteo dentro del marcador y el nombre al pasar o elegir. Fuentes, destinos y «sin
 * ubicación» van debajo del mapa. Mientras cargan los datos, el mapa ya anticipa lo que viene: el país
 * aparece en ola, ezrá late y unas líneas fantasma llegan a cada departamento; con los datos, las que
 * tienen eventos se vuelven conexiones reales y aparecen los marcadores.
 */
export function MapaProcedencia({
  datos,
  cargando,
  tr,
  metrica,
  seleccion,
  setSeleccion,
}: {
  datos: Datos | null;
  cargando: boolean;
  tr: Tr;
  metrica: Metrica;
  seleccion: Seleccion;
  setSeleccion: (s: Seleccion) => void;
}) {
  const [contenedor, ancho] = useAncho<HTMLDivElement>();
  const [escena, anchoMapa] = useAncho<HTMLDivElement>();
  const amplio = ancho === 0 || ancho >= ANCHO_AMPLIO;
  const reducido = useMovReducido();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [previa, setPrevia] = useState<Foco | null>(null);
  const { centros } = geo();
  const rel = useMemo(() => (datos ? relaciones(datos) : null), [datos]);
  const fijo = focoDeSeleccion(seleccion);
  const al = datos && rel ? alcance(datos, rel, fijo, seleccion) : null;
  const claveSel = claveFoco(fijo);

  // Tamaños pensados en píxeles de pantalla (legibles a cualquier ancho), pasados a unidades del mapa.
  const escala = Math.max(0.3, (anchoMapa || 900) / VB[2]);
  const conNumeros = escala >= 0.72;
  const por = new Map((datos?.departamentos ?? []).map((d) => [d.nombre, d]));
  const deptos = [...por.values()]
    .filter((d) => d.nombre !== SIN && d[metrica] > 0 && centros[d.nombre])
    .sort((a, b) => b[metrica] - a[metrica]);
  const max = Math.max(1, ...deptos.map((d) => d[metrica]));
  const [rMin, rMax] = conNumeros ? [11, 22] : [4.5, 10];
  const radio = (v: number) => (rMin + Math.sqrt(v / max) * (rMax - rMin)) / escala;
  const sinUbic = por.get(SIN);
  const deptosConDatos = new Set(deptos.map((d) => d.nombre));
  const claveDatos = [...deptosConDatos].join("|");
  const claveActivos = al?.hay ? [...al.deptos.keys()].sort().join("|") : "";
  const hayActividad = Boolean(datos?.fuentes.some((f) => reciente(f.ultimaLectura)));
  const [hw, hh] = [46 / escala, 17 / escala];
  const salida: [number, number] = [HUB[0], HUB[1] + hh];

  // Escape quita la selección cuando el foco está dentro del mapa o su listado.
  useEffect(() => {
    if (!claveSel) return;
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && contenedor.current?.contains(document.activeElement))
        setSeleccion(null);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [claveSel, setSeleccion, contenedor]);

  const elegir = (f: Foco) => setSeleccion(claveFoco(f) === claveSel ? null : seleccionDe(f));
  /** Pasar el cursor resalta sin mover nada; clic, toque o Enter fijan la selección. */
  const explorable = (f: Foco, etiqueta: string) => ({
    tabIndex: 0,
    role: "button" as const,
    "aria-label": etiqueta,
    "aria-pressed": claveFoco(f) === claveSel,
    onClick: () => elegir(f),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        elegir(f);
      }
    },
    onPointerEnter: () => setPrevia(f),
    onPointerLeave: () => setPrevia(null),
    onFocus: (e: FocusEvent<Element>) => porTeclado(e) && setPrevia(f),
    onBlur: () => setPrevia(null),
  });
  const nEv = (n: number) => `${n} ${tr(n === 1 ? "ez_mapa_evento" : "ez_mapa_eventos")}`;
  const unidad = tr(`ez_dc_m_${metrica}`).toLowerCase();
  const destinoTexto = (d: Rel["destinos"][number]) =>
    tr("ez_dc_destinoResumen")
      .replace("{r}", String(d.realizadas))
      .replace("{p}", String(d.pendientes)) +
    (d.errores ? ` · ${d.errores} ${tr("ez_dc_sinConfirmar")}` : "");
  const estado = (k: string, enAlcance: boolean) =>
    [
      k === claveSel ? "ez-mp-elegido" : "",
      al?.hay && !enAlcance ? "ez-mp-tenue" : "",
      al?.hay && enAlcance && k !== claveSel ? "ez-mp-rel" : "",
      claveFoco(previa) === k ? "ez-mp-sobre" : "",
    ].join(" ");
  const nombres = [
    ...new Set([
      previa?.tipo === "departamento" ? previa.nombre : "",
      fijo?.tipo === "departamento" ? fijo.nombre : "",
    ]),
  ].filter((n) => n && n !== SIN && deptosConDatos.has(n));
  const totalListado =
    (datos?.fuentes.length ?? 0) + (rel?.destinos.length ?? 0) + (sinUbic?.[metrica] ? 1 : 0);
  // Conexiones de la selección (ezrá ↔ departamento): se dibujan una vez con dirección y quedan.
  // Hacia un destino, el recorrido va del departamento a ezrá; en lo demás, de ezrá al departamento.
  const rutas = al?.hay ? deptos.filter((d) => al.deptos.has(d.nombre)) : [];
  const haciaEzra = fijo?.tipo === "destino";

  const listado = (
    <>
      <Grupo titulo={tr("ez_mapa_fuentes")} n={datos?.fuentes.length}>
        {!datos && <Esqueleto filas={3} />}
        {datos?.fuentes.map((f, i) => {
          const k = `f:${f.clave}`;
          return (
            <Fila
              key={k}
              k={k}
              i={i}
              clase={estado(k, Boolean(al?.fuentes.has(f.clave)))}
              {...explorable(
                { tipo: "fuente", clave: f.clave },
                `${f.etiqueta}: ${nEv(f.eventos)}`,
              )}
            >
              <span className="ez-mp-fila-nombre" title={f.etiqueta}>
                {recortar(f.etiqueta, 28)}
              </span>
              <b>
                <Conteo valor={f.eventos} reducido={reducido} />
              </b>
            </Fila>
          );
        })}
      </Grupo>
      <Grupo titulo={tr("ez_dc_col_destinos")} n={rel?.destinos.length}>
        {!datos && <Esqueleto filas={2} />}
        {rel?.destinos.map((d, i) => {
          const k = `d:${d.canal}`;
          const nombre = nombresCanal[d.canal] ?? d.canal;
          return (
            <Fila
              key={k}
              k={k}
              i={i}
              clase={`${estado(k, Boolean(al?.destinos.has(d.canal)))} ${d.realizadas + d.pendientes + d.errores ? "" : "ez-mp-sin-actividad"}`}
              {...explorable({ tipo: "destino", canal: d.canal }, `${nombre}: ${destinoTexto(d)}`)}
            >
              <span className="ez-mp-fila-nombre">{nombre}</span>
              <small>{destinoTexto(d)}</small>
            </Fila>
          );
        })}
      </Grupo>
      <Grupo titulo={tr("ez_mp_sinAnclar")}>
        {!datos && <Esqueleto filas={1} />}
        {sinUbic && sinUbic[metrica] > 0 && (
          <Fila
            k={`p:${SIN}`}
            i={0}
            clase={`ez-mp-fila-sin ${estado(`p:${SIN}`, Boolean(al?.deptos.has(SIN)))}`}
            {...explorable(
              { tipo: "departamento", nombre: SIN },
              `${tr("ez_mapa_sinUbicacion")}: ${sinUbic[metrica]} ${unidad}`,
            )}
          >
            <span className="ez-mp-fila-nombre">{tr("ez_mapa_sinUbicacion")}</span>
            <b>
              <Conteo valor={sinUbic[metrica]} reducido={reducido} />
            </b>
          </Fila>
        )}
      </Grupo>
    </>
  );

  return (
    <div
      ref={contenedor}
      className={`ez-mp ${amplio ? "ez-mp-amplio" : "ez-mp-angosto"}`}
      data-cargando={cargando || !datos ? "" : undefined}
      aria-busy={cargando || !datos}
    >
      <div ref={escena} className="ez-mp-escena">
        <svg
          viewBox={VB.join(" ")}
          role="group"
          aria-label={`${tr("ez_dc_mapaAlt")}. ${deptos.map((d) => `${d.nombre} ${d[metrica]}`).join(", ")}.`}
        >
          <defs>
            <filter id={`${uid}-brillo`} x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation={5 / escala} />
            </filter>
            <linearGradient
              id={`${uid}-linea`}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={HUB[1]}
              x2="0"
              y2={VB[1] + VB[3]}
            >
              <stop offset="0" className="ez-mp-linea-hub" />
              <stop offset="1" className="ez-mp-linea-depto" />
            </linearGradient>
          </defs>
          {/* 1 · El país, en ola. Tocar un punto de un departamento con datos lo elige. */}
          <g
            className="ez-mp-puntos"
            aria-hidden="true"
            onClick={(e) => {
              const d = (e.target as Element).getAttribute("data-d");
              if (d && deptosConDatos.has(d)) elegir({ tipo: "departamento", nombre: d });
            }}
          >
            <PuntosPais activos={claveActivos} conDatos={claveDatos} />
          </g>

          {/* 2a · Cargando: líneas fantasma de ezrá a los 14 departamentos y anillos donde irán los marcadores. */}
          {!datos && (
            <g className="ez-mp-fantasmas" aria-hidden="true">
              {Object.entries(centros).map(([n, c], i) => (
                <g key={n} style={{ ["--i" as string]: i }}>
                  <path d={curva(salida, c)} pathLength={1} strokeWidth={1.5 / escala} />
                  <circle cx={c[0]} cy={c[1]} r={9 / escala} strokeWidth={1.5 / escala} />
                </g>
              ))}
            </g>
          )}

          {/* 2b · Conexiones de ezrá a cada departamento con eventos (por debajo de los marcadores). */}
          {datos && (
            <g className="ez-mp-lineas" aria-hidden="true">
              {deptos.map((d, i) => {
                const camino = curva(salida, centros[d.nombre]);
                const clase = `${al?.hay && !al.deptos.has(d.nombre) ? "ez-mp-tenue" : ""} ${claveFoco(previa) === `p:${d.nombre}` ? "ez-mp-sobre" : ""}`;
                return (
                  <g key={d.nombre} className={clase} style={{ ["--i" as string]: i }}>
                    <path
                      d={camino}
                      pathLength={1}
                      stroke={`url(#${uid}-linea)`}
                      strokeWidth={(1 + Math.sqrt(d[metrica] / max) * 1.4) / escala}
                      className="ez-mp-linea"
                    />
                    {/* Flujo discreto: pequeños tramos que bajan de ezrá (solo con lecturas recientes y sin selección). */}
                    {hayActividad && !reducido && !al?.hay && (
                      <path
                        d={camino}
                        pathLength={1}
                        strokeWidth={1.6 / escala}
                        className="ez-mp-flujo"
                      />
                    )}
                  </g>
                );
              })}
            </g>
          )}
          {/* Selección: el recorrido se dibuja una vez y queda; cambiar de selección cancela el anterior. */}
          {datos && rutas.length > 0 && (
            <g className="ez-mp-rutas" aria-hidden="true" key={claveSel || "sel"}>
              {rutas.map((d, i) => {
                const fin = centros[d.nombre];
                const r = radio(d[metrica]) + 3 / escala;
                const llegada: [number, number] = [fin[0], fin[1] - r];
                const camino = haciaEzra ? curvaInversa(llegada, salida) : curva(salida, llegada);
                return (
                  <g key={d.nombre} className="ez-mp-ruta" style={{ ["--i" as string]: i }}>
                    <path
                      d={camino}
                      pathLength={1}
                      strokeWidth={(2 + Math.sqrt(d[metrica] / max) * 1.6) / escala}
                    />
                    <Cabeza
                      d={camino}
                      fin={haciaEzra ? salida : llegada}
                      retraso={i * 0.05}
                      reducido={reducido}
                      r={3.6 / escala}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* 3 · Marcadores, del mayor al menor, con su conteo dentro. */}
          <g className="ez-mp-marcadores">
            {deptos.map((d, i) => {
              const [x, y] = centros[d.nombre];
              const r = radio(d[metrica]);
              return (
                <g
                  key={d.nombre}
                  data-depto={d.nombre}
                  className={`ez-mp-marcador ${estado(`p:${d.nombre}`, Boolean(al?.deptos.has(d.nombre)))}`}
                  style={{ ["--i" as string]: i, transformOrigin: `${x}px ${y}px` }}
                  {...explorable(
                    { tipo: "departamento", nombre: d.nombre },
                    `${d.nombre}: ${d[metrica]} ${unidad}`,
                  )}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={r * 1.9}
                    className="ez-mp-halo"
                    filter={`url(#${uid}-brillo)`}
                  />
                  <circle cx={x} cy={y} r={r + 4 / escala} className="ez-mp-anillo" />
                  <circle cx={x} cy={y} r={r} className="ez-mp-nucleo" />
                  {conNumeros && (
                    <text
                      x={x}
                      y={y}
                      dy="0.36em"
                      textAnchor="middle"
                      fontSize={Math.min(12.5, r * escala * 0.95) / escala}
                      className="ez-mp-cifra"
                    >
                      <Conteo valor={d[metrica]} reducido={reducido} />
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* 4 · ezrá, en el centro. Late mientras cargan los datos. */}
          <g className={`ez-mp-hub ${!datos ? "ez-mp-hub-cargando" : ""}`} aria-hidden="true">
            <circle
              cx={HUB[0]}
              cy={HUB[1]}
              r={34 / escala}
              className="ez-mp-halo"
              filter={`url(#${uid}-brillo)`}
            />
            <rect x={HUB[0] - hw} y={HUB[1] - hh} width={hw * 2} height={hh * 2} rx={hh} />
            <text x={HUB[0]} y={HUB[1]} dy="0.36em" textAnchor="middle" fontSize={17 / escala}>
              ezrá
            </text>
            <circle cx={salida[0]} cy={salida[1]} r={3 / escala} className="ez-mp-puerto" />
          </g>

          <g className="ez-mp-nombres" aria-hidden="true">
            {nombres.map((n) => {
              const [x, y] = centros[n];
              const v = por.get(n)?.[metrica] ?? 0;
              const r = radio(v);
              return (
                <text
                  key={n}
                  x={x}
                  y={y + r + 19 / escala}
                  textAnchor="middle"
                  fontSize={13 / escala}
                >
                  {n} · {v} {unidad}
                </text>
              );
            })}
          </g>
        </svg>
        {datos && deptos.length === 0 && (
          <p className="ez-mp-aviso">
            {tr(metrica === "contenidos" ? "ez_mp_sinContenidos" : "ez_dc_sinDatos")}
          </p>
        )}
      </div>

      {/* Debajo del mapa: el detalle de lo elegido y el listado de fuentes, destinos y sin ubicación. */}
      <div className="ez-mp-bajo">
        <div className="ez-mp-progreso" aria-hidden="true" />
        {(fijo || !amplio) && <DetalleBreve datos={datos} rel={rel} foco={fijo} al={al} tr={tr} />}
        {amplio ? (
          <div className="ez-mp-listado" aria-label={tr("ez_mp_recorrido")} role="group">
            {listado}
          </div>
        ) : (
          <details className="ez-mp-plegable">
            <summary>
              <span>{tr("ez_mp_listado")}</span>
              <b>{totalListado}</b>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className="ez-mp-plegable-cuerpo">{listado}</div>
          </details>
        )}
      </div>
    </div>
  );
}
/**
 * El país en ola (oeste → este) la primera vez; los departamentos con datos y los elegidos, más
 * intensos. Componente aparte y memorizado: pasar el cursor no vuelve a dibujar los ~2.000 puntos.
 */
const PuntosPais = memo(function PuntosPais({
  activos,
  conDatos,
}: {
  activos: string;
  conDatos: string;
}) {
  const { puntos } = geo();
  const on = new Set(activos.split("|").filter(Boolean));
  const datos = new Set(conDatos.split("|").filter(Boolean));
  return (
    <>
      {puntos.map((p, i) => (
        <circle
          key={i}
          data-d={p.d}
          cx={p.x}
          cy={p.y}
          r={1.7}
          style={{
            animationDelay: `${Math.round(((p.x - X_PAIS[0]) / (X_PAIS[1] - X_PAIS[0])) * 520)}ms`,
          }}
          className={on.has(p.d) ? "ez-mp-p-activo" : datos.has(p.d) ? "ez-mp-p-datos" : "ez-mp-p"}
        />
      ))}
    </>
  );
});

/** Del departamento hacia ezrá (para los destinos: lo que sale hacia afuera pasa por ezrá). */
const curvaInversa = (a: [number, number], b: [number, number]) => {
  const c = (a[1] - b[1]) * 0.55;
  const f = (v: number) => v.toFixed(1);
  return `M${f(a[0])},${f(a[1])} C${f(a[0])},${f(a[1] - c)} ${f(b[0] + (a[0] - b[0]) * 0.15)},${f(b[1] + c)} ${f(b[0])},${f(b[1])}`;
};

/** Punto que recorre la conexión una sola vez y se queda en la llegada. */
function Cabeza({
  d,
  fin,
  retraso,
  reducido,
  r,
}: {
  d: string;
  fin: [number, number];
  retraso: number;
  reducido: boolean;
  r: number;
}) {
  const anim = useRef<SVGAnimateMotionElement>(null);
  useEffect(() => {
    anim.current?.beginElementAt(retraso);
  }, [retraso]);
  if (reducido) return <circle className="ez-mp-cabeza" cx={fin[0]} cy={fin[1]} r={r} />;
  return (
    <circle className="ez-mp-cabeza" r={r} cx={0} cy={0}>
      <animateMotion
        ref={anim}
        dur="0.75s"
        begin="indefinite"
        fill="freeze"
        path={d}
        calcMode="spline"
        keyTimes="0;1"
        keySplines="0.22 1 0.36 1"
      />
    </circle>
  );
}

function Grupo({ titulo, n, children }: { titulo: string; n?: number; children: ReactNode }) {
  return (
    <section className="ez-mp-grupo">
      <h3>
        {titulo}
        {n !== undefined && <span>{n}</span>}
      </h3>
      <ul>{children}</ul>
    </section>
  );
}
function Fila({
  k,
  i,
  clase,
  children,
  ...resto
}: { k: string; i: number; clase: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <li style={{ ["--i" as string]: i }}>
      <button type="button" data-fila={k} className={`ez-mp-fila ${clase}`} {...resto}>
        <span className="ez-mp-ancla" aria-hidden="true" />
        {children}
      </button>
    </li>
  );
}
/** Mientras llegan los datos: el espacio ya reservado, sin saltos. */
function Esqueleto({ filas }: { filas: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <li key={i} className="ez-mp-esqueleto" aria-hidden="true">
          <span />
          <span />
        </li>
      ))}
    </>
  );
}

/** Detalle de la selección: cantidad, última actividad y relaciones reales. */
function DetalleBreve({
  datos,
  rel,
  foco,
  al,
  tr,
}: {
  datos: Datos | null;
  rel: Rel | null;
  foco: Foco | null;
  al: Alcance | null;
  tr: Tr;
}) {
  if (!datos || !rel || !al)
    return <div className="ez-mp-detalle ez-mp-detalle-cargando" aria-hidden="true" />;
  if (!foco) return <p className="ez-mp-detalle ez-mp-pista">{tr("ez_mp_pistaMovil")}</p>;
  const lista = (m: Map<string, number>, nombre: (k: string) => string) => {
    const orden = [...m.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const vis = orden.slice(0, 4).map(([c, n]) => `${nombre(c)} ${n}`);
    return orden.length > 4
      ? `${vis.join(" · ")} · ${tr("ez_mp_yMas").replace("{n}", String(orden.length - 4))}`
      : vis.join(" · ");
  };
  const depto = (n: string) => (n === SIN ? tr("ez_mapa_sinUbicacion") : n);
  const fuente = (c: string) => datos.fuentes.find((f) => f.clave === c)?.etiqueta ?? c;
  const nEv = (n: number) => `${n} ${tr(n === 1 ? "ez_mapa_evento" : "ez_mapa_eventos")}`;
  let titulo = "";
  let linea = "";
  const relacion: string[] = [];
  if (foco.tipo === "fuente") {
    const f = datos.fuentes.find((x) => x.clave === foco.clave);
    titulo = f?.etiqueta ?? foco.clave;
    linea = [
      nEv(al.eventos),
      f?.ultimaLectura ? tr("ez_mp_ultimaLectura").replace("{t}", hace(f.ultimaLectura, tr)) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (al.deptos.size) relacion.push(`${tr("ez_dc_departamentos")}: ${lista(al.deptos, depto)}`);
    if (al.compartidas.size)
      relacion.push(`${tr("ez_mp_compartidos")}: ${lista(al.compartidas, fuente)}`);
  } else if (foco.tipo === "departamento") {
    const d = datos.departamentos.find((x) => x.nombre === foco.nombre);
    titulo = depto(foco.nombre);
    linea = [
      nEv(d?.eventos ?? 0),
      `${d?.contenidos ?? 0} ${tr("ez_dc_m_contenidos").toLowerCase()}`,
      al.ultimo ? tr("ez_mp_ultimoHallazgo").replace("{t}", hace(al.ultimo, tr)) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (al.fuentes.size) relacion.push(`${tr("ez_mapa_fuentes")}: ${lista(al.fuentes, fuente)}`);
    if (foco.nombre === SIN) relacion.push(tr("ez_mp_sinAnclarNota"));
  } else {
    const d = rel.destinos.find((x) => x.canal === foco.canal);
    titulo = nombresCanal[foco.canal] ?? foco.canal;
    linea = [
      tr("ez_dc_destinoResumen")
        .replace("{r}", String(d?.realizadas ?? 0))
        .replace("{p}", String(d?.pendientes ?? 0)),
      d?.errores ? `${d.errores} ${tr("ez_dc_sinConfirmar")}` : "",
      d?.ultima ? tr("ez_mp_ultimaEntrega").replace("{t}", hace(d.ultima, tr)) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    relacion.push(
      al.deptos.size
        ? `${tr("ez_dc_departamentos")}: ${lista(al.deptos, depto)}`
        : tr("ez_mp_sinEnvios"),
    );
  }
  return (
    <div className="ez-mp-detalle" aria-live="polite">
      <strong>{titulo}</strong>
      <span>{linea}</span>
      {relacion.map((r) => (
        <span key={r} className="ez-mp-relacion">
          {r}
        </span>
      ))}
      <small>{tr("ez_mp_detalleAbajo")}</small>
    </div>
  );
}
