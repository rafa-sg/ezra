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

/** Tarjetas reales por canal. Nada aparece como conectado sin una verificación del servidor. */
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
  const [guia, setGuia] = useState<Conexion | null>(null);
  const cargar = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([
        pedir<ConexionesRespuesta>("/api/granjas/conexiones"),
        pedir<Almacen>("/api/granjas/almacenamiento"),
      ]);
      setDatos(c);
      setAlmacen(a);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<ConexionesRespuesta>("/api/granjas/conexiones"),
      pedir<Almacen>("/api/granjas/almacenamiento"),
    ])
      .then(([c, a]) => {
        if (!vivo) return;
        setDatos(c);
        setAlmacen(a);
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);
  async function accion(canal: string, cuerpo: object, exito: string) {
    setOcupado(canal);
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
  function conectar(c: Conexion) {
    if (c.configFaltante.length) return setGuia(c);
    if (c.canal === "spotmi")
      return void accion("spotmi", { accion: "conectar", canal: "spotmi" }, g("conectado"));
    window.location.assign(`/api/granjas/conexiones/${c.canal}/autorizar`);
  }

  return (
    <section className="eg-conexiones">
      <div className="ep-seccion-cabecera">
        <div>
          <h2>{g("redesTitulo")}</h2>
          <p>{g("redesAyuda")}</p>
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
        <ConexionN8n g={g} fecha={fecha} />
        {(datos?.conexiones ?? []).map((c) => (
          <article className="ep-conexion eg-conexion" key={c.canal}>
            <div className="ep-conexion-icono">{nombres[c.canal].slice(0, 2)}</div>
            <div className="eg-conexion-cuerpo">
              <h3>{nombres[c.canal]}</h3>
              <span className={`ep-pill eg-con-${c.estado}`}>{g(`con_${c.estado}`)}</span>
              <p className="eg-habilita">
                <b>{g("habilita")}:</b> {g(`habilita_${c.canal}`)}
              </p>
              {!c.verificado && !c.identidad && (
                <p className="ep-nota">
                  <b>{g("falta")}:</b> {c.configFaltante.length ? `${g("faltaConfig")} ${c.configFaltante.join(", ")}` : g("faltaConectar")}
                </p>
              )}
              {(c.verificado || c.identidad) && (
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
                <dd>
                  {c.capacidades.length ? c.capacidades.map((x) => g(`cap_${x}`)).join(", ") : "—"}
                </dd>
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
              )}
              {c.aviso && <p className="ep-nota">{c.aviso}</p>}
              {c.canal === "tiktok" && <p className="ep-nota">{g("tiktokPolitica")}</p>}
              {c.canal === "facebook" && c.opciones.length > 1 && (
                <label className="eg-campo">
                  {g("paginaPublicar")}
                  <select
                    value={c.identidad?.id ?? ""}
                    onChange={(e) =>
                      e.target.value &&
                      void accion(
                        "facebook",
                        { accion: "pagina", paginaId: e.target.value },
                        g("paginaElegida"),
                      )
                    }
                  >
                    <option value="">{g("eligePagina")}</option>
                    {c.opciones.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre}{" "}
                        {o.tareas.includes("CREATE_CONTENT") ? "" : `· ${g("sinPermisoPagina")}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="ep-acciones">
                {["sin_configurar", "requiere_oauth"].includes(c.estado) ? (
                  <button
                    type="button"
                    className="ep-boton"
                    disabled={ocupado === c.canal}
                    onClick={() => conectar(c)}
                  >
                    <Plug size={15} />
                    {g("conectarCuenta")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ep-boton"
                      disabled={ocupado === c.canal}
                      onClick={() =>
                        void accion(
                          c.canal,
                          { accion: "verificar", canal: c.canal },
                          g("verificadaOk"),
                        )
                      }
                    >
                      <ShieldCheck size={15} />
                      {g("verificar")}
                    </button>
                    <button
                      type="button"
                      className="ep-boton"
                      disabled={ocupado === c.canal}
                      onClick={() => conectar(c)}
                    >
                      <RefreshCw size={15} />
                      {g("reconectar")}
                    </button>
                    <button
                      type="button"
                      className="ep-boton eg-peligro"
                      disabled={ocupado === c.canal}
                      onClick={() =>
                        void accion(
                          c.canal,
                          { accion: "desconectar", canal: c.canal },
                          g("desconectada"),
                        )
                      }
                    >
                      <Unplug size={15} />
                      {g("desconectar")}
                    </button>
                  </>
                )}
                {c.configFaltante.length > 0 && (
                  <button type="button" className="ep-boton ep-texto" onClick={() => setGuia(c)}>
                    {g("verGuia")}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
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
