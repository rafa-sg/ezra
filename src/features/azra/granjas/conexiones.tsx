"use client";
import { ConexionN8n } from "./n8n";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plug, Unplug, ShieldCheck, Download, HardDrive } from "lucide-react";
import { Modal } from "../ui";
import { pedir, type Conexion, type ConexionesRespuesta } from "./cliente";

const nombres = {
  spotmi: "Spotmi web",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
} as const;
type Almacen = {
  local: boolean;
  rutas: Record<string, string>;
  bytes: { base: number; medios: number };
  conteos: Record<string, number>;
  cola: { tipo: string; estado: string; n: number }[];
  remotos: { canal: string; estado: string; n: number }[];
  trabajador: string;
};
const megas = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

type EstadoCanal = ConexionesRespuesta["canales"][number];
const conectada = (c: Conexion) => !["sin_configurar", "requiere_oauth"].includes(c.estado);

/**
 * Una tarjeta por red con todas sus cuentas: las compartidas de Spotmi (las administra el propietario)
 * y las personales de esta sesión (solo tú las ves). Se puede agregar otra cuenta de la misma red.
 * Nada aparece como conectado sin una verificación del servidor.
 */
export function ConexionesGranjas({
  g,
  fecha,
  aviso,
}: {
  g: (clave: string) => string;
  fecha: (iso: string) => string;
  aviso: string | null;
}) {
  const [datos, setDatos] = useState<ConexionesRespuesta | null>(null);
  const [almacen, setAlmacen] = useState<Almacen | null>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  useEffect(() => {
    if (!mensaje) return;
    const reloj = setTimeout(() => setMensaje(""), 4000);
    return () => clearTimeout(reloj);
  }, [mensaje]);
  const [guia, setGuia] = useState<EstadoCanal | null>(null);
  const cargar = useCallback(async () => {
    try {
      const c = await pedir<ConexionesRespuesta>("/api/granjas/conexiones");
      setDatos(c);
      // El almacenamiento local (rutas y respaldo) es solo del propietario.
      if (c.rol === "propietario") setAlmacen(await pedir<Almacen>("/api/granjas/almacenamiento"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void cargar());
  }, [cargar]);
  async function accion(clave: string, cuerpo: object, exito: string) {
    setOcupado(clave);
    setError("");
    setMensaje("");
    try {
      const r = await pedir<{ aviso?: string }>("/api/granjas/conexiones", cuerpo);
      setMensaje(r.aviso || exito);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
      await cargar();
    }
  }
  /** Abre el OAuth de la red; si falta configurar algo, muestra la guía. */
  function conectar(canal: EstadoCanal, alcance: "compartida" | "personal") {
    if (canal.configFaltante.length) return setGuia(canal);
    if (canal.canal === "spotmi")
      return void accion("spotmi", { accion: "conectar", canal: "spotmi" }, g("conectado"));
    window.location.assign(`/api/granjas/conexiones/${canal.canal}/autorizar?alcance=${alcance}`);
  }
  const esPropietario = datos?.rol === "propietario";

  return (
    <section className="eg-conexiones">
      <div className="ep-seccion-cabecera">
        <div>
          <h2>{g("redesTitulo")}</h2>
          <p>{g("cx_ayuda")}</p>
        </div>
      </div>
      {aviso && (
        <p className={aviso.endsWith(":ok") ? "ep-aviso" : "ep-alerta"} role="status">
          {aviso.endsWith(":ok") ? g("oauthOk") : g("oauthError")}
        </p>
      )}
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
        </p>
      )}
      {mensaje && (
        <p className="ep-aviso" role="status">
          {mensaje}
        </p>
      )}
      {datos && !datos.claveTokens && <p className="ep-nota">{g("faltaClaveTokens")}</p>}
      <div className="ep-conexiones">
        {esPropietario && <ConexionN8n g={g} fecha={fecha} />}
        {(datos?.canales ?? []).map((canal) => {
          const cuentas = (datos?.conexiones ?? []).filter((c) => c.canal === canal.canal);
          const compartidas = cuentas.filter((c) => c.alcance === "compartida");
          const personales = cuentas.filter((c) => c.alcance === "personal");
          const error = [canal.errorCompartida, canal.errorPersonal].filter(Boolean).join(" · ");
          return (
            <article className="ep-conexion eg-conexion" key={canal.canal}>
              <div className="ep-conexion-icono">{nombres[canal.canal].slice(0, 2)}</div>
              <div className="eg-conexion-cuerpo">
                <h3>{nombres[canal.canal]}</h3>
                <p className="eg-habilita">
                  <b>{g("habilita")}:</b> {g(`habilita_${canal.canal}`)}
                </p>
                {canal.configFaltante.length > 0 && (
                  <p className="ep-nota">
                    <b>{g("falta")}:</b> {g("faltaConfig")} {canal.configFaltante.join(", ")}
                  </p>
                )}
                {!cuentas.length && !canal.configFaltante.length && (
                  <p className="ep-nota">{g("cx_sinCuentas")}</p>
                )}
                {error && !cuentas.length && <p className="ep-nota">{error}</p>}
                {[
                  { titulo: g("cx_compartidas"), lista: compartidas },
                  { titulo: g("cx_tuyas"), lista: personales },
                ]
                  .filter((grupo) => grupo.lista.length)
                  .map((grupo) => (
                    <div key={grupo.titulo} className="cx-grupo">
                      <h4>{grupo.titulo}</h4>
                      <ul className="cx-cuentas">
                        {grupo.lista.map((c) => (
                          <CuentaConexion
                            key={c.id}
                            c={c}
                            g={g}
                            fecha={fecha}
                            ocupado={ocupado === c.id}
                            administra={c.alcance === "personal" || esPropietario}
                            onAccion={(cuerpo, exito) => void accion(c.id!, cuerpo, exito)}
                            onReconectar={() => conectar(canal, c.alcance)}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                {canal.canal === "tiktok" && <p className="ep-nota">{g("tiktokPolitica")}</p>}
                {canal.canal === "youtube" && <p className="ep-nota">{g("youtubePolitica")}</p>}
                <div className="ep-acciones">
                  {canal.puedeCompartida && (canal.canal !== "spotmi" || !compartidas.length) && (
                    <button
                      type="button"
                      className="ep-boton"
                      disabled={ocupado === canal.canal}
                      onClick={() => conectar(canal, "compartida")}
                    >
                      <Plug size={15} aria-hidden="true" />
                      {g(compartidas.length ? "cx_otraCompartida" : canal.canal === "spotmi" ? "conectarCuenta" : "cx_conectarCompartida")}
                    </button>
                  )}
                  {canal.puedePersonal && (
                    <button
                      type="button"
                      className="ep-boton"
                      disabled={ocupado === canal.canal}
                      onClick={() => conectar(canal, "personal")}
                    >
                      <Plug size={15} aria-hidden="true" />
                      {g(personales.length ? "cx_otraPersonal" : "cx_conectarPersonal")}
                    </button>
                  )}
                  {canal.configFaltante.length > 0 && (
                    <button type="button" className="ep-boton ep-texto" onClick={() => setGuia(canal)}>
                      {g("verGuia")}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {almacen && (
        <section className="eg-almacen" aria-label={g("almacenTitulo")}>
          <h2>
            <HardDrive size={18} /> {g("almacenTitulo")}
          </h2>
          <p>{g("almacenAyuda")}</p>
          <details className="eg-detalles-tecnicos">
            <summary>{g("detallesTecnicos")}</summary>
            <dl className="eg-datos">
              <dt>{g("almacenBase")}</dt>
              <dd>
                <code>{almacen.rutas.base}</code> · {megas(almacen.bytes.base)}
              </dd>
              <dt>{g("almacenMedios")}</dt>
              <dd>
                <code>{almacen.rutas.medios}</code> · {megas(almacen.bytes.medios)} ·{" "}
                {almacen.conteos.medios} {g("archivos")}
              </dd>
              <dt>{g("almacenEncargos")}</dt>
              <dd>
                <code>{almacen.rutas.encargos}</code>
              </dd>
              <dt>{g("almacenRespaldos")}</dt>
              <dd>
                <code>{almacen.rutas.respaldos}</code>
              </dd>
              <dt>{g("almacenConteos")}</dt>
              <dd>
                {almacen.conteos.granjas} {g("granjasMin")} · {almacen.conteos.ejecuciones}{" "}
                {g("ejecucionesMin")} · {almacen.conteos.artefactos} {g("resultadosMin")} ·{" "}
                {almacen.conteos.piezas} {g("piezasMin")}
              </dd>
              <dt>{g("almacenRemotos")}</dt>
              <dd>
                {almacen.remotos.length
                  ? almacen.remotos
                      .map(
                        (r) =>
                          `${nombres[r.canal as keyof typeof nombres]}: ${r.n} ${g(`rec_${r.estado}`)}`,
                      )
                      .join(" · ")
                  : g("ningunEnvio")}
              </dd>
              <dt>{g("almacenTrabajador")}</dt>
              <dd>{almacen.trabajador}</dd>
            </dl>
            <p className="ep-nota">{g("almacenLocal")}</p>
          </details>
          <a className="ep-boton" href="/api/granjas/almacenamiento?descargar=1">
            <Download size={15} />
            {g("descargarRespaldo")}
          </a>
        </section>
      )}

      <Modal
        open={Boolean(guia)}
        onClose={() => setGuia(null)}
        label={g("guiaTitulo")}
        className="ep-modal"
        dismissOnBackdrop
      >
        {guia && (
          <div className="eg-guia">
            <h2>
              {g("guiaTitulo")} · {nombres[guia.canal]}
            </h2>
            <p>{g(`guia_${guia.canal}`)}</p>
            {guia.canal === "facebook" && (
              <>
                <h3>{g("guia_lecturaTitulo")}</h3>
                <p>{g("guia_lecturaInstagram")}</p>
                <p>{g("guia_lecturaFacebook")}</p>
              </>
            )}
            {guia.canal === "tiktok" && <p className="ep-nota">{g("guia_lecturaTiktok")}</p>}
            <h3>{g("guiaFalta")}</h3>
            <ul>
              {guia.configFaltante.map((n) => (
                <li key={n}>
                  <code>{n}</code>
                </li>
              ))}
            </ul>
            {guia.redireccion && (
              <>
                <h3>{g("guiaRedireccion")}</h3>
                <code className="eg-bloque-codigo">{guia.redireccion}</code>
              </>
            )}
            <p className="ep-nota">{g("guiaSecretos")}</p>
            <button type="button" className="ep-boton" onClick={() => setGuia(null)}>
              {g("entendido")}
            </button>
          </div>
        )}
      </Modal>
    </section>
  );
}

/** Una cuenta conectada: estado, detalles técnicos y acciones (solo quien la administra la cambia). */
function CuentaConexion({
  c,
  g,
  fecha,
  ocupado,
  administra,
  onAccion,
  onReconectar,
}: {
  c: Conexion;
  g: (clave: string) => string;
  fecha: (iso: string) => string;
  ocupado: boolean;
  administra: boolean;
  onAccion: (cuerpo: object, exito: string) => void;
  onReconectar: () => void;
}) {
  return (
    <li className="cx-cuenta">
      <div className="cx-cuenta-cabeza">
        <strong>{c.identidad?.nombre ?? g("sinVerificar")}</strong>
        <span className={`ep-pill eg-con-${c.estado}`}>{g(`con_${c.estado}`)}</span>
      </div>
      {c.aviso && <p className="ep-nota">{c.aviso}</p>}
      <details className="eg-detalles-tecnicos">
        <summary>{g("detallesTecnicos")}</summary>
        <dl className="eg-datos">
          <dt>{g("cuenta")}</dt>
          <dd>
            {c.identidad
              ? `${c.identidad.nombre}${c.identidad.tipo ? ` · ${c.identidad.tipo}` : ""}`
              : g("sinVerificar")}
          </dd>
          <dt>{g("capacidades")}</dt>
          <dd>{c.capacidades.length ? c.capacidades.map((x) => g(`cap_${x}`)).join(", ") : "—"}</dd>
          <dt>{g("permisos")}</dt>
          <dd>{c.permisos.length ? c.permisos.join(", ") : "—"}</dd>
          <dt>{g("vence")}</dt>
          <dd>{c.expira ? fecha(c.expira) : "—"}</dd>
          <dt>{g("verificado")}</dt>
          <dd>{c.verificado ? fecha(c.verificado) : g("nunca")}</dd>
          <dt>{g("ultimoError")}</dt>
          <dd>
            {c.ultimoError
              ? `${c.ultimoError}${c.ultimoErrorFecha ? ` (${fecha(c.ultimoErrorFecha)})` : ""}`
              : "—"}
          </dd>
        </dl>
      </details>
      {c.canal === "facebook" && administra && c.opciones.length > 1 && (
        <label className="eg-campo">
          {g("paginaPublicar")}
          <select
            value={c.identidad?.id ?? ""}
            onChange={(e) =>
              e.target.value &&
              onAccion({ accion: "pagina", id: c.id, paginaId: e.target.value }, g("paginaElegida"))
            }
          >
            <option value="">{g("eligePagina")}</option>
            {c.opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre} {o.tareas.includes("CREATE_CONTENT") ? "" : `· ${g("sinPermisoPagina")}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="ep-acciones">
        {conectada(c) && (
          <button
            type="button"
            className="ep-boton ep-texto"
            disabled={ocupado}
            onClick={() => onAccion({ accion: "verificar", id: c.id }, g("verificadaOk"))}
          >
            <ShieldCheck size={15} aria-hidden="true" />
            {g("verificar")}
          </button>
        )}
        {administra && (
          <>
            <button type="button" className="ep-boton ep-texto" disabled={ocupado} onClick={onReconectar}>
              <RefreshCw size={15} aria-hidden="true" />
              {g("reconectar")}
            </button>
            <button
              type="button"
              className="ep-boton ep-texto eg-peligro"
              disabled={ocupado}
              onClick={() => onAccion({ accion: "desconectar", id: c.id }, g("desconectada"))}
            >
              <Unplug size={15} aria-hidden="true" />
              {g("desconectar")}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
