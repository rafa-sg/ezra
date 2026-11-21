"use client";
import { useState } from "react";
import {
  Trash2,
  Link2,
  Unlink,
  Upload,
  Play,
  RotateCcw,
  Check,
  FileInput,
  Pencil,
} from "lucide-react";
import { agentes, canales, type Agente } from "@/lib/produccion/modelo";
import {
  proveedoresNodo,
  salidasNodo,
  aceptaNodo,
  type Grafo,
  type Nodo,
} from "@/lib/granjas/modelo";
import type { Artefacto, MedioResumen, Paso, Resumen } from "./cliente";

const nombresCanales = {
  spotmi: "Spotmi web",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
};
export type AccionesPaso = {
  ejecutarSolo: (nodoId: string, ia: boolean) => void;
  reintentar: (pasoId: string, ia: boolean) => void;
  manual: (pasoId: string, contenido: string, nota: string, medioId: string | null) => void;
  importar: (pasoId: string) => void;
  aprobar: (pasoId: string, c: { hechos: boolean; derechos: boolean; marca: boolean }) => void;
  editarArtefacto: (id: string, contenido: string, nota: string) => void;
  subir: (
    archivo: File,
    licencia: string,
    generado: boolean,
    permiso?: { tipo: "propio" | "autorizado"; autor: string; constancia: string },
  ) => Promise<MedioResumen | null>;
};

export function Inspector({
  nodo,
  grafo,
  paso,
  artefactos,
  aprobado,
  faltantes,
  clips = false,
  resumen,
  guardado,
  ocupado,
  g,
  tr,
  fecha,
  onCambiar,
  onEliminar,
  onConectar,
  onDesconectar,
  acciones,
}: {
  nodo: Nodo;
  grafo: Grafo;
  paso: Paso | undefined;
  artefactos: Map<string, Artefacto>;
  aprobado: boolean;
  faltantes: string[];
  /** Granja «Clips»: material solo de video con origen declarado y referencia de «Videos virales». */
  clips?: boolean;
  resumen: Resumen;
  guardado: boolean;
  ocupado: boolean;
  g: (clave: string) => string;
  tr: (clave: string) => string;
  fecha: (iso: string) => string;
  onCambiar: (nodo: Nodo) => void;
  onEliminar: () => void;
  onConectar: (desde: string, hacia: string) => void;
  onDesconectar: (aristaId: string) => void;
  acciones: AccionesPaso;
}) {
  const [destino, setDestino] = useState("");
  const [consentir, setConsentir] = useState(false);
  const [manual, setManual] = useState({ contenido: "", nota: "", medioId: "" });
  const [revision, setRevision] = useState({ hechos: false, derechos: false, marca: false });
  const [subida, setSubida] = useState<{
    archivo: File | null;
    licencia: string;
    generado: boolean;
    permiso: "" | "propio" | "autorizado";
    autor: string;
    constancia: string;
  }>({ archivo: null, licencia: "", generado: false, permiso: "", autor: "", constancia: "" });
  const subidaLista = clips
    ? Boolean(subida.archivo) &&
      (subida.permiso === "propio" ||
        (subida.permiso === "autorizado" && subida.autor.trim() !== "" && subida.constancia.trim() !== ""))
    : Boolean(subida.archivo) && subida.licencia.trim() !== "";
  const [edicion, setEdicion] = useState<{ id: string; contenido: string; nota: string } | null>(
    null,
  );
  const cambiar = (cambios: Partial<Nodo>) => onCambiar({ ...nodo, ...cambios });
  const entrantes = grafo.aristas.filter((a) => a.hacia === nodo.id);
  const salientes = grafo.aristas.filter((a) => a.desde === nodo.id);
  const titulo = (id: string) => grafo.nodos.find((n) => n.id === id)?.titulo ?? "—";
  const ia = nodo.tipo === "agente" && nodo.proveedor !== "manual" && nodo.proveedor !== "local";
  const candidatos = grafo.nodos.filter(
    (n) =>
      n.id !== nodo.id &&
      !salientes.some((a) => a.hacia === n.id) &&
      salidasNodo(nodo, grafo).some((t) => aceptaNodo(n).includes(t)),
  );
  const disponible = (p: string) =>
    p === "manual" || p === "local" ? true : resumen.ia[p as "astra" | "claude" | "gemini"];
  const verArtefacto = (id: string) => {
    const a = artefactos.get(id);
    if (!a) return null;
    return (
      <li key={id} className={`eg-artefacto ${a.estado === "reemplazado" ? "eg-reemplazado" : ""}`}>
        <div className="eg-artefacto-cabecera">
          <span className="ep-pill">
            {g(`tipo_${a.tipo}`)} · v{a.version}
          </span>
          <span className="eg-procedencia">{g(`origen_${a.procedencia.origen}`)}</span>
        </div>
        {a.procedencia.nota && <p className="ep-nota">{a.procedencia.nota}</p>}
        {a.medioId ? (
          a.tipo === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- vista interna de medios propios; los subtítulos vienen en el material
            <video
              className="eg-medio"
              src={`/api/granjas/medios/${a.medioId}`}
              controls
              preload="metadata"
            />
          ) : (
            <img
              className="eg-medio"
              src={`/api/granjas/medios/${a.medioId}`}
              alt={a.contenido || g("tipo_imagen")}
            />
          )
        ) : (
          <details>
            <summary>{g("verContenido")}</summary>
            <pre className="eg-contenido">{a.contenido}</pre>
          </details>
        )}
        {!a.medioId && a.estado === "vigente" && paso?.salidas.includes(id) && (
          <button
            type="button"
            className="ep-boton ep-texto"
            onClick={() => setEdicion({ id, contenido: a.contenido, nota: "" })}
          >
            <Pencil size={14} />
            {g("corregir")}
          </button>
        )}
      </li>
    );
  };

  return (
    <aside className="eg-inspector" aria-label={g("inspector")}>
      <p className="ep-eyebrow">
        {nodo.agente ? g(`agente_${nodo.agente}`) : g(`nodo_${nodo.tipo}`)}
      </p>
      <label className="eg-campo">
        {nodo.tipo === "agente" ? g("responsabilidad") : g("nombrePaso")}
        <input
          value={nodo.titulo}
          maxLength={160}
          onChange={(e) => cambiar({ titulo: e.target.value })}
        />
      </label>

      {nodo.tipo === "agente" && (
        <>
          {clips && nodo.agente === "shorts" && (
            <p className="ep-nota eg-clips-ayuda">{g("clips_momentosAyuda")}</p>
          )}
          <div className="eg-dos">
            <label className="eg-campo">
              {g("especialidad")}
              <select
                value={nodo.agente ?? "cazador"}
                onChange={(e) => cambiar({ agente: e.target.value as Agente })}
              >
                {agentes
                  .filter((a) => resumen.especialistas.includes(a) || a === nodo.agente)
                  .map((a) => (
                    <option key={a} value={a}>
                      {g(`agente_${a}`)}
                      {resumen.especialistas.includes(a) ? "" : ` ${g("especialistaOculto")}`}
                    </option>
                  ))}
              </select>
            </label>
            <label className="eg-campo">
              {g("proveedor")}
              <select
                value={nodo.proveedor}
                onChange={(e) => cambiar({ proveedor: e.target.value as Nodo["proveedor"] })}
              >
                {proveedoresNodo.map((p) => (
                  <option key={p} value={p}>
                    {p === "manual"
                      ? g("manual")
                      : p === "local"
                        ? g("proveedorLocal")
                        : tr(`p_${p}`)}{" "}
                    {disponible(p) ? "" : `· ${g("noDisponible")}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!disponible(nodo.proveedor) && (
            <p className="ep-nota">
              {nodo.proveedor === "gemini" ? g("geminiApagado") : g("herramientaFalta")}
            </p>
          )}
          {nodo.proveedor === "gemini" && (
            <>
              <label className="ep-checkbox">
                <input
                  type="checkbox"
                  checked={nodo.busqueda ?? nodo.agente === "cazador"}
                  onChange={(e) => cambiar({ busqueda: e.target.checked })}
                />
                {g("usarBusqueda")}
              </label>
              <p className="ep-nota">{g("usarBusquedaAyuda")}</p>
            </>
          )}
          <label className="eg-campo">
            {g("instrucciones")}
            <textarea
              rows={4}
              maxLength={8000}
              value={nodo.instrucciones}
              onChange={(e) => cambiar({ instrucciones: e.target.value })}
            />
          </label>
          <fieldset className="eg-campo">
            <legend>{g("fuentes")}</legend>
            {nodo.fuentes.map((f, i) => (
              <div className="eg-fuente" key={i}>
                <input
                  aria-label={g("fuenteNombre")}
                  placeholder={g("fuenteNombre")}
                  value={f.nombre}
                  maxLength={180}
                  onChange={(e) =>
                    cambiar({
                      fuentes: nodo.fuentes.map((x, j) =>
                        j === i ? { ...x, nombre: e.target.value } : x,
                      ),
                    })
                  }
                />
                <input
                  aria-label={g("fuenteUrl")}
                  placeholder="https://"
                  type="url"
                  value={f.url}
                  onChange={(e) =>
                    cambiar({
                      fuentes: nodo.fuentes.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="ep-boton ep-icono"
                  aria-label={g("quitarFuente")}
                  onClick={() => cambiar({ fuentes: nodo.fuentes.filter((_, j) => j !== i) })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ep-boton ep-texto"
              disabled={nodo.fuentes.length >= 20}
              onClick={() =>
                cambiar({
                  fuentes: [...nodo.fuentes, { nombre: "", url: "", imagen: "", nota: "" }],
                })
              }
            >
              {g("agregarFuente")}
            </button>
            <p className="ep-nota">{g("fuentesAyuda")}</p>
          </fieldset>
          <label className="eg-campo">
            {g("encargoVinculado")}
            <select
              value={nodo.encargoId ?? ""}
              onChange={(e) => cambiar({ encargoId: e.target.value || null })}
            >
              <option value="">{g("ninguno")}</option>
              {resumen.encargos
                .filter((e) => !(clips && nodo.agente === "virales") || e.agente === "virales")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo} · v{e.version}
                    {clips && nodo.agente === "virales" && e.estado !== "aprobado" ? ` · ${g("clips_sinAprobar")}` : ""}
                  </option>
                ))}
            </select>
            {clips && nodo.agente === "virales" && <small className="ep-nota">{g("clips_referenciaAyuda")}</small>}
          </label>
        </>
      )}

      {nodo.tipo === "medios" && (
        <fieldset className="eg-campo">
          <legend>{g("mediosAutorizados")}</legend>
          {clips && <p className="ep-nota">{g("clips_materialAyuda")}</p>}
          {resumen.medios.filter((m) => m.origen !== "render" && (!clips || m.mime.startsWith("video/"))).length === 0 && (
            <p className="ep-nota">{clips ? g("clips_sinVideos") : g("sinMedios")}</p>
          )}
          {resumen.medios
            .filter((m) => m.origen !== "render" && (!clips || m.mime.startsWith("video/")))
            .map((m) => (
              <label className="ep-checkbox" key={m.id}>
                <input
                  type="checkbox"
                  disabled={clips && !m.permiso && !nodo.medios.includes(m.id)}
                  checked={nodo.medios.includes(m.id)}
                  onChange={(e) =>
                    cambiar({
                      medios: e.target.checked
                        ? [...nodo.medios, m.id].slice(0, 20)
                        : nodo.medios.filter((x) => x !== m.id),
                    })
                  }
                />
                <span>
                  {m.nombre} ·{" "}
                  {m.mime.split("/")[0] === "video"
                    ? `${m.duracion?.toFixed(1) ?? "?"} s`
                    : `${m.ancho ?? "?"}×${m.alto ?? "?"}`}
                  <small>
                    {clips
                      ? m.permiso
                        ? m.permiso.tipo === "propio"
                          ? g("clips_propio")
                          : `${g("clips_autorizado")} · ${m.permiso.autor}`
                        : g("clips_sinPermiso")
                      : m.licencia}
                    {m.generado ? ` · ${g("generada")}` : ""}
                  </small>
                </span>
              </label>
            ))}
          <div className="eg-subida">
            <input
              aria-label={g("archivo")}
              type="file"
              accept={clips ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp,video/mp4,video/webm"}
              onChange={(e) => setSubida({ ...subida, archivo: e.target.files?.[0] ?? null })}
            />
            {clips ? (
              <fieldset className="eg-permiso">
                <legend>{g("clips_deQuien")}</legend>
                <label className="ep-checkbox">
                  <input
                    type="radio"
                    name={`permiso-${nodo.id}`}
                    checked={subida.permiso === "propio"}
                    onChange={() => setSubida({ ...subida, permiso: "propio" })}
                  />
                  {g("clips_propio")}
                </label>
                <label className="ep-checkbox">
                  <input
                    type="radio"
                    name={`permiso-${nodo.id}`}
                    checked={subida.permiso === "autorizado"}
                    onChange={() => setSubida({ ...subida, permiso: "autorizado" })}
                  />
                  {g("clips_autorizado")}
                </label>
                {subida.permiso === "autorizado" && (
                  <>
                    <input
                      aria-label={g("clips_autor")}
                      placeholder={g("clips_autor")}
                      value={subida.autor}
                      maxLength={200}
                      onChange={(e) => setSubida({ ...subida, autor: e.target.value })}
                    />
                    <input
                      aria-label={g("clips_constancia")}
                      placeholder={g("clips_constanciaEjemplo")}
                      value={subida.constancia}
                      maxLength={500}
                      onChange={(e) => setSubida({ ...subida, constancia: e.target.value })}
                    />
                  </>
                )}
                <small className="ep-nota">{g("clips_terceros")}</small>
              </fieldset>
            ) : (
              <>
                <input
                  aria-label={g("permiso")}
                  placeholder={g("permisoEjemplo")}
                  value={subida.licencia}
                  maxLength={1000}
                  onChange={(e) => setSubida({ ...subida, licencia: e.target.value })}
                />
                <label className="ep-checkbox">
                  <input
                    type="checkbox"
                    checked={subida.generado}
                    onChange={(e) => setSubida({ ...subida, generado: e.target.checked })}
                  />
                  {g("esGenerada")}
                </label>
              </>
            )}
            <button
              type="button"
              className="ep-boton"
              disabled={!subidaLista || ocupado}
              onClick={async () => {
                const medio = await acciones.subir(
                  subida.archivo!,
                  clips ? "" : subida.licencia,
                  clips ? false : subida.generado,
                  clips && subida.permiso
                    ? { tipo: subida.permiso, autor: subida.autor.trim(), constancia: subida.constancia.trim() }
                    : undefined,
                );
                if (medio) {
                  cambiar({ medios: [...nodo.medios, medio.id].slice(0, 20) });
                  setSubida({ archivo: null, licencia: "", generado: false, permiso: "", autor: "", constancia: "" });
                }
              }}
            >
              <Upload size={15} />
              {g("subir")}
            </button>
          </div>
        </fieldset>
      )}

      {nodo.tipo === "render" && (
        <label className="eg-campo">
          {g("segundosImagen")}
          <input
            type="number"
            min={1}
            max={15}
            value={nodo.segundosPorImagen}
            onChange={(e) =>
              cambiar({ segundosPorImagen: Math.min(15, Math.max(1, Number(e.target.value) || 4)) })
            }
          />
          <span className="ep-nota">{g("renderAyuda")}</span>
        </label>
      )}

      {nodo.tipo === "publicacion" && (
        <fieldset className="eg-campo">
          <legend>{g("destinos")}</legend>
          <div className="ep-canales">
            {canales.map((c) => (
              <label className="ep-checkbox" key={c}>
                <input
                  type="checkbox"
                  checked={nodo.canales.includes(c)}
                  onChange={(e) =>
                    cambiar({
                      canales: e.target.checked
                        ? [...nodo.canales, c]
                        : nodo.canales.filter((x) => x !== c),
                    })
                  }
                />
                {nombresCanales[c]}
              </label>
            ))}
          </div>
          <p className="ep-nota">{g("publicacionAyuda")}</p>
        </fieldset>
      )}

      <fieldset className="eg-campo eg-conexiones-nodo">
        <legend>{g("conexiones")}</legend>
        <ul>
          {entrantes.map((a) => (
            <li key={a.id}>
              {g("recibeDe")} «{titulo(a.desde)}»
              <button
                type="button"
                className="ep-boton ep-icono"
                aria-label={`${g("quitarConexion")}: ${titulo(a.desde)}`}
                onClick={() => onDesconectar(a.id)}
              >
                <Unlink size={14} />
              </button>
            </li>
          ))}
          {salientes.map((a) => (
            <li key={a.id}>
              {g("entregaA")} «{titulo(a.hacia)}»
              <button
                type="button"
                className="ep-boton ep-icono"
                aria-label={`${g("quitarConexion")}: ${titulo(a.hacia)}`}
                onClick={() => onDesconectar(a.id)}
              >
                <Unlink size={14} />
              </button>
            </li>
          ))}
          {!entrantes.length && !salientes.length && (
            <li className="ep-nota">{g("sinConexiones")}</li>
          )}
        </ul>
        {nodo.tipo !== "publicacion" && (
          <div className="eg-fuente">
            <select
              aria-label={g("conectarCon")}
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
            >
              <option value="">{g("conectarCon")}…</option>
              {candidatos.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.titulo}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ep-boton"
              disabled={!destino}
              onClick={() => (onConectar(nodo.id, destino), setDestino(""))}
            >
              <Link2 size={15} />
              {g("conectar")}
            </button>
          </div>
        )}
      </fieldset>

      {faltantes.length > 0 && (
        <div className="eg-faltantes" role="note">
          <strong>{g("falta")}</strong>
          <ul>
            {faltantes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="eg-paso" aria-label={g("ultimaEjecucion")}>
        <h3>{g("ultimaEjecucion")}</h3>
        {!paso ? (
          <p className="ep-nota">{g("sinEjecutar")}</p>
        ) : (
          <>
            <p>
              <span className={`eg-estado eg-estado-${paso.estado}`}>
                {g(`estado_${paso.estado}`)}
              </span>
              {aprobado && <span className="ep-pill">{g("aprobacionVigente")}</span>}
            </p>
            {paso.detalle && <p className="ep-nota">{paso.detalle}</p>}
            {paso.error && (
              <p className="ep-alerta" role="alert">
                {paso.error}
              </p>
            )}
            <dl className="eg-datos">
              <dt>{g("intentos")}</dt>
              <dd>{paso.intentos}</dd>
              <dt>{g("ejecutor")}</dt>
              <dd>
                {paso.proveedor === "manual"
                  ? g("manual")
                  : paso.proveedor === "local"
                    ? g("proveedorLocal")
                    : paso.proveedor}
              </dd>
              {paso.inicio && (
                <>
                  <dt>{g("inicio")}</dt>
                  <dd>{fecha(paso.inicio)}</dd>
                </>
              )}
              {paso.fin && (
                <>
                  <dt>{g("fin")}</dt>
                  <dd>{fecha(paso.fin)}</dd>
                </>
              )}
            </dl>
            {paso.entradas.length > 0 && (
              <>
                <h4>{g("entradas")}</h4>
                <ul className="eg-artefactos">{paso.entradas.map(verArtefacto)}</ul>
              </>
            )}
            {paso.salidas.length > 0 && paso.estado !== "aprobado" && (
              <>
                <h4>{g("salidas")}</h4>
                <ul className="eg-artefactos">{paso.salidas.map(verArtefacto)}</ul>
              </>
            )}
            {edicion && (
              <div className="eg-bloque">
                <label className="eg-campo">
                  {g("corregir")}
                  <textarea
                    rows={6}
                    value={edicion.contenido}
                    onChange={(e) => setEdicion({ ...edicion, contenido: e.target.value })}
                  />
                </label>
                <input
                  aria-label={g("notaCambio")}
                  placeholder={g("notaCambio")}
                  value={edicion.nota}
                  maxLength={300}
                  onChange={(e) => setEdicion({ ...edicion, nota: e.target.value })}
                />
                <p className="ep-nota">{g("corregirAyuda")}</p>
                <div className="ep-acciones">
                  <button
                    type="button"
                    className="ep-boton ep-primario"
                    disabled={ocupado || !edicion.contenido.trim()}
                    onClick={() => (
                      acciones.editarArtefacto(edicion.id, edicion.contenido, edicion.nota),
                      setEdicion(null)
                    )}
                  >
                    {g("guardarVersion")}
                  </button>
                  <button type="button" className="ep-boton" onClick={() => setEdicion(null)}>
                    {tr("p_cancelar")}
                  </button>
                </div>
              </div>
            )}
            {paso.estado === "en_revision" && (
              <div className="eg-bloque">
                {(["hechos", "derechos", "marca"] as const).map((c) => (
                  <label className="ep-checkbox" key={c}>
                    <input
                      type="checkbox"
                      checked={revision[c]}
                      onChange={(e) => setRevision({ ...revision, [c]: e.target.checked })}
                    />
                    {g(`comprobar_${c}`)}
                  </label>
                ))}
                <button
                  type="button"
                  className="ep-boton ep-primario"
                  disabled={ocupado || !Object.values(revision).every(Boolean)}
                  onClick={() => acciones.aprobar(paso.id, revision)}
                >
                  <Check size={15} />
                  {g("aprobarRevision")}
                </button>
              </div>
            )}
            {["esperando_manual", "fallido", "bloqueado"].includes(paso.estado) &&
              ["agente", "render"].includes(nodo.tipo) && (
                <div className="eg-bloque">
                  {nodo.encargoId && (
                    <button
                      type="button"
                      className="ep-boton"
                      disabled={ocupado}
                      onClick={() => acciones.importar(paso.id)}
                    >
                      <FileInput size={15} />
                      {g("importarEncargo")}
                    </button>
                  )}
                  <label className="eg-campo">
                    {g("resultadoManual")}
                    <textarea
                      rows={5}
                      maxLength={60000}
                      value={manual.contenido}
                      onChange={(e) => setManual({ ...manual, contenido: e.target.value })}
                    />
                  </label>
                  {nodo.tipo === "render" && (
                    <select
                      aria-label={g("videoManual")}
                      value={manual.medioId}
                      onChange={(e) => setManual({ ...manual, medioId: e.target.value })}
                    >
                      <option value="">{g("videoManual")}…</option>
                      {resumen.medios
                        .filter((m) => m.mime.startsWith("video/"))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                    </select>
                  )}
                  <input
                    aria-label={g("procedenciaManual")}
                    placeholder={g("procedenciaManual")}
                    value={manual.nota}
                    maxLength={300}
                    onChange={(e) => setManual({ ...manual, nota: e.target.value })}
                  />
                  <p className="ep-nota">{g("manualAyuda")}</p>
                  <button
                    type="button"
                    className="ep-boton ep-primario"
                    disabled={ocupado || (!manual.contenido.trim() && !manual.medioId)}
                    onClick={() => (
                      acciones.manual(
                        paso.id,
                        manual.contenido,
                        manual.nota,
                        manual.medioId || null,
                      ),
                      setManual({ contenido: "", nota: "", medioId: "" })
                    )}
                  >
                    {g("guardarManual")}
                  </button>
                </div>
              )}
          </>
        )}
        <div className="eg-bloque">
          {ia && (
            <label className="ep-checkbox">
              <input
                type="checkbox"
                checked={consentir}
                onChange={(e) => setConsentir(e.target.checked)}
              />
              {g("consentimientoPaso")}
            </label>
          )}
          <div className="ep-acciones">
            <button
              type="button"
              className="ep-boton"
              disabled={ocupado || !guardado || (ia && !consentir)}
              onClick={() => acciones.ejecutarSolo(nodo.id, consentir)}
            >
              <Play size={15} />
              {g("ejecutarSolo")}
            </button>
            {paso && ["fallido", "bloqueado", "desactualizado"].includes(paso.estado) && (
              <button
                type="button"
                className="ep-boton"
                disabled={ocupado || (ia && !consentir)}
                onClick={() => acciones.reintentar(paso.id, consentir)}
              >
                <RotateCcw size={15} />
                {g("reintentar")}
              </button>
            )}
          </div>
          {!guardado && <p className="ep-nota">{g("guardaAntes")}</p>}
        </div>
      </section>

      <button type="button" className="ep-boton eg-peligro" onClick={onEliminar}>
        <Trash2 size={15} />
        {g("quitarPaso")}
      </button>
    </aside>
  );
}
