"use client";
import { useEffect, useRef, useState, type PointerEvent as EventoPuntero } from "react";
import { Minus, Plus, Maximize2, AlertTriangle } from "lucide-react";
import { agentes } from "@/lib/produccion/modelo";
import { estadosTrabajando, type EstadoPaso, type Grafo } from "@/lib/granjas/modelo";
import { Pixel } from "./pixel";
import type { Paso } from "./cliente";

const ANCHO = 200;
const ALTO = 150;
type Arrastre =
  | { tipo: "nodo"; id: string; dx: number; dy: number; movido: boolean }
  | { tipo: "fondo"; x: number; y: number; vx: number; vy: number }
  | { tipo: "conexion"; desde: string; x: number; y: number };

/** Lienzo de nodos y conexiones. Arrastrar es opcional: el inspector permite hacer lo mismo. */
export function Lienzo({
  grafo,
  pasos,
  faltantes,
  seleccionado,
  traspasos,
  etiqueta,
  g,
  onSeleccionar,
  onMover,
  onConectar,
}: {
  grafo: Grafo;
  pasos: Map<string, Paso>;
  faltantes: Record<string, string[]>;
  seleccionado: string | null;
  traspasos: Set<string>;
  etiqueta: string;
  g: (clave: string) => string;
  onSeleccionar: (id: string | null) => void;
  onMover: (id: string, x: number, y: number) => void;
  onConectar: (desde: string, hacia: string) => void;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState({ x: 20, y: 20, zoom: 0.85 });
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const aLienzo = (clienteX: number, clienteY: number) => {
    const caja = marco.current!.getBoundingClientRect();
    return { x: (clienteX - caja.left - vista.x) / vista.zoom, y: (clienteY - caja.top - vista.y) / vista.zoom };
  };
  const zoom = (factor: number) => setVista((v) => ({ ...v, zoom: Math.min(1.6, Math.max(0.35, v.zoom * factor)) }));
  const ajustar = () => {
    if (!grafo.nodos.length || !marco.current) return setVista({ x: 20, y: 20, zoom: 0.85 });
    const xs = grafo.nodos.map((n) => n.posicion.x);
    const ys = grafo.nodos.map((n) => n.posicion.y);
    const ancho = Math.max(...xs) - Math.min(...xs) + ANCHO + 40;
    const alto = Math.max(...ys) - Math.min(...ys) + ALTO + 40;
    const caja = marco.current.getBoundingClientRect();
    const z = Math.min(1.2, Math.max(0.35, Math.min(caja.width / ancho, caja.height / alto)));
    setVista({ zoom: z, x: 20 - Math.min(...xs) * z, y: 20 - Math.min(...ys) * z });
  };
  // Al abrir, el flujo completo queda a la vista; luego el propietario decide el zoom.
  const ajustado = useRef(false);
  useEffect(() => {
    if (ajustado.current || !grafo.nodos.length) return;
    ajustado.current = true;
    // Sin cancelar: una nueva renderización (por ejemplo, la consulta periódica) no debe impedir el ajuste inicial.
    requestAnimationFrame(ajustar);
  });
  useEffect(() => {
    const elemento = marco.current;
    if (!elemento) return;
    // Rueda con Ctrl/⌘ o pellizco: zoom; sin modificador se desplaza la página como siempre.
    const rueda = (evento: WheelEvent) => {
      if (!evento.ctrlKey && !evento.metaKey) return;
      evento.preventDefault();
      zoom(evento.deltaY > 0 ? 0.9 : 1.1);
    };
    elemento.addEventListener("wheel", rueda, { passive: false });
    return () => elemento.removeEventListener("wheel", rueda);
  }, []);

  function abajo(evento: EventoPuntero<HTMLDivElement>) {
    if (evento.button !== 0) return;
    const objetivo = evento.target as HTMLElement;
    const asa = objetivo.closest<HTMLElement>("[data-asa-salida]");
    const tarjeta = objetivo.closest<HTMLElement>("[data-nodo]");
    if (asa) {
      const p = aLienzo(evento.clientX, evento.clientY);
      setArrastre({ tipo: "conexion", desde: asa.dataset.asaSalida!, ...p });
      setCursor(p);
    } else if (tarjeta) {
      const nodo = grafo.nodos.find((n) => n.id === tarjeta.dataset.nodo)!;
      const p = aLienzo(evento.clientX, evento.clientY);
      setArrastre({ tipo: "nodo", id: nodo.id, dx: p.x - nodo.posicion.x, dy: p.y - nodo.posicion.y, movido: false });
    } else {
      setArrastre({ tipo: "fondo", x: evento.clientX, y: evento.clientY, vx: vista.x, vy: vista.y });
    }
    marco.current?.setPointerCapture(evento.pointerId);
  }
  function mover(evento: EventoPuntero<HTMLDivElement>) {
    if (!arrastre) return;
    if (arrastre.tipo === "fondo") setVista((v) => ({ ...v, x: arrastre.vx + evento.clientX - arrastre.x, y: arrastre.vy + evento.clientY - arrastre.y }));
    else if (arrastre.tipo === "nodo") {
      const p = aLienzo(evento.clientX, evento.clientY);
      onMover(arrastre.id, Math.round(p.x - arrastre.dx), Math.round(p.y - arrastre.dy));
      if (!arrastre.movido) setArrastre({ ...arrastre, movido: true });
    } else setCursor(aLienzo(evento.clientX, evento.clientY));
  }
  function arriba(evento: EventoPuntero<HTMLDivElement>) {
    if (arrastre?.tipo === "conexion") {
      const debajo = document.elementFromPoint(evento.clientX, evento.clientY)?.closest<HTMLElement>("[data-nodo]");
      if (debajo && debajo.dataset.nodo !== arrastre.desde) onConectar(arrastre.desde, debajo.dataset.nodo!);
    }
    if (arrastre?.tipo === "nodo" && !arrastre.movido) onSeleccionar(arrastre.id);
    if (arrastre?.tipo === "fondo" && Math.abs(evento.clientX - arrastre.x) + Math.abs(evento.clientY - arrastre.y) < 4) onSeleccionar(null);
    setArrastre(null);
    setCursor(null);
  }
  const centro = (id: string, lado: "entrada" | "salida") => {
    const n = grafo.nodos.find((x) => x.id === id)!;
    return { x: n.posicion.x + (lado === "salida" ? ANCHO : 0), y: n.posicion.y + ALTO / 2 };
  };
  const curva = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const d = Math.max(40, Math.abs(b.x - a.x) / 2);
    return `M${a.x},${a.y} C${a.x + d},${a.y} ${b.x - d},${b.y} ${b.x},${b.y}`;
  };
  const estadoDe = (id: string): EstadoPaso | undefined => pasos.get(id)?.estado;

  return (
    <div className="eg-lienzo-marco">
      <div className="eg-lienzo-controles" role="toolbar" aria-label={g("zoom")}>
        <button className="ep-boton ep-icono" onClick={() => zoom(1.15)} aria-label={g("acercar")}>
          <Plus size={16} />
        </button>
        <button className="ep-boton ep-icono" onClick={() => zoom(1 / 1.15)} aria-label={g("alejar")}>
          <Minus size={16} />
        </button>
        <button className="ep-boton ep-icono" onClick={ajustar} aria-label={g("ajustar")}>
          <Maximize2 size={16} />
        </button>
        <span className="eg-zoom">{Math.round(vista.zoom * 100)}%</span>
      </div>
      <div
        ref={marco}
        className={`eg-lienzo ${arrastre?.tipo === "fondo" ? "eg-moviendo" : ""}`}
        aria-label={etiqueta}
        role="group"
        onPointerDown={abajo}
        onPointerMove={mover}
        onPointerUp={arriba}
        onPointerCancel={() => setArrastre(null)}
      >
        <div className="eg-lienzo-capa" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.zoom})` }}>
          <svg className="eg-aristas" width="6000" height="6000" aria-hidden="true">
            {grafo.aristas.map((a) => {
              if (!grafo.nodos.some((n) => n.id === a.desde) || !grafo.nodos.some((n) => n.id === a.hacia)) return null;
              const camino = curva(centro(a.desde, "salida"), centro(a.hacia, "entrada"));
              const activa = traspasos.has(a.id);
              const esperando = estadoDe(a.hacia) === "esperando";
              return (
                <g key={a.id}>
                  <path d={camino} className={`eg-arista ${esperando ? "eg-arista-espera" : ""} ${activa ? "eg-arista-activa" : ""}`} />
                  {activa && (
                    <circle r="7" className="eg-token">
                      <animateMotion dur="1.6s" repeatCount="2" path={camino} />
                    </circle>
                  )}
                </g>
              );
            })}
            {arrastre?.tipo === "conexion" && cursor && <path d={curva(centro(arrastre.desde, "salida"), cursor)} className="eg-arista eg-arista-nueva" />}
          </svg>
          {grafo.nodos.map((n) => {
            const estado = estadoDe(n.id);
            const falta = faltantes[n.id] ?? [];
            const indice = n.agente ? agentes.indexOf(n.agente) : n.tipo === "medios" ? 3 : n.tipo === "render" ? 5 : n.tipo === "revision" ? 8 : 9;
            return (
              <div
                key={n.id}
                data-nodo={n.id}
                className={`eg-nodo eg-nodo-${n.tipo} ${seleccionado === n.id ? "eg-seleccionado" : ""} ${estado && estadosTrabajando.includes(estado) ? "eg-trabajando" : ""}`}
                style={{ left: n.posicion.x, top: n.posicion.y, width: ANCHO, height: ALTO }}
              >
                <span className="eg-asa eg-asa-entrada" aria-hidden="true" />
                <button
                  type="button"
                  className="eg-nodo-boton"
                  aria-pressed={seleccionado === n.id}
                  title={n.titulo}
                  aria-label={`${n.titulo}. ${g(`nodo_${n.tipo}`)}. ${estado ? g(`estado_${estado}`) : g("sinEjecutar")}${falta.length ? `. ${falta.length} ${g("pendientes")}` : ""}`}
                  onClick={() => onSeleccionar(n.id)}
                  onKeyDown={(e) => {
                    const pasos: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
                    if (e.altKey && pasos[e.key]) {
                      e.preventDefault();
                      onMover(n.id, n.posicion.x + pasos[e.key][0], n.posicion.y + pasos[e.key][1]);
                    }
                  }}
                >
                  <span className="eg-nodo-arte">
                    <Pixel indice={indice < 0 ? 0 : indice} estado={estado} />
                  </span>
                  <span className="eg-nodo-texto">
                    <span className="eg-nodo-tipo">{n.agente ? g(`agente_${n.agente}`) : g(`nodo_${n.tipo}`)}</span>
                    <strong>{n.titulo}</strong>
                    <span className={`eg-estado eg-estado-${estado ?? "inactivo"}`} role="status">
                      {estado ? g(`estado_${estado}`) : g("sinEjecutar")}
                    </span>
                  </span>
                  {falta.length > 0 && (
                    <span className="eg-falta" title={falta.join(" ")}>
                      <AlertTriangle size={14} aria-hidden="true" />
                      {falta.length}
                    </span>
                  )}
                </button>
                {n.tipo !== "publicacion" && <span className="eg-asa eg-asa-salida" data-asa-salida={n.id} title={g("arrastraConectar")} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
      <p className="ep-nota eg-ayuda-lienzo">{g("ayudaLienzo")}</p>
    </div>
  );
}
