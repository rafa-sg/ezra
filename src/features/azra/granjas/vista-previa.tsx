"use client";
import { useState } from "react";
import { Check, Eye, Send, ShieldCheck, ExternalLink } from "lucide-react";
import { CONFIRMACION_PUBLICAR, type ContenidoPieza } from "@/lib/granjas/pieza";
import type { Conexion, MedioResumen, VistaPieza } from "./cliente";

const nombres = {
  spotmi: "Spotmi web",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
} as const;
type Canal = keyof typeof nombres;
type Simulacion = {
  destinos: {
    canal: Canal;
    conexionId: string | null;
    alcance: "compartida" | "personal";
    cuenta: { id: string; nombre: string } | null;
    problemas: string[];
    plan: string[];
  }[];
  aviso: string;
  aprobada: boolean;
};

/** Vista previa por canal, aprobación de un hash concreto y autorización explícita por cuenta. */
export function VistaPrevia({
  vista,
  conexiones,
  medios,
  ocupado,
  g,
  fecha,
  onGuardar,
  onAprobar,
  onSimular,
  onAutorizar,
  onResolver,
}: {
  vista: VistaPieza;
  conexiones: Conexion[];
  medios: MedioResumen[];
  ocupado: boolean;
  g: (clave: string) => string;
  fecha: (iso: string) => string;
  onGuardar: (contenido: ContenidoPieza) => Promise<void>;
  onAprobar: (c: { hechos: boolean; derechos: boolean; marca: boolean }) => void;
  /** Destinos = ids de conexión: se pueden elegir varias cuentas de la misma red. */
  onSimular: (destinos: string[]) => Promise<Simulacion | null>;
  onAutorizar: (destinos: string[], confirmacion: string) => void;
  onResolver: (reciboId: string, resultado: "no_publicado" | "publicado", enlace: string) => void;
}) {
  const { pieza } = vista;
  const [borrador, setBorrador] = useState<ContenidoPieza>(pieza.contenido);
  const [base, setBase] = useState(pieza.hash);
  if (base !== pieza.hash) {
    setBase(pieza.hash);
    setBorrador(pieza.contenido);
  }
  const [comprobado, setComprobado] = useState({ hechos: false, derechos: false, marca: false });
  const [destinos, setDestinos] = useState<string[]>([]);
  const [simulacion, setSimulacion] = useState<Simulacion | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [resolucion, setResolucion] = useState<Record<string, string>>({});
  const modificado = JSON.stringify(borrador) !== JSON.stringify(pieza.contenido);
  const cuentasDe = (c: Canal) =>
    conexiones.filter(
      (x) => x.canal === c && x.id && ["conectada_publicacion", "conectada_lectura", "restringida", "vencida"].includes(x.estado),
    );
  const cuenta = (c: Canal) => cuentasDe(c)[0];
  const texto = (c: Canal) => (borrador.textos as Record<string, string>)[c] ?? "";
  const medioDe = (id: string) =>
    vista.medios.find((m) => m.id === id) ?? medios.find((m) => m.id === id);

  return (
    <section className="eg-vista" aria-label={g("vistaPrevia")}>
      <div className="eg-vista-cabecera">
        <div>
          <p className="ep-eyebrow">{g("vistaPrevia")}</p>
          <h3>{pieza.contenido.titulo}</h3>
          <p className="ep-nota">
            {g("version")} {pieza.version} · {g("huella")} <code>{pieza.hash.slice(0, 12)}</code> ·{" "}
            {vista.aprobada ? g("aprobadaEsta") : g("sinAprobar")}
          </p>
        </div>
        <span className={`ep-pill ${vista.aprobada ? "eg-ok" : ""}`}>
          {vista.aprobada ? g("aprobada") : g("borrador")}
        </span>
      </div>

      <div className="eg-canales-vista">
        {borrador.canales.map((c) => {
          const con = cuenta(c);
          return (
            <article key={c} className="eg-tarjeta-canal">
              <header>
                <strong>{nombres[c]}</strong>
                <span className="ep-nota">
                  {con?.identidad ? con.identidad.nombre : g("sinCuenta")}
                </span>
              </header>
              {borrador.medios.map((m) => {
                const medio = medioDe(m.id);
                return medio?.mime.startsWith("video/") ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption -- vista interna de medios propios; los subtítulos vienen en el material
                  <video
                    key={m.id}
                    className="eg-medio"
                    src={`/api/granjas/medios/${m.id}`}
                    controls
                    preload="metadata"
                  />
                ) : (
                  <img
                    key={m.id}
                    className="eg-medio"
                    src={`/api/granjas/medios/${m.id}`}
                    alt={medio?.nombre ?? ""}
                  />
                );
              })}
              {!borrador.medios.length && <p className="eg-sin-medio">{g("sinMedioPieza")}</p>}
              {c === "tiktok" ? <p className="ep-nota">{g("tiktokBorradorAyuda")}</p> : null}
              {/* YouTube: título = título de la pieza; descripción = texto de Instagram (o Facebook). Siempre en privado. */}
              {c === "youtube" ? (
                <p className="ep-nota">{g("youtubeBorradorAyuda")}</p>
              ) : (
                <label className="eg-campo">
                  {g("textoCanal")} ({texto(c).length})
                  <textarea
                    rows={5}
                    value={texto(c)}
                    onChange={(e) =>
                      setBorrador({
                        ...borrador,
                        textos: { ...borrador.textos, [c]: e.target.value },
                      })
                    }
                  />
                </label>
              )}
              {c === "spotmi" && (
                <div className="eg-dos">
                  {(["titulo", "fecha", "lugar", "departamento", "fuente"] as const).map(
                    (campo) => (
                      <label className="eg-campo" key={campo}>
                        {g(`spotmi_${campo}`)}
                        <input
                          type={campo === "fecha" ? "date" : campo === "fuente" ? "url" : "text"}
                          value={borrador.spotmi[campo]}
                          onChange={(e) =>
                            setBorrador({
                              ...borrador,
                              spotmi: { ...borrador.spotmi, [campo]: e.target.value },
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="eg-dos">
        <label className="eg-campo">
          {g("creditos")}
          <input
            value={borrador.divulgaciones.creditos}
            maxLength={500}
            onChange={(e) =>
              setBorrador({
                ...borrador,
                divulgaciones: { ...borrador.divulgaciones, creditos: e.target.value },
              })
            }
          />
          {borrador.divulgaciones.imagenGenerada && (
            <span className="ep-nota">{g("declaraGenerada")}</span>
          )}
        </label>
        <label className="eg-campo">
          {g("enlace")}
          <input
            type="url"
            value={borrador.enlaces[0] ?? ""}
            onChange={(e) =>
              setBorrador({ ...borrador, enlaces: e.target.value ? [e.target.value] : [] })
            }
          />
        </label>
        <fieldset className="eg-campo">
          <legend>{g("cuando")}</legend>
          <label className="ep-checkbox">
            <input
              type="radio"
              name={`cuando-${pieza.id}`}
              checked={borrador.programacion.tipo === "ahora"}
              onChange={() => setBorrador({ ...borrador, programacion: { tipo: "ahora" } })}
            />
            {g("alAutorizar")}
          </label>
          <label className="ep-checkbox">
            <input
              type="radio"
              name={`cuando-${pieza.id}`}
              checked={borrador.programacion.tipo === "local"}
              onChange={() =>
                setBorrador({
                  ...borrador,
                  programacion: {
                    tipo: "local",
                    fecha: new Date(Date.now() + 3600000 - 6 * 3600000).toISOString().slice(0, 16),
                  },
                })
              }
            />
            {g("horaLocal")}
          </label>
          {borrador.programacion.tipo === "local" && (
            <input
              type="datetime-local"
              aria-label={g("horaLocal")}
              value={borrador.programacion.fecha}
              onChange={(e) =>
                setBorrador({ ...borrador, programacion: { tipo: "local", fecha: e.target.value } })
              }
            />
          )}
          <span className="ep-nota">{g("programacionAyuda")}</span>
        </fieldset>
      </div>
      {borrador.fuentes.length > 0 && (
        <details>
          <summary>
            {g("fuentesPieza")} ({borrador.fuentes.length})
          </summary>
          <ul>
            {borrador.fuentes.map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noreferrer">
                  {f.nombre}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      {modificado && (
        <div className="ep-acciones">
          <button
            type="button"
            className="ep-boton ep-primario"
            disabled={ocupado}
            onClick={() => void onGuardar(borrador)}
          >
            {g("guardarVersionPieza")}
          </button>
          <button type="button" className="ep-boton" onClick={() => setBorrador(pieza.contenido)}>
            {g("descartar")}
          </button>
          <p className="ep-nota">{g("editarInvalida")}</p>
        </div>
      )}

      {!vista.aprobada && !modificado && (
        <div className="eg-bloque">
          <h4>
            <ShieldCheck size={16} /> {g("aprobarContenido")}
          </h4>
          {(["hechos", "derechos", "marca"] as const).map((c) => (
            <label className="ep-checkbox" key={c}>
              <input
                type="checkbox"
                checked={comprobado[c]}
                onChange={(e) => setComprobado({ ...comprobado, [c]: e.target.checked })}
              />
              {g(`comprobar_${c}`)}
            </label>
          ))}
          <button
            type="button"
            className="ep-boton ep-primario"
            disabled={ocupado || !Object.values(comprobado).every(Boolean)}
            onClick={() => onAprobar(comprobado)}
          >
            <Check size={15} />
            {g("aprobarVersion")} {pieza.version}
          </button>
        </div>
      )}

      <div className="eg-bloque">
        <h4>{g("destinosPublicar")}</h4>
        <div className="ep-canales">
          {borrador.canales.map((c) => {
            const lista = cuentasDe(c);
            if (!lista.length)
              return (
                <p key={c} className="ep-nota">
                  {nombres[c]} · {g("sinCuenta")}
                </p>
              );
            return lista.map((con) => (
              <label className="ep-checkbox" key={con.id}>
                <input
                  type="checkbox"
                  checked={destinos.includes(con.id!)}
                  onChange={(e) => {
                    setSimulacion(null);
                    setDestinos(
                      e.target.checked
                        ? [...destinos, con.id!]
                        : destinos.filter((x) => x !== con.id),
                    );
                  }}
                />
                {nombres[c]} · {con.identidad?.nombre ?? g("sinCuenta")} ·{" "}
                {g(con.alcance === "personal" ? "cx_personal" : "cx_compartida")} (
                {g(`con_${con.estado}`)})
              </label>
            ));
          })}
        </div>
        <button
          type="button"
          className="ep-boton"
          disabled={ocupado || !destinos.length || modificado}
          onClick={async () => setSimulacion(await onSimular(destinos))}
        >
          <Eye size={15} />
          {g("simular")}
        </button>
        {simulacion && (
          <div className="eg-simulacion" role="status">
            <p className="ep-nota">{simulacion.aviso}</p>
            {simulacion.destinos.map((d) => (
              <div
                key={d.conexionId ?? d.canal}
                className={d.problemas.length ? "eg-sim-mal" : "eg-sim-bien"}
              >
                <strong>
                  {nombres[d.canal]} · {d.cuenta?.nombre ?? g("sinCuenta")}
                </strong>
                {d.problemas.length ? (
                  <ul>
                    {d.problemas.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{g("listoParaEnviar")}</p>
                )}
                {d.plan.length > 0 && (
                  <details>
                    <summary>{g("queSeEnviaria")}</summary>
                    <ol>
                      {d.plan.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
        {vista.aprobada && !modificado && (
          <div className="eg-autorizar">
            <p className="ep-nota">{g("autorizarAyuda")}</p>
            <label className="eg-campo">
              {g("escribePublicar")}
              <input
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="ep-boton eg-peligro"
              disabled={ocupado || !destinos.length || confirmacion !== CONFIRMACION_PUBLICAR}
              onClick={() => (onAutorizar(destinos, confirmacion), setConfirmacion(""))}
            >
              <Send size={15} />
              {g("autorizarPublicacion")}
            </button>
          </div>
        )}
      </div>

      {vista.recibos.length > 0 && (
        <div className="eg-bloque">
          <h4>{g("recibos")}</h4>
          <ul className="eg-recibos">
            {vista.recibos.map((r) => (
              <li key={r.id}>
                <span className={`eg-estado eg-rec-${r.estado}`}>{g(`rec_${r.estado}`)}</span>
                <strong>{nombres[r.canal]}</strong> · {r.cuenta} · {fecha(r.actualizado)}
                {r.enlace && (
                  <a href={r.enlace} target="_blank" rel="noreferrer">
                    {g("abrir")} <ExternalLink size={13} />
                  </a>
                )}
                {r.remotoId && <code>{r.remotoId}</code>}
                {r.error && <p className="ep-nota">{r.error}</p>}
                {r.estado === "desconocido" && (
                  <div className="eg-fuente">
                    <input
                      aria-label={g("enlaceComprobado")}
                      placeholder={g("enlaceComprobado")}
                      value={resolucion[r.id] ?? ""}
                      onChange={(e) => setResolucion({ ...resolucion, [r.id]: e.target.value })}
                    />
                    <button
                      type="button"
                      className="ep-boton"
                      onClick={() => onResolver(r.id, "publicado", resolucion[r.id] ?? "")}
                    >
                      {g("siSePublico")}
                    </button>
                    <button
                      type="button"
                      className="ep-boton"
                      onClick={() => onResolver(r.id, "no_publicado", "")}
                    >
                      {g("noSePublico")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
