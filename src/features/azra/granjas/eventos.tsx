"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Image as Imagen,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { Evento, EstadoVisible } from "@/lib/granjas/eventos";
import { Modal } from "../ui";
import { pedir } from "./cliente";
import { ListaPosts } from "./posts";
import { ConfianzaDominios, CuentasSeguir, PegarEnlace, type FilaConfianza } from "./eventos-redes";
import type { CuentasSeguidas, EstadoLectura } from "@/lib/granjas/redes";

import { EventCatalog } from "./event-catalog";
import { ImagenOriginal } from "./imagen-original";
import { FilaEvento, IndicadorConfianza } from "./eventos-lista";

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
  imagenesIA: EstadoIA;
  imagenesAstra: EstadoIA;
};
type EstadoIA = {
  activa: boolean;
  motivo: string;
  aviso: string;
  hoy: number;
  limite: number;
  modelo: string;
};
type ResultadoImagen = {
  id: string;
  titulo: string;
  estado: "afiche" | "ticketera" | "red" | "prensa" | "ia" | "sin_imagen" | "ya_tenia";
  motivo: string;
  boletos?: string;
};
type Lote = { total: number; hechos: ResultadoImagen[]; activo: boolean };
const estados: EstadoVisible[] = [
  "nuevo",
  "aprobado",
  "descartado",
  "propuesto",
  "aceptado",
  "subido_ig",
];
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
const hoyLocal = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());

/** Bandeja de eventos: el propietario decide; Spotmi solo recibe propuestas pendientes de lo aprobado. */
export function SeccionEventos({
  g,
  fecha,
  locale,
}: {
  g: (clave: string) => string;
  fecha: (iso: string) => string;
  locale: string;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [filtro, setFiltro] = useState<{
    estado: EstadoVisible | "";
    desde: string;
    hasta: string;
  }>({ estado: "", desde: "", hasta: "" });
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<{ evento: EventoVista; form: Formulario } | null>(null);
  const [descartando, setDescartando] = useState<{ evento: EventoVista; motivo: string } | null>(
    null,
  );
  const [imagen, setImagen] = useState<{
    evento: EventoVista;
    url: string;
    permiso: string;
  } | null>(null);
  const [diaExportar, setDiaExportar] = useState(hoyLocal);
  const [pestana, setPestana] = useState<"bandeja" | "posts" | "catalogo">("bandeja");
  const archivo = useRef<HTMLInputElement>(null);
  type Importacion = {
    nuevos: number;
    duplicados: { titulo: string; de: string }[];
    descartados: { titulo: string; motivo: string }[];
    conImagen: number;
    conDatosPorConfirmar: number;
    invalidos: { posicion: number; motivo: string }[];
  };
  const [importacion, setImportacion] = useState<Importacion | null>(null);
  const [lote, setLote] = useState<Lote | null>(null);
  const [conIA, setConIA] = useState(false);
  // Panel lateral con la ficha completa y todas las acciones.
  const [abierto, setAbierto] = useState<string | null>(null);
  // Editor del prompt de la imagen de referencia IA.
  const [prompt, setPrompt] = useState<{
    evento: EventoVista;
    texto: string;
    avisos: string[];
    forzar: boolean;
  } | null>(null);
  const archivoIA = useRef<HTMLInputElement>(null);
  // «Buscar imagen original» / «Subir o pegar captura» (panel aparte).
  const [original, setOriginal] = useState<{
    evento: EventoVista;
    modo: "buscar" | "captura";
  } | null>(null);
  const [geminiReference, setGeminiReference] = useState<{
    event: EventoVista;
    text: string;
    copied: boolean;
  } | null>(null);
  async function prepareGeminiReference(event: EventoVista) {
    setOcupado(true);
    setError("");
    try {
      const result = await pedir<{ paraModelo: string }>("/api/granjas/eventos", {
        accion: "referencia_prompt",
        id: event.id,
      });
      const text =
        result.paraModelo.replace("vertical 4:5", "horizontal 3:2") +
        " This is an AI-generated conceptual reference, not documentation of the actual event. Do not recreate a specific venue or imply confirmed performers, attendance or attractions. Generate an inviting editorial image with a clear focal subject and restrained, natural lighting.";
      setGeminiReference({ event, text, copied: false });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  /** Copia el prompt armado (con «Avoid: …») para pegarlo en la app de Gemini. */
  async function copiarPrompt(e: EventoVista) {
    setError("");
    try {
      const r = await pedir<{ paraModelo: string }>("/api/granjas/eventos", {
        accion: "referencia_prompt",
        id: e.id,
      });
      await navigator.clipboard.writeText(r.paraModelo);
      setAviso(g("ev_ia_promptCopiado"));
    } catch (x) {
      setError((x as Error).message || g("ev_copiaFallo"));
    }
  }
  /** Sube la imagen hecha en la app de Gemini y la deja como referencia IA del evento. */
  async function subirReferencia(e: EventoVista, file: File) {
    setOcupado(true);
    setError("");
    try {
      const formulario = new FormData();
      formulario.set("archivo", file);
      formulario.set(
        "licencia",
        "Imagen de referencia generada con IA (app de Gemini, subida por ti)",
      );
      formulario.set("generado", "1");
      const r = await fetch("/api/granjas/medios", { method: "POST", body: formulario });
      const j = (await r.json().catch(() => ({}))) as { medio?: { id: string }; error?: string };
      if (!r.ok || !j.medio) throw new Error(j.error ?? g("ev_ia_subidaFallo"));
      await pedir("/api/granjas/eventos", {
        accion: "referencia_subida",
        id: e.id,
        medioId: j.medio.id,
      });
      setAviso(g("ev_ia_subida"));
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setOcupado(false);
      if (archivoIA.current) archivoIA.current.value = "";
      await cargar();
    }
  }
  async function abrirPrompt(e: EventoVista) {
    setError("");
    try {
      const r = await pedir<{ prompt: string }>("/api/granjas/eventos", {
        accion: "referencia_prompt",
        id: e.id,
      });
      setAbierto(null);
      setPrompt({ evento: e, texto: r.prompt, avisos: [], forzar: false });
    } catch (x) {
      setError((x as Error).message);
    }
  }
  // Filtro y orden por confianza (en el navegador: la lista ya viene filtrada por estado y fechas).
  const [cuidado, setCuidado] = useState(false);
  const [orden, setOrden] = useState<"fecha" | "confianza_baja" | "confianza_alta">("fecha");
  const [busqueda, setBusqueda] = useState("");
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
        r = (
          await pedir<{ resultado: ResultadoImagen }>("/api/granjas/eventos", {
            accion: "completar_imagen",
            id,
            ia: conIA,
          })
        ).resultado;
      } catch (e) {
        r = {
          id,
          titulo: datos?.eventos.find((x) => x.id === id)?.titulo ?? id,
          estado: "sin_imagen",
          motivo: (e as Error).message,
        };
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
      const lista = Array.isArray(eventos)
        ? eventos
        : (eventos as { eventos?: unknown[] })?.eventos;
      const r = await pedir<{ importacion: Importacion }>("/api/granjas/eventos", {
        accion: "importar",
        eventos: lista ?? [],
      });
      setImportacion(r.importacion);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
      if (archivo.current) archivo.current.value = "";
      await cargar();
    }
  }
  const consulta =
    pestana === "catalogo"
      ? ""
      : `estado=${filtro.estado}&desde=${filtro.desde}&hasta=${filtro.hasta}`;
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
    new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dia}T12:00:00Z`));
  const horaCorta = (hora: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`2000-01-01T${hora}:00Z`));
  const fechaLarga = (dia: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${dia}T12:00:00Z`));
  /** Organizador o dominio de la fuente (la cuenta si vino de una red). */
  const origenVisible = (e: EventoVista) => {
    const f = e.fuentes.find((x) => x.url === e.fuenteUrl) ?? e.fuentes[0];
    return f?.cuenta || host(e.fuenteUrl);
  };
  const etiquetaImagen = (e: EventoVista) =>
    e.imagenTipo === "ia"
      ? g("ev_etiqueta_ia")
      : e.imagenTipo === "prensa"
        ? g("ev_etiqueta_prensa")
        : e.imagenMedioId && !e.imagenConfirmada
          ? `${g("ev_etiqueta_pendiente")}${e.imagenBaja ? ` · ${g("ev_etiqueta_baja")}` : ""}`
          : "";
  const dato = (e: EventoVista, campo: "fecha" | "hora" | "precio", valor: string | null) =>
    valor ? (
      <>
        {campo === "fecha" ? diaCorto(valor) : campo === "hora" ? horaCorta(valor) : valor}{" "}
        <small className="eg-confirmado">
          <Check size={12} aria-hidden="true" />{" "}
          {g(
            e.confirmadoEn[campo] === "propietario"
              ? "ev_confirmadoPropietario"
              : "ev_confirmadoFuente",
          )}
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
      {(["bandeja", "posts", "catalogo"] as const).map((p) => (
        <button
          key={p}
          role="tab"
          aria-selected={pestana === p}
          className={pestana === p ? "eg-pestana-activa" : ""}
          onClick={() => {
            if (p !== pestana && (p === "catalogo" || pestana === "catalogo")) setDatos(null);
            setPestana(p);
          }}
        >
          {p === "catalogo"
            ? locale === "es"
              ? "Vista previa Spotmi"
              : "Spotmi preview"
            : g(`ev_tab_${p}`)}
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
  if (!datos)
    return (
      <div className="eg-eventos">
        {pestanas}
        <p role="status">{error || g("cargando")}</p>
      </div>
    );
  if (pestana === "catalogo")
    return (
      <div className="eg-eventos">
        {pestanas}
        <EventCatalog events={datos.eventos} locale={locale} g={g} />
      </div>
    );
  const enPanel = abierto ? (datos.eventos.find((x) => x.id === abierto) ?? null) : null;
  // Búsqueda local por nombre y lugar (sin acentos ni mayúsculas), sobre los eventos ya cargados.
  const normal = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const textoBuscado = normal(busqueda.trim());
  const visibles = datos.eventos
    .filter((e) => !cuidado || e.confianza.puntos < 50)
    .filter(
      (e) =>
        !textoBuscado ||
        normal([e.titulo, e.lugar, e.municipio, e.departamento].filter(Boolean).join(" ")).includes(
          textoBuscado,
        ),
    )
    .sort((a, b) =>
      orden === "confianza_baja"
        ? a.confianza.puntos - b.confianza.puntos
        : orden === "confianza_alta"
          ? b.confianza.puntos - a.confianza.puntos
          : 0,
    );
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
      {/* Barra de la bandeja: búsqueda, estado y orden a la vista; lo demás, plegado. */}
      <div className="ev-barra" role="group" aria-label={g("ev_filtros")}>
        <label className="eg-campo ev-buscar">
          {g("ev_buscar")}
          <input
            type="search"
            value={busqueda}
            placeholder={g("ev_buscarAyuda")}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <label className="eg-campo">
          {g("ev_estado")}
          <select
            value={filtro.estado}
            onChange={(e) => setFiltro({ ...filtro, estado: e.target.value as EstadoVisible | "" })}
          >
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
          {g("ev_conf_orden")}
          <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
            <option value="fecha">{g("ev_conf_ordenFecha")}</option>
            <option value="confianza_baja">{g("ev_conf_ordenBaja")}</option>
            <option value="confianza_alta">{g("ev_conf_ordenAlta")}</option>
          </select>
        </label>
        <details
          className="ev-plegable"
          open={Boolean(filtro.desde || filtro.hasta || cuidado) || undefined}
        >
          <summary>
            {g("ev_masFiltros")}
            {[filtro.desde, filtro.hasta, cuidado].filter(Boolean).length
              ? ` · ${[filtro.desde, filtro.hasta, cuidado].filter(Boolean).length}`
              : ""}
          </summary>
          <div className="ev-plegable-cuerpo">
            <label className="eg-campo">
              {g("ev_desde")}
              <input
                type="date"
                value={filtro.desde}
                onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })}
              />
            </label>
            <label className="eg-campo">
              {g("ev_hasta")}
              <input
                type="date"
                value={filtro.hasta}
                onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })}
              />
            </label>
            <label className="eg-check">
              <input
                type="checkbox"
                checked={cuidado}
                onChange={(e) => setCuidado(e.target.checked)}
              />
              {g("ev_conf_cuidado")} ({datos.eventos.filter((e) => e.confianza.puntos < 50).length})
            </label>
          </div>
        </details>
        <button
          className="ep-boton ep-texto"
          disabled={!filtro.estado && !filtro.desde && !filtro.hasta && !cuidado && !busqueda}
          onClick={() => (
            setFiltro({ estado: "", desde: "", hasta: "" }),
            setCuidado(false),
            setBusqueda("")
          )}
        >
          {g("ev_limpiar")}
        </button>
      </div>
      <div className="ev-barra" role="group" aria-label={g("ev_acciones")}>
        <details className="ev-plegable">
          <summary>{g("ev_importarMenu")}</summary>
          <div className="ev-plegable-cuerpo">
            <PegarEnlace
              g={g}
              categorias={datos.categorias}
              departamentos={datos.departamentos}
              alTerminar={async (m) => {
                setAviso(m);
                await cargar();
              }}
            />
            <input
              ref={archivo}
              type="file"
              accept="application/json,.json"
              className="eg-oculto"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])}
            />
            <button
              className="ep-boton"
              disabled={ocupado}
              onClick={() => archivo.current?.click()}
              title={g("ev_importarAyuda")}
            >
              <Upload size={15} />
              {g("ev_importar")}
            </button>
          </div>
        </details>
        {lote?.activo ? (
          <button className="ep-boton" onClick={() => (detener.current = true)}>
            <X size={15} />
            {g("ev_img_detener")}
          </button>
        ) : (
          <>
            <button
              className="ep-boton"
              disabled={ocupado || !datos.sinImagen.length}
              onClick={() => void completarImagenes(datos.sinImagen)}
              title={g("ev_img_ayuda")}
            >
              <Imagen size={15} />
              {g("ev_img_completar")} ({datos.sinImagen.length})
            </button>
            <label
              className="eg-check"
              title={datos.imagenesIA.activa ? g("ev_ia_loteAyuda") : datos.imagenesIA.motivo}
            >
              <input
                type="checkbox"
                checked={conIA && datos.imagenesIA.activa}
                disabled={!datos.imagenesIA.activa}
                onChange={(e) => setConIA(e.target.checked)}
              />
              {g("ev_ia_lote")} ({datos.imagenesIA.hoy}/{datos.imagenesIA.limite})
            </label>
            {/* El motivo de Gemini va junto a su acción, no como aviso permanente arriba. */}
            {(datos.imagenesIA.aviso || !datos.imagenesIA.activa) && (
              <p className="ev-ia-nota">
                {g("ev_ia_titulo")}: {datos.imagenesIA.aviso || datos.imagenesIA.motivo}
              </p>
            )}
          </>
        )}
        {datos.spotmi && (datos.conteo.propuesto ?? 0) > 0 && (
          <button
            className="ep-boton"
            disabled={ocupado}
            onClick={() => void accion({ accion: "consultar_spotmi" }, g("ev_estadoActualizado"))}
          >
            <RefreshCw size={15} />
            {g("ev_actualizarSpotmi")}
          </button>
        )}
        <span
          className={`ev-estado-spotmi ${datos.spotmi ? "ev-ok" : ""}`}
          title={g(datos.spotmi ? "ev_spotmiConectado" : "ev_spotmiNoConectado")}
        >
          <i aria-hidden="true" />
          {g(datos.spotmi ? "ev_spotmiCompacto_ok" : "ev_spotmiCompacto_no")}
        </span>
      </div>
      <p className="ev-resumen" role="status">
        {visibles.length} {g("ev_deTotal")} {datos.eventos.length}
      </p>
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
                {g("ev_img_resumen")}:{" "}
                {
                  lote.hechos.filter((h) => h.estado === "afiche" || h.estado === "ticketera")
                    .length
                }{" "}
                {g("ev_img_oficiales")} · {lote.hechos.filter((h) => h.estado === "red").length}{" "}
                {g("ev_img_red")} · {lote.hechos.filter((h) => h.estado === "prensa").length}{" "}
                {g("ev_img_prensa")} · {lote.hechos.filter((h) => h.estado === "ia").length}{" "}
                {g("ev_img_ia")} · {lote.hechos.filter((h) => h.estado === "sin_imagen").length}{" "}
                {g("ev_img_sin")}
                {lote.hechos.length < lote.total
                  ? ` · ${lote.total - lote.hechos.length} ${g("ev_img_sinRevisar")}`
                  : ""}
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
            {g("ev_importado")}: {importacion.nuevos} {g("ev_imp_nuevos")} ·{" "}
            {importacion.duplicados.length} {g("ev_imp_duplicados")} ·{" "}
            {importacion.descartados.length} {g("ev_imp_descartados")} · {importacion.conImagen}{" "}
            {g("ev_imp_conImagen")} · {importacion.conDatosPorConfirmar} {g("ev_imp_porConfirmar")}
            {importacion.invalidos.length
              ? ` · ${importacion.invalidos.length} ${g("ev_imp_invalidos")}`
              : ""}
          </strong>
          {(importacion.duplicados.length > 0 ||
            importacion.descartados.length > 0 ||
            importacion.invalidos.length > 0) && (
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
        <ul className="ev-lista" aria-label={g("ev_tab_bandeja")}>
          {visibles.map((e) => {
            const sinImagen = !e.imagenMedioId || e.imagenTipo === "ia";
            const porConfirmar = (t: string) => <span className="ev-por-confirmar">{t}</span>;
            return (
              <FilaEvento
                key={e.id}
                g={g}
                evento={e}
                categoria={g(`ev_cat_${e.categoria}`)}
                fecha={
                  e.fecha ? (
                    <>
                      {fechaLarga(e.fecha)}
                      {e.fechaFin ? ` ${g("ev_al")} ${fechaLarga(e.fechaFin)}` : ""}
                      {e.hora ? ` · ${horaCorta(e.hora)}` : ""}
                    </>
                  ) : (
                    porConfirmar(g("ev_fechaPorConfirmar"))
                  )
                }
                lugar={
                  [e.lugar, e.municipio].filter(Boolean).join(" · ") ||
                  e.departamento ||
                  porConfirmar(g("ev_lugarPorConfirmar"))
                }
                origen={origenVisible(e)}
                notaImagen={etiquetaImagen(e) || null}
                precio={
                  !e.precioDesde
                    ? g("ev_precioPorConfirmar")
                    : e.precioDesde.tipo === "gratis"
                      ? g("ev_gratis")
                      : `${g("ev_desde")} $${Number.isInteger(e.precioDesde.valor) ? e.precioDesde.valor : e.precioDesde.valor.toFixed(2)}`
                }
                onRevisar={() => setAbierto(e.id)}
                acciones={[
                  ...(e.estado === "nuevo"
                    ? [
                        {
                          clave: "aprobar",
                          etiqueta: g("ev_aprobar"),
                          deshabilitada: ocupado,
                          onClick: () =>
                            void accion(
                              { accion: "aprobar", id: e.id, revision: e.revision },
                              g("ev_estado_aprobado"),
                            ),
                        },
                      ]
                    : []),
                  ...(sinImagen
                    ? [
                        {
                          clave: "buscar",
                          etiqueta: g("ev_menu_buscarImagen"),
                          deshabilitada: ocupado,
                          onClick: () => setOriginal({ evento: e, modo: "buscar" }),
                        },
                        {
                          clave: "captura",
                          etiqueta: g("ev_menu_subirCaptura"),
                          deshabilitada: ocupado,
                          onClick: () => setOriginal({ evento: e, modo: "captura" }),
                        },
                        {
                          clave: "gemini",
                          etiqueta: g("ev_menu_referenciaGemini"),
                          deshabilitada: ocupado,
                          onClick: () => void prepareGeminiReference(e),
                        },
                      ]
                    : []),
                  ...(e.estado !== "descartado" && !e.spotmiPropuestaId
                    ? [
                        {
                          clave: "descartar",
                          etiqueta: g("ev_descartar"),
                          peligro: true,
                          deshabilitada: ocupado,
                          onClick: () => setDescartando({ evento: e, motivo: "" }),
                        },
                      ]
                    : []),
                ]}
              />
            );
          })}
        </ul>
      )}
      {/* Configuración de fuentes (cuentas a seguir y confianza por dominio), plegada. */}
      <details className="ev-plegable ev-configuracion">
        <summary>{g("ev_configFuentes")}</summary>
        <div className="ev-plegable-cuerpo ev-configuracion-cuerpo">
          <CuentasSeguir
            key={JSON.stringify(datos.cuentas)}
            g={g}
            cuentas={datos.cuentas}
            lectura={datos.lectura}
            alGuardar={cargar}
          />
          <ConfianzaDominios
            key={JSON.stringify(datos.confianza)}
            g={g}
            filas={datos.confianza}
            alGuardar={cargar}
          />
        </div>
      </details>
      <section className="eg-bloque">
        <h2 className="eg-subtitulo">{g("ev_exportar")}</h2>
        <p className="ep-nota">{g("ev_exportarAyuda")}</p>
        <div className="eg-formulario-linea">
          <label className="eg-campo">
            {g("ev_diaHallazgo")}
            <input
              type="date"
              value={diaExportar}
              onChange={(e) => setDiaExportar(e.target.value)}
            />
          </label>
          <a
            className="ep-boton"
            href={`/api/granjas/eventos/exportar?dia=${diaExportar}&formato=csv`}
          >
            <Download size={15} />
            {g("ev_csv")}
          </a>
          <a
            className="ep-boton"
            href={`/api/granjas/eventos/exportar?dia=${diaExportar}&formato=json`}
          >
            <Download size={15} />
            {g("ev_json")}
          </a>
        </div>
      </section>

      {original && (
        <ImagenOriginal
          key={`${original.evento.id}-${original.modo}`}
          evento={original.evento}
          modoInicial={original.modo}
          locale={locale}
          onCerrar={() => setOriginal(null)}
          onGuardado={async (m) => {
            setOriginal(null);
            setAviso(m);
            await cargar();
          }}
        />
      )}
      <Modal
        open={Boolean(geminiReference)}
        onClose={() => !ocupado && setGeminiReference(null)}
        label={locale === "es" ? "Referencia con Gemini" : "Gemini reference"}
        className="ep-modal"
        dismissOnBackdrop
      >
        {geminiReference && (
          <div className="eg-guia">
            <h2>{locale === "es" ? "Referencia con Gemini" : "Gemini reference"}</h2>
            <strong>{geminiReference.event.titulo}</strong>
            <p>
              {locale === "es"
                ? "Si ya revisaste las fuentes y no encontraste una imagen, copiá este prompt en Gemini, generá la referencia y subila aquí. No encontrar una imagen en Ezra no significa que no exista en otra fuente."
                : "If you checked the sources and found no image, paste this prompt into Gemini, generate a reference and upload it here. A missing image in Ezra does not prove none exists elsewhere."}
            </p>
            <label className="eg-campo">
              Prompt
              <textarea rows={8} readOnly value={geminiReference.text} />
            </label>
            <div className="ep-acciones">
              <button
                className="ep-boton ep-primario"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(geminiReference.text);
                    setGeminiReference({ ...geminiReference, copied: true });
                  } catch {
                    setError(g("ev_copiaFallo"));
                  }
                }}
              >
                <Copy size={15} />
                {geminiReference.copied
                  ? locale === "es"
                    ? "Copiado"
                    : "Copied"
                  : locale === "es"
                    ? "1. Copiar prompt"
                    : "1. Copy prompt"}
              </button>
              <a
                className="ep-boton"
                href="https://gemini.google.com/app"
                target="_blank"
                rel="noopener noreferrer"
              >
                {locale === "es" ? "2. Abrir Gemini ↗" : "2. Open Gemini ↗"}
              </a>
            </div>
            <label className="eg-campo">
              {locale === "es" ? "3. Subir la imagen generada" : "3. Upload generated image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={ocupado}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) await subirReferencia(geminiReference.event, file);
                  event.target.value = "";
                }}
              />
            </label>
            {ocupado && <p role="status">{g("cargando")}</p>}
            {error && <p role="alert">{error}</p>}
            {aviso && <p role="status">{aviso}</p>}
            <p className="ep-nota">
              {locale === "es"
                ? "Se guarda como IA · referencia en la bandeja, nunca como foto oficial. No se envía a Spotmi ni a Instagram. Este flujo no llama a la API de Gemini."
                : "Saved as AI reference in the inbox, never as an official photo. Not sent to Spotmi or Instagram. This workflow does not call the Gemini API."}
            </p>
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(enPanel)}
        onClose={() => setAbierto(null)}
        label={enPanel?.titulo ?? g("ev_verMas")}
        className="ep-modal eg-panel-lateral"
        dismissOnBackdrop
      >
        {enPanel &&
          ((e) => (
            <div className={`eg-panel-evento eg-evento-${e.estadoVisible}`}>
              <div className="eg-evento-cabecera">
                <span className="ep-pill">{g(`ev_estado_${e.estadoVisible}`)}</span>
                <span className="eg-evento-categoria">{g(`ev_cat_${e.categoria}`)}</span>
                {e.origen !== "cazador" && e.origen !== "desconocido" && (
                  <span className="eg-evento-categoria">· {g(`ev_origen_${e.origen}`)}</span>
                )}
                {e.cambios.length > 0 && (
                  <span className="ep-pill eg-pill-actualizado">{g("ev_actualizado")}</span>
                )}
              </div>
              <h2 className="eg-panel-titulo">{e.titulo}</h2>
              {e.cambios.length > 0 && (
                <ul className="eg-cambios" aria-label={g("ev_actualizado")}>
                  {e.cambios.slice(-3).map((c) => (
                    <li key={`${c.campo}-${c.fecha}`}>
                      {g(`ev_campo_${c.campo}`)}: <del>{c.antes ?? g("ev_porConfirmar")}</del> →{" "}
                      <ins>{c.despues ?? g("ev_porConfirmar")}</ins>{" "}
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
                  <dd>
                    {[e.lugar, e.municipio, e.departamento].filter(Boolean).join(", ") || (
                      <span className="eg-por-confirmar">{g("ev_porConfirmar")}</span>
                    )}
                  </dd>
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
                          · {g("ev_fuentes_confirmo")}:{" "}
                          {f.campos.map((c) => g(`ev_campo_${c}`)).join(", ")}
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
                    <img
                      src={`/api/granjas/medios/${e.imagenMedioId}`}
                      alt={`${g("ev_imagen")}: ${e.titulo}`}
                      loading="lazy"
                    />
                    <div>
                      <span className={`ep-pill ${e.imagenConfirmada ? "" : "eg-pill-pendiente"}`}>
                        {e.imagenTipo === "ia"
                          ? g("ev_imagenEstadoIA")
                          : g(
                              e.imagenConfirmada
                                ? "ev_imagenEstadoConfirmada"
                                : "ev_imagenEstadoPendiente",
                            )}
                      </span>
                      <small className="ep-nota">
                        {g(`ev_imagenTipo_${e.imagenTipo ?? "afiche"}`)}
                        {e.imagenBaja ? ` · ${g("ev_bajaResolucion")}` : ""}
                      </small>
                      <small className="ep-nota">{e.imagenPermiso}</small>
                      {e.imagenPublicacion && (
                        <small className="ep-nota">
                          {g("ev_or_publicacion")}:{" "}
                          <a
                            href={e.imagenPublicacion.url}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {e.imagenPublicacion.plataforma} · {e.imagenPublicacion.cuenta}
                          </a>{" "}
                          ·{" "}
                          {g(
                            e.imagenPublicacion.verificada
                              ? "ev_or_verificada"
                              : "ev_or_sinVerificar",
                          )}
                          {e.imagenPublicacion.recuperada
                            ? ` · ${g("ev_or_recuperada")} ${fecha(e.imagenPublicacion.recuperada)}`
                            : ""}
                          {e.imagenOrigen ? ` · ${g(`ev_or_origen_${e.imagenOrigen}`)}` : ""}
                        </small>
                      )}
                      <small className="ep-nota">
                        {g(
                          e.imagenTipo === "ia"
                            ? "ev_imagenIAAyuda"
                            : e.imagenConfirmada
                              ? "ev_imagenConfirmadaAyuda"
                              : "ev_imagenPendienteAyuda",
                        )}
                      </small>
                    </div>
                  </>
                ) : (
                  <>
                    <CuadroFecha fecha={e.fecha} locale={locale} />
                    <small className="ep-nota">{g("ev_sinImagen")}</small>
                  </>
                )}
              </div>
              {e.imagenTipo === "ia" && e.imagenes.at(-1)?.ia && (
                <details className="eg-fuentes-evento">
                  <summary>{g("ev_ia_promptUsado")}</summary>
                  <p className="eg-prompt-ia">{e.imagenes.at(-1)!.ia!.prompt}</p>
                  <small className="ep-nota">
                    {g("ev_ia_negativo")}: {e.imagenes.at(-1)!.ia!.negativo} ·{" "}
                    {e.imagenes.at(-1)!.ia!.modelo} · {e.imagenes.at(-1)!.ia!.version}
                  </small>
                </details>
              )}
              {e.imagenes.length > 1 && (
                <details className="eg-fuentes-evento">
                  <summary>
                    {g("ev_historialImagenes")} ({e.imagenes.length})
                  </summary>
                  <ul>
                    {e.imagenes.map((i) => (
                      <li key={i.id}>
                        {g(`ev_imagenTipo_${i.tipo}`)} · {fecha(i.creado)}
                        {i.medioId === e.imagenMedioId ? ` · ${g("ev_imagenActual")}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="ev-confianza-detalle">
                <IndicadorConfianza g={g} confianza={e.confianza} />
                <details>
                  <summary>{g("ev_conf_desglose")}</summary>
                  <ul>
                    {e.confianza.desglose.map((l, i) => (
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
                </details>
              </div>
              {e.descripcion && <p className="eg-evento-descripcion">{e.descripcion}</p>}
              {e.spotmiPropuestaId && (
                <p className="ep-nota">
                  {g("ev_propuesta")}: <code>{e.spotmiPropuestaId}</code> ·{" "}
                  {e.spotmiEstado ? g(`ev_spotmi_${e.spotmiEstado}`) : ""}
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
                  <button
                    className="ep-boton ep-primario"
                    disabled={ocupado}
                    onClick={() =>
                      void accion(
                        { accion: "aprobar", id: e.id, revision: e.revision },
                        g("ev_estado_aprobado"),
                      )
                    }
                  >
                    <Check size={15} />
                    {g("ev_aprobar")}
                  </button>
                )}
                {e.estado === "aprobado" && !e.spotmiPropuestaId && (
                  <button
                    className="ep-boton ep-primario"
                    disabled={ocupado || !datos.spotmi}
                    title={datos.spotmi ? undefined : g("ev_spotmiNoConectado")}
                    onClick={() =>
                      void accion({ accion: "enviar_spotmi", id: e.id }, g("ev_enviado"))
                    }
                  >
                    <Send size={15} />
                    {g("ev_enviarSpotmi")}
                  </button>
                )}
                {e.spotmiPropuestaId && (
                  <button
                    className="ep-boton"
                    disabled={ocupado || !datos.spotmi}
                    onClick={() =>
                      void accion(
                        { accion: "consultar_spotmi", id: e.id },
                        g("ev_estadoActualizado"),
                      )
                    }
                  >
                    <RefreshCw size={15} />
                    {g("ev_consultarSpotmi")}
                  </button>
                )}
                <button
                  className="ep-boton"
                  disabled={ocupado}
                  onClick={() => (
                    setAbierto(null),
                    setEditando({ evento: e, form: aFormulario(e) })
                  )}
                >
                  <Pencil size={15} />
                  {g("ev_editar")}
                </button>
                {e.imagenMedioId && !e.imagenConfirmada && e.imagenTipo !== "ia" && (
                  <button
                    className="ep-boton"
                    disabled={ocupado}
                    onClick={() =>
                      void accion(
                        { accion: "confirmar_imagen", id: e.id, revision: e.revision },
                        g("ev_imagenConfirmadaOk"),
                      )
                    }
                  >
                    <Check size={15} />
                    {g("ev_usarImagenFuente")}
                  </button>
                )}
                {e.imagenTipo !== "afiche" && !e.imagenConfirmada && (
                  <button
                    className="ep-boton"
                    disabled={ocupado}
                    onClick={() =>
                      void accion({ accion: "buscar_imagen", id: e.id }, g("ev_imagenEncontrada"))
                    }
                  >
                    <Search size={15} />
                    {g("ev_buscarImagen")}
                  </button>
                )}
                {!e.imagenConfirmada && (
                  <button
                    className="ep-boton"
                    disabled={ocupado}
                    onClick={() => (setAbierto(null), setOriginal({ evento: e, modo: "buscar" }))}
                  >
                    <Search size={15} />
                    {locale === "es" ? "Buscar imagen original" : "Find original image"}
                  </button>
                )}
                <button
                  className="ep-boton"
                  disabled={ocupado}
                  onClick={() => (
                    setAbierto(null),
                    setImagen({
                      evento: e,
                      url: e.imagenUrl ?? "",
                      permiso: e.imagenConfirmada ? e.imagenPermiso : "",
                    })
                  )}
                >
                  <Imagen size={15} />
                  {g("ev_cambiarImagen")}
                </button>
                {(e.imagenTipo === null || e.imagenTipo === "ia") && (
                  <>
                    <button
                      className="ep-boton"
                      disabled={ocupado || !datos.imagenesIA.activa}
                      title={datos.imagenesIA.activa ? g("ev_ia_ayuda") : datos.imagenesIA.motivo}
                      onClick={() =>
                        void accion(
                          {
                            accion: "generar_referencia",
                            id: e.id,
                            regenerar: e.imagenTipo === "ia",
                          },
                          g("ev_ia_generada"),
                        )
                      }
                    >
                      <Sparkles size={15} />
                      {g(e.imagenTipo === "ia" ? "ev_ia_regenerar" : "ev_ia_generar")}
                    </button>
                    <button
                      className="ep-boton"
                      disabled={ocupado || !datos.imagenesAstra.activa}
                      title={
                        datos.imagenesAstra.activa
                          ? g("ev_ia_astraAyuda")
                          : datos.imagenesAstra.motivo
                      }
                      onClick={() =>
                        void accion(
                          {
                            accion: "generar_referencia",
                            id: e.id,
                            regenerar: e.imagenTipo === "ia",
                            proveedor: "astra",
                          },
                          g("ev_ia_generada"),
                        )
                      }
                    >
                      <Sparkles size={15} />
                      {g("ev_ia_astra")}
                    </button>
                    <button
                      className="ep-boton"
                      disabled={ocupado || !datos.imagenesIA.activa}
                      title={datos.imagenesIA.activa ? undefined : datos.imagenesIA.motivo}
                      onClick={() => void abrirPrompt(e)}
                    >
                      <Pencil size={15} />
                      {g("ev_ia_editarPrompt")}
                    </button>
                    <button
                      className="ep-boton"
                      disabled={ocupado}
                      title={g("ev_ia_copiarAyuda")}
                      onClick={() => void copiarPrompt(e)}
                    >
                      <Copy size={15} />
                      {g("ev_ia_copiarPrompt")}
                    </button>
                    <input
                      ref={archivoIA}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="eg-oculto"
                      tabIndex={-1}
                      aria-hidden="true"
                      onChange={(x) =>
                        x.target.files?.[0] && void subirReferencia(e, x.target.files[0])
                      }
                    />
                    <button
                      className="ep-boton"
                      disabled={ocupado}
                      title={g("ev_ia_subirAyuda")}
                      onClick={() => archivoIA.current?.click()}
                    >
                      <Upload size={15} />
                      {g("ev_ia_subir")}
                    </button>
                  </>
                )}
                <button className="ep-boton" onClick={() => void copiar(e)}>
                  <Copy size={15} />
                  {g("ev_copiarFicha")}
                </button>
                {e.estado !== "descartado" && !e.spotmiPropuestaId && (
                  <button
                    className="ep-boton eg-peligro"
                    disabled={ocupado}
                    onClick={() => (setAbierto(null), setDescartando({ evento: e, motivo: "" }))}
                  >
                    <X size={15} />
                    {g("ev_descartar")}
                  </button>
                )}
              </div>
            </div>
          ))(enPanel)}
      </Modal>
      <Modal
        open={Boolean(prompt)}
        onClose={() => setPrompt(null)}
        label={g("ev_ia_editarPrompt")}
        className="ep-modal"
        dismissOnBackdrop
      >
        {prompt && (
          <form
            className="eg-guia"
            onSubmit={async (ev) => {
              ev.preventDefault();
              setOcupado(true);
              setError("");
              try {
                const r = await pedir<{ avisos: string[] }>("/api/granjas/eventos", {
                  accion: "referencia_prompt",
                  id: prompt.evento.id,
                  prompt: prompt.texto,
                });
                if (r.avisos.length && !prompt.forzar) {
                  setPrompt({ ...prompt, avisos: r.avisos });
                  return;
                }
                await pedir("/api/granjas/eventos", {
                  accion: "generar_referencia",
                  id: prompt.evento.id,
                  prompt: prompt.texto,
                  forzar: prompt.forzar,
                  regenerar: prompt.evento.imagenTipo === "ia",
                });
                setAviso(g("ev_ia_generada"));
                setPrompt(null);
              } catch (x) {
                setPrompt({ ...prompt, avisos: [(x as Error).message] });
              } finally {
                setOcupado(false);
                await cargar();
              }
            }}
          >
            <h2>
              {g("ev_ia_editarPrompt")} · {prompt.evento.titulo}
            </h2>
            <p className="ep-nota">{g("ev_ia_promptAyuda")}</p>
            <label className="eg-campo">
              {g("ev_ia_prompt")}
              <textarea
                rows={8}
                maxLength={2000}
                value={prompt.texto}
                onChange={(x) =>
                  setPrompt({ ...prompt, texto: x.target.value, avisos: [], forzar: false })
                }
              />
            </label>
            {prompt.avisos.length > 0 && (
              <div className="ep-alerta" role="alert">
                <ul>
                  {prompt.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <label className="eg-check">
                  <input
                    type="checkbox"
                    checked={prompt.forzar}
                    onChange={(x) => setPrompt({ ...prompt, forzar: x.target.checked })}
                  />
                  {g("ev_ia_forzar")}
                </label>
              </div>
            )}
            <div className="ep-acciones">
              <button
                className="ep-boton ep-primario"
                disabled={ocupado || prompt.texto.trim().length < 20}
              >
                <Sparkles size={15} />
                {g("ev_ia_generar")}
              </button>
              <button type="button" className="ep-boton" onClick={() => setPrompt(null)}>
                {g("ev_cancelar")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={Boolean(editando)}
        onClose={() => setEditando(null)}
        label={g("ev_editar")}
        className="ep-modal"
        dismissOnBackdrop
      >
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
                  placeholder={
                    ["fecha", "hora", "precio"].includes(campo) ? g("ev_porConfirmar") : undefined
                  }
                  onChange={(x) =>
                    setEditando({
                      ...editando,
                      form: { ...editando.form, [campo]: x.target.value },
                    })
                  }
                />
              </label>
            ))}
            <div className="eg-dos">
              <label className="eg-campo">
                {g("ev_departamento")}
                <select
                  value={editando.form.departamento}
                  onChange={(x) =>
                    setEditando({
                      ...editando,
                      form: { ...editando.form, departamento: x.target.value },
                    })
                  }
                >
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
                <select
                  value={editando.form.categoria}
                  onChange={(x) =>
                    setEditando({
                      ...editando,
                      form: { ...editando.form, categoria: x.target.value },
                    })
                  }
                >
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
              <textarea
                rows={4}
                maxLength={300}
                value={editando.form.descripcion}
                onChange={(x) =>
                  setEditando({
                    ...editando,
                    form: { ...editando.form, descripcion: x.target.value },
                  })
                }
              />
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
      <Modal
        open={Boolean(descartando)}
        onClose={() => setDescartando(null)}
        label={g("ev_descartar")}
        className="ep-modal"
        dismissOnBackdrop
      >
        {descartando && (
          <form
            className="eg-guia"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const ok = await accion(
                {
                  accion: "descartar",
                  id: descartando.evento.id,
                  revision: descartando.evento.revision,
                  motivo: descartando.motivo,
                },
                g("ev_estado_descartado"),
              );
              if (ok) setDescartando(null);
            }}
          >
            <h2>
              {g("ev_descartar")} · {descartando.evento.titulo}
            </h2>
            <label className="eg-campo">
              {g("ev_motivo")}
              <textarea
                rows={3}
                required
                minLength={3}
                maxLength={300}
                value={descartando.motivo}
                onChange={(x) => setDescartando({ ...descartando, motivo: x.target.value })}
              />
            </label>
            <p className="ep-nota">{g("ev_motivoAyuda")}</p>
            <div className="ep-acciones">
              <button
                className="ep-boton eg-peligro"
                disabled={ocupado || descartando.motivo.trim().length < 3}
              >
                {g("ev_descartar")}
              </button>
              <button type="button" className="ep-boton" onClick={() => setDescartando(null)}>
                {g("ev_cancelar")}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={Boolean(imagen)}
        onClose={() => setImagen(null)}
        label={g("ev_imagen")}
        className="ep-modal"
        dismissOnBackdrop
      >
        {imagen && (
          <form
            className="eg-guia"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const ok = await accion(
                {
                  accion: "imagen",
                  id: imagen.evento.id,
                  revision: imagen.evento.revision,
                  url: imagen.url,
                  permiso: imagen.permiso,
                },
                g("ev_imagenAutorizada"),
              );
              if (ok) setImagen(null);
            }}
          >
            <h2>{g("ev_autorizarImagen")}</h2>
            <label className="eg-campo">
              {g("ev_imagenUrl")}
              <input
                type="url"
                required
                maxLength={1000}
                value={imagen.url}
                onChange={(x) => setImagen({ ...imagen, url: x.target.value })}
              />
            </label>
            <label className="eg-campo">
              {g("ev_permiso")}
              <input
                required
                minLength={3}
                maxLength={500}
                value={imagen.permiso}
                onChange={(x) => setImagen({ ...imagen, permiso: x.target.value })}
              />
            </label>
            <p className="ep-nota">{g("ev_permisoAyuda")}</p>
            <div className="ep-acciones">
              <button
                className="ep-boton ep-primario"
                disabled={
                  ocupado || imagen.permiso.trim().length < 3 || !imagen.url.startsWith("https://")
                }
              >
                {g("ev_autorizarImagen")}
              </button>
              {imagen.evento.imagenMedioId && (
                <button
                  type="button"
                  className="ep-boton eg-peligro"
                  disabled={ocupado}
                  onClick={async () => {
                    const ok = await accion(
                      {
                        accion: "imagen",
                        id: imagen.evento.id,
                        revision: imagen.evento.revision,
                        medioId: null,
                        permiso: "",
                      },
                      g("ev_quitarImagen"),
                    );
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
/** Sin imagen: el mismo cuadro azul marino de Spotmi con el día grande y el mes. */
function CuadroFecha({
  fecha,
  locale,
  grande = false,
}: {
  fecha: string | null;
  locale: string;
  grande?: boolean;
}) {
  const d = fecha ? new Date(`${fecha}T12:00:00Z`) : null;
  return (
    <div className={`eg-cuadro-fecha ${grande ? "eg-cuadro-grande" : ""}`} aria-hidden="true">
      <strong>{d ? d.getUTCDate() : "?"}</strong>
      <span>
        {d
          ? new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", {
              month: "short",
              timeZone: "UTC",
            })
              .format(d)
              .replace(".", "")
          : "—"}
      </span>
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
                {new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(`${dia}T12:00:00Z`))}
              </time>
              <ul>
                {eventos
                  .filter((e) => e.fecha === dia)
                  .map((e) => (
                    <li key={e.id}>
                      <strong>{e.titulo}</strong>
                      <span>
                        {[e.hora, e.lugar || e.municipio].filter(Boolean).join(" · ")} ·{" "}
                        {g(`ev_estado_${e.estadoVisible}`)}
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
