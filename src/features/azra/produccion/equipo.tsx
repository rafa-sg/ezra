"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, MailPlus, RefreshCw, Save, Send, UserMinus } from "lucide-react";
import { seccionesEquipo, type Miembro, type SeccionEquipo } from "@/lib/equipo/modelo";
import type { Solicitud } from "@/lib/equipo/solicitudes";
import { pedir } from "../granjas/cliente";
import "./equipo.css";

type Respuesta = { miembros: Miembro[] | null; aviso?: string };
type Borrador = { rol: "socio" | "invitado"; secciones: SeccionEquipo[]; soloLectura: boolean };
const etiquetaSeccion: Record<SeccionEquipo, string> = {
  inicio: "p_inicio",
  encargos: "p_encargos",
  granjas: "p_cola",
  eventos: "p_eventos",
  apps: "ez_apps",
  calendario: "p_calendario",
  conexiones: "p_conexiones",
  consumo: "p_consumo",
};

/** Casillas de secciones de un invitado (y su modo de solo lectura). */
function AccesoInvitado({
  valor,
  cambiar,
  tr,
  id,
}: {
  valor: Borrador;
  cambiar: (v: Borrador) => void;
  tr: (c: string) => string;
  id: string;
}) {
  return (
    <fieldset className="eq-secciones">
      <legend>{tr("eq_secciones")}</legend>
      {seccionesEquipo.map((s) => (
        <label key={s}>
          <input
            type="checkbox"
            checked={valor.secciones.includes(s)}
            onChange={(e) =>
              cambiar({
                ...valor,
                secciones: e.target.checked
                  ? [...valor.secciones, s]
                  : valor.secciones.filter((x) => x !== s),
              })
            }
          />
          {tr(etiquetaSeccion[s])}
        </label>
      ))}
      <label className="eq-solo-lectura" htmlFor={`${id}-lectura`}>
        <input
          id={`${id}-lectura`}
          type="checkbox"
          checked={valor.soloLectura}
          onChange={(e) => cambiar({ ...valor, soloLectura: e.target.checked })}
        />
        {tr("eq_soloLectura")}
      </label>
    </fieldset>
  );
}

/** Equipo e invitaciones (solo propietario): invitar, cambiar rol y quitar acceso. */
export function SeccionEquipo({ tr }: { tr: (c: string) => string }) {
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [nuevo, setNuevo] = useState<Borrador>({ rol: "socio", secciones: [], soloLectura: false });
  const [editando, setEditando] = useState<{ id: string; valor: Borrador } | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const correoInvitar = useRef<HTMLInputElement>(null);
  const cargar = useCallback(async () => {
    try {
      // Las solicitudes no deben impedir ver el equipo si fallan.
      void pedir<{ solicitudes: Solicitud[] }>("/api/equipo/solicitudes")
        .then((r) => setSolicitudes(r.solicitudes))
        .catch(() => setSolicitudes([]));
      setMiembros((await pedir<Respuesta>("/api/equipo")).miembros ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void cargar());
  }, [cargar]);
  async function enviar(cuerpo: object, despues?: () => void) {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      const r = await pedir<Respuesta>("/api/equipo", cuerpo);
      setMiembros(r.miembros ?? []);
      setAviso(r.aviso || tr("eq_guardado"));
      despues?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  const estado = (m: Miembro) =>
    m.estado === "invitado"
      ? tr("eq_pendiente")
      : m.estado === "retirado"
        ? tr("eq_retirado")
        : tr("eq_activo");
  const rol = (m: Miembro) => tr(`eq_rol_${m.rol}`);
  async function cambiarSolicitud(id: string, estado: "invitada" | "descartada") {
    try {
      setSolicitudes((await pedir<{ solicitudes: Solicitud[] }>("/api/equipo/solicitudes", { id, estado })).solicitudes);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="eq">
      {solicitudes && solicitudes.length > 0 && (
        <section className="eg-bloque">
          <h2 className="eg-subtitulo">
            {tr("eq_solicitudes")} · {solicitudes.length}
          </h2>
          <p className="ep-nota">{tr("eq_solicitudesAyuda")}</p>
          <ul className="eq-solicitudes">
            {solicitudes.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.nombre}</strong> <span>{s.email}</span>
                  {s.motivo && <p>{s.motivo}</p>}
                  <small>{new Date(s.creado).toLocaleString("es-SV", { timeZone: "America/El_Salvador" })}</small>
                </div>
                <div className="eq-solicitud-acciones">
                  <button
                    className="ep-boton ep-primario"
                    onClick={() => {
                      // Llena el formulario de invitación; tú eliges rol y secciones antes de enviar.
                      setEmail(s.email);
                      setNombre(s.nombre);
                      correoInvitar.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      correoInvitar.current?.focus();
                    }}
                  >
                    <MailPlus size={15} aria-hidden="true" />
                    {tr("eq_usarInvitacion")}
                  </button>
                  <button className="ep-boton" onClick={() => void cambiarSolicitud(s.id, "descartada")}>
                    {tr("eq_descartar")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="eg-bloque">
        <h2 className="eg-subtitulo">{tr("eq_invitar")}</h2>
        <form
          className="eq-form"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(
              { accion: "invitar", datos: { email, nombre, ...nuevo } },
              () => {
                // Si venía de una solicitud de acceso, queda como invitada.
                const pendiente = solicitudes?.find((x) => x.email === email.trim().toLowerCase());
                if (pendiente) void cambiarSolicitud(pendiente.id, "invitada");
                setEmail("");
                setNombre("");
                setNuevo({ rol: "socio", secciones: [], soloLectura: false });
              },
            );
          }}
        >
          <label className="eg-campo">
            {tr("eq_correo")}
            <input
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              ref={correoInvitar}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="eg-campo">
            {tr("eq_nombre")}
            <input maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="eg-campo">
            {tr("eq_rol")}
            <select
              value={nuevo.rol}
              onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value as Borrador["rol"] })}
            >
              <option value="socio">{tr("eq_rol_socio")}</option>
              <option value="invitado">{tr("eq_rol_invitado")}</option>
            </select>
          </label>
          {nuevo.rol === "invitado" && (
            <AccesoInvitado valor={nuevo} cambiar={setNuevo} tr={tr} id="eq-nuevo" />
          )}
          <p className="ep-nota">
            {tr(nuevo.rol === "socio" ? "eq_socioAyuda" : "eq_invitadoAyuda")}
          </p>
          <button className="ep-boton ep-primario" disabled={ocupado}>
            <MailPlus size={15} aria-hidden="true" />
            {tr("eq_enviarInvitacion")}
          </button>
        </form>
        <p className="ep-nota">
          {tr("eq_clerkAyuda")}{" "}
          <a
            href="https://dashboard.clerk.com/~/user-authentication/access-mode"
            target="_blank"
            rel="noreferrer"
          >
            {tr("eq_clerkEnlace")} <ExternalLink size={12} aria-hidden="true" />
          </a>
        </p>
      </section>
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
        </p>
      )}
      {aviso && !error && (
        <p className="ep-nota" role="status">
          {aviso}
        </p>
      )}
      <section className="eg-bloque">
        <div className="eg-bloque-cabecera">
          <h2 className="eg-subtitulo">{tr("eq_miembros")}</h2>
          <button className="ep-boton ep-texto" onClick={() => void cargar()}>
            <RefreshCw size={15} aria-hidden="true" />
            {tr("eq_actualizar")}
          </button>
        </div>
        {!miembros ? (
          <p className="ep-nota">{tr("eq_cargando")}</p>
        ) : (
          <ul className="eq-lista">
            {miembros.map((m) => (
              <li key={m.id} className="eq-fila" data-estado={m.estado}>
                <div className="eq-quien">
                  <strong>{m.nombre || m.email}</strong>
                  <small>{m.email}</small>
                </div>
                <div className="eq-etiquetas">
                  <span className="eq-chip">{rol(m)}</span>
                  <span className="eq-chip" data-estado={m.estado}>
                    {estado(m)}
                  </span>
                  {m.rol === "invitado" && (
                    <small>
                      {m.secciones.map((s) => tr(etiquetaSeccion[s])).join(" · ")}
                      {m.soloLectura ? ` · ${tr("eq_soloLecturaCorto")}` : ""}
                    </small>
                  )}
                </div>
                {m.rol !== "propietario" && m.estado !== "retirado" && (
                  <div className="eq-acciones">
                    <button
                      className="ep-boton ep-texto"
                      aria-expanded={editando?.id === m.id}
                      onClick={() =>
                        setEditando(
                          editando?.id === m.id
                            ? null
                            : {
                                id: m.id,
                                valor: {
                                  rol: m.rol as Borrador["rol"],
                                  secciones: m.secciones,
                                  soloLectura: m.soloLectura,
                                },
                              },
                        )
                      }
                    >
                      {tr("eq_cambiarRol")}
                    </button>
                    {m.estado === "invitado" && (
                      <button
                        className="ep-boton ep-texto"
                        disabled={ocupado}
                        onClick={() => void enviar({ accion: "reenviar", id: m.id })}
                      >
                        <Send size={14} aria-hidden="true" />
                        {tr("eq_reenviar")}
                      </button>
                    )}
                    {retirando === m.id ? (
                      <span className="eq-confirmar" role="group" aria-label={tr("eq_quitar")}>
                        <button
                          className="ep-boton ep-peligro"
                          disabled={ocupado}
                          onClick={() =>
                            void enviar({ accion: "retirar", id: m.id }, () => setRetirando(null))
                          }
                        >
                          {tr("eq_confirmarQuitar")}
                        </button>
                        <button className="ep-boton ep-texto" onClick={() => setRetirando(null)}>
                          {tr("eq_cancelar")}
                        </button>
                      </span>
                    ) : (
                      <button className="ep-boton ep-texto" onClick={() => setRetirando(m.id)}>
                        <UserMinus size={14} aria-hidden="true" />
                        {tr("eq_quitar")}
                      </button>
                    )}
                  </div>
                )}
                {editando?.id === m.id && (
                  <form
                    className="eq-editar"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void enviar(
                        { accion: "cambiar", datos: { id: m.id, ...editando.valor } },
                        () => setEditando(null),
                      );
                    }}
                  >
                    <label className="eg-campo">
                      {tr("eq_rol")}
                      <select
                        value={editando.valor.rol}
                        onChange={(e) =>
                          setEditando({
                            id: m.id,
                            valor: { ...editando.valor, rol: e.target.value as Borrador["rol"] },
                          })
                        }
                      >
                        <option value="socio">{tr("eq_rol_socio")}</option>
                        <option value="invitado">{tr("eq_rol_invitado")}</option>
                      </select>
                    </label>
                    {editando.valor.rol === "invitado" && (
                      <AccesoInvitado
                        valor={editando.valor}
                        cambiar={(v) => setEditando({ id: m.id, valor: v })}
                        tr={tr}
                        id={`eq-${m.id}`}
                      />
                    )}
                    <button className="ep-boton ep-primario" disabled={ocupado}>
                      <Save size={15} aria-hidden="true" />
                      {tr("eq_guardar")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
