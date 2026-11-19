"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Image as Imagen, Pencil, RefreshCw, Search, Send, Upload, X } from "lucide-react";
import type { Evento, EstadoVisible } from "@/lib/granjas/eventos";
import { Modal } from "../ui";
import { pedir } from "./cliente";
import { ListaPosts } from "./posts";
import { ConfianzaDominios, CuentasSeguir, PegarEnlace, type FilaConfianza } from "./eventos-redes";
import type { CuentasSeguidas, EstadoLectura } from "@/lib/granjas/redes";

type EventoVista = Evento & { ficha: string };
type Respuesta = {
  eventos: EventoVista[];
  conteo: Record<EstadoVisible, number>;
  total: number;
  spotmi: boolean;
  categorias: string[];
  departamentos: string[];
  sinImagen: string[];
  cuentas: CuentasSeguidas;
  lectura: { instagram: EstadoLectura; facebook: EstadoLectura };
  confianza: FilaConfianza[];
};
type ResultadoImagen = { id: string; titulo: string; estado: "afiche" | "ticketera" | "red" | "prensa" | "ia" | "sin_imagen" | "ya_tenia"; motivo: string; boletos?: string };
type Lote = { total: number; hechos: ResultadoImagen[]; activo: boolean };
const estados: EstadoVisible[] = ["nuevo", "aprobado", "descartado", "propuesto", "aceptado", "subido_ig"];
type Formulario = {
  titulo: string;
  fecha: string;
  fechaFin: string;
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
  fechaFin: e.fechaFin ?? "",
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
  const [pestana, setPestana] = useState<"bandeja" | "posts">("bandeja");
  const archivo = useRef<HTMLInputElement>(null);
  type Importacion = { nuevos: number; duplicados: { titulo: string; de: string }[]; descartados: { titulo: string; motivo: string }[]; conImagen: number; conDatosPorConfirmar: number; invalidos: { posicion: number; motivo: string }[] };
  const [importacion, setImportacion] = useState<Importacion | null>(null);
  const [lote, setLote] = useState<Lote | null>(null);
  // Filtro y orden por confianza (en el navegador: la lista ya viene filtrada por estado y fechas).
  const [cuidado, setCuidado] = useState(false);
  const [orden, setOrden] = useState<"fecha" | "confianza_baja" | "confianza_alta">("fecha");
  const detener = useRef(false);
  /** Recorre de a uno los eventos sin imagen: cada paso es una petición, así se ve el progreso y se puede detener. */
  async function completarImagenes(ids: string[]) {
    detener.current = false;
    setError("");
    setLote({ total: ids.length, hechos: [], activo: true });
    for (const id of ids) {
      if (detener.current) break;
      let r: ResultadoImagen;
      try {
        r = (await pedir<{ resultado: ResultadoImagen }>("/api/granjas/eventos", { accion: "completar_imagen", id })).resultado;
      } catch (e) {
        r = { id, titulo: datos?.eventos.find((x) => x.id === id)?.titulo ?? id, estado: "sin_imagen", motivo: (e as Error).message };
      }
      setLote((l) => (l ? { ...l, hechos: [...l.hechos, r] } : l));
    }
    setLote((l) => (l ? { ...l, activo: false } : l));
    await cargar();
  }
  async function importar(file: File) {
    setOcupado(true);
    setError("");
    setImportacion(null);
    try {
      let eventos: unknown;
      try {
        eventos = JSON.parse(await file.text());
      } catch {
        throw new Error(g("ev_imp_jsonInvalido"));
      }
      const lista = Array.isArray(eventos) ? eventos : (eventos as { eventos?: unknown[] })?.eventos;
      const r = await pedir<{ importacion: Importacion }>("/api/granjas/eventos", { accion: "importar", eventos: lista ?? [] });
      setImportacion(r.importacion);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
      if (archivo.current) archivo.current.value = "";
      await cargar();
    }
  }
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
  const horaCorta = (hora: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(`2000-01-01T${hora}:00Z`));
  const dato = (e: EventoVista, campo: "fecha" | "hora" | "precio", valor: string | null) =>
    valor ? (
      <>
        {campo === "fecha" ? diaCorto(valor) : campo === "hora" ? horaCorta(valor) : valor}{" "}
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
  const pestanas = (
    <div className="eg-pestanas" role="tablist" aria-label={g("ev_tab_bandeja")}>
      {(["bandeja", "posts"] as const).map((p) => (
        <button key={p} role="tab" aria-selected={pestana === p} className={pestana === p ? "eg-pestana-activa" : ""} onClick={() => setPestana(p)}>
          {g(`ev_tab_${p}`)}
        </button>
      ))}
    </div>
  );
  if (pestana === "posts")
    return (
      <div className="eg-eventos">
        {pestanas}
        <ListaPosts g={g} fecha={fecha} />
      </div>
    );
  if (!datos) return <p role="status">{error || g("cargando")}</p>;
  const visibles = datos.eventos
    .filter((e) => !cuidado || e.confianza.puntos < 50)
    .sort((a, b) => (orden === "confianza_baja" ? a.confianza.puntos - b.confianza.puntos : orden === "confianza_alta" ? b.confianza.puntos - a.confianza.puntos : 0));
  return (
    <div className="eg-eventos">
      {pestanas}
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
      <CuentasSeguir key={JSON.stringify(datos.cuentas)} g={g} cuentas={datos.cuentas} lectura={datos.lectura} alGuardar={cargar} />
      <ConfianzaDominios key={JSON.stringify(datos.confianza)} g={g} filas={datos.confianza} alGuardar={cargar} />
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
        <label className="eg-campo">
          {g("ev_conf_orden")}
          <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
            <option value="fecha">{g("ev_conf_ordenFecha")}</option>
            <option value="confianza_baja">{g("ev_conf_ordenBaja")}</option>
            <option value="confianza_alta">{g("ev_conf_ordenAlta")}</option>
          </select>
        </label>
        <label className="eg-check">
          <input type="checkbox" checked={cuidado} onChange={(e) => setCuidado(e.target.checked)} />
          {g("ev_conf_cuidado")} ({datos.eventos.filter((e) => e.confianza.puntos < 50).length})
        </label>
        <button className="ep-boton ep-texto" disabled={!filtro.estado && !filtro.desde && !filtro.hasta && !cuidado} onClick={() => (setFiltro({ estado: "", desde: "", hasta: "" }), setCuidado(false))}>
          {g("ev_limpiar")}
        </button>
        <PegarEnlace
          g={g}
          categorias={datos.categorias}
          departamentos={datos.departamentos}
          alTerminar={async (m) => {
            setAviso(m);
            await cargar();
          }}
        />
        <input ref={archivo} type="file" accept="application/json,.json" className="eg-oculto" tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />
        <button className="ep-boton" disabled={ocupado} onClick={() => archivo.current?.click()} title={g("ev_importarAyuda")}>
          <Upload size={15} />
          {g("ev_importar")}
        </button>
        {lote?.activo ? (
          <button className="ep-boton" onClick={() => (detener.current = true)}>
            <X size={15} />
            {g("ev_img_detener")}
          </button>
        ) : (
          <button className="ep-boton" disabled={ocupado || !datos.sinImagen.length} onClick={() => void completarImagenes(datos.sinImagen)} title={g("ev_img_ayuda")}>
            <Imagen size={15} />
            {g("ev_img_completar")} ({datos.sinImagen.length})
          </button>
        )}
        {datos.spotmi && (datos.conteo.propuesto ?? 0) > 0 && (
          <button className="ep-boton" disabled={ocupado} onClick={() => void accion({ accion: "consultar_spotmi" }, g("ev_estadoActualizado"))}>
            <RefreshCw size={15} />
            {g("ev_actualizarSpotmi")}
          </button>
        )}
      </div>
      {lote && (
        <div className="eg-bloque eg-lote" role="status" aria-live="polite">
          {lote.activo ? (
            <>
              <strong>
                {g("ev_img_buscando")} {Math.min(lote.hechos.length + 1, lote.total)} / {lote.total}
              </strong>
              <progress max={lote.total} value={lote.hechos.length} />
            </>
          ) : (
            <>
              <strong>
                {g("ev_img_resumen")}: {lote.hechos.filter((h) => h.estado === "afiche" || h.estado === "ticketera").length} {g("ev_img_oficiales")} ·{" "}
                {lote.hechos.filter((h) => h.estado === "red").length} {g("ev_img_red")} · {lote.hechos.filter((h) => h.estado === "prensa").length} {g("ev_img_prensa")} ·{" "}
                {lote.hechos.filter((h) => h.estado === "ia").length} {g("ev_img_ia")} · {lote.hechos.filter((h) => h.estado === "sin_imagen").length} {g("ev_img_sin")}
                {lote.hechos.length < lote.total ? ` · ${lote.total - lote.hechos.length} ${g("ev_img_sinRevisar")}` : ""}
              </strong>
              <p className="ep-nota">{g("ev_img_pendientes")}</p>
              {lote.hechos.some((h) => h.estado !== "ya_tenia") && (
                <details>
                  <summary>{g("ev_img_detalle")}</summary>
                  <ul className="eg-lista-importacion">
                    {lote.hechos
                      .filter((h) => h.estado !== "ya_tenia")
                      .map((h) => (
                        <li key={h.id}>
                          {h.titulo} → {g(`ev_img_estado_${h.estado}`)}
                          {h.motivo ? `: ${h.motivo}` : ""}
                          {h.boletos ? ` · ${g("ev_boletos")}: ${host(h.boletos)}` : ""}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
              <button className="ep-boton ep-texto" onClick={() => setLote(null)}>
                {g("ev_cerrar")}
              </button>
            </>
          )}
        </div>
      )}
      {importacion && (
        <div className="eg-bloque" role="status">
          <strong>
            {g("ev_importado")}: {importacion.nuevos} {g("ev_imp_nuevos")} · {importacion.duplicados.length} {g("ev_imp_duplicados")} · {importacion.descartados.length} {g("ev_imp_descartados")} · {importacion.conImagen} {g("ev_imp_conImagen")} · {importacion.conDatosPorConfirmar} {g("ev_imp_porConfirmar")}
            {importacion.invalidos.length ? ` · ${importacion.invalidos.length} ${g("ev_imp_invalidos")}` : ""}
          </strong>
          {(importacion.duplicados.length > 0 || importacion.descartados.length > 0 || importacion.invalidos.length > 0) && (
            <ul className="eg-lista-importacion">
              {importacion.duplicados.map((d) => (
                <li key={`d-${d.titulo}`}>
                  {d.titulo} → {d.de}
                </li>
              ))}
              {importacion.descartados.map((d) => (
                <li key={`x-${d.titulo}`}>
                  {d.titulo} → {d.motivo}
                </li>
              ))}
              {importacion.invalidos.map((d) => (
                <li key={`i-${d.posicion}`}>
                  #{d.posicion} → {d.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!datos.total ? (
        <div className="ep-vacio">
          <h3>{g("ev_vacioFiltro")}</h3>
        </div>
      ) : !visibles.length ? (
        <p className="ep-nota">{g("ev_vacioFiltro")}</p>
      ) : (
        <ul className="eg-lista-eventos">
          {visibles.map((e) => (
            <li key={e.id} className={`eg-evento eg-evento-${e.estadoVisible}`}>
              <div className="eg-evento-cabecera">
                <span className="ep-pill">{g(`ev_estado_${e.estadoVisible}`)}</span>
                <span className="eg-evento-categoria">{g(`ev_cat_${e.categoria}`)}</span>
                {e.origen !== "cazador" && e.origen !== "desconocido" && <span className="eg-evento-categoria">· {g(`ev_origen_${e.origen}`)}</span>}
                {e.cambios.length > 0 && <span className="ep-pill eg-pill-actualizado">{g("ev_actualizado")}</span>}
              </div>
              <h3>{e.titulo}</h3>
              {e.cambios.length > 0 && (
                <ul className="eg-cambios" aria-label={g("ev_actualizado")}>
                  {e.cambios.slice(-3).map((c) => (
                    <li key={`${c.campo}-${c.fecha}`}>
                      {g(`ev_campo_${c.campo}`)}: <del>{c.antes ?? g("ev_porConfirmar")}</del> → <ins>{c.despues ?? g("ev_porConfirmar")}</ins>{" "}
                      <small className="ep-nota">
                        · {host(c.url)} · {fecha(c.fecha)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="eg-evento-datos">
                <div>
                  <dt>{g("ev_fecha")}</dt>
                  <dd>
                    {dato(e, "fecha", e.fecha)}
                    {e.fechaFin && (
                      <>
                        {" "}
                        {g("ev_al")} {diaCorto(e.fechaFin)}
                      </>
                    )}
                  </dd>
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
              </dl>
              <details className="eg-fuentes-evento">
                <summary>
                  {g("ev_fuentes_titulo")} ({e.fuentes.length})
                </summary>
                <ul>
                  {e.fuentes.map((f) => (
                    <li key={f.id}>
                      <a href={f.url} target="_blank" rel="noreferrer noopener">
                        {f.cuenta || f.dominio} <ExternalLink size={12} aria-hidden="true" />
                      </a>{" "}
                      · {g(`ev_tipo_${f.tipo}`)} ({f.puntos})
                      {f.campos.length > 0 && (
                        <small className="ep-nota">
                          {" "}
                          · {g("ev_fuentes_confirmo")}: {f.campos.map((c) => g(`ev_campo_${c}`)).join(", ")}
                        </small>
                      )}
                      <small className="ep-nota">
                        {" "}
                        · {g("ev_fuentes_leido")} {fecha(f.publicado ?? f.leido)}
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="eg-evento-imagen">
                {e.imagenMedioId ? (
                  <>
                    <img src={`/api/granjas/medios/${e.imagenMedioId}`} alt={`${g("ev_imagen")}: ${e.titulo}`} loading="lazy" />
                    <div>
                      <span className={`ep-pill ${e.imagenConfirmada ? "" : "eg-pill-pendiente"}`}>{g(e.imagenConfirmada ? "ev_imagenEstadoConfirmada" : "ev_imagenEstadoPendiente")}</span>
                      <small className="ep-nota">{e.imagenPermiso}</small>
                      <small className="ep-nota">{g(e.imagenConfirmada ? "ev_imagenConfirmadaAyuda" : "ev_imagenPendienteAyuda")}</small>
                    </div>
                  </>
                ) : (
                  <>
                    <CuadroFecha fecha={e.fecha} locale={locale} />
                    <small className="ep-nota">{g("ev_sinImagen")}</small>
                  </>
                )}
              </div>
              <AnilloConfianza g={g} confianza={e.confianza} />
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
                {e.imagenMedioId && !e.imagenConfirmada && (
                  <button className="ep-boton" disabled={ocupado} onClick={() => void accion({ accion: "confirmar_imagen", id: e.id, revision: e.revision }, g("ev_imagenConfirmadaOk"))}>
                    <Check size={15} />
                    {g("ev_usarImagenFuente")}
                  </button>
                )}
                {!e.imagenMedioId && (
                  <button className="ep-boton" disabled={ocupado} onClick={() => void accion({ accion: "buscar_imagen", id: e.id }, g("ev_imagenEncontrada"))}>
                    <Search size={15} />
                    {g("ev_buscarImagen")}
                  </button>
                )}
                <button className="ep-boton" disabled={ocupado} onClick={() => setImagen({ evento: e, url: e.imagenUrl ?? "", permiso: e.imagenConfirmada ? e.imagenPermiso : "" })}>
                  <Imagen size={15} />
                  {g("ev_cambiarImagen")}
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
                    fechaFin: f.fechaFin || null,
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
                ["fechaFin", "ev_fechaFin", "date", 10],
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
                {g("ev_cancelar")}
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
                {g("ev_cancelar")}
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
                {g("ev_cancelar")}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/** Círculo de confianza (verde ≥ 80, amarillo 50–79, rojo < 50); el desglose aparece al pasar el cursor o con el teclado. */
function AnilloConfianza({ g, confianza }: { g: (clave: string) => string; confianza: Evento["confianza"] }) {
  const p = confianza.puntos;
  const nivel = p >= 80 ? "alta" : p >= 50 ? "media" : "baja";
  const radio = 16;
  const largo = 2 * Math.PI * radio;
  const desglose = confianza.desglose.map((l) => `${l.concepto}: ${l.puntos > 0 ? "+" : ""}${l.puntos}`).join("\n");
  return (
    <div className={`eg-confianza eg-confianza-${nivel}`}>
      <button type="button" className="eg-confianza-anillo" aria-label={`${g("ev_conf_nombre")}: ${p} %. ${desglose.replace(/\n/g, ". ")}`}>
        <svg viewBox="0 0 40 40" width="44" height="44" aria-hidden="true">
          <circle cx="20" cy="20" r={radio} className="eg-confianza-fondo" />
          <circle cx="20" cy="20" r={radio} className="eg-confianza-valor" strokeDasharray={`${(p / 100) * largo} ${largo}`} transform="rotate(-90 20 20)" />
        </svg>
        <span>{p}%</span>
      </button>
      <span className="eg-confianza-texto">
        {g("ev_conf_nombre")} · {g(`ev_conf_nivel_${nivel}`)}
      </span>
      <div className="eg-confianza-desglose" role="tooltip">
        <strong>{g("ev_conf_desglose")}</strong>
        <ul>
          {confianza.desglose.map((l, i) => (
            <li key={i}>
              <span>{l.concepto}</span>
              <b>
                {l.puntos > 0 ? "+" : ""}
                {l.puntos}
              </b>
            </li>
          ))}
        </ul>
        <small>{g("ev_conf_limite")}</small>
      </div>
    </div>
  );
}

/** Sin imagen: el mismo cuadro azul marino de Spotmi con el día grande y el mes. */
function CuadroFecha({ fecha, locale }: { fecha: string | null; locale: string }) {
  const d = fecha ? new Date(`${fecha}T12:00:00Z`) : null;
  return (
    <div className="eg-cuadro-fecha" aria-hidden="true">
      <strong>{d ? d.getUTCDate() : "?"}</strong>
      <span>{d ? new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", { month: "short", timeZone: "UTC" }).format(d).replace(".", "") : "—"}</span>
    </div>
  );
}

/** Calendario: eventos aprobados o enviados a Spotmi con fecha confirmada, por día. */
export function AgendaEventos({ g, locale }: { g: (clave: string) => string; locale: string }) {
  const [eventos, setEventos] = useState<EventoVista[] | null>(null);
  useEffect(() => {
    let vivo = true;
    pedir<Respuesta>(`/api/granjas/eventos?desde=${hoyLocal()}`)
      .then((r) => vivo && setEventos(r.eventos.filter((e) => e.fecha && e.estado === "aprobado")))
      .catch(() => vivo && setEventos([]));
    return () => {
      vivo = false;
    };
  }, []);
  if (!eventos) return <p role="status">{g("cargando")}</p>;
  const dias = [...new Set(eventos.map((e) => e.fecha!))];
  return (
    <section className="eg-bloque">
      <h2 className="eg-subtitulo">{g("cal_eventos")}</h2>
      <p className="ep-nota">{g("cal_eventosAyuda")}</p>
      {!dias.length ? (
        <p className="ep-nota">{g("cal_sinEventos")}</p>
      ) : (
        <ol className="eg-agenda-eventos">
          {dias.map((dia) => (
            <li key={dia}>
              <time dateTime={dia}>
                {new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${dia}T12:00:00Z`))}
              </time>
              <ul>
                {eventos
                  .filter((e) => e.fecha === dia)
                  .map((e) => (
                    <li key={e.id}>
                      <strong>{e.titulo}</strong>
                      <span>
                        {[e.hora, e.lugar || e.municipio].filter(Boolean).join(" · ")} · {g(`ev_estado_${e.estadoVisible}`)}
                      </span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
