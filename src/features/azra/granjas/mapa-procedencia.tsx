"use client";
import {
  memo,
  useCallback,
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
import { ANCLA, VB, X_PAIS, bordes, geo, geometriaAccesos } from "./mapa-geo";
import { agendaVigente } from "@/lib/granjas/agenda-mapa";
import { ACCESOS, POBLACION_2024 } from "@/lib/granjas/datos-pais";
import { diaLocal } from "@/lib/granjas/tiempo";
import {
  AgendaDepto,
  CapaAccesos,
  ControlesCapas,
  DetalleAcceso,
  DetallePoblacion,
  DetallePuesto,
  PanelMapa,
  PulsosIngreso,
  nivelesPoblacion,
  useImanes,
  type Capas,
  type Panel,
  type Solo,
} from "./mapa-capas";
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

/** Con este ancho o más, el listado va abierto debajo del mapa; si no, se pliega. */
const ANCHO_AMPLIO = 760;

const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
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
  // Inicio abre con Eventos e Ingresos juntos; Población es una consulta aparte.
  const [capas, setCapas] = useState<Capas>({ eventos: true, ingresos: true });
  const [poblacion, setPoblacion] = useState(false);
  const verEventos = !poblacion && capas.eventos;
  const verIngresos = !poblacion && capas.ingresos;
  const [panel, setPanel] = useState<Panel>(null);
  const [corrida, setCorrida] = useState(0);
  const [solo, setSolo] = useState<Solo>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const hoy = diaLocal();
  // Un solo origen para el marcador y su agenda: eventos confirmados, vigentes y sin duplicados.
  const agenda = useMemo(() => (datos ? agendaVigente(datos.eventos, hoy) : null), [datos, hoy]);
  const departamentosVista = useMemo(() => {
    if (!datos) return [];
    if (metrica !== "eventos" || !agenda) return datos.departamentos;
    const base = new Map(datos.departamentos.map((d) => [d.nombre, d]));
    return [...new Set([...base.keys(), ...agenda.keys()])].map((n) => ({
      nombre: n,
      eventos: agenda.get(n)?.length ?? 0,
      contenidos: base.get(n)?.contenidos ?? 0,
    }));
  }, [datos, agenda, metrica]);
  const geos = geometriaAccesos();
  const niveles = useMemo(() => nivelesPoblacion(), []);

  // Tamaños pensados en píxeles de pantalla (legibles a cualquier ancho), pasados a unidades del mapa.
  const escala = Math.max(0.3, (anchoMapa || 900) / VB[2]);
  const conNumeros = escala >= 0.72;
  const imanes = useImanes(escala, reducido);
  const por = new Map(departamentosVista.map((d) => [d.nombre, d]));
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
  const salida = ANCLA;
  // Posición del marcador: si un cruce queda debajo, el marcador se aparta lo justo (nada se tapa).
  const pos = (n: string): [number, number] => {
    let [x, y] = centros[n];
    if (!verIngresos) return [x, y];
    const r = radio(por.get(n)?.[metrica] ?? 0);
    for (const g of geos)
      for (const p of g.puestos) {
        const min = r + (g.acceso.tipo === "aereo" ? 14 : 9) / escala;
        const [dx, dy] = [x - p.punto[0], y - p.punto[1]];
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < min) [x, y] = [p.punto[0] + (dx / d) * min, p.punto[1] + (dy / d) * min];
      }
    return [x, y];
  };

  const clavePanel = !panel
    ? ""
    : panel.tipo === "acceso"
      ? `a:${panel.id}`
      : panel.tipo === "puesto"
        ? `i:${panel.id}`
        : panel.tipo === "poblacion"
          ? `h:${panel.nombre}`
          : `p:${panel.nombre}`;
  /** Cierra la agenda o el detalle y devuelve el foco al marcador (o fila) que lo abrió. */
  const cerrarPanel = useCallback(() => {
    const k = clavePanel;
    setPanel(null);
    setSeleccion(null);
    setSolo(null);
    if (k)
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            `[data-mapa="${uid}"] :is([data-foco="${k}"], [data-fila="${k}"])`,
          )
          ?.focus({ preventScroll: true }),
      );
  }, [clavePanel, setSeleccion, setSolo, uid]);
  // Escape cierra el panel o quita la selección cuando el foco está dentro del mapa o su listado.
  useEffect(() => {
    if (!claveSel && !clavePanel) return;
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && contenedor.current?.contains(document.activeElement)) cerrarPanel();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [claveSel, clavePanel, cerrarPanel, contenedor]);
  /** En móvil el panel sube desde abajo: se desplaza la página para que el marcador quede visible arriba. */
  const mostrarArriba = (k: string) => {
    if (amplio) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-mapa="${uid}"] :is([data-foco="${k}"], [data-fila="${k}"])`,
      );
      const r = el?.getBoundingClientRect();
      if (r && r.bottom > window.innerHeight * 0.4)
        window.scrollBy({
          top: r.top - window.innerHeight * 0.18,
          behavior: reducido ? "auto" : "smooth",
        });
    });
  };
  /** Encender o apagar una capa con un toque; al encender Ingresos se repite la secuencia de llegada. */
  const alternar = (c: keyof Capas) => {
    const encender = poblacion || !capas[c];
    setCapas({ ...capas, [c]: poblacion ? true : !capas[c] });
    if (poblacion) setPoblacion(false);
    const delPanel =
      panel?.tipo === "depto"
        ? "eventos"
        : panel?.tipo === "acceso" || panel?.tipo === "puesto"
          ? "ingresos"
          : null;
    if (panel && (poblacion || (!encender && delPanel === c))) {
      setPanel(null);
      setSeleccion(null);
    }
    if (c === "ingresos" && encender) {
      setSolo(null);
      setCorrida((x) => x + 1);
    }
  };
  const alternarPoblacion = () => {
    setPoblacion(!poblacion);
    setPanel(null);
    setSeleccion(null);
    setSolo(null);
    if (poblacion && capas.ingresos) setCorrida((x) => x + 1);
  };

  const elegir = (f: Foco) => {
    // Un departamento (o «sin ubicación») abre su agenda; elegirlo otra vez la cierra.
    if (f.tipo === "departamento") {
      const k = claveFoco(f);
      if (k === clavePanel) return cerrarPanel();
      setSeleccion(seleccionDe(f));
      setSobre(null);
      setPanel({ tipo: "depto", nombre: f.nombre });
      mostrarArriba(k);
      return;
    }
    setPanel(null);
    setSeleccion(claveFoco(f) === claveSel ? null : seleccionDe(f));
  };
  const elegirAcceso = (id: (typeof ACCESOS)[number]["id"]) => {
    if (clavePanel === `a:${id}`) return cerrarPanel();
    setPanel({ tipo: "acceso", id });
    setSeleccion(null);
    setSolo({ acceso: id });
    setCorrida((c) => c + 1);
    mostrarArriba(`a:${id}`);
  };
  const elegirPuesto = (acceso: (typeof ACCESOS)[number]["id"], id: string) => {
    if (clavePanel === `i:${id}`) return cerrarPanel();
    setPanel({ tipo: "puesto", acceso, id });
    setSeleccion(null);
    setSolo({ puesto: id });
    setCorrida((c) => c + 1);
    mostrarArriba(`i:${id}`);
  };
  /** Tocar dentro de un departamento: su agenda (si tiene eventos) o, en Población, su detalle. */
  const elegirDepto = (n: string) => {
    if (poblacion) elegirPoblacion(n);
    else if (verEventos && deptosConDatos.has(n)) elegir({ tipo: "departamento", nombre: n });
  };
  const elegirPoblacion = (nombre: string) => {
    if (clavePanel === `h:${nombre}`) return cerrarPanel();
    setPanel({ tipo: "poblacion", nombre });
    mostrarArriba(`h:${nombre}`);
  };
  const boton = (accion: () => void, etiqueta: string, presionado: boolean) => ({
    tabIndex: 0,
    role: "button" as const,
    "aria-label": etiqueta,
    "aria-pressed": presionado,
    onClick: accion,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        accion();
      }
    },
  });
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
  const deptoElegido =
    panel?.tipo === "depto" || panel?.tipo === "poblacion"
      ? panel.nombre
      : fijo?.tipo === "departamento"
        ? fijo.nombre
        : "";
  const nombres = [
    ...new Set([sobre ?? "", previa?.tipo === "departamento" ? previa.nombre : "", deptoElegido]),
  ].filter((n) => n && n !== SIN && centros[n]);
  const totalListado =
    (datos?.fuentes.length ?? 0) + (rel?.destinos.length ?? 0) + (sinUbic?.[metrica] ? 1 : 0);
  // Conexiones de la selección (ezrá ↔ departamento): se dibujan una vez con dirección y quedan.
  // Hacia un destino, el recorrido va del departamento a ezrá; en lo demás, de ezrá al departamento.
  const rutas = al?.hay ? deptos.filter((d) => al.deptos.has(d.nombre)) : [];
  const haciaEzra = fijo?.tipo === "destino";

  const accesoAbierto =
    panel?.tipo === "acceso" || panel?.tipo === "puesto"
      ? (ACCESOS.find((a) => a.id === (panel.tipo === "acceso" ? panel.id : panel.acceso)) ?? null)
      : null;
  const puestoAbierto =
    panel?.tipo === "puesto" ? accesoAbierto?.puestos.find((p) => p.id === panel.id) : undefined;
  const nAgenda = panel?.tipo === "depto" ? (agenda?.get(panel.nombre)?.length ?? 0) : 0;
  const tituloPanel = !panel
    ? ""
    : panel.tipo === "acceso"
      ? (accesoAbierto?.nombre ?? "")
      : panel.tipo === "puesto"
        ? (puestoAbierto?.nombre ?? "")
        : panel.nombre === SIN
          ? tr("ez_mapa_sinUbicacion")
          : panel.nombre;
  const subtituloPanel = !panel
    ? undefined
    : panel.tipo === "depto"
      ? `${nAgenda} ${tr(nAgenda === 1 ? "ez_mpv_eventoVigente" : "ez_mpv_eventosVigentes")}`
      : panel.tipo === "poblacion"
        ? tr("ez_mpv_departamento")
        : panel.tipo === "puesto"
          ? `${accesoAbierto?.nombre} · ${puestoAbierto?.lugar ?? ""}`
          : accesoAbierto?.tipo === "aereo"
            ? tr("ez_mpv_entradaAerea")
            : `${accesoAbierto?.puestos.length ?? 0} ${tr("ez_mpv_puestos")}`;

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
      data-mapa={uid}
      className={`ez-mp ${amplio ? "ez-mp-amplio" : "ez-mp-angosto"}`}
      data-cargando={cargando || !datos ? "" : undefined}
      aria-busy={cargando || !datos}
    >
      <div className="ez-mp-escenario" data-panel={panel ? "" : undefined}>
        <div className="ez-mp-columna">
          <ControlesCapas
            capas={capas}
            poblacion={poblacion}
            alternar={alternar}
            alternarPoblacion={alternarPoblacion}
            tr={tr}
          />
          <div ref={escena} className="ez-mp-escena">
            <svg
              viewBox={VB.join(" ")}
              role="group"
              aria-label={[
                poblacion ? tr("ez_mpv_altPoblacion") : "",
                verEventos
                  ? `${tr("ez_dc_mapaAlt")}. ${deptos.map((d) => `${d.nombre} ${d[metrica]}`).join(", ")}.`
                  : "",
                verIngresos ? tr("ez_mpv_altIngresos") : "",
              ]
                .filter(Boolean)
                .join(" ")}
              {...imanes.manejadores}
              onPointerLeave={() => {
                imanes.manejadores.onPointerLeave();
                setSobre(null);
              }}
            >
              <defs>
                <filter id={`${uid}-brillo`} x="-200%" y="-200%" width="500%" height="500%">
                  <feGaussianBlur stdDeviation={5 / escala} />
                </filter>
              </defs>
              {/* 1 · El país, en ola. Tocar un punto de un departamento con datos lo elige. */}
              <g className="ez-mp-puntos" aria-hidden="true">
                <PuntosPais
                  activos={verEventos && claveActivos ? claveActivos : deptoElegido}
                  conDatos={verEventos ? claveDatos : ""}
                  niveles={poblacion ? niveles : ""}
                />
              </g>
              {/* Límites reales de los 14 departamentos: línea fina y tenue; fijos durante el efecto magnético.
                Pasar el cursor muestra el nombre; tocar abre su agenda (o su población). */}
              <g className="ez-mp-limites">
                {bordes().map((b) => (
                  <path
                    key={b.nombre}
                    d={b.d}
                    data-limite={b.nombre}
                    className={`ez-mp-limite ${b.nombre === deptoElegido ? "ez-mp-limite-elegido" : ""} ${b.nombre === sobre ? "ez-mp-limite-sobre" : ""} ${poblacion || (verEventos && deptosConDatos.has(b.nombre)) ? "ez-mp-limite-activo" : ""}`}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setSobre(b.nombre)}
                    onPointerLeave={() => setSobre(null)}
                    onClick={() => elegirDepto(b.nombre)}
                    aria-hidden="true"
                  />
                ))}
              </g>
              {imanes.halo && (
                <circle
                  key={imanes.halo.k}
                  cx={imanes.halo.x}
                  cy={imanes.halo.y}
                  r={40 / escala}
                  className="ez-mp-toque"
                  onAnimationEnd={imanes.terminarHalo}
                  aria-hidden="true"
                />
              )}

              {/* Cargando: anillos donde irán los marcadores. */}
              {verEventos && !datos && (
                <g className="ez-mp-fantasmas" aria-hidden="true">
                  {Object.entries(centros).map(([n, c], i) => (
                    <g key={n} style={{ ["--i" as string]: i }}>
                      <circle cx={c[0]} cy={c[1]} r={9 / escala} strokeWidth={1.5 / escala} />
                    </g>
                  ))}
                </g>
              )}

              {/* Ancla discreta de ezrá sobre el borde norte: de aquí sale solo la conexión elegida. */}
              <g
                className={`ez-mp-ezra ${rutas.length ? "ez-mp-ezra-activa" : ""}`}
                aria-hidden="true"
              >
                <circle cx={ANCLA[0]} cy={ANCLA[1]} r={6 / escala} className="ez-mp-ezra-aro" />
                <circle cx={ANCLA[0]} cy={ANCLA[1]} r={2.6 / escala} className="ez-mp-ezra-punto" />
                <text x={ANCLA[0] + 10 / escala} y={ANCLA[1]} dy="0.36em" fontSize={11 / escala}>
                  ezrá
                </text>
              </g>

              {/* Selección: el recorrido se dibuja una vez y queda; cambiar de selección cancela el anterior. */}
              {verEventos && datos && rutas.length > 0 && (
                <g className="ez-mp-rutas" aria-hidden="true" key={claveSel || "sel"}>
                  {rutas.map((d, i) => {
                    const fin = pos(d.nombre);
                    const r = radio(d[metrica]) + 3 / escala;
                    const llegada: [number, number] = [fin[0], fin[1] - r];
                    const camino = haciaEzra
                      ? curvaInversa(llegada, salida)
                      : curva(salida, llegada);
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
              {verEventos && (
                <g className="ez-mp-marcadores">
                  {deptos.map((d, i) => {
                    const [x, y] = pos(d.nombre);
                    const r = radio(d[metrica]);
                    return (
                      <g
                        key={d.nombre}
                        data-depto={d.nombre}
                        data-foco={`p:${d.nombre}`}
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
              )}

              {/* Ingresos: los accesos con sus puestos reales y los pulsos de llegada, de a uno. */}
              {verIngresos && (
                <>
                  {!reducido ? (
                    <PulsosIngreso key={corrida} geos={geos} solo={solo} escala={escala} />
                  ) : (
                    <g className="ez-mpi-estaticos" aria-hidden="true">
                      {geos
                        .filter((g) => !solo?.acceso || g.acceso.id === solo.acceso)
                        .flatMap((g) => g.puestos)
                        .filter((p) => !solo?.puesto || p.id === solo.puesto)
                        .map((p) => (
                          <path key={p.id} d={p.camino} strokeWidth={1.2 / escala} />
                        ))}
                    </g>
                  )}
                  <CapaAccesos
                    geos={geos}
                    escala={escala}
                    compacto={!conNumeros}
                    elegido={panel?.tipo === "acceso" || panel?.tipo === "puesto" ? clavePanel : ""}
                    accesoProps={(g) =>
                      boton(
                        () => elegirAcceso(g.acceso.id),
                        `${g.acceso.nombre}: ${g.acceso.puestos.map((p) => p.nombre).join(", ")}`,
                        clavePanel === `a:${g.acceso.id}`,
                      )
                    }
                    puestoProps={(g, p) => {
                      const pu = g.acceso.puestos.find((x) => x.id === p.id);
                      return boton(
                        () => elegirPuesto(g.acceso.id, p.id),
                        `${pu?.nombre ?? p.id} (${g.acceso.nombre})`,
                        clavePanel === `i:${p.id}`,
                      );
                    }}
                  />
                </>
              )}

              {/* Población: un punto de acceso por departamento (los puntos del país cambian de intensidad). */}
              {poblacion && (
                <g className="ez-mph-marcadores">
                  {Object.entries(centros).map(([n, [x, y]]) => {
                    const k = `h:${n}`;
                    const v = POBLACION_2024.departamentos[n];
                    return (
                      <g
                        key={n}
                        data-foco={k}
                        className={`ez-mph-marcador ${clavePanel === k ? "ez-mp-elegido" : ""}`}
                        {...boton(
                          () => elegirPoblacion(n),
                          `${n}: ${v ? `${v.toLocaleString("es-SV")} ${tr("ez_mpv_habitantes")}` : tr("ez_mpv_sinDatos")}`,
                          clavePanel === k,
                        )}
                      >
                        <circle cx={x} cy={y} r={14 / escala} className="ez-mph-zona" />
                        <circle
                          cx={x}
                          cy={y}
                          r={4.5 / escala}
                          className="ez-mph-punto"
                          strokeWidth={2 / escala}
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              <g className="ez-mp-nombres" aria-hidden="true">
                {nombres.map((n) => {
                  const [x, y] = pos(n);
                  const v = verEventos ? (por.get(n)?.[metrica] ?? 0) : 0;
                  const r = v > 0 ? radio(v) : (poblacion ? 6 : 0) / escala;
                  return (
                    <text
                      key={n}
                      x={x}
                      y={y + r + 19 / escala}
                      textAnchor="middle"
                      fontSize={13 / escala}
                    >
                      {v > 0 ? `${n} · ${v} ${unidad}` : n}
                    </text>
                  );
                })}
              </g>
            </svg>
            {verIngresos && ACCESOS.every((a) => !a.entradas) && (
              <p className="ez-mpi-aviso">
                <span>{tr("ez_mpv_sinDatos")}</span> · {tr("ez_mpv_ilustrativa")}
              </p>
            )}
            {verEventos && datos && deptos.length === 0 && (
              <p className="ez-mp-aviso">
                {tr(metrica === "contenidos" ? "ez_mp_sinContenidos" : "ez_dc_sinDatos")}
              </p>
            )}
          </div>
        </div>
        <PanelMapa
          abierto={Boolean(panel)}
          clave={clavePanel}
          titulo={tituloPanel}
          subtitulo={subtituloPanel}
          onCerrar={cerrarPanel}
          tr={tr}
        >
          {panel?.tipo === "depto" && (
            <AgendaDepto eventos={agenda?.get(panel.nombre) ?? []} tr={tr} />
          )}
          {panel?.tipo === "acceso" && accesoAbierto && (
            <DetalleAcceso
              key={accesoAbierto.id}
              acceso={accesoAbierto}
              verRecorrido={() => {
                setSolo({ acceso: accesoAbierto.id });
                setCorrida((c) => c + 1);
              }}
              tr={tr}
            />
          )}
          {panel?.tipo === "puesto" && accesoAbierto && (
            <DetallePuesto
              key={panel.id}
              acceso={accesoAbierto}
              puestoId={panel.id}
              verRecorrido={() => {
                setSolo({ puesto: panel.id });
                setCorrida((c) => c + 1);
              }}
              tr={tr}
            />
          )}
          {panel?.tipo === "poblacion" && <DetallePoblacion nombre={panel.nombre} tr={tr} />}
        </PanelMapa>
      </div>

      {/* Debajo del mapa: el detalle de lo elegido y el listado de fuentes, destinos y sin ubicación. */}
      <div className="ez-mp-bajo">
        <div className="ez-mp-progreso" aria-hidden="true" />
        {((fijo && !panel) || (!amplio && !panel)) && (
          <DetalleBreve datos={datos} rel={rel} foco={fijo} al={al} tr={tr} />
        )}
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
  niveles,
}: {
  activos: string;
  conDatos: string;
  niveles: string;
}) {
  const { puntos } = geo();
  const on = new Set(activos.split("|").filter(Boolean));
  const datos = new Set(conDatos.split("|").filter(Boolean));
  const nivel = new Map(
    niveles
      .split("|")
      .filter(Boolean)
      .map((x) => x.split(":") as [string, string]),
  );
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
          className={
            on.has(p.d)
              ? "ez-mp-p-activo"
              : nivel.has(p.d)
                ? `ez-mp-p ez-mp-n${nivel.get(p.d)}`
                : datos.has(p.d)
                  ? "ez-mp-p-datos"
                  : "ez-mp-p"
          }
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
