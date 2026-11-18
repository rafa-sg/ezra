"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Image as Imagen, Pencil, RefreshCw, Send, X } from "lucide-react";
import type { Evento, EstadoVisible } from "@/lib/granjas/eventos";
import { Modal } from "../ui";
import { pedir } from "./cliente";

type EventoVista = Evento & { ficha: string };
type Respuesta = {
  eventos: EventoVista[];
  conteo: Record<EstadoVisible, number>;
  total: number;
  spotmi: boolean;
  categorias: string[];
  departamentos: string[];
};
const estados: EstadoVisible[] = ["nuevo", "aprobado", "descartado", "propuesto", "aceptado", "subido_ig"];
type Formulario = {
  titulo: string;
  fecha: string;
  hora: string;
  lugar: string;
  municipio: string;
  departamento: string;
  categoria: string;
  precio: string;
  boletosUrl: string;
  fuenteUrl: string;
  descripcion: string;
};
const aFormulario = (e: Evento): Formulario => ({
  titulo: e.titulo,
  fecha: e.fecha ?? "",
  hora: e.hora ?? "",
  lugar: e.lugar,
  municipio: e.municipio,
  departamento: e.departamento,
  categoria: e.categoria,
  precio: e.precio ?? "",
  boletosUrl: e.boletosUrl ?? "",
  fuenteUrl: e.fuenteUrl,
  descripcion: e.descripcion,
});
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const hoyLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());

/** Bandeja de eventos: el propietario decide; Spotmi solo recibe propuestas pendientes de lo aprobado. */
export function SeccionEventos({ g, fecha, locale }: { g: (clave: string) => string; fecha: (iso: string) => string; locale: string }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [filtro, setFiltro] = useState<{ estado: EstadoVisible | ""; desde: string; hasta: string }>({ estado: "", desde: "", hasta: "" });
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<{ evento: EventoVista; form: Formulario } | null>(null);
  const [descartando, setDescartando] = useState<{ evento: EventoVista; motivo: string } | null>(null);
  const [imagen, setImagen] = useState<{ evento: EventoVista; url: string; permiso: string } | null>(null);
  const [diaExportar, setDiaExportar] = useState(hoyLocal);
  const consulta = `estado=${filtro.estado}&desde=${filtro.desde}&hasta=${filtro.hasta}`;
  const cargar = useCallback(async () => {
    try {
      setDatos(await pedir<Respuesta>(`/api/granjas/eventos?${consulta}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [consulta]);
  useEffect(() => {
    let vivo = true;
    pedir<Respuesta>(`/api/granjas/eventos?${consulta}`)
      .then((r) => vivo && setDatos(r))
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [consulta]);
  useEffect(() => {
    if (!aviso) return;
    const reloj = setTimeout(() => setAviso(""), 4000);
    return () => clearTimeout(reloj);
  }, [aviso]);
  async function accion(cuerpo: object, exito: string) {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      await pedir("/api/granjas/eventos", cuerpo);
      setAviso(exito);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
      await cargar();
    }
  }
  async function copiar(e: EventoVista) {
    try {
      await navigator.clipboard.writeText(e.ficha);
      setAviso(g("ev_fichaCopiada"));
    } catch {
      setError(g("ev_copiaFallo"));
    }
  }
  const diaCorto = (dia: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${dia}T12:00:00Z`),
    );
  const dato = (e: EventoVista, campo: "fecha" | "hora" | "precio", valor: string | null) =>
    valor ? (
      <>
        {campo === "fecha" ? diaCorto(valor) : valor}{" "}
        <small className="eg-confirmado">
          <Check size={12} aria-hidden="true" /> {g(e.confirmadoEn[campo] === "propietario" ? "ev_confirmadoPropietario" : "ev_confirmadoFuente")}
        </small>
      </>
    ) : (
      <>
        <span className="eg-por-confirmar">{g("ev_porConfirmar")}</span>
        {e.sugerencias[campo] && (
          <small className="ep-nota">
            {" "}
            · {g("ev_sugerido")}: {e.sugerencias[campo]} ({g("ev_sinConfirmarFuente")})
          </small>
        )}
      </>
    );
  if (!datos) return <p role="status">{error || g("cargando")}</p>;
  return (
    <div className="eg-eventos">
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="ep-aviso" role="status">
          {aviso}
        </p>
      )}
      <p className={datos.spotmi ? "ep-nota" : "eg-presupuesto-aviso"}>{g(datos.spotmi ? "ev_spotmiConectado" : "ev_spotmiNoConectado")}</p>
      <div className="eg-filtros" role="group" aria-label={g("ev_estado")}>
        <label className="eg-campo">
          {g("ev_estado")}
          <select value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value as EstadoVisible | "" })}>
            <option value="">
              {g("ev_todos")} ({datos.total})
            </option>
            {estados.map((e) => (
              <option key={e} value={e}>
                {g(`ev_estado_${e}`)} ({datos.conteo[e] ?? 0})
              </option>
            ))}
          </select>
        </label>
        <label className="eg-campo">
          {g("ev_desde")}
          <input type="date" value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} />
        </label>
        <label className="eg-campo">
          {g("ev_hasta")}
          <input type="date" value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} />
        </label>
        <button className="ep-boton ep-texto" disabled={!filtro.estado && !filtro.desde && !filtro.hasta} onClick={() => setFiltro({ estado: "", desde: "", hasta: "" })}>
          {g("ev_limpiar")}
        </button>
        {datos.spotmi && (datos.conteo.propuesto ?? 0) > 0 && (
          <button className="ep-boton" disabled={ocupado} onClick={() => void accion({ accion: "consultar_spotmi" }, g("ev_estadoActualizado"))}>
            <RefreshCw size={15} />
            {g("ev_actualizarSpotmi")}
          </button>
        )}
      </div>
      {!datos.total ? (
        <div className="ep-vacio">
          <h3>{g("ev_vacioFiltro")}</h3>
        </div>
      ) : !datos.eventos.length ? (
        <p className="ep-nota">{g("ev_vacioFiltro")}</p>
      ) : (
        <ul className="eg-lista-eventos">
          {datos.eventos.map((e) => (
            <li key={e.id} className={`eg-evento eg-evento-${e.estadoVisible}`}>
              <div className="eg-evento-cabecera">
                <span className="ep-pill">{g(`ev_estado_${e.estadoVisible}`)}</span>
                <span className="eg-evento-categoria">{g(`ev_cat_${e.categoria}`)}</span>
              </div>
              <h3>{e.titulo}</h3>
              <dl className="eg-evento-datos">
                <div>
                  <dt>{g("ev_fecha")}</dt>
                  <dd>{dato(e, "fecha", e.fecha)}</dd>
                </div>
                <div>
                  <dt>{g("ev_hora")}</dt>
                  <dd>{dato(e, "hora", e.hora)}</dd>
                </div>
                <div>
                  <dt>{g("ev_lugar")}</dt>
                  <dd>{[e.lugar, e.municipio, e.departamento].filter(Boolean).join(", ") || <span className="eg-por-confirmar">{g("ev_porConfirmar")}</span>}</dd>
                </div>
                <div>
                  <dt>{g("ev_precio")}</dt>
                  <dd>{dato(e, "precio", e.precio)}</dd>
                </div>
                {e.boletosUrl && (
                  <div>
                    <dt>{g("ev_boletos")}</dt>
                    <dd>
                      <a href={e.boletosUrl} target="_blank" rel="noreferrer noopener">
                        {host(e.boletosUrl)} <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>{g("ev_fuente")}</dt>
                  <dd>
                    <a href={e.fuenteUrl} target="_blank" rel="noreferrer noopener">
                      {host(e.fuenteUrl)} <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{g("ev_imagen")}</dt>
                  <dd>
                    {e.imagenMedioId ? (
                      <>
                        {g("ev_imagenAutorizada")} · <small className="ep-nota">{e.imagenPermiso}</small>
                      </>
                    ) : e.imagenUrl ? (
                      <a href={e.imagenUrl} target="_blank" rel="noreferrer noopener">
                        {g("ev_imagenSugerida")}
                      </a>
                    ) : (
                      <small className="ep-nota">{g("ev_sinImagen")}</small>
                    )}
                  </dd>
                </div>
              </dl>
              {e.descripcion && <p className="eg-evento-descripcion">{e.descripcion}</p>}
              {e.spotmiPropuestaId && (
                <p className="ep-nota">
                  {g("ev_propuesta")}: <code>{e.spotmiPropuestaId}</code> · {e.spotmiEstado ? g(`ev_spotmi_${e.spotmiEstado}`) : ""}
                  {e.spotmiConsultado ? ` · ${fecha(e.spotmiConsultado)}` : ""}
                </p>
              )}
              {e.estado === "descartado" && e.motivoDescarte && (
                <p className="ep-nota">
                  {g("ev_descartado")} {e.motivoDescarte}
                </p>
              )}
              {e.notaVerificacion && (
                <p className="ep-nota">
                  {g("ev_nota")}: {e.notaVerificacion}
                </p>
              )}
              <div className="ep-acciones eg-evento-acciones">
                {e.estado === "nuevo" && (
                  <button className="ep-boton ep-primario" disabled={ocupado} onClick={() => void accion({ accion: "aprobar", id: e.id, revision: e.revision }, g("ev_estado_aprobado"))}>
                    <Check size={15} />
                    {g("ev_aprobar")}
                  </button>
                )}
                {e.estado === "aprobado" && !e.spotmiPropuestaId && (
                  <button
                    className="ep-boton ep-primario"
                    disabled={ocupado || !datos.spotmi}
                    title={datos.spotmi ? undefined : g("ev_spotmiNoConectado")}
                    onClick={() => void accion({ accion: "enviar_spotmi", id: e.id }, g("ev_enviado"))}
                  >
                    <Send size={15} />
                    {g("ev_enviarSpotmi")}
                  </button>
                )}
                {e.spotmiPropuestaId && (
                  <button className="ep-boton" disabled={ocupado || !datos.spotmi} onClick={() => void accion({ accion: "consultar_spotmi", id: e.id }, g("ev_estadoActualizado"))}>
                    <RefreshCw size={15} />
                    {g("ev_consultarSpotmi")}
                  </button>
                )}
                <button className="ep-boton" disabled={ocupado} onClick={() => setEditando({ evento: e, form: aFormulario(e) })}>
                  <Pencil size={15} />
                  {g("ev_editar")}
                </button>
                <button className="ep-boton" disabled={ocupado} onClick={() => setImagen({ evento: e, url: e.imagenUrl ?? "", permiso: e.imagenPermiso })}>
                  <Imagen size={15} />
                  {g("ev_imagen")}
                </button>
                <button className="ep-boton" onClick={() => void copiar(e)}>
                  <Copy size={15} />
                  {g("ev_copiarFicha")}
                </button>
                {e.estado !== "descartado" && !e.spotmiPropuestaId && (
                  <button className="ep-boton eg-peligro" disabled={ocupado} onClick={() => setDescartando({ evento: e, motivo: "" })}>
                    <X size={15} />
                    {g("ev_descartar")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className="eg-bloque">
        <h2 className="eg-subtitulo">{g("ev_exportar")}</h2>
        <p className="ep-nota">{g("ev_exportarAyuda")}</p>
        <div className="eg-formulario-linea">
          <label className="eg-campo">
            {g("ev_diaHallazgo")}
            <input type="date" value={diaExportar} onChange={(e) => setDiaExportar(e.target.value)} />
          </label>
          <a className="ep-boton" href={`/api/granjas/eventos/exportar?dia=${diaExportar}&formato=csv`}>
            <Download size={15} />
            {g("ev_csv")}
          </a>
          <a className="ep-boton" href={`/api/granjas/eventos/exportar?dia=${diaExportar}&formato=json`}>
            <Download size={15} />
            {g("ev_json")}
          </a>
        </div>
      </section>

      <Modal open={Boolean(editando)} onClose={() => setEditando(null)} label={g("ev_editar")} className="ep-modal" dismissOnBackdrop>
        {editando && (
          <form
            className="eg-guia eg-form-evento"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const f = editando.form;
              const ok = await accion(
                {
                  accion: "editar",
                  id: editando.evento.id,
                  revision: editando.evento.revision,
                  datos: {
                    ...f,
                    fecha: f.fecha || null,
                    hora: f.hora || null,
                    precio: f.precio.trim() || null,
                    boletosUrl: f.boletosUrl.trim() || null,
                  },
                },
                g("ev_guardado"),
              );
              if (ok) setEditando(null);
            }}
          >
            <h2>{g("ev_editar")}</h2>
            <p className="ep-nota">{g("ev_editarAyuda")}</p>
            {(
              [
                ["titulo", "ev_titulo", "text", 160],
                ["fecha", "ev_fecha", "date", 10],
                ["hora", "ev_hora", "time", 5],
                ["lugar", "ev_lugar", "text", 200],
                ["municipio", "ev_municipio", "text", 120],
                ["precio", "ev_precio", "text", 120],
                ["boletosUrl", "ev_boletos", "url", 1000],
                ["fuenteUrl", "ev_fuente", "url", 1000],
              ] as const
            ).map(([campo, etiqueta, tipo, max]) => (
              <label key={campo} className="eg-campo">
                {g(etiqueta)}
                <input
                  type={tipo}
                  maxLength={max}
                  required={campo === "titulo" || campo === "fuenteUrl"}
                  value={editando.form[campo]}
                  placeholder={["fecha", "hora", "precio"].includes(campo) ? g("ev_porConfirmar") : undefined}
                  onChange={(x) => setEditando({ ...editando, form: { ...editando.form, [campo]: x.target.value } })}
                />
              </label>
            ))}
            <div className="eg-dos">
              <label className="eg-campo">
                {g("ev_departamento")}
                <select value={editando.form.departamento} onChange={(x) => setEditando({ ...editando, form: { ...editando.form, departamento: x.target.value } })}>
                  <option value="">—</option>
                  {datos.departamentos.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="eg-campo">
                {g("ev_categoria")}
                <select value={editando.form.categoria} onChange={(x) => setEditando({ ...editando, form: { ...editando.form, categoria: x.target.value } })}>
                  {datos.categorias.map((c) => (
                    <option key={c} value={c}>
                      {g(`ev_cat_${c}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="eg-campo">
              {g("ev_descripcion")}
              <textarea rows={4} maxLength={300} value={editando.form.descripcion} onChange={(x) => setEditando({ ...editando, form: { ...editando.form, descripcion: x.target.value } })} />
              <small>{editando.form.descripcion.length}/300</small>
            </label>
            <div className="ep-acciones">
              <button className="ep-boton ep-primario" disabled={ocupado}>
                {g("guardar")}
              </button>
              <button type="button" className="ep-boton" onClick={() => setEditando(null)}>
                {g("cancelar")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal open={Boolean(descartando)} onClose={() => setDescartando(null)} label={g("ev_descartar")} className="ep-modal" dismissOnBackdrop>
        {descartando && (
          <form
            className="eg-guia"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const ok = await accion({ accion: "descartar", id: descartando.evento.id, revision: descartando.evento.revision, motivo: descartando.motivo }, g("ev_estado_descartado"));
              if (ok) setDescartando(null);
            }}
          >
            <h2>
              {g("ev_descartar")} · {descartando.evento.titulo}
            </h2>
            <label className="eg-campo">
              {g("ev_motivo")}
              <textarea rows={3} required minLength={3} maxLength={300} value={descartando.motivo} onChange={(x) => setDescartando({ ...descartando, motivo: x.target.value })} />
            </label>
            <p className="ep-nota">{g("ev_motivoAyuda")}</p>
            <div className="ep-acciones">
              <button className="ep-boton eg-peligro" disabled={ocupado || descartando.motivo.trim().length < 3}>
                {g("ev_descartar")}
              </button>
              <button type="button" className="ep-boton" onClick={() => setDescartando(null)}>
                {g("cancelar")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal open={Boolean(imagen)} onClose={() => setImagen(null)} label={g("ev_imagen")} className="ep-modal" dismissOnBackdrop>
        {imagen && (
          <form
            className="eg-guia"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const ok = await accion({ accion: "imagen", id: imagen.evento.id, revision: imagen.evento.revision, url: imagen.url, permiso: imagen.permiso }, g("ev_imagenAutorizada"));
              if (ok) setImagen(null);
            }}
          >
            <h2>{g("ev_autorizarImagen")}</h2>
            <label className="eg-campo">
              {g("ev_imagenUrl")}
              <input type="url" required maxLength={1000} value={imagen.url} onChange={(x) => setImagen({ ...imagen, url: x.target.value })} />
            </label>
            <label className="eg-campo">
              {g("ev_permiso")}
              <input required minLength={3} maxLength={500} value={imagen.permiso} onChange={(x) => setImagen({ ...imagen, permiso: x.target.value })} />
            </label>
            <p className="ep-nota">{g("ev_permisoAyuda")}</p>
            <div className="ep-acciones">
              <button className="ep-boton ep-primario" disabled={ocupado || imagen.permiso.trim().length < 3 || !imagen.url.startsWith("https://")}>
                {g("ev_autorizarImagen")}
              </button>
              {imagen.evento.imagenMedioId && (
                <button
                  type="button"
                  className="ep-boton eg-peligro"
                  disabled={ocupado}
                  onClick={async () => {
                    const ok = await accion({ accion: "imagen", id: imagen.evento.id, revision: imagen.evento.revision, medioId: null, permiso: "" }, g("ev_quitarImagen"));
                    if (ok) setImagen(null);
                  }}
                >
                  {g("ev_quitarImagen")}
                </button>
              )}
              <button type="button" className="ep-boton" onClick={() => setImagen(null)}>
                {g("cancelar")}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
