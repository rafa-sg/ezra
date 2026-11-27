"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { Encargo } from "@/lib/produccion/modelo";
import type { Granja } from "@/lib/granjas/modelo";
import { farmPurpose } from "@/lib/granjas/purposes";
import { pedir, type Resumen } from "../granjas/cliente";
import { claseDeAgente, claseDePurpose, estadoNota, infoClase, type Clase, type Tema } from "./clases";
import "./oficina.css";

const nombreIA: Record<string, string> = { astra: "Codex", claude: "Claude", gemini: "Gemini", manual: "Tú", local: "Sin IA" };
const ropa = ["#7760d8", "#3f8f6b", "#d9822b", "#3b82c4"];
const pelo = ["#4a2f22", "#1d1d22", "#a5591c", "#6d6d6d"];
const piel = ["#f1c7a0", "#c98e62", "#e8b48a", "#8d5a3b"];
const gamer = (t: Tema) => t === "gamerMorado" || t === "gamerCian";

type Puesto = { id: string; rol: string; ia: string; revisor: boolean };
type Nota = { id: string; titulo: string; etiqueta: string };

function puestosDe(g: Granja): Puesto[] {
  const nodos = g.grafo.nodos
    .filter((n) => n.tipo === "agente" || n.tipo === "revision")
    .sort((a, b) => a.posicion.x - b.posicion.x || a.posicion.y - b.posicion.y);
  const lista = nodos.map((n) => ({
    id: n.id,
    rol: n.titulo,
    ia: n.tipo === "revision" ? "Tú" : (nombreIA[n.proveedor] ?? n.proveedor),
    revisor: n.tipo === "revision",
  }));
  if (!lista.some((p) => p.revisor)) lista.push({ id: `${g.id}-revisor`, rol: "Revisor", ia: "Tú", revisor: true });
  return lista.slice(0, 6);
}

/** Cabeza pixelada asomada por encima del monitor. Con audífonos en los setups gamer. */
function Cabeza({ i, tema }: { i: number; tema: Tema }) {
  const audif = gamer(tema) ? "#1b1b1f" : "transparent";
  return (
    <svg width="72" height="66" viewBox="0 0 12 11" aria-hidden="true" className="of-cabeza-svg">
      <rect x="3" y="0" width="6" height="2" fill={pelo[i % 4]} />
      <rect x="2" y="1" width="8" height="2" fill={pelo[i % 4]} />
      <rect x="2" y="3" width="8" height="4" fill={piel[(i + 1) % 4]} />
      <rect x="4" y="4" width="1" height="1" fill="#1b1b1f" />
      <rect x="7" y="4" width="1" height="1" fill="#1b1b1f" />
      <rect x="1" y="2" width="1" height="4" fill={audif} />
      <rect x="10" y="2" width="1" height="4" fill={audif} />
      {gamer(tema) && <rect x="2" y="0" width="8" height="1" fill="#1b1b1f" />}
      <rect x="1" y="7" width="10" height="4" fill={ropa[i % 4]} />
    </svg>
  );
}

function Escritorio({ p, i, tema, notas, estado, papel }: { p: Puesto; i: number; tema: Tema; notas: Nota[]; estado: "trabajando" | "esperando" | "tu"; papel: string }) {
  return (
    <div className="of-puesto">
      <div className="of-escena-puesto">
        <span className="of-halo" aria-hidden="true" />
        <div className={`of-cabeza ${estado === "trabajando" ? "of-trabaja" : ""}`}>
          <Cabeza i={i} tema={tema} />
          <span className={`of-estado of-estado-${estado}`} aria-hidden="true" />
        </div>
        <div className="of-monitor">
          {notas.length === 0 && <span className="of-marca">ezrá</span>}
          {notas.map((n, k) => (
            <span key={n.id} className="of-mini" style={{ background: papel, "--pi-giro": `${k % 2 ? 2.5 : -3}deg` } as CSSProperties}>
              <small>{n.etiqueta}</small>
              {n.titulo}
            </span>
          ))}
        </div>
        <span className="of-pie" aria-hidden="true" />
        {gamer(tema) && i % 2 === 1 && (
          <span className="of-torre" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        {tema === "clasico" && i === 0 && (
          <svg className="of-lampara" width="40" height="56" viewBox="0 0 10 14" aria-hidden="true">
            <rect x="1" y="0" width="7" height="3" fill="#2f6b4f" />
            <rect x="2" y="3" width="5" height="1" fill="#f6d77a" />
            <rect x="4" y="4" width="1" height="8" fill="#b08a3e" />
            <rect x="2" y="12" width="5" height="2" fill="#b08a3e" />
          </svg>
        )}
        {tema === "clasico" && i > 0 && <span className="of-papeles" aria-hidden="true" />}
        {tema === "creativo" && i === 0 && (
          <svg className="of-planta" width="34" height="44" viewBox="0 0 8 11" aria-hidden="true">
            <rect x="1" y="0" width="2" height="3" fill="#5f9e6e" />
            <rect x="5" y="1" width="2" height="3" fill="#5f9e6e" />
            <rect x="3" y="2" width="2" height="4" fill="#4a8a5c" />
            <rect x="1" y="6" width="6" height="5" fill="#e8a7b8" />
          </svg>
        )}
        <span className="of-mesa" aria-hidden="true" />
      </div>
      <div className="of-rotulo">
        <strong>{p.rol}</strong>
        <span>
          {p.ia} · {estado === "trabajando" ? "Trabajando" : estado === "tu" ? "Te necesita" : "Esperando"}
        </span>
      </div>
    </div>
  );
}

/**
 * La oficina: una sala por granja activa, con su setup (gamer, clásico o creativo). Los post-its de
 * Encargos van pegados en la parte trasera de los monitores: en fila en el primero, el que se está
 * haciendo en el primer agente, y los que esperan revisión en el tuyo.
 */
export function Oficina({
  encargos,
  ejecutandoId,
  onEntrar,
  onConfigurar,
}: {
  encargos: Encargo[];
  ejecutandoId: string | null;
  onEntrar: (clase: Clase, nombre: string) => void;
  onConfigurar: () => void;
}) {
  const [granjas, setGranjas] = useState<Granja[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const control = new AbortController();
    pedir<Resumen>("/api/granjas", undefined, { signal: control.signal })
      .then((r) => setGranjas(r.granjas))
      .catch((e: Error) => {
        if (!control.signal.aborted) setError(e.message);
      });
    return () => control.abort();
  }, []);
  if (error) return <p className="of-aviso">No se pudieron leer las granjas: {error}</p>;
  if (!granjas) return <p className="of-aviso">Abriendo la oficina…</p>;
  const activas = granjas.filter((g) => g.estado === "activa");
  const porNombre = new Map<string, Granja>();
  for (const g of activas) {
    const previa = porNombre.get(g.nombre);
    if (!previa || previa.actualizado < g.actualizado) porNombre.set(g.nombre, g);
  }
  const repetidas = activas.length - porNombre.size;
  const salas = [...porNombre.values()];
  return (
    <div className="of-oficina">
      <div className="of-oficina-barra">
        <p>Cada granja es una sala con su propio estilo. Los ves desde atrás del monitor: ahí tienen pegados sus post-its de Encargos.</p>
        <button type="button" className="of-boton of-boton-claro" onClick={onConfigurar}>
          Configurar granjas
        </button>
      </div>
      {repetidas > 0 && (
        <p className="of-aviso">
          Hay {repetidas} {repetidas === 1 ? "granja repetida" : "granjas repetidas"} con el mismo nombre; aquí se muestra la más reciente de cada una. Las juntamos cuando conectemos encargos y granjas.
        </p>
      )}
      {salas.length === 0 && <p className="of-aviso">Todavía no hay granjas activas. Crea una desde «Configurar granjas».</p>}
      {salas.map((g) => {
        const clase = claseDePurpose(farmPurpose(g));
        const info = infoClase[clase];
        const puestos = puestosDe(g);
        const suyos = encargos.filter((e) => e.estado !== "rechazado" && e.estado !== "aprobado" && claseDeAgente(e.agente) === clase);
        const estados = suyos.map((e) => ({ e, s: estadoNota(e, e.id === ejecutandoId) }));
        const nota = (e: Encargo, etiqueta: string): Nota => ({ id: e.id, titulo: e.titulo, etiqueta });
        const trabajando = estados.filter((x) => x.s === "trabajando").map((x) => nota(x.e, "ahora"));
        const fila = estados.filter((x) => x.s === "fila" || x.s === "cambios").map((x) => nota(x.e, "en fila"));
        const revisar = estados.filter((x) => x.s === "revisar").map((x) => nota(x.e, "revisar"));
        const activo = puestos.findIndex((p) => !p.revisor);
        return (
          <section key={g.id} className="of-sala" aria-label={g.nombre}>
            <header className="of-sala-cabecera">
              <span className="of-punto" style={{ background: info.papel[1] }} aria-hidden="true" />
              <div>
                <h2>{g.nombre}</h2>
                <p>{info.descripcion}</p>
              </div>
              <span className="of-setup">Setup: {{ gamerMorado: "edición gamer", gamerCian: "gamer cian", clasico: "clásico", creativo: "creativo" }[info.tema]}</span>
              <button type="button" className="of-boton" onClick={() => onEntrar(clase, g.nombre)}>
                Entrar
              </button>
            </header>
            <div className={`of-escena of-tema-${info.tema}`}>
              {puestos.map((p, i) => {
                const notas = p.revisor ? revisar : i === activo ? [...trabajando, ...(activo === 0 ? fila : [])] : i === 0 ? fila : [];
                const estado = p.revisor ? (revisar.length ? "tu" : "esperando") : i === activo && trabajando.length ? "trabajando" : "esperando";
                return <Escritorio key={p.id} p={p} i={i} tema={info.tema} notas={notas.slice(0, 2)} estado={estado} papel={info.papel[1]} />;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
