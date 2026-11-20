"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, Copy, Download, LayoutGrid, List, Pencil, RotateCcw, Search, X } from "lucide-react";
import type { Encargo } from "@/lib/produccion/modelo";
import { estadoEditorial, estadoEjecucion, estadoEntrega, etapa, tipoResultado, type EstadoEditorial } from "@/lib/produccion/resumen-encargo";
import type { RelacionesEncargo } from "@/lib/produccion/relaciones";
import "./encargos.css";

type Tr = (c: string) => string;
export type AccionEncargo =
  | { tipo: "ejecutar"; id: string }
  | { tipo: "estado"; id: string; estado: Encargo["estado"]; comprobaciones: Encargo["comprobaciones"] }
  | { tipo: "cambios"; id: string; nota: string }
  | { tipo: "rechazar"; id: string; motivo: string }
  | { tipo: "fecha"; id: string; fechaPrevista: string };

const nombresCanal: Record<string, string> = { spotmi: "Spotmi web", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const filtros = ["todos", "por_hacer", "pendiente_revision", "cambios_solicitados", "aprobado", "rechazado"] as const;
type Filtro = (typeof filtros)[number];
const enFiltro = (f: Filtro, ed: EstadoEditorial) => f === "todos" || (f === "por_hacer" ? ed === "borrador" : ed === f);
const claseEstado: Record<EstadoEditorial | "fallida", string> = {
  borrador: "ez-est-neutro",
  pendiente_revision: "ez-est-atencion",
  cambios_solicitados: "ez-est-atencion",
  aprobado: "ez-est-hecho",
  rechazado: "ez-est-apagado",
  fallida: "ez-est-error",
};

/** «hace 12 min», «hace 3 h», «hace 2 días». */
export function haceCuanto(iso: string, tr: Tr) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  const h = Math.round(min / 60);
  const [clave, n] = min < 60 ? ["ez_hace_min", min] : h < 48 ? ["ez_hace_h", h] : ["ez_hace_dias", Math.round(h / 24)];
  return tr(clave).replace("{n}", String(n));
}
const fechaPrevistaLegible = (v: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(`${v}:00Z`));

/** Estado resumido en una sola etiqueta: un fallo de ejecución pesa más que el estado editorial. */
function EtiquetaEstado({ e, tr, ejecutando }: { e: Encargo; tr: Tr; ejecutando: boolean }) {
  if (ejecutando) return <span className="ez-est ez-est-proceso">{tr("ez_enc_ejecutandose")}</span>;
  const ej = estadoEjecucion(e);
  const ed = estadoEditorial(e);
  if (ej.estado === "fallida" && !e.resultado.trim() && ed === "borrador") return <span className={`ez-est ${claseEstado.fallida}`}>{tr("ez_enc_fallida")}</span>;
  return <span className={`ez-est ${claseEstado[ed]}`}>{tr(`ez_ed_${ed}`)}</span>;
}

/** Lista (vista predeterminada) o tablero: qué pediste → qué recibirás → qué pasa → qué te toca. */
export function VistaEncargos({
  encargos,
  tr,
  locale,
  ejecutandoId,
  tablero,
  onAbrir,
}: {
  encargos: Encargo[];
  tr: Tr;
  locale: string;
  ejecutandoId: string | null;
  tablero: ReactNode;
  onAbrir: (id: string) => void;
}) {
  const [vista, setVista] = useState<"lista" | "tablero">("lista");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const conteo = useMemo(() => Object.fromEntries(filtros.map((f) => [f, encargos.filter((e) => enFiltro(f, estadoEditorial(e))).length])) as Record<Filtro, number>, [encargos]);
  const texto = busqueda.toLocaleLowerCase(locale);
  const visibles = encargos
    .filter((e) => enFiltro(filtro, estadoEditorial(e)))
    .filter((e) => !texto || `${e.titulo} ${e.encargo}`.toLocaleLowerCase(locale).includes(texto))
    .sort((a, b) => b.actualizado.localeCompare(a.actualizado));
  return (
    <section className="ez-enc" aria-label={tr("p_encargos")}>
      <div className="ez-enc-barra">
        <label className="ez-enc-buscar">
          <Search size={16} aria-hidden="true" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={tr("p_buscar")} aria-label={tr("p_buscar")} />
        </label>
        <div className="ez-enc-filtros" role="radiogroup" aria-label={tr("ez_enc_filtrar")}>
          {filtros.map((f) => (
            <button key={f} role="radio" aria-checked={filtro === f} onClick={() => setFiltro(f)}>
              {tr(`ez_enc_f_${f}`)} <span>{conteo[f]}</span>
            </button>
          ))}
        </div>
        <div className="ez-segmentado" role="radiogroup" aria-label={tr("ez_enc_vista")}>
          <button role="radio" aria-checked={vista === "lista"} onClick={() => setVista("lista")}>
            <List size={14} aria-hidden="true" /> {tr("ez_enc_lista")}
          </button>
          <button role="radio" aria-checked={vista === "tablero"} onClick={() => setVista("tablero")}>
            <LayoutGrid size={14} aria-hidden="true" /> {tr("ez_enc_tablero")}
          </button>
        </div>
      </div>
      {vista === "tablero" ? (
        tablero
      ) : !visibles.length ? (
        <p className="ez-vacio ez-enc-vacio">{encargos.length ? tr("ez_enc_sinCoincidencias") : tr("p_sinEncargos")}</p>
      ) : (
        <ul className="ez-enc-lista">
          {visibles.map((e) => {
            const et = etapa(e);
            const ejecutando = ejecutandoId === e.id;
            return (
              <li key={e.id}>
                <button className="ez-enc-fila" onClick={() => onAbrir(e.id)}>
                  <span className="ez-enc-principal">
                    <strong>{e.titulo}</strong>
                    <span className="ez-enc-meta">
                      <span>{tr(`ez_tipo_${tipoResultado(e.agente)}`)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{e.canales.map((c) => nombresCanal[c] ?? c).join(", ")}</span>
                      <span aria-hidden="true">·</span>
                      <EtiquetaEstado e={e} tr={tr} ejecutando={ejecutando} />
                    </span>
                    <span className="ez-enc-etapa">
                      {tr(`ez_etapa_${ejecutando ? "ejecutandose" : et.etapa}`)}
                      {" · "}
                      {e.fechaPrevista ? `${tr("ez_enc_previsto")} ${fechaPrevistaLegible(e.fechaPrevista, locale)}` : `${tr("ez_enc_actualizado")} ${haceCuanto(e.actualizado, tr)}`}
                    </span>
                  </span>
                  <span className={`ez-enc-accion ${et.accion === "revisar" || et.accion === "reintentar" ? "ez-enc-accion-fuerte" : ""}`}>
                    {tr(`ez_acc_${et.accion}`)}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Seccion({ titulo, children, secundaria }: { titulo: string; children: ReactNode; secundaria?: boolean }) {
  if (secundaria)
    return (
      <details className="ez-det-seccion ez-det-secundaria">
        <summary>{titulo}</summary>
        {children}
      </details>
    );
  return (
    <section className="ez-det-seccion">
      <h3>{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * Detalle de un encargo: pedido, resultado (vista previa primero), estado y siguiente acción, fuentes y
 * eventos, ejecuciones y errores, versiones y cambios, destinos y entrega. Los datos técnicos, al final.
 */
export function DetalleEncargo({
  e,
  tr,
  locale,
  fecha,
  ocupado,
  ejecutando,
  usosRestantes,
  onAccion,
  onEditar,
  onCerrar,
}: {
  e: Encargo;
  tr: Tr;
  locale: string;
  fecha: (iso: string) => string;
  ocupado: boolean;
  ejecutando: boolean;
  usosRestantes: number | null;
  onAccion: (a: AccionEncargo) => void;
  onEditar: (e: Encargo) => void;
  onCerrar: () => void;
}) {
  const [rel, setRel] = useState<RelacionesEncargo | null>(null);
  const [relError, setRelError] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [checks, setChecks] = useState(e.comprobaciones);
  const [nota, setNota] = useState("");
  const [motivo, setMotivo] = useState("");
  const [fechaNueva, setFechaNueva] = useState(e.fechaPrevista);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/produccion/relaciones?id=${e.id}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j as { error?: string }).error ?? "Error");
        if (vivo) setRel(j as RelacionesEncargo);
      })
      .catch((x) => vivo && setRelError((x as Error).message));
    return () => {
      vivo = false;
    };
  }, [e.id]);
  const ed = estadoEditorial(e);
  const ej = estadoEjecucion(e);
  const et = etapa(e);
  const ejecuciones = (e.historial ?? []).filter((h) => h.accion === "generado" || h.accion === "fallo").reverse();
  const versiones = (e.historial ?? []).filter((h) => ["creado", "editado", "revision", "cambios", "aprobado", "rechazado"].includes(h.accion)).reverse();
  const costo = e.proveedor === "gemini" ? tr("ez_det_costoGemini") : `${tr("ez_det_costoIntento")}${usosRestantes !== null ? ` (${tr("ez_det_quedan").replace("{n}", String(usosRestantes))})` : ""}`;
  const descargar = () => {
    const blob = new Blob([`${e.titulo}\n\n${e.resultado}`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${e.titulo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 60)}-v${e.version}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(e.resultado);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  const ejecutarBloque = (etiqueta: string) => (
    <div className="ez-det-ejecutar">
      <label className="ep-checkbox">
        <input type="checkbox" checked={confirmar} onChange={(x) => setConfirmar(x.target.checked)} />
        {tr("ez_det_confirmar").replace("{ia}", tr(`p_${e.proveedor}`))} {costo}.
      </label>
      <div className="ep-acciones">
        <button className="ez-boton-negro" disabled={!confirmar || ocupado || ejecutando} onClick={() => onAccion({ tipo: "ejecutar", id: e.id })}>
          {ejecutando ? tr("ez_enc_ejecutandose") : etiqueta}
        </button>
        <button className="ez-boton-blanco" onClick={() => onEditar(e)}>
          <Pencil size={14} aria-hidden="true" /> {tr("ez_det_pegarAMano")}
        </button>
      </div>
    </div>
  );
  return (
    <div className="ez-det">
      <header className="ez-det-cabecera">
        <div>
          <span className="ez-det-tipo">
            {tr(`ez_tipo_${tipoResultado(e.agente)}`)} · {e.canales.map((c) => nombresCanal[c] ?? c).join(", ")} · v{e.version}
          </span>
          <h2>{e.titulo}</h2>
          <span className="ez-det-estado">
            <EtiquetaEstado e={e} tr={tr} ejecutando={ejecutando} />
            <span>{tr(`ez_etapa_${ejecutando ? "ejecutandose" : et.etapa}`)}</span>
          </span>
        </div>
        <div className="ep-acciones">
          <button className="ez-boton-blanco" onClick={() => onEditar(e)}>
            <Pencil size={14} aria-hidden="true" /> {tr("ez_det_editar")}
          </button>
          <button className="ez-cerrar" onClick={onCerrar} aria-label={tr("p_cerrar")}>
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="ez-det-cuerpo">
        <div className="ez-det-columna">
          <Seccion titulo={tr("ez_det_resultado")}>
            {e.resultado.trim() ? (
              <>
                <pre className="ez-det-vista">{e.resultado}</pre>
                <div className="ep-acciones">
                  <button className="ez-boton-blanco" onClick={() => void copiar()}>
                    <Copy size={14} aria-hidden="true" /> {copiado ? tr("p_copiado") : tr("ez_det_copiar")}
                  </button>
                  <button className="ez-boton-blanco" onClick={descargar}>
                    <Download size={14} aria-hidden="true" /> {tr("ez_det_descargar")}
                  </button>
                </div>
              </>
            ) : (
              <p className="ez-vacio">{tr("ez_det_sinResultado")}</p>
            )}
          </Seccion>

          <Seccion titulo={tr("ez_det_pedido")}>
            <dl className="ez-det-datos">
              <div>
                <dt>{tr("ez_det_quePediste")}</dt>
                <dd className="ez-det-texto">{e.encargo || tr("ez_det_sinInstrucciones")}</dd>
              </div>
              <div>
                <dt>{tr("ez_det_queRecibiras")}</dt>
                <dd>{tr(`p_${e.agente}_entrega`)}</dd>
              </div>
            </dl>
          </Seccion>

          <Seccion titulo={tr("ez_det_fuentes")}>
            {e.fuentes.length ? (
              <ul className="ez-det-lista">
                {e.fuentes.map((f) => (
                  <li key={f.url}>
                    <a href={f.url} target="_blank" rel="noreferrer noopener">
                      {f.nombre} <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ez-vacio">{tr("ez_det_sinFuentes")}</p>
            )}
            <h4>{tr("ez_det_eventos")}</h4>
            {relError ? (
              <p className="ep-alerta">{relError}</p>
            ) : !rel ? (
              <p role="status">{tr("p_cargando")}</p>
            ) : rel.eventos.length ? (
              <ul className="ez-det-lista">
                {rel.eventos.map((x) => (
                  <li key={x.id}>
                    {x.titulo}
                    <small>
                      {[x.fecha, x.departamento || tr("ez_mapa_sinUbicacion"), tr(`ez_evest_${x.estado}`)].filter(Boolean).join(" · ")}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ez-vacio">{tr("ez_det_procedenciaNoRegistrada")}</p>
            )}
            {rel && rel.granjas.length > 0 && (
              <>
                <h4>{tr("ez_det_granjas")}</h4>
                <ul className="ez-det-lista">
                  {rel.granjas.map((g) => (
                    <li key={g.id}>
                      {g.nombre}
                      <small>{g.ultima ? `${tr(`ez_ej_${g.ultima.estado}`)} · ${fecha(g.ultima.creado)}` : tr("ez_sinEjecuciones")}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Seccion>
        </div>

        <aside className="ez-det-columna ez-det-lateral">
          <Seccion titulo={tr("ez_det_siguiente")}>
            {ej.estado === "fallida" && (
              <div className="ez-det-fallo" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <div>
                  <strong>{tr("ez_det_fallo")}</strong>
                  <p>{ej.motivo}</p>
                  <p className="ep-nota">{e.resultado.trim() ? tr("ez_det_falloConservado") : tr("ez_det_falloSinResultado")}</p>
                </div>
              </div>
            )}
            {e.notaCambios && (ed === "cambios_solicitados" || ed === "rechazado") && (
              <p className="ez-det-nota">
                <strong>{tr(ed === "rechazado" ? "ez_det_motivoRechazo" : "ez_det_cambiosPedidos")}:</strong> {e.notaCambios}
              </p>
            )}
            {(et.accion === "ejecutar" || et.accion === "reintentar" || et.accion === "aplicar_cambios") && ejecutarBloque(tr(et.accion === "reintentar" ? "ez_acc_reintentar" : "ez_det_ejecutar"))}
            {(et.accion === "enviar_revision" || et.accion === "terminar_preparacion") && (
              <button className="ez-boton-negro" disabled={ocupado} onClick={() => onAccion({ tipo: "estado", id: e.id, estado: "revision", comprobaciones: e.comprobaciones })}>
                {tr("ez_acc_enviar_revision")}
              </button>
            )}
            {et.accion === "revisar" && (
              <div className="ez-det-revisar">
                <fieldset>
                  <legend>{tr("ez_det_comprobaciones")}</legend>
                  {(["hechos", "derechos", "marca"] as const).map((k) => (
                    <label key={k} className="ep-checkbox">
                      <input type="checkbox" checked={checks[k]} onChange={(x) => setChecks({ ...checks, [k]: x.target.checked })} />
                      {tr(`p_${k}`)}
                    </label>
                  ))}
                </fieldset>
                <button className="ez-boton-negro" disabled={ocupado || !Object.values(checks).every(Boolean) || !e.fuentes.length} onClick={() => onAccion({ tipo: "estado", id: e.id, estado: "aprobado", comprobaciones: checks })}>
                  {tr("ez_det_aprobar")}
                </button>
                {!e.fuentes.length && <p className="ep-nota">{tr("ez_det_aprobarSinFuente")}</p>}
                <p className="ep-nota">{tr("ez_det_aprobarNoPublica")}</p>
              </div>
            )}
            {(et.accion === "planificar" || et.accion === "exportar") && (
              <div className="ez-det-revisar">
                <button className="ez-boton-negro" onClick={descargar}>
                  <Download size={14} aria-hidden="true" /> {tr("ez_det_descargar")}
                </button>
                <label className="eg-campo">
                  {tr("ez_det_fechaPrevista")}
                  <input type="datetime-local" value={fechaNueva} onChange={(x) => setFechaNueva(x.target.value)} />
                </label>
                <button className="ez-boton-blanco" disabled={ocupado || fechaNueva === e.fechaPrevista} onClick={() => onAccion({ tipo: "fecha", id: e.id, fechaPrevista: fechaNueva })}>
                  {tr("ez_det_guardarFecha")}
                </button>
                <p className="ep-nota">{tr("ez_det_fechaNoPublica")}</p>
              </div>
            )}
            {et.accion === "reabrir" && (
              <button className="ez-boton-negro" onClick={() => onEditar(e)}>
                <RotateCcw size={14} aria-hidden="true" /> {tr("ez_acc_reabrir")}
              </button>
            )}
            {(ed === "pendiente_revision" || ed === "aprobado") && (
              <details className="ez-det-mas">
                <summary>{tr("ez_det_pedirCambiosORechazar")}</summary>
                <label className="eg-campo">
                  {tr("ez_det_queCambiar")}
                  <textarea rows={3} maxLength={2000} value={nota} onChange={(x) => setNota(x.target.value)} />
                </label>
                <button className="ez-boton-blanco" disabled={ocupado || nota.trim().length < 3} onClick={() => onAccion({ tipo: "cambios", id: e.id, nota })}>
                  {tr("ez_det_pedirCambios")}
                </button>
                <label className="eg-campo">
                  {tr("ez_det_motivoRechazo")}
                  <textarea rows={2} maxLength={2000} value={motivo} onChange={(x) => setMotivo(x.target.value)} />
                </label>
                <button className="ez-boton-blanco ez-peligro" disabled={ocupado || motivo.trim().length < 3} onClick={() => onAccion({ tipo: "rechazar", id: e.id, motivo })}>
                  {tr("ez_det_rechazar")}
                </button>
              </details>
            )}
          </Seccion>

          <Seccion titulo={tr("ez_det_destinos")}>
            <ul className="ez-det-lista">
              {estadoEntrega(e).map((d) => (
                <li key={d.canal}>
                  {nombresCanal[d.canal] ?? d.canal}
                  <small>{tr(`ez_entrega_${d.estado}`)}</small>
                </li>
              ))}
            </ul>
            <p className="ep-nota">{tr("ez_det_entregaManual")}</p>
          </Seccion>

          <Seccion titulo={`${tr("ez_det_ejecuciones")} (${ejecuciones.length})`}>
            {ejecuciones.length ? (
              <ul className="ez-det-lista">
                {ejecuciones.map((h, i) => (
                  <li key={`${h.fecha}-${i}`} className={h.accion === "fallo" ? "ez-det-error" : ""}>
                    {h.accion === "fallo" ? tr("ez_enc_fallida") : tr("ez_det_entregada")} · v{h.version}
                    <small>
                      {fecha(h.fecha)}
                      {h.nota ? ` · ${h.nota}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ez-vacio">{tr("ez_det_sinEjecuciones")}</p>
            )}
          </Seccion>

          <Seccion titulo={`${tr("ez_det_versiones")} (${versiones.length})`}>
            {versiones.length ? (
              <ul className="ez-det-lista">
                {versiones.map((h, i) => (
                  <li key={`${h.fecha}-${i}`}>
                    v{h.version} · {tr(`p_h_${h.accion}`)}
                    <small>
                      {fecha(h.fecha)}
                      {h.nota ? ` · ${h.nota}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ez-vacio">{tr("p_historialVacio")}</p>
            )}
          </Seccion>

          <Seccion titulo={tr("ez_det_tecnico")} secundaria>
            <dl className="ez-det-datos ez-det-tecnico">
              <div>
                <dt>{tr("ez_det_especialista")}</dt>
                <dd>{tr(`p_${e.agente}_titulo`)}</dd>
              </div>
              <div>
                <dt>{tr("ez_det_ia")}</dt>
                <dd>
                  {tr(`p_${e.proveedor}`)}
                  {ej.proveedor && ej.estado === "completada" ? ` · ${tr("ez_det_ultimaPor")} ${ej.proveedor}` : ""}
                </dd>
              </div>
              <div>
                <dt>{tr("ez_det_creado")}</dt>
                <dd>{fecha(e.creado)}</dd>
              </div>
              <div>
                <dt>{tr("ez_det_actualizado")}</dt>
                <dd>{fecha(e.actualizado)}</dd>
              </div>
              {e.dependencia && (
                <div>
                  <dt>{tr("ez_det_dependeDe")}</dt>
                  <dd>
                    {e.dependencia.id.slice(0, 8)} · v{e.dependencia.version}
                  </dd>
                </div>
              )}
              <div>
                <dt>ID</dt>
                <dd>
                  <code>{e.id}</code>
                </dd>
              </div>
              {e.fechaPrevista && (
                <div>
                  <dt>{tr("ez_det_fechaPrevista")}</dt>
                  <dd>{fechaPrevistaLegible(e.fechaPrevista, locale)}</dd>
                </div>
              )}
            </dl>
          </Seccion>
        </aside>
      </div>
    </div>
  );
}
