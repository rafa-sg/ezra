"use client";
import { useEffect, useState } from "react";
import type { Encargo } from "@/lib/produccion/modelo";
import { pedir, type MedioResumen, type Resumen } from "../granjas/cliente";
import { claseDeAgente } from "./clases";
import "./oficina.css";

type Archivo = { id: string; nombre: string; tipo: "video" | "imagen" | "texto"; detalle: string; medioId?: string; encargoId?: string };
type CarpetaId = "clips" | "post" | "virales" | "eventos" | "subidos";

const carpetas: { id: CarpetaId; nombre: string; color: [string, string] }[] = [
  { id: "clips", nombre: "Clips", color: ["#8fd3ef", "#aee0f4"] },
  { id: "virales", nombre: "Videos virales", color: ["#b9a8f6", "#cfc3fa"] },
  { id: "eventos", nombre: "Eventos de El Salvador", color: ["#f0cf5a", "#f7df7f"] },
  { id: "post", nombre: "Post para Instagram", color: ["#f2a3b8", "#f8c4d2"] },
  { id: "subidos", nombre: "Subidos por ti", color: ["#9aa3ad", "#bcc3cb"] },
];
const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
const dur = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

function archivosDe(medios: MedioResumen[], encargos: Encargo[]): Record<CarpetaId, Archivo[]> {
  const res: Record<CarpetaId, Archivo[]> = { clips: [], post: [], virales: [], eventos: [], subidos: [] };
  for (const m of medios) {
    const tipo = m.mime.startsWith("video/") ? "video" : "imagen";
    const a: Archivo = { id: m.id, nombre: m.nombre, tipo, medioId: m.id, detalle: [dur(m.duracion), m.ancho && m.alto ? `${m.ancho}×${m.alto}` : "", mb(m.bytes)].filter(Boolean).join(" · ") };
    if (!m.generado) res.subidos.push(a);
    else res[tipo === "video" ? "clips" : "post"].push(a);
  }
  for (const e of encargos) {
    if (!e.resultado.trim() || e.estado === "rechazado") continue;
    const c = claseDeAgente(e.agente);
    if (c === "virales" || c === "eventos") res[c].push({ id: e.id, encargoId: e.id, nombre: e.titulo, tipo: "texto", detalle: e.estado === "aprobado" ? "Aprobado" : "Por revisar" });
  }
  return res;
}

function IconoCarpeta({ color, grande = true }: { color: [string, string]; grande?: boolean }) {
  return (
    <span className={`al-icono ${grande ? "" : "al-icono-chico"}`} aria-hidden="true">
      <span className="al-pestana" style={{ background: color[0] }} />
      <span className="al-atras" style={{ background: color[0] }} />
      <span className="al-hoja" />
      <span className="al-frente" style={{ background: `linear-gradient(180deg, ${color[1]}, ${color[0]})` }} />
    </span>
  );
}

/**
 * Almacenamiento: una carpeta de escritorio por granja. Dentro, lo que cada granja ha guardado. Aprobar,
 * elegir cuenta y publicar desde aquí todavía no están conectados: se muestran como vista previa.
 */
export function Almacenamiento({ encargos, onAbrirEncargo }: { encargos: Encargo[]; onAbrirEncargo: (id: string) => void }) {
  const [medios, setMedios] = useState<MedioResumen[] | null>(null);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<CarpetaId | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    const control = new AbortController();
    pedir<Resumen>("/api/granjas", undefined, { signal: control.signal })
      .then((r) => setMedios(r.medios))
      .catch((e: Error) => {
        if (!control.signal.aborted) setError(e.message);
      });
    return () => control.abort();
  }, []);
  if (error) return <p className="of-aviso">No se pudo leer el almacenamiento: {error}</p>;
  if (!medios) return <p className="of-aviso">Abriendo el almacenamiento…</p>;
  const archivos = archivosDe(medios, encargos);
  const total = medios.reduce((s, m) => s + m.bytes, 0);

  if (!abierta)
    return (
      <div className="al-raiz">
        <p className="al-ayuda">
          Todo lo que guardan las granjas, en una carpeta por granja · {mb(total)} usados
        </p>
        <div className="al-escritorio">
          {carpetas.map((c) => (
            <button key={c.id} type="button" className="al-carpeta" onClick={() => setAbierta(c.id)}>
              <IconoCarpeta color={c.color} />
              {archivos[c.id].length > 0 && <span className="al-globo">{archivos[c.id].length}</span>}
              <strong>{c.nombre}</strong>
              <span>
                {archivos[c.id].length} {archivos[c.id].length === 1 ? "archivo" : "archivos"}
              </span>
            </button>
          ))}
        </div>
      </div>
    );

  const carpeta = carpetas.find((c) => c.id === abierta)!;
  const lista = archivos[abierta];
  const elegido = lista.find((a) => a.id === sel) ?? lista[0] ?? null;
  return (
    <div className="al-raiz">
      <nav className="al-ruta" aria-label="Ruta">
        <button type="button" className="of-enlace" onClick={() => { setAbierta(null); setSel(null); }}>
          Almacenamiento
        </button>
        <span aria-hidden="true">›</span>
        <strong>{carpeta.nombre}</strong>
      </nav>
      <div className="al-dentro">
        <div className="al-archivos">
          {lista.length === 0 && <p className="of-vacio">Esta carpeta está vacía. Cuando la granja guarde algo, aparece aquí.</p>}
          {lista.map((a) => (
            <button key={a.id} type="button" className={`al-archivo ${elegido?.id === a.id ? "al-sel" : ""}`} onClick={() => setSel(a.id)}>
              <span className="al-vista">
                {a.tipo === "imagen" && a.medioId && <img src={`/api/granjas/medios/${a.medioId}?thumbnail=480`} alt="" loading="lazy" />}
                {a.tipo === "video" && <span className="al-video">▶</span>}
                {a.tipo === "texto" && <IconoCarpeta color={carpeta.color} grande={false} />}
              </span>
              <strong>{a.nombre}</strong>
              <span>{a.detalle}</span>
            </button>
          ))}
        </div>
        {elegido && (
          <aside className="al-detalle">
            <strong className="al-nombre">{elegido.nombre}</strong>
            <span className="al-gris">{elegido.detalle}</span>
            {elegido.tipo === "video" && elegido.medioId && (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- vista interna de medios propios; los subtítulos vienen en el material
              <video className="al-reproductor" src={`/api/granjas/medios/${elegido.medioId}`} controls preload="metadata" />
            )}
            {elegido.tipo === "imagen" && elegido.medioId && <img className="al-reproductor" src={`/api/granjas/medios/${elegido.medioId}?thumbnail=480`} alt={elegido.nombre} />}
            {elegido.encargoId && (
              <button type="button" className="of-boton" onClick={() => onAbrirEncargo(elegido.encargoId!)}>
                Abrir el encargo
              </button>
            )}
            <div className="al-previa">
              <strong>Aprobar y publicar desde aquí</strong>
              <p>Muy pronto: aprobar, elegir en qué cuentas de Conexiones publicar y mandar a la Papelera. Por ahora se hace desde el encargo o la granja.</p>
              <div className="al-acciones">
                <button type="button" disabled>Aprobar</button>
                <button type="button" disabled>Publicar en…</button>
                <button type="button" disabled>Eliminar</button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
