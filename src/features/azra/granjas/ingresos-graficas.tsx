"use client";
/**
 * Gráficas debajo del mapa: «Cruces por frontera» (una barra por puesto con dato) e «Ingresos del mes
 * por nacionalidad» (entradas registradas por la DGME). Sin dato no hay barra: «Datos aún no disponibles».
 */
import { useState, type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { ACCESOS, type Acceso } from "@/lib/granjas/datos-pais";
import type { ResumenIngresos } from "@/lib/granjas/ingresos";
import "./ingresos-graficas.css";

type Tr = (c: string) => string;
const numero = new Intl.NumberFormat("es-SV");
const nombreMes = (m: string) =>
  new Intl.DateTimeFormat("es-SV", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${m}-15T12:00:00Z`),
  );

export function GraficasIngresos({
  ingresos,
  mes,
  setMes,
  accesoElegido,
  puestoElegido,
  onPuesto,
  onCargado,
  tr,
}: {
  ingresos: ResumenIngresos | null;
  mes: string | null;
  setMes: (m: string | null) => void;
  accesoElegido: Acceso["id"] | null;
  puestoElegido: string | null;
  onPuesto: (acceso: Acceso["id"], id: string) => void;
  onCargado: () => void;
  tr: Tr;
}) {
  const nac = ingresos?.nacionalidad;
  const series = [
    ["guatemalteca", nac?.guatemalteca ?? null],
    ["hondureña", nac?.hondureña ?? null],
  ] as const;
  const maxNac = Math.max(1, ...series.map(([, c]) => c?.valor ?? 0));
  const corte = ingresos?.corte;
  const mesActual = ingresos?.mes ?? mes;
  return (
    <section className="ez-mpg" aria-labelledby="ez-mpg-titulo">
      <header className="ez-mpg-cabeza">
        <h3 id="ez-mpg-titulo">{tr("ez_mpg_titulo")}</h3>
        <label className="ez-mpg-mes">
          <span>{tr("ez_mpg_mes")}</span>
          <select
            value={mesActual ?? ""}
            disabled={!ingresos?.meses.length}
            onChange={(e) => setMes(e.target.value || null)}
          >
            {!ingresos?.meses.length && <option value="">{tr("ez_mpv_sinDatos")}</option>}
            {ingresos?.meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="ez-mpg-grupo">
        <h4>{tr("ez_mpg_cruces")}</h4>
        <p className="ez-mpg-nota">{tr("ez_mpg_crucesNota")}</p>
        <div className="ez-mpg-pares">
          {ACCESOS.filter((a) => a.tipo === "terrestre").map((a) => {
            const filas = a.puestos.map((p) => ({ p, c: ingresos?.cruces[p.id] ?? null }));
            const max = Math.max(1, ...filas.map((f) => f.c?.valor ?? 0));
            const hay = filas.some((f) => f.c);
            return (
              <figure
                key={a.id}
                className={`ez-mpg-grafica ez-mpg-${a.id} ${accesoElegido === a.id ? "ez-mpg-elegida" : ""} ${accesoElegido && accesoElegido !== a.id ? "ez-mpg-tenue" : ""}`}
              >
                <figcaption>{a.nombre}</figcaption>
                <ul>
                  {filas.map(({ p, c }) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={puestoElegido === p.id ? "ez-mpg-barra-elegida" : ""}
                        aria-pressed={puestoElegido === p.id}
                        onClick={() => onPuesto(a.id, p.id)}
                      >
                        <span className="ez-mpg-etq">{p.nombre}</span>
                        <span className="ez-mpg-pista">
                          {c && (
                            <span
                              className="ez-mpg-barra"
                              style={{ width: `${(c.valor / max) * 100}%` }}
                            />
                          )}
                        </span>
                        <span className="ez-mpg-valor">{c ? numero.format(c.valor) : "—"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {!hay && <p className="ez-mpg-vacio">{tr("ez_mpv_sinDatos")}</p>}
              </figure>
            );
          })}
        </div>
      </div>

      <div className="ez-mpg-grupo">
        <h4>{tr("ez_mpg_nacionalidad")}</h4>
        {series.some(([, c]) => c) ? (
          <figure className="ez-mpg-grafica ez-mpg-nac">
            <ul>
              {series.map(([k, c]) => (
                <li key={k}>
                  <div className="ez-mpg-fila">
                    <span className="ez-mpg-etq">
                      {tr(`ez_mpg_nac_${k === "hondureña" ? "hn" : "gt"}`)}
                    </span>
                    <span className="ez-mpg-pista">
                      {c && (
                        <span
                          className={`ez-mpg-barra ez-mpg-barra-${k === "hondureña" ? "hn" : "gt"}`}
                          style={{ width: `${(c.valor / maxNac) * 100}%` }}
                        />
                      )}
                    </span>
                    <span className="ez-mpg-valor">
                      {c ? numero.format(c.valor) : tr("ez_mpv_sinDatos")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </figure>
        ) : (
          <p className="ez-mpg-vacio">{tr("ez_mpv_sinDatos")}</p>
        )}
        <p className="ez-mpg-medida">
          {tr("ez_mpg_medida")}
          {mesActual && (
            <>
              {" · "}
              {ingresos?.enCurso && corte
                ? tr("ez_mpg_acumulado").replace("{fecha}", corte)
                : nombreMes(mesActual)}
            </>
          )}
          {corte && ` · ${tr("ez_mpg_corte")} ${corte}`}
          {ingresos?.fuentes.length
            ? ` · ${tr("ez_mpv_fuente")}: ${ingresos.fuentes.join(" · ")}`
            : ""}
        </p>
        <p className="ez-mpg-nota">{tr("ez_mpg_noPersonas")}</p>
        {ingresos?.presentes && (
          <p className="ez-mpg-nota">
            {tr("ez_mpg_presentes")}: <strong>{numero.format(ingresos.presentes.valor)}</strong> ·{" "}
            {ingresos.presentes.periodo} · {ingresos.presentes.fuente}
          </p>
        )}
      </div>

      <CargaCsv onCargado={onCargado} tr={tr} />
    </section>
  );
}

/** Carga manual de cortes oficiales (CSV agregado). Todo o nada: con un error no se guarda nada. */
function CargaCsv({ onCargado, tr }: { onCargado: () => void; tr: Tr }) {
  const [modo, setModo] = useState<"agregar" | "reemplazar">("agregar");
  const [estado, setEstado] = useState<{ ok?: string; errores?: string[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const subir = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/granjas/ingresos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: await archivo.text(), modo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setEstado({ errores: [j.error ?? "Error", ...(j.errores ?? [])] });
      else {
        setEstado({
          ok: tr("ez_mpg_csvOk")
            .replace("{n}", String(j.guardadas))
            .replace("{v}", String(j.vacias)),
        });
        onCargado();
      }
    } catch (error) {
      setEstado({ errores: [(error as Error).message] });
    } finally {
      setOcupado(false);
    }
  };
  return (
    <details className="ez-mpg-csv">
      <summary>{tr("ez_mpg_csv")}</summary>
      <p className="ez-mpg-nota">{tr("ez_mpg_csvAyuda")}</p>
      <code className="ez-mpg-columnas">
        fecha,nacionalidad,puesto,tipo_movimiento,valor,fuente,fecha_corte,url,alcance
      </code>
      <div className="ez-mpg-csv-acciones">
        <select
          aria-label={tr("ez_mpg_csvModo")}
          value={modo}
          onChange={(e) => setModo(e.target.value as typeof modo)}
        >
          <option value="agregar">{tr("ez_mpg_csvAgregar")}</option>
          <option value="reemplazar">{tr("ez_mpg_csvReemplazar")}</option>
        </select>
        <label className="ez-boton-blanco ez-mpg-archivo">
          <Upload size={14} aria-hidden="true" />
          {ocupado ? tr("ez_mpg_csvSubiendo") : tr("ez_mpg_csvElegir")}
          <input type="file" accept=".csv,text/csv" onChange={subir} disabled={ocupado} />
        </label>
      </div>
      {estado?.ok && (
        <p className="ez-mpg-ok" role="status">
          {estado.ok}
        </p>
      )}
      {estado?.errores && (
        <ul className="ez-mpg-errores" role="alert">
          {estado.errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
