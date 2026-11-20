"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, RefreshCw, Settings2, SlidersHorizontal, X } from "lucide-react";
import type { ResumenInicio } from "@/lib/produccion/inicio";
import type { EstadoOnboarding } from "@/lib/produccion/onboarding";
import { temas, type Preferencias, type WidgetPulso } from "@/lib/produccion/preferencias-modelo";
import { Modal } from "../../ui";
import { Aparece } from "./aparece";
import { FondoLiquido } from "./fondo-liquido";
import { Hero } from "./hero";
import { componentes, equipo, nombreAgente, rolAgente, type DestinoInicio } from "./widgets";
import "./inicio.css";

export type { DestinoInicio };

async function pedirJson<T>(url: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(url, cuerpo === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

/**
 * Inicio · «Pulso de mis granjas»: bienvenida con los agentes y un tablero personalizable.
 * Todos los números salen de lo guardado; lo editable es la presentación (orden, tamaño, títulos, tema).
 */
export function Inicio({
  tr,
  fecha,
  onIr,
  onNuevo,
  onGuia,
  guia,
  version,
}: {
  tr: (clave: string) => string;
  fecha: (iso: string) => string;
  onIr: (d: DestinoInicio) => void;
  onNuevo: () => void;
  onGuia: () => void;
  guia: EstadoOnboarding | null;
  version: number;
}) {
  const [datos, setDatos] = useState<ResumenInicio | null>(null);
  const [prefs, setPrefs] = useState<Preferencias | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [editando, setEditando] = useState(false);
  const [propiedades, setPropiedades] = useState<WidgetPulso | "agentes_equipo" | null>(null);
  const [arrastrando, setArrastrando] = useState<WidgetPulso | null>(null);
  const tablero = useRef<HTMLElement>(null);
  useEffect(() => {
    let vivo = true;
    Promise.all([pedirJson<ResumenInicio>("/api/produccion/inicio"), pedirJson<{ preferencias: Preferencias }>("/api/produccion/preferencias")])
      .then(([d, p]) => {
        if (!vivo) return;
        setDatos(d);
        setPrefs(p.preferencias);
        setError("");
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [version, recarga]);

  async function guardar(cambios: Partial<Omit<Preferencias, "revision">>) {
    if (!prefs) return;
    // Optimista: se ve al instante; si el servidor rechaza, se vuelve a lo guardado.
    const anterior = prefs;
    setPrefs({ ...prefs, ...cambios });
    try {
      const r = await pedirJson<{ preferencias: Preferencias }>("/api/produccion/preferencias", { revision: prefs.revision, cambios });
      setPrefs(r.preferencias);
      setAviso(tr("ez_guardado"));
    } catch (e) {
      setPrefs(anterior);
      setError((e as Error).message);
    }
  }
  const widgets = prefs?.widgets ?? [];
  const mover = (id: WidgetPulso, hacia: number) => {
    const i = widgets.findIndex((w) => w.id === id);
    const j = Math.max(0, Math.min(widgets.length - 1, i + hacia));
    if (i < 0 || i === j) return;
    const lista = [...widgets];
    const [w] = lista.splice(i, 1);
    lista.splice(j, 0, w);
    void guardar({ widgets: lista });
  };
  const soltarSobre = (destino: WidgetPulso) => {
    if (!arrastrando || arrastrando === destino) return;
    const lista = widgets.filter((w) => w.id !== arrastrando);
    lista.splice(
      lista.findIndex((w) => w.id === destino),
      0,
      widgets.find((w) => w.id === arrastrando)!,
    );
    setArrastrando(null);
    void guardar({ widgets: lista });
  };
  const cambiar = (id: WidgetPulso, cambio: Partial<Preferencias["widgets"][number]>) => void guardar({ widgets: widgets.map((w) => (w.id === id ? { ...w, ...cambio } : w)) });

  if (error && !datos)
    return (
      <div className="ez-inicio">
        <div className="ep-alerta" role="alert">
          {error}
          <button onClick={() => setRecarga((x) => x + 1)}>{tr("p_reintentar")}</button>
        </div>
      </div>
    );
  if (!datos || !prefs)
    return (
      <div className="ez-inicio">
        <p role="status">{tr("p_cargando")}</p>
      </div>
    );
  const tema = prefs.temas.inicio ?? "claro";
  const pasoGuia = guia?.paso ?? 1;
  const hechos = guia ? Math.min(5, guia.completado ? 5 : pasoGuia - 1) : 0;
  const props = { datos, tr, fecha, onIr, onNuevo, prefs };
  const titulo = (id: WidgetPulso) => widgets.find((w) => w.id === id)?.titulo || tr(`ez_w_${id}`);
  const ocultos = widgets.filter((w) => !w.visible);
  return (
    <div className="ez-inicio" data-tema={tema}>
      {tema === "liquido" && <FondoLiquido className="ez-inicio-liquido" />}
      <Hero datos={datos} tr={tr} prefs={prefs} liquido={false} onIr={onIr} onNuevo={onNuevo} onPendientes={() => tablero.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />

      <section className="ez-tablero" ref={tablero} aria-labelledby="ez-tablero-titulo" tabIndex={-1}>
        <div className="ez-tablero-cabecera">
          <div>
            <span className="ez-pill">{tr("ez_pill_pulso")}</span>
            <h2 id="ez-tablero-titulo" className="ez-titulo-seccion">
              {tr("ez_pulso_l1")} <em>{tr("ez_pulso_l2")}</em>
            </h2>
          </div>
          <div className="ez-tablero-controles">
            <div className="ez-segmentado" role="radiogroup" aria-label={tr("ez_tema")}>
              {temas.map((t) => (
                <button key={t} role="radio" aria-checked={tema === t} onClick={() => void guardar({ temas: { ...prefs.temas, inicio: t } })}>
                  {tr(`ez_tema_${t}`)}
                </button>
              ))}
            </div>
            <button className="ez-boton-blanco" onClick={() => setRecarga((x) => x + 1)} aria-label={tr("p_actualizar")}>
              <RefreshCw size={15} aria-hidden="true" />
            </button>
            <button className={editando ? "ez-boton-negro" : "ez-boton-blanco"} aria-pressed={editando} onClick={() => setEditando(!editando)}>
              <SlidersHorizontal size={15} aria-hidden="true" />
              {tr(editando ? "ez_listo" : "ez_personalizar")}
            </button>
          </div>
        </div>
        {aviso && (
          <p className="ez-aviso" role="status" onAnimationEnd={() => setAviso("")}>
            {aviso}
          </p>
        )}
        {error && (
          <p className="ep-alerta" role="alert">
            {error}
          </p>
        )}

        {(!guia || !guia.completado) && (
          <div className="ez-guia ez-tarjeta">
            <span>
              <strong>{tr("p_ob_titulo")}</strong>
              <small>
                {hechos} / 5 {tr("p_ob_completados")}
              </small>
            </span>
            <span className="ez-barra" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={hechos} aria-label={tr("p_ob_progreso")}>
              <span style={{ width: `${(hechos / 5) * 100}%` }} />
            </span>
            <button className="ez-boton-negro" onClick={onGuia}>
              {tr(pasoGuia > 1 ? "p_ob_continuar" : "p_ob_empezar")}
            </button>
          </div>
        )}

        {editando && ocultos.length > 0 && (
          <div className="ez-agregar">
            <span>{tr("ez_agregar")}</span>
            {ocultos.map((w) => (
              <button key={w.id} className="ez-boton-blanco" onClick={() => cambiar(w.id, { visible: true })}>
                + {titulo(w.id)}
              </button>
            ))}
          </div>
        )}

        <div className={`ez-rejilla ${editando ? "ez-editando" : ""}`}>
          {widgets
            .filter((w) => w.visible)
            .map((w, i, visibles) => {
              const Componente = componentes[w.id];
              return (
                <Aparece key={w.id} como="section" className={`ez-widget ez-tam-${w.tamano} ez-con-halo`}>
                  <div
                    className={`ez-tarjeta ez-widget-tarjeta ${arrastrando === w.id ? "ez-arrastrando" : ""}`}
                    aria-labelledby={`ez-w-${w.id}`}
                    draggable={editando}
                    onDragStart={(e) => {
                      setArrastrando(w.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setArrastrando(null)}
                    onDragOver={(e) => editando && arrastrando && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      soltarSobre(w.id);
                    }}
                  >
                    <header className="ez-widget-cabecera">
                      <h3 id={`ez-w-${w.id}`}>{titulo(w.id)}</h3>
                      {w.id === "atencion" && datos.pendientes.length > 0 && <span className="ez-contador">{datos.pendientes.length}</span>}
                      {editando && (
                        <span className="ez-widget-herramientas">
                          <GripVertical size={16} className="ez-asa" aria-hidden="true" />
                          <button aria-label={`${tr("ez_subir")}: ${titulo(w.id)}`} disabled={i === 0} onClick={() => mover(w.id, -1)}>
                            <ArrowUp size={15} />
                          </button>
                          <button aria-label={`${tr("ez_bajar")}: ${titulo(w.id)}`} disabled={i === visibles.length - 1} onClick={() => mover(w.id, 1)}>
                            <ArrowDown size={15} />
                          </button>
                          <button aria-label={`${tr("ez_propiedades")}: ${titulo(w.id)}`} onClick={() => setPropiedades(w.id)}>
                            <Settings2 size={15} />
                          </button>
                          <button aria-label={`${tr("ez_ocultar")}: ${titulo(w.id)}`} onClick={() => cambiar(w.id, { visible: false })}>
                            <EyeOff size={15} />
                          </button>
                        </span>
                      )}
                    </header>
                    <Componente {...props} />
                  </div>
                </Aparece>
              );
            })}
        </div>
        {editando && (
          <div className="ez-agregar">
            <button className="ez-boton-blanco" onClick={() => setPropiedades("agentes_equipo")}>
              <Settings2 size={15} aria-hidden="true" />
              {tr("ez_editarAgentes")}
            </button>
          </div>
        )}
      </section>

      <Modal open={Boolean(propiedades)} onClose={() => setPropiedades(null)} label={tr("ez_propiedades")} className="ep-modal ez-panel" dismissOnBackdrop>
        {propiedades && propiedades !== "agentes_equipo" && (
          <PanelWidget
            key={propiedades}
            w={widgets.find((x) => x.id === propiedades)!}
            porDefecto={tr(`ez_w_${propiedades}`)}
            tr={tr}
            onCerrar={() => setPropiedades(null)}
            onGuardar={(c) => {
              cambiar(propiedades, c);
              setPropiedades(null);
            }}
          />
        )}
        {propiedades === "agentes_equipo" && (
          <PanelAgentes
            prefs={prefs}
            tr={tr}
            onCerrar={() => setPropiedades(null)}
            onGuardar={(agentes) => {
              void guardar({ agentes });
              setPropiedades(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function PanelWidget({
  w,
  porDefecto,
  tr,
  onCerrar,
  onGuardar,
}: {
  w: Preferencias["widgets"][number];
  porDefecto: string;
  tr: (c: string) => string;
  onCerrar: () => void;
  onGuardar: (c: Partial<Preferencias["widgets"][number]>) => void;
}) {
  const [titulo, setTitulo] = useState(w.titulo);
  const [tamano, setTamano] = useState(w.tamano);
  const [visible, setVisible] = useState(w.visible);
  return (
    <form
      className="ez-panel-form"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ titulo, tamano, visible });
      }}
    >
      <header>
        <h2>{tr("ez_propiedades")}</h2>
        <button type="button" className="ez-cerrar" aria-label={tr("p_cancelar")} onClick={onCerrar}>
          <X size={18} />
        </button>
      </header>
      <label className="eg-campo">
        {tr("ez_prop_titulo")}
        <input value={titulo} maxLength={40} placeholder={porDefecto} onChange={(e) => setTitulo(e.target.value)} />
      </label>
      <fieldset className="ez-segmentado-campo">
        <legend>{tr("ez_prop_tamano")}</legend>
        <div className="ez-segmentado" role="radiogroup">
          {(["s", "m", "l"] as const).map((t) => (
            <button type="button" key={t} role="radio" aria-checked={tamano === t} onClick={() => setTamano(t)}>
              {tr(`ez_tam_${t}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="ez-interruptor">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        <span aria-hidden="true">{visible ? <Eye size={15} /> : <EyeOff size={15} />}</span>
        {tr("ez_prop_visible")}
      </label>
      <p className="ep-nota">{tr("ez_prop_nota")}</p>
      <div className="ep-acciones">
        <button className="ez-boton-negro">{tr("ez_guardar")}</button>
        <button type="button" className="ez-boton-blanco" onClick={onCerrar}>
          {tr("p_cancelar")}
        </button>
      </div>
    </form>
  );
}

function PanelAgentes({ prefs, tr, onCerrar, onGuardar }: { prefs: Preferencias; tr: (c: string) => string; onCerrar: () => void; onGuardar: (a: Preferencias["agentes"]) => void }) {
  const [valores, setValores] = useState(() =>
    Object.fromEntries(equipo.map(({ agente }) => [agente, { nombre: prefs.agentes[agente]?.nombre ?? "", rol: prefs.agentes[agente]?.rol ?? "" }])),
  );
  return (
    <form
      className="ez-panel-form"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ ...prefs.agentes, ...valores });
      }}
    >
      <header>
        <h2>{tr("ez_editarAgentes")}</h2>
        <button type="button" className="ez-cerrar" aria-label={tr("p_cancelar")} onClick={onCerrar}>
          <X size={18} />
        </button>
      </header>
      {equipo.map(({ agente }) => (
        <fieldset key={agente} className="ez-agente-campos">
          <legend>{tr(`p_${agente}_titulo`)}</legend>
          <label className="eg-campo">
            {tr("ez_prop_nombre")}
            <input value={valores[agente].nombre} maxLength={30} placeholder={nombreAgente(agente, { ...prefs, agentes: {} }, tr)} onChange={(e) => setValores({ ...valores, [agente]: { ...valores[agente], nombre: e.target.value } })} />
          </label>
          <label className="eg-campo">
            {tr("ez_prop_rol")}
            <input value={valores[agente].rol} maxLength={90} placeholder={rolAgente(agente, { ...prefs, agentes: {} }, tr)} onChange={(e) => setValores({ ...valores, [agente]: { ...valores[agente], rol: e.target.value } })} />
          </label>
        </fieldset>
      ))}
      <div className="ep-acciones">
        <button className="ez-boton-negro">{tr("ez_guardar")}</button>
        <button type="button" className="ez-boton-blanco" onClick={onCerrar}>
          {tr("p_cancelar")}
        </button>
      </div>
    </form>
  );
}
