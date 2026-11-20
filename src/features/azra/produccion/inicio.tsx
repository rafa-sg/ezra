"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import type { ResumenInicio } from "@/lib/produccion/inicio";
import type { EstadoOnboarding } from "@/lib/produccion/onboarding";

export type DestinoInicio = { seccion: "encargos" | "granjas" | "eventos" | "conexiones" | "consumo" | "calendario"; id?: string };

/** Estado (chip) y acción concreta de cada pendiente. */
const chipPendiente: Record<string, { clase: string; clave: string }> = {
  encargo_revision: { clase: "ep-chip-atencion", clave: "p_chip_revision" },
  encargo_cambios: { clase: "ep-chip-atencion", clave: "p_chip_cambios" },
  granja_error: { clase: "ep-chip-error", clave: "p_chip_bloqueo" },
  granja_revision: { clase: "ep-chip-atencion", clave: "p_chip_revision" },
  granja_manual: { clase: "ep-chip-proceso", clave: "p_chip_manual" },
  presupuesto: { clase: "ep-chip-error", clave: "p_chip_pausa" },
  eventos_nuevos: { clase: "ep-chip-proceso", clave: "p_chip_eventos" },
  imagenes: { clase: "ep-chip-atencion", clave: "p_chip_imagen" },
  posts: { clase: "ep-chip-proceso", clave: "p_chip_posts" },
};
const accionPendiente: Record<string, string> = {
  encargo_revision: "p_ac_revisar",
  encargo_cambios: "p_ac_abrir",
  granja_error: "p_ac_bloqueo",
  granja_revision: "p_ac_revisar",
  granja_manual: "p_ac_abrir",
  presupuesto: "p_ac_consumo",
  eventos_nuevos: "p_ac_eventos",
  imagenes: "p_ac_imagen",
  posts: "p_ac_posts",
};

/**
 * Inicio: lo que necesita tu atención primero (con el siguiente paso integrado), luego lo que está en
 * curso; fechas, aprobados y granjas como información secundaria. Todo sale de lo guardado.
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
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let vivo = true;
    fetch("/api/produccion/inicio", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Error");
        if (vivo) {
          setDatos(j as ResumenInicio);
          setError("");
        }
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [version, recarga]);
  const cabecera = (
    <div className="ep-seccion-cabecera">
      <div>
        <h1>{tr("p_inicioTitulo")}</h1>
        <p>{tr("p_inicioAyuda")}</p>
      </div>
      <div className="ep-acciones">
        <button className="ep-boton ep-texto" onClick={() => setRecarga((x) => x + 1)}>
          <RefreshCw size={15} />
          {tr("p_actualizar")}
        </button>
        <button className="ep-boton ep-primario" onClick={onNuevo}>
          <Plus size={16} />
          {tr("p_nuevo")}
        </button>
      </div>
    </div>
  );
  if (error)
    return (
      <div className="ep-inicio">
        {cabecera}
        <div className="ep-alerta" role="alert">
          {error}
          <button onClick={() => setRecarga((x) => x + 1)}>{tr("p_reintentar")}</button>
        </div>
      </div>
    );
  if (!datos)
    return (
      <div className="ep-inicio">
        {cabecera}
        <p role="status">{tr("p_cargando")}</p>
      </div>
    );
  const pasoGuia = guia?.paso ?? 1;
  const hechos = guia ? Math.min(5, guia.completado ? 5 : pasoGuia - 1) : 0;
  const conectadas = datos.conexiones.filter((c) => c.estado === "conectada_publicacion" || c.estado === "conectada_lectura").length;
  // Sin pendientes, el siguiente paso útil ocupa la primera fila (no se repite si ya es un pendiente).
  const sugerido = !datos.pendientes.length ? datos.siguiente : null;
  return (
    <div className="ep-inicio">
      {cabecera}

      {(!guia || !guia.completado) && (
        <details className="ep-guia-compacta">
          <summary>
            <span className="ep-guia-titulo">{tr("p_ob_titulo")}</span>
            <span className="ep-guia-cuenta">
              {hechos} / 5 {tr("p_ob_completados")}
            </span>
            <span className="ep-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={hechos} aria-label={tr("p_ob_progreso")}>
              <span style={{ width: `${(hechos / 5) * 100}%` }} />
            </span>
            <button
              className="ep-boton"
              onClick={(e) => {
                e.preventDefault();
                onGuia();
              }}
            >
              {tr(pasoGuia > 1 ? "p_ob_continuar" : "p_ob_empezar")}
            </button>
          </summary>
          <ol className="ep-guia-pasos">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n} className={n <= hechos ? "ep-hecho" : n === pasoGuia ? "ep-actual" : ""}>
                {tr(`p_ob_paso${n}`)}
                {n === 3 && guia?.configuracionOmitida ? ` · ${tr("p_ob_omitido")}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="ep-inicio-rejilla">
        <div className="ep-inicio-principal">
          <section aria-labelledby="ep-atencion">
            <h2 id="ep-atencion" className="ep-inicio-h2">
              {tr("p_atencion")}
              {datos.pendientes.length > 0 && <span className="ep-contador">{datos.pendientes.length}</span>}
            </h2>
            <ul className="ep-filas">
              {sugerido && (
                <li className="ep-fila ep-fila-sugerida">
                  <span className="ep-fila-texto">
                    <strong>{tr(`p_sp_${sugerido.accion}`)}</strong>
                    {sugerido.titulo && <small>{sugerido.titulo}</small>}
                  </span>
                  <span className="ep-chip ep-chip-neutro">{tr("p_siguientePaso")}</span>
                  <button
                    className="ep-boton"
                    onClick={() =>
                      sugerido.accion === "primer_encargo" || sugerido.accion === "nuevo_encargo" ? onNuevo() : onIr({ seccion: sugerido.seccion as DestinoInicio["seccion"], id: sugerido.id })
                    }
                  >
                    {tr(`p_spb_${sugerido.accion}`)}
                  </button>
                </li>
              )}
              {datos.pendientes.map((p, i) => (
                <li key={`${p.tipo}-${p.id ?? i}`} className={`ep-fila ${i === 0 ? "ep-fila-primera" : ""}`}>
                  <span className="ep-fila-texto">
                    <strong>{p.titulo}</strong>
                    <small>{p.detalle}</small>
                  </span>
                  <span className={`ep-chip ${chipPendiente[p.tipo]?.clase ?? "ep-chip-neutro"}`}>{tr(chipPendiente[p.tipo]?.clave ?? "p_chip_revision")}</span>
                  <button className="ep-boton" onClick={() => onIr({ seccion: p.seccion, id: p.id })}>
                    {tr(accionPendiente[p.tipo] ?? "p_ac_abrir")}
                  </button>
                </li>
              ))}
            </ul>
            {!datos.pendientes.length && !sugerido && <p className="ep-vacio-breve">{tr("p_atencionVacio")}</p>}
          </section>

          <section aria-labelledby="ep-encurso">
            <h2 id="ep-encurso" className="ep-inicio-h2">
              {tr("p_enCurso")}
              {datos.enCurso.length > 0 && <span className="ep-contador">{datos.enCurso.length}</span>}
            </h2>
            {!datos.enCurso.length ? (
              <p className="ep-vacio-breve">{tr("p_enCursoVacio")}</p>
            ) : (
              <ul className="ep-filas">
                {datos.enCurso.map((x) => (
                  <li key={`${x.tipo}-${x.id}`} className="ep-fila">
                    <span className="ep-fila-texto">
                      <strong>{x.titulo}</strong>
                      <small>{x.tipo === "encargo" ? tr(`p_sig_${x.detalle}`) : tr("p_ej_en_curso")}</small>
                    </span>
                    <span className="ep-chip ep-chip-proceso">{tr(x.tipo === "encargo" ? "p_chip_encargo" : "p_chip_granja")}</span>
                    <button className="ep-boton ep-texto" onClick={() => onIr({ seccion: x.seccion, id: x.tipo === "encargo" ? x.id : undefined })}>
                      {tr("p_ac_abrir")} <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="ep-inicio-lateral">
          <section aria-labelledby="ep-fechas">
            <h2 id="ep-fechas" className="ep-inicio-h3">
              {tr("p_proximas")}
              <button className="ep-enlace" onClick={() => onIr({ seccion: "calendario" })}>
                {tr("p_verCalendario")}
              </button>
            </h2>
            {!datos.proximas.length ? (
              <p className="ep-vacio-breve">{tr("p_proximasVacio")}</p>
            ) : (
              <ul className="ep-agenda-breve">
                {datos.proximas.slice(0, 6).map((x) => (
                  <li key={`${x.tipo}-${x.id}`}>
                    <time>
                      {new Intl.DateTimeFormat("es-SV", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${x.fecha.slice(0, 10)}T12:00:00Z`))}
                      {x.fecha.length > 10 && <small>{x.fecha.slice(11, 16)}</small>}
                    </time>
                    <span>
                      {x.tipo === "encargo" ? (
                        <button className="ep-enlace ep-enlace-titulo" onClick={() => onIr({ seccion: "encargos", id: x.id })}>
                          {x.titulo}
                        </button>
                      ) : (
                        <strong>{x.titulo}</strong>
                      )}
                      <small>{tr(x.tipo === "encargo" ? "p_ag_prevista" : "p_ag_evento")}</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="ep-aprobados">
            <h2 id="ep-aprobados" className="ep-inicio-h3">
              {tr("p_terminado")} <span className="ep-contador ep-contador-suave">{datos.encargos.porEstado.aprobado}</span>
            </h2>
            {!datos.terminados.length ? (
              <p className="ep-vacio-breve">{tr("p_terminadoVacio")}</p>
            ) : (
              <ul className="ep-lista-simple">
                {datos.terminados.map((e) => (
                  <li key={e.id}>
                    <button className="ep-enlace ep-enlace-titulo" onClick={() => onIr({ seccion: "encargos", id: e.id })}>
                      {e.titulo}
                    </button>
                    <small>
                      v{e.version} · {e.fechaPrevista ? fecha(e.fechaPrevista) : tr("p_sinFechaCorta")}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="ep-granjas">
            <h2 id="ep-granjas" className="ep-inicio-h3">
              {tr("p_granjasActivas")}
            </h2>
            {!datos.granjas.length ? (
              <p className="ep-vacio-breve">{tr("p_granjasVacio")}</p>
            ) : (
              <ul className="ep-lista-simple">
                {datos.granjas.map((g) => (
                  <li key={g.granjaId}>
                    <button className="ep-enlace ep-enlace-titulo" onClick={() => onIr({ seccion: "granjas", id: g.granjaId })}>
                      {g.nombre}
                    </button>
                    <small>
                      <span className={`ep-punto ep-ej-${g.ultima?.estado ?? "nunca"}`} aria-hidden="true" />
                      {g.ultima ? `${tr(`p_ej_${g.ultima.estado}`)} · ${fecha(g.ultima.creado)}` : tr("p_sinEjecuciones")}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="ep-inicio-pie">
            <button className="ep-enlace" onClick={() => onIr({ seccion: "conexiones" })}>
              {tr("p_conexiones")}: {conectadas}/{datos.conexiones.length}
            </button>
            <span>
              {tr("p_consumoHoy")}: {new Intl.NumberFormat("es-SV").format(datos.consumo.dia.usado)} {tr("p_tokens")}
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}
