"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from "lucide-react";
import type { EstadoOnboarding } from "@/lib/produccion/onboarding";
import { Modal } from "../ui";

type Vista = {
  estado: EstadoOnboarding;
  cuenta: { email: string; organizacion: string };
  espacios: { id: string; nombre: string }[];
  proveedores: { gemini: boolean; astra: boolean; claude: boolean };
  existentes: Record<string, string | null>;
  plantillas: Record<string, { titulo: string; agente: string; fuentes: number; receta: string | null }>;
  encargo: { id: string; titulo: string; estado: string; version: number } | null;
  granja: { id: string; nombre: string } | null;
  tieneTrabajo: boolean;
};
const objetivos = ["eventos", "instagram", "contenido"] as const;

/** Lee el estado de la guía (para el Inicio y para abrirla sola la primera vez). */
export async function leerGuia(): Promise<Vista | null> {
  const r = await fetch("/api/produccion/onboarding", { cache: "no-store" });
  if (!r.ok) return null;
  return (await r.json()) as Vista;
}

/**
 * Guía de inicio en 5 pasos: espacio de trabajo → objetivo → lo mínimo para esa tarea → primer
 * encargo real → dónde verlo y revisarlo. Cada paso se guarda en el servidor: se puede cerrar y
 * retomar. Configurar es opcional. No conecta cuentas ni autoriza publicar.
 */
export function Bienvenida({
  abierta,
  onCerrar,
  onAbrirEncargo,
  onIrGranjas,
  onCambio,
  tr,
}: {
  abierta: boolean;
  onCerrar: () => void;
  onAbrirEncargo: (id: string) => void;
  onIrGranjas: () => void;
  onCambio: (estado: EstadoOnboarding) => void;
  tr: (clave: string) => string;
}) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [espacio, setEspacio] = useState("");
  const [crearGranja, setCrearGranja] = useState(true);
  const [proveedor, setProveedor] = useState<"gemini" | "astra" | "claude">("gemini");
  const [titulo, setTitulo] = useState("");
  const [fuente, setFuente] = useState("");
  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    leerGuia()
      .then((v) => {
        if (!vivo || !v) return;
        setVista(v);
        setEspacio(v.estado.espacio ?? v.espacios[0]?.id ?? "");
        setProveedor(v.estado.proveedor ?? (v.proveedores.gemini ? "gemini" : v.proveedores.claude ? "claude" : v.proveedores.astra ? "astra" : "gemini"));
        if (v.estado.objetivo) setTitulo(v.plantillas[v.estado.objetivo].titulo);
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [abierta]);
  async function enviar(cuerpo: object) {
    setOcupado(true);
    setError("");
    try {
      const r = await fetch("/api/produccion/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? tr("p_error"));
      const v = j as Vista;
      setVista(v);
      onCambio(v.estado);
      return v;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setOcupado(false);
    }
  }
  const e = vista?.estado;
  const paso = e?.paso ?? 1;
  const nombreProveedor = (p: "gemini" | "astra" | "claude") => tr(`p_${p}`);
  return (
    <Modal open={abierta} onClose={onCerrar} label={tr("p_ob_titulo")} className="ep-modal ep-bienvenida" dismissOnBackdrop>
      {!vista ? (
        <p role="status">{error || tr("p_cargando")}</p>
      ) : (
        <div className="ep-ob">
          <p className="ep-eyebrow">{tr("p_ob_titulo")}</p>
          <ol className="ep-guia-progreso" aria-label={tr("p_ob_progreso")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n} className={n < paso || (n === 5 && e?.completado) ? "ep-hecho" : n === paso ? "ep-actual" : ""} aria-current={n === paso ? "step" : undefined}>
                {n < paso ? <CheckCircle2 size={14} aria-hidden="true" /> : <span>{n}</span>}
                {tr(`p_ob_paso${n}`)}
              </li>
            ))}
          </ol>
          {error && (
            <p className="ep-alerta" role="alert">
              {error}
            </p>
          )}

          {paso === 1 && (
            <section>
              <h2>{tr("p_ob_espacioTitulo")}</h2>
              <p>{tr("p_ob_espacioAyuda")}</p>
              <p className="ep-nota">
                {tr("p_ob_cuenta")}: <strong>{vista.cuenta.email}</strong>
              </p>
              {!vista.espacios.length ? (
                <p className="ep-alerta">{tr("p_ob_sinEspacios")}</p>
              ) : (
                <fieldset className="ep-ob-opciones">
                  <legend>{tr("p_ob_espacioElegir")}</legend>
                  {vista.espacios.map((s) => (
                    <label key={s.id} className="ep-ob-opcion">
                      <input type="radio" name="espacio" checked={espacio === s.id} onChange={() => setEspacio(s.id)} />
                      <strong>{s.nombre}</strong>
                      <small>{tr("p_ob_espacioLocal")}</small>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="ep-acciones">
                <button className="ep-boton ep-primario" disabled={ocupado || !espacio} onClick={() => void enviar({ accion: "espacio", espacio })}>
                  {tr("p_ob_confirmar")}
                  <ArrowRight size={16} />
                </button>
              </div>
            </section>
          )}

          {paso === 2 && (
            <section>
              <h2>{tr("p_ob_objetivoTitulo")}</h2>
              <p>{tr("p_ob_objetivoAyuda")}</p>
              <div className="ep-ob-objetivos">
                {objetivos.map((o) => (
                  <button
                    key={o}
                    className={`ep-ob-objetivo ${e?.objetivo === o ? "ep-elegido" : ""}`}
                    aria-pressed={e?.objetivo === o}
                    disabled={ocupado}
                    onClick={async () => {
                      const v = await enviar({ accion: "objetivo", objetivo: o });
                      if (v) setTitulo(v.plantillas[o].titulo);
                    }}
                  >
                    <strong>{tr(`p_ob_obj_${o}`)}</strong>
                    <span>{tr(`p_ob_obj_${o}_ayuda`)}</span>
                    {vista.existentes[o] && <small>{tr("p_ob_yaTienes")}: {vista.existentes[o]}</small>}
                  </button>
                ))}
              </div>
              <div className="ep-acciones">
                <button className="ep-boton ep-texto" onClick={() => void enviar({ accion: "ir", paso: 1 })}>
                  <ArrowLeft size={16} />
                  {tr("p_ob_atras")}
                </button>
              </div>
            </section>
          )}

          {paso === 3 && e?.objetivo && (
            <section>
              <h2>{tr("p_ob_configTitulo")}</h2>
              <p>{tr(`p_ob_config_${e.objetivo}`)}</p>
              {vista.plantillas[e.objetivo].receta && (
                <label className="ep-checkbox">
                  <input type="checkbox" checked={crearGranja} onChange={(x) => setCrearGranja(x.target.checked)} />
                  {vista.existentes[e.objetivo] ? `${tr("p_ob_usarGranja")}: ${vista.existentes[e.objetivo]} (${tr("p_ob_sinCambios")})` : tr(`p_ob_crearGranja_${e.objetivo}`)}
                </label>
              )}
              <fieldset className="ep-ob-opciones">
                <legend>{tr("p_ob_proveedor")}</legend>
                {(["gemini", "claude", "astra"] as const).map((p) => (
                  <label key={p} className="ep-ob-opcion">
                    <input type="radio" name="proveedor" checked={proveedor === p} onChange={() => setProveedor(p)} />
                    <strong>{nombreProveedor(p)}</strong>
                    <small>{vista.proveedores[p] ? tr("p_ob_disponible") : tr(`p_ob_noDisponible_${p}`)}</small>
                  </label>
                ))}
              </fieldset>
              {!vista.proveedores[proveedor] && <p className="ep-nota">{tr("p_ob_manual")}</p>}
              <div className="ep-acciones">
                <button className="ep-boton ep-primario" disabled={ocupado} onClick={() => void enviar({ accion: "configurar", crearGranja: Boolean(e.objetivo && vista.plantillas[e.objetivo].receta) && crearGranja, proveedor })}>
                  {tr("p_ob_guardarSeguir")}
                  <ArrowRight size={16} />
                </button>
                <button className="ep-boton" disabled={ocupado} onClick={() => void enviar({ accion: "omitir_configuracion" })}>
                  {tr("p_ob_omitir")}
                </button>
                <button className="ep-boton ep-texto" onClick={() => void enviar({ accion: "ir", paso: 2 })}>
                  <ArrowLeft size={16} />
                  {tr("p_ob_atras")}
                </button>
              </div>
            </section>
          )}

          {paso === 4 && e?.objetivo && (
            <form
              onSubmit={(x) => {
                x.preventDefault();
                void enviar({ accion: "encargo", titulo, fuente: fuente.trim() });
              }}
            >
              <h2>{tr("p_ob_encargoTitulo")}</h2>
              <p>{tr(`p_ob_encargo_${e.objetivo}`)}</p>
              <label className="ep-campo">
                {tr("p_tituloCampo")}
                <input required minLength={3} maxLength={180} value={titulo} onChange={(x) => setTitulo(x.target.value)} />
              </label>
              <label className="ep-campo">
                {tr(e.objetivo === "instagram" ? "p_ob_fuenteEvento" : "p_ob_fuenteOpcional")}
                <input type="url" maxLength={2000} placeholder="https://" required={e.objetivo === "instagram"} value={fuente} onChange={(x) => setFuente(x.target.value)} />
              </label>
              {e.configuracionOmitida && (
                <p className="ep-nota">
                  {tr("p_ob_configPendiente")}{" "}
                  <button type="button" className="ep-boton ep-texto" onClick={() => void enviar({ accion: "ir", paso: 3 })}>
                    {tr("p_ob_configurarAhora")}
                  </button>
                </p>
              )}
              <div className="ep-acciones">
                <button className="ep-boton ep-primario" disabled={ocupado || titulo.trim().length < 3}>
                  {tr("p_ob_crearEncargo")}
                  <ArrowRight size={16} />
                </button>
                <button type="button" className="ep-boton ep-texto" onClick={() => void enviar({ accion: "ir", paso: 3 })}>
                  <ArrowLeft size={16} />
                  {tr("p_ob_atras")}
                </button>
              </div>
            </form>
          )}

          {paso === 5 && (
            <section>
              <h2>{tr("p_ob_listoTitulo")}</h2>
              {vista.encargo ? (
                <>
                  <p>
                    {tr("p_ob_listoEncargo")} <strong>«{vista.encargo.titulo}»</strong> · {tr(`p_${vista.encargo.estado}`)} · v{vista.encargo.version}
                  </p>
                  <ol className="ep-ob-siguientes">
                    <li>{tr("p_ob_sig1")}</li>
                    <li>{tr(vista.proveedores[(e?.proveedor ?? "gemini") as "gemini"] ? "p_ob_sig2" : "p_ob_sig2Manual")}</li>
                    <li>{tr("p_ob_sig3")}</li>
                    <li>{tr("p_ob_sig4")}</li>
                  </ol>
                  {vista.granja && (
                    <p className="ep-nota">
                      {tr(e?.granjaReutilizada ? "p_ob_granjaReutilizada" : "p_ob_granjaCreada")}: <strong>{vista.granja.nombre}</strong>. {tr("p_ob_granjaAyuda")}
                    </p>
                  )}
                  <div className="ep-acciones">
                    <button
                      className="ep-boton ep-primario"
                      onClick={() => {
                        onAbrirEncargo(vista.encargo!.id);
                        if (!e?.completado) void enviar({ accion: "completar" });
                      }}
                    >
                      {tr("p_ob_abrirEncargo")}
                      <ArrowRight size={16} />
                    </button>
                    {vista.granja && (
                      <button className="ep-boton" onClick={onIrGranjas}>
                        {tr("p_ob_irGranja")}
                      </button>
                    )}
                    {!e?.completado && (
                      <button className="ep-boton" disabled={ocupado} onClick={async () => (await enviar({ accion: "completar" })) && onCerrar()}>
                        <Check size={16} />
                        {tr("p_ob_terminar")}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="ep-alerta">{tr("p_ob_encargoFalta")}</p>
                  <button className="ep-boton" onClick={() => void enviar({ accion: "ir", paso: 4 })}>
                    <ArrowLeft size={16} />
                    {tr("p_ob_atras")}
                  </button>
                </>
              )}
            </section>
          )}
          <p className="ep-nota ep-ob-pie">{tr("p_ob_pie")}</p>
        </div>
      )}
    </Modal>
  );
}
