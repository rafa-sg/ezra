"use client";
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";

export type ClipVista = {
  id: string;
  numero: number;
  version: number;
  inicio: number;
  fin: number;
  titulo: string;
  gancho: string;
  medioId: string | null;
  piezaId: string | null;
  estado: "renderizando" | "por_revisar" | "aprobado" | "rechazado" | "cambios" | "fallido";
  motivo: string;
  error: string;
  medio: { id: string; duracion: number | null } | null;
};
type Comprobaciones = { hechos: boolean; derechos: boolean; marca: boolean };
export type AccionesClip = {
  aprobar: (clipId: string, c: Comprobaciones) => void;
  rechazar: (clipId: string, motivo: string) => void;
  cambios: (clipId: string, cambios: { motivo: string; inicio?: number; fin?: number; titulo?: string; gancho?: string }) => void;
};
const tiempo = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** «Tu revisión» de la granja Clips: cada clip se aprueba, se rechaza con motivo o vuelve con cambios. */
export function RevisionClips({
  clips,
  abierta,
  ocupado,
  g,
  acciones,
}: {
  clips: ClipVista[];
  /** «Tu revisión» está esperando decisiones. */
  abierta: boolean;
  ocupado: boolean;
  g: (clave: string) => string;
  acciones: AccionesClip;
}) {
  const pendientes = clips.filter((c) => ["por_revisar", "cambios", "renderizando"].includes(c.estado)).length;
  return (
    <section className="eg-clips" aria-labelledby="eg-clips-titulo">
      <header className="eg-clips-cabecera">
        <div>
          <p className="ep-eyebrow">{g("clips_revision")}</p>
          <h3 id="eg-clips-titulo">{g("clips_titulo")}</h3>
          <p className="ep-nota">{abierta ? `${pendientes} ${g("clips_pendientes")}` : g("clips_cerrada")}</p>
        </div>
      </header>
      <ol className="eg-clips-lista">
        {clips.map((c) => (
          <TarjetaClip key={`${c.id}-${c.version}`} clip={c} abierta={abierta} ocupado={ocupado} g={g} acciones={acciones} />
        ))}
      </ol>
    </section>
  );
}

function TarjetaClip({
  clip,
  abierta,
  ocupado,
  g,
  acciones,
}: {
  clip: ClipVista;
  abierta: boolean;
  ocupado: boolean;
  g: (clave: string) => string;
  acciones: AccionesClip;
}) {
  const [modo, setModo] = useState<"" | "aprobar" | "rechazar" | "cambios">("");
  const [comprobado, setComprobado] = useState<Comprobaciones>({ hechos: false, derechos: false, marca: false });
  const [motivo, setMotivo] = useState("");
  const [edicion, setEdicion] = useState({ inicio: String(clip.inicio), fin: String(clip.fin), titulo: clip.titulo, gancho: clip.gancho });
  const decidir = abierta && clip.estado === "por_revisar";
  const id = `clip-${clip.id}`;
  return (
    <li className={`eg-clip eg-clip-${clip.estado}`} aria-labelledby={`${id}-titulo`}>
      <div className="eg-clip-video">
        {clip.medioId && clip.estado !== "renderizando" && clip.estado !== "cambios" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- los subtítulos van quemados en el propio clip
          <video controls preload="metadata" src={`/api/granjas/medios/${clip.medioId}`} aria-label={`${g("clips_clip")} ${clip.numero}`} />
        ) : (
          <p className="ep-nota">{clip.estado === "fallido" ? g("clips_fallo") : g("clips_renderizando")}</p>
        )}
      </div>
      <div className="eg-clip-datos">
        <p className="eg-clip-meta">
          <span className={`ep-pill eg-clip-estado-${clip.estado}`}>{g(`clips_estado_${clip.estado}`)}</span>
          <span>
            {g("clips_clip")} {clip.numero} · {tiempo(clip.inicio)}–{tiempo(clip.fin)} · {(clip.fin - clip.inicio).toFixed(0)} s
            {clip.version > 1 ? ` · v${clip.version}` : ""}
          </span>
        </p>
        <h4 id={`${id}-titulo`}>{clip.titulo}</h4>
        {clip.gancho && (
          <p className="eg-clip-gancho">
            <b>{g("clips_gancho")}:</b> {clip.gancho}
          </p>
        )}
        {clip.motivo && (
          <p className="ep-nota">
            <b>{clip.estado === "rechazado" ? g("clips_motivoRechazo") : g("clips_cambiosPedidos")}:</b> {clip.motivo}
          </p>
        )}
        {clip.error && <p className="ep-error">{clip.error}</p>}

        {decidir && (
          <div className="eg-clip-acciones" role="group" aria-label={g("clips_decidir")}>
            <button type="button" className="ep-boton" aria-pressed={modo === "aprobar"} onClick={() => setModo(modo === "aprobar" ? "" : "aprobar")}>
              <Check size={15} /> {g("clips_aprobar")}
            </button>
            <button type="button" className="ep-boton ep-texto" aria-pressed={modo === "cambios"} onClick={() => setModo(modo === "cambios" ? "" : "cambios")}>
              <Pencil size={15} /> {g("clips_pedirCambios")}
            </button>
            <button type="button" className="ep-boton ep-texto" aria-pressed={modo === "rechazar"} onClick={() => setModo(modo === "rechazar" ? "" : "rechazar")}>
              <X size={15} /> {g("clips_rechazar")}
            </button>
          </div>
        )}
        {decidir && modo === "aprobar" && (
          <fieldset className="eg-clip-form">
            <legend>{g("clips_confirma")}</legend>
            {(["hechos", "derechos", "marca"] as const).map((k) => (
              <label className="ep-checkbox" key={k}>
                <input type="checkbox" checked={comprobado[k]} onChange={(e) => setComprobado({ ...comprobado, [k]: e.target.checked })} />
                {g(`clips_comprobar_${k}`)}
              </label>
            ))}
            <button
              type="button"
              className="ep-boton"
              disabled={ocupado || !Object.values(comprobado).every(Boolean)}
              onClick={() => acciones.aprobar(clip.id, comprobado)}
            >
              {g("clips_aprobarVersion")}
            </button>
          </fieldset>
        )}
        {decidir && modo === "rechazar" && (
          <div className="eg-clip-form">
            <label className="eg-campo">
              {g("clips_motivoRechazo")}
              <textarea rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            <button type="button" className="ep-boton" disabled={ocupado || motivo.trim().length < 3} onClick={() => acciones.rechazar(clip.id, motivo)}>
              {g("clips_rechazar")}
            </button>
          </div>
        )}
        {decidir && modo === "cambios" && (
          <div className="eg-clip-form">
            <div className="eg-clip-tiempos">
              <label className="eg-campo">
                {g("clips_inicio")}
                <input type="number" min={0} step={0.5} inputMode="decimal" value={edicion.inicio} onChange={(e) => setEdicion({ ...edicion, inicio: e.target.value })} />
              </label>
              <label className="eg-campo">
                {g("clips_fin")}
                <input type="number" min={0} step={0.5} inputMode="decimal" value={edicion.fin} onChange={(e) => setEdicion({ ...edicion, fin: e.target.value })} />
              </label>
            </div>
            <label className="eg-campo">
              {g("clips_tituloCampo")}
              <input maxLength={90} value={edicion.titulo} onChange={(e) => setEdicion({ ...edicion, titulo: e.target.value })} />
            </label>
            <label className="eg-campo">
              {g("clips_gancho")}
              <input maxLength={120} value={edicion.gancho} onChange={(e) => setEdicion({ ...edicion, gancho: e.target.value })} />
            </label>
            <label className="eg-campo">
              {g("clips_queCambiar")}
              <textarea rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            <button
              type="button"
              className="ep-boton"
              disabled={ocupado || motivo.trim().length < 3 || !edicion.titulo.trim() || !(Number(edicion.fin) > Number(edicion.inicio))}
              onClick={() =>
                acciones.cambios(clip.id, {
                  motivo,
                  inicio: Number(edicion.inicio),
                  fin: Number(edicion.fin),
                  titulo: edicion.titulo.trim(),
                  gancho: edicion.gancho.trim(),
                })
              }
            >
              {g("clips_rehacer")}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
