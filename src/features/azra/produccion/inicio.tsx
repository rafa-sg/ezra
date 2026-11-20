"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Compass, Inbox, RefreshCw, Workflow } from "lucide-react";
import type { ResumenInicio } from "@/lib/produccion/inicio";
import type { EstadoOnboarding } from "@/lib/produccion/onboarding";

export type DestinoInicio = { seccion: "encargos" | "granjas" | "eventos" | "conexiones" | "consumo" | "calendario"; id?: string };

/**
 * Inicio: lo que necesita tu atención y lo que viene, leído de los datos guardados. Cada fila lleva
 * a la pantalla donde se resuelve; nada aquí aprueba ni publica.
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
  /** Cambia cuando el estudio guarda algo: el inicio se vuelve a leer. */
  version: number;
}) {
  const [datos, setDatos] = useState<ResumenInicio | null>(null);
  const [error, setError] = useState("");
  const cargar = useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/produccion/inicio", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? tr("p_error"));
      setDatos(j as ResumenInicio);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tr]);
  useEffect(() => {
    let vivo = true;
    fetch("/api/produccion/inicio", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Error");
        if (vivo) setDatos(j as ResumenInicio);
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [version]);
  if (error)
    return (
      <div className="ep-alerta" role="alert">
        {error}
        <button onClick={() => void cargar()}>{tr("p_reintentar")}</button>
      </div>
    );
  if (!datos) return <p role="status">{tr("p_cargando")}</p>;
  const pasosGuia = ["p_ob_paso1", "p_ob_paso2", "p_ob_paso3", "p_ob_paso4", "p_ob_paso5"];
  const conectadas = datos.conexiones.filter((c) => c.estado === "conectada_publicacion" || c.estado === "conectada_lectura").length;
  return (
    <div className="ep-inicio">
      <div className="ep-seccion-cabecera">
        <div>
          <p className="ep-eyebrow">{tr("p_inicio")}</p>
          <h1>{tr("p_inicioTitulo")}</h1>
          <p>{tr("p_inicioAyuda")}</p>
        </div>
        <div className="ep-acciones">
          <button className="ep-boton ep-texto" onClick={() => void cargar()}>
            <RefreshCw size={15} />
            {tr("p_actualizar")}
          </button>
        </div>
      </div>

      {(!guia || !guia.completado) && (
        <section className="ep-guia-tarjeta" aria-label={tr("p_ob_titulo")}>
          <Compass size={26} aria-hidden="true" />
          <div>
            <h2>{tr("p_ob_titulo")}</h2>
            <p>{tr("p_ob_ayuda")}</p>
            <ol className="ep-guia-progreso">
              {pasosGuia.map((p, i) => {
                const n = i + 1;
                const hecho = guia ? n < guia.paso || (n === 5 && Boolean(guia.completado)) : false;
                return (
                  <li key={p} className={hecho ? "ep-hecho" : guia?.paso === n ? "ep-actual" : ""}>
                    {hecho ? <CheckCircle2 size={14} aria-hidden="true" /> : <span>{n}</span>}
                    {tr(p)}
                    {n === 3 && guia?.configuracionOmitida ? ` · ${tr("p_ob_omitido")}` : ""}
                  </li>
                );
              })}
            </ol>
          </div>
          <button className="ep-boton ep-primario" onClick={onGuia}>
            {tr(guia && guia.paso > 1 ? "p_ob_continuar" : "p_ob_empezar")}
            <ArrowRight size={16} />
          </button>
        </section>
      )}

      <section className="ep-siguiente-paso" aria-label={tr("p_siguientePaso")}>
        <div>
          <p className="ep-siguiente-etiqueta">{tr("p_siguientePaso")}</p>
          <h2>{tr(`p_sp_${datos.siguiente.accion}`)}</h2>
          {datos.siguiente.titulo && <p>{datos.siguiente.titulo}</p>}
        </div>
        <button
          className="ep-boton ep-primario"
          onClick={() =>
            datos.siguiente.accion === "primer_encargo" || datos.siguiente.accion === "nuevo_encargo"
              ? onNuevo()
              : onIr({ seccion: datos.siguiente.seccion as DestinoInicio["seccion"], id: datos.siguiente.id })
          }
        >
          {tr(`p_spb_${datos.siguiente.accion}`)}
          <ArrowRight size={16} />
        </button>
      </section>

      <div className="ep-inicio-columnas ep-inicio-tres">
        <section className="ep-inicio-bloque ep-bloque-atencion">
          <h2>
            <Inbox size={18} aria-hidden="true" />
            {tr("p_atencion")}
            <span className="ep-chip ep-chip-atencion">{datos.pendientes.length}</span>
          </h2>
          {!datos.pendientes.length ? (
            <p className="ep-nota">{tr("p_atencionVacio")}</p>
          ) : (
            <ul className="ep-inicio-lista">
              {datos.pendientes.map((p, i) => (
                <li key={`${p.tipo}-${p.id ?? i}`}>
                  <button onClick={() => onIr({ seccion: p.seccion, id: p.id })}>
                    {p.tipo === "granja_error" || p.tipo === "presupuesto" ? <AlertTriangle size={16} aria-hidden="true" className="ep-icono-error" /> : <ArrowRight size={16} aria-hidden="true" />}
                    <span>
                      <strong>{p.titulo}</strong>
                      <small>{p.detalle}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="ep-inicio-bloque ep-bloque-proceso">
          <h2>
            <Workflow size={18} aria-hidden="true" />
            {tr("p_enCurso")}
            <span className="ep-chip ep-chip-proceso">{datos.enCurso.length}</span>
          </h2>
          {!datos.enCurso.length ? (
            <p className="ep-nota">{tr("p_enCursoVacio")}</p>
          ) : (
            <ul className="ep-inicio-lista">
              {datos.enCurso.map((x) => (
                <li key={`${x.tipo}-${x.id}`}>
                  <button onClick={() => onIr({ seccion: x.seccion, id: x.tipo === "encargo" ? x.id : undefined })}>
                    <ArrowRight size={16} aria-hidden="true" />
                    <span>
                      <strong>{x.titulo}</strong>
                      <small>{x.tipo === "encargo" ? tr(`p_sig_${x.detalle}`) : tr("p_ej_en_curso")}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="ep-inicio-bloque ep-bloque-hecho">
          <h2>
            <CheckCircle2 size={18} aria-hidden="true" />
            {tr("p_terminado")}
            <span className="ep-chip ep-chip-hecho">{datos.encargos.porEstado.aprobado}</span>
          </h2>
          {!datos.terminados.length ? (
            <p className="ep-nota">{tr("p_terminadoVacio")}</p>
          ) : (
            <ul className="ep-inicio-lista">
              {datos.terminados.map((e) => (
                <li key={e.id}>
                  <button onClick={() => onIr({ seccion: "encargos", id: e.id })}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span>
                      <strong>{e.titulo}</strong>
                      <small>
                        v{e.version} · {e.fechaPrevista ? `${tr("p_fechaPrevistaCorta")}: ${fecha(e.fechaPrevista)}` : tr("p_sinFechaCorta")}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="ep-inicio-columnas">
        <section className="ep-inicio-bloque">
          <h2>
            <CalendarDays size={18} aria-hidden="true" />
            {tr("p_proximas")}
          </h2>
          {!datos.proximas.length ? (
            <p className="ep-nota">{tr("p_proximasVacio")}</p>
          ) : (
            <ul className="ep-inicio-lista">
              {datos.proximas.slice(0, 8).map((x) => (
                <li key={`${x.tipo}-${x.id}`}>
                  <button onClick={() => onIr(x.tipo === "encargo" ? { seccion: "encargos", id: x.id } : { seccion: "calendario" })}>
                    <time>{x.fecha.length === 10 ? new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${x.fecha}T12:00:00Z`)) : fecha(x.fecha)}</time>
                    <span>
                      <strong>{x.titulo}</strong>
                      <small>{tr(x.tipo === "encargo" ? "p_fechaPrevistaCorta" : "p_eventoAprobado")}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="ep-inicio-bloque">
          <h2>
            <Workflow size={18} aria-hidden="true" />
            {tr("p_granjasActivas")}
          </h2>
          {!datos.granjas.length ? (
            <p className="ep-nota">{tr("p_granjasVacio")}</p>
          ) : (
            <ul className="ep-inicio-lista">
              {datos.granjas.map((g) => (
                <li key={g.granjaId}>
                  <button onClick={() => onIr({ seccion: "granjas", id: g.granjaId })}>
                    <span className={`ep-estado-ejecucion ep-ej-${g.ultima?.estado ?? "nunca"}`} aria-hidden="true" />
                    <span>
                      <strong>{g.nombre}</strong>
                      <small>{g.ultima ? `${tr(`p_ej_${g.ultima.estado}`) || g.ultima.estado} · ${fecha(g.ultima.creado)}` : tr("p_sinEjecuciones")}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="ep-nota ep-inicio-pie">
          <button className="ep-enlace" onClick={() => onIr({ seccion: "conexiones" })}>
            {tr("p_conexiones")}: {conectadas}/{datos.conexiones.length} {tr("p_conectadasComprobadas")}
          </button>{" "}
          · {tr("p_consumoHoy")}: {new Intl.NumberFormat("es-SV").format(datos.consumo.dia.usado)} {tr("p_tokens")}
          {datos.consumo.dia.limite ? ` / ${new Intl.NumberFormat("es-SV").format(datos.consumo.dia.limite)}` : ""} · {tr("p_imagenesIA")} {datos.consumo.imagenesIA.hoy}/{datos.consumo.imagenesIA.limite}
        </p>
      </div>
    </div>
  );
}
