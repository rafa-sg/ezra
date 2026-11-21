"use client";
/**
 * «Ingresos al país» debajo del mapa. Cortes oficiales cargados por CSV:
 * - DGME (ingresos registrados por puesto migratorio) o MITUR (visitantes internacionales), nunca
 *   mezclados: un interruptor elige la fuente y cambia los títulos.
 * - Sin datos: una tarjeta compacta «Esperando corte oficial» con «Cargar CSV» y «Cómo pedir los datos».
 * - Cortes largos (semestre, año): barras por puesto con «Corte DGME ene–jun 2024», su % del total y
 *   la variación contra el mismo período anterior. El gráfico mensual solo aparece con datos mensuales.
 */
import { useState, type ChangeEvent, type ReactNode } from "react";
import { Copy, Download, FileQuestion, Upload, X } from "lucide-react";
import { PUESTOS_CATALOGO, type GrupoPuesto } from "@/lib/granjas/datos-pais";
import type { Barra, Fuente, ResumenIngresos } from "@/lib/granjas/ingresos";
import { COLUMNAS, PLANTILLA_CSV } from "@/lib/granjas/ingresos-formato";
import "./ingresos-graficas.css";

type Tr = (c: string) => string;
const numero = new Intl.NumberFormat("es-SV");
const pct = new Intl.NumberFormat("es-SV", { maximumFractionDigits: 1 });
const fechaCarga = (iso: string) =>
  new Intl.DateTimeFormat("es-SV", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
const GRUPOS: { id: GrupoPuesto; titulo: string; plegable: boolean }[] = [
  { id: "guatemala", titulo: "Guatemala", plegable: false },
  { id: "honduras", titulo: "Honduras", plegable: false },
  { id: "otros", titulo: "ez_mpg_otrosPuestos", plegable: true },
  { id: "aereos_maritimos", titulo: "ez_mpg_aereosMaritimos", plegable: true },
];
const TIPOS = [
  ["mes", "ez_mpg_tipo_mes"],
  ["trimestre", "ez_mpg_tipo_trimestre"],
  ["semestre", "ez_mpg_tipo_semestre"],
  ["anio", "ez_mpg_tipo_anio"],
] as const;

export function GraficasIngresos({
  ingresos,
  fuente,
  setFuente,
  setPeriodo,
  accesoElegido,
  puestoElegido,
  onPuesto,
  onCargado,
  tr,
}: {
  ingresos: ResumenIngresos | null;
  fuente: Fuente;
  setFuente: (f: Fuente) => void;
  setPeriodo: (p: string | null) => void;
  accesoElegido: string | null;
  puestoElegido: string | null;
  onPuesto: (b: Barra) => void;
  onCargado: () => void;
  tr: Tr;
}) {
  const [abierto, setAbierto] = useState<"csv" | "ayuda" | null>(null);
  const mitur = fuente === "MITUR";
  const periodo = ingresos?.periodo ?? null;
  const corteTexto = periodo ? `${tr("ez_mpg_corte")} ${fuente} ${periodo.etiqueta}` : "";
  const pie = periodo
    ? `${tr("ez_mpv_fuente")}: ${fuente} · ${corteTexto}${ingresos?.cargado ? ` · ${tr("ez_mpg_cargado")} ${fechaCarga(ingresos.cargado)}` : ""}`
    : "";
  const esperando = (
    <Esperando
      fuente={fuente}
      onCsv={() => setAbierto("csv")}
      onAyuda={() => setAbierto("ayuda")}
      tr={tr}
    />
  );
  const hayPuestos = Object.keys(ingresos?.puestos ?? {}).length > 0;
  return (
    <section className="ez-mpg" aria-labelledby="ez-mpg-titulo">
      <header className="ez-mpg-cabeza">
        <h3 id="ez-mpg-titulo">{tr(mitur ? "ez_mpg_tituloMitur" : "ez_mpg_titulo")}</h3>
        <div className="ez-mpg-controles">
          <div className="ez-segmentado" role="radiogroup" aria-label={tr("ez_mpg_fuente")}>
            {(["DGME", "MITUR"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={fuente === f}
                onClick={() => setFuente(f)}
              >
                {tr(f === "DGME" ? "ez_mpg_fuenteDgme" : "ez_mpg_fuenteMitur")}
              </button>
            ))}
          </div>
          <label className="ez-mpg-mes">
            <span>{tr("ez_mpg_periodo")}</span>
            <select
              value={periodo?.clave ?? ""}
              disabled={!ingresos?.periodos.length}
              onChange={(e) => setPeriodo(e.target.value || null)}
            >
              {!ingresos?.periodos.length && <option value="">{tr("ez_mpg_sinCortes")}</option>}
              {TIPOS.map(([tipo, titulo]) => {
                const lista = ingresos?.periodos.filter((p) => p.tipo === tipo) ?? [];
                return lista.length ? (
                  <optgroup key={tipo} label={tr(titulo)}>
                    {lista.map((p) => (
                      <option key={p.clave} value={p.clave}>
                        {p.etiqueta}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
        </div>
      </header>
      {mitur && <p className="ez-mpg-aviso">{tr("ez_mpg_notaMetodologias")}</p>}

      {/* Sin ningún corte: una sola tarjeta para toda la sección. */}
      {!ingresos?.periodos.length ? (
        esperando
      ) : (
        <>
          {/* 1 · Por mes (solo con datos mensuales) o una barra por período largo. */}
          {ingresos.anual ? (
            <AnioPorMes
              anual={ingresos.anual}
              titulo={tr(mitur ? "ez_mpg_anualMitur" : "ez_mpg_anual")}
              tr={tr}
            />
          ) : (
            <Bloque titulo={tr(mitur ? "ez_mpg_porPeriodoMitur" : "ez_mpg_porPeriodo")}>
              {ingresos.porPeriodo.length ? (
                <PorPeriodo filas={ingresos.porPeriodo} fuente={fuente} tr={tr} />
              ) : (
                esperando
              )}
            </Bloque>
          )}

          {/* 2 · Cruces por frontera (solo DGME: MITUR no publica por puesto). */}
          {!mitur && (
            <Bloque
              titulo={tr("ez_mpg_cruces")}
              sub={hayPuestos ? corteTexto : undefined}
              pie={hayPuestos ? pie : undefined}
            >
              {hayPuestos ? (
                <div className="ez-mpg-grupos">
                  {GRUPOS.map((g) => {
                    const puestos = PUESTOS_CATALOGO.filter((p) => p.grupo === g.id);
                    const barras = puestos.map((p) => ingresos!.puestos[p.id] ?? null);
                    const max = Math.max(1, ...barras.map((b) => b?.valor ?? 0));
                    const hay = barras.some(Boolean);
                    const contenido = (
                      <ul>
                        {puestos.map((p, i) => (
                          <li key={p.id}>
                            <FilaBarra
                              etiqueta={p.nombre}
                              barra={barras[i]}
                              max={max}
                              periodo={periodo?.etiqueta ?? ""}
                              elegida={puestoElegido === p.id}
                              clase={g.id}
                              onClick={barras[i] ? () => onPuesto(barras[i]!) : undefined}
                              tr={tr}
                            />
                          </li>
                        ))}
                      </ul>
                    );
                    const clase = `ez-mpg-grafica ez-mpg-${g.id} ${accesoElegido === g.id ? "ez-mpg-elegida" : ""} ${accesoElegido && accesoElegido !== g.id ? "ez-mpg-tenue" : ""}`;
                    const titulo = g.titulo.startsWith("ez_") ? tr(g.titulo) : g.titulo;
                    return g.plegable ? (
                      <details
                        key={g.id}
                        className={`${clase} ez-mpg-plegable`}
                        open={hay || undefined}
                      >
                        <summary>
                          {titulo}
                          {!hay && (
                            <span className="ez-mpg-sinDato"> · {tr("ez_mpg_sinDatoCorte")}</span>
                          )}
                        </summary>
                        {contenido}
                      </details>
                    ) : (
                      <figure key={g.id} className={clase}>
                        <figcaption>{titulo}</figcaption>
                        {contenido}
                      </figure>
                    );
                  })}
                </div>
              ) : (
                esperando
              )}
            </Bloque>
          )}

          {/* 3 · Por nacionalidad (DGME) o por país de origen (MITUR). */}
          <Bloque
            titulo={tr(mitur ? "ez_mpg_porPaisMitur" : "ez_mpg_nacionalidad")}
            sub={ingresos?.paises.length ? corteTexto : undefined}
            pie={ingresos?.paises.length ? pie : undefined}
          >
            {ingresos?.paises.length ? (
              <figure className="ez-mpg-grafica ez-mpg-nac">
                <ul>
                  {ingresos.paises.map((b) => (
                    <li key={b.clave}>
                      <FilaBarra
                        etiqueta={b.etiqueta}
                        barra={b}
                        max={ingresos.paises[0].valor || 1}
                        periodo={periodo?.etiqueta ?? ""}
                        elegida={false}
                        clase="pais"
                        onClick={() => onPuesto(b)}
                        tr={tr}
                      />
                    </li>
                  ))}
                </ul>
              </figure>
            ) : (
              esperando
            )}
          </Bloque>
        </>
      )}
      {!mitur && <p className="ez-mpg-nota">{tr("ez_mpg_noPersonas")}</p>}

      <div className="ez-mpg-acciones">
        <button
          type="button"
          className="ez-boton-blanco"
          onClick={() => setAbierto(abierto === "csv" ? null : "csv")}
          aria-expanded={abierto === "csv"}
        >
          <Upload size={14} aria-hidden="true" /> {tr("ez_mpg_cargarCsv")}
        </button>
        <button
          type="button"
          className="ez-boton-blanco"
          onClick={() => setAbierto(abierto === "ayuda" ? null : "ayuda")}
          aria-expanded={abierto === "ayuda"}
        >
          <FileQuestion size={14} aria-hidden="true" /> {tr("ez_mpg_comoPedir")}
        </button>
      </div>
      {abierto === "csv" && (
        <CargaCsv onCerrar={() => setAbierto(null)} onCargado={onCargado} tr={tr} />
      )}
      {abierto === "ayuda" && <ComoPedir onCerrar={() => setAbierto(null)} tr={tr} />}
    </section>
  );
}

function Bloque({
  titulo,
  sub,
  pie,
  children,
}: {
  titulo: string;
  sub?: string;
  pie?: string;
  children: ReactNode;
}) {
  return (
    <div className="ez-mpg-grupo">
      <h4>
        {titulo}
        {sub && <span className="ez-mpg-corte">{sub}</span>}
      </h4>
      {children}
      {pie && <p className="ez-mpg-pie">{pie}</p>}
    </div>
  );
}

/** Sin datos en un bloque: una sola tarjeta compacta (nada de cuadrículas de «—»). */
function Esperando({
  fuente,
  onCsv,
  onAyuda,
  tr,
}: {
  fuente: Fuente;
  onCsv: () => void;
  onAyuda: () => void;
  tr: Tr;
}) {
  return (
    <div className="ez-mpg-esperando">
      <p>{tr(fuente === "MITUR" ? "ez_mpg_esperandoMitur" : "ez_mpg_esperando")}</p>
      <div>
        <button type="button" className="ez-boton-blanco" onClick={onCsv}>
          <Upload size={14} aria-hidden="true" /> {tr("ez_mpg_cargarCsv")}
        </button>
        <button type="button" className="ez-mpg-enlace" onClick={onAyuda}>
          {tr("ez_mpg_comoPedir")}
        </button>
      </div>
    </div>
  );
}

/** Una barra accesible: botón con «Puesto, valor, período»; % del total y variación si existe. */
function FilaBarra({
  etiqueta,
  barra,
  max,
  periodo,
  elegida,
  clase,
  onClick,
  tr,
}: {
  etiqueta: string;
  barra: Barra | null;
  max: number;
  periodo: string;
  elegida: boolean;
  clase: string;
  onClick?: () => void;
  tr: Tr;
}) {
  if (!barra)
    return (
      <div className="ez-mpg-fila ez-mpg-fila-vacia">
        <span className="ez-mpg-etq" title={etiqueta}>
          {etiqueta}
        </span>
        <span className="ez-mpg-sinDato">{tr("ez_mpg_sinDatoCorte")}</span>
      </div>
    );
  const variacion =
    barra.variacion === null
      ? null
      : `${barra.variacion >= 0 ? "▲" : "▼"} ${pct.format(Math.abs(barra.variacion))} %`;
  return (
    <button
      type="button"
      className={`ez-mpg-fila ${elegida ? "ez-mpg-barra-elegida" : ""}`}
      aria-pressed={elegida}
      aria-label={`${etiqueta}, ${numero.format(barra.valor)}, ${periodo}`}
      title={`${etiqueta}: ${numero.format(barra.valor)} · ${periodo}`}
      onClick={onClick}
    >
      <span className="ez-mpg-etq">{etiqueta}</span>
      <span className="ez-mpg-pista">
        <span
          className={`ez-mpg-barra ez-mpg-barra-${clase}`}
          style={{ width: `${(barra.valor / max) * 100}%` }}
        />
      </span>
      <span className="ez-mpg-valor">
        {numero.format(barra.valor)}
        <small>
          {barra.porcentaje !== null ? `${pct.format(barra.porcentaje)} %` : ""}
          {variacion && (
            <em
              className={barra.variacion! >= 0 ? "ez-mpg-sube" : "ez-mpg-baja"}
              title={tr("ez_mpg_variacionAyuda")}
            >
              {" "}
              {variacion}
            </em>
          )}
        </small>
      </span>
    </button>
  );
}

/** Sin datos mensuales: una barra por período largo con su etiqueta («Corte DGME ene–jun 2024»). */
function PorPeriodo({
  filas,
  fuente,
  tr,
}: {
  filas: NonNullable<ResumenIngresos["porPeriodo"]>;
  fuente: Fuente;
  tr: Tr;
}) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <figure className="ez-mpg-grafica ez-mpg-periodos">
      <ul>
        {filas.map((f) => (
          <li key={f.clave}>
            <div
              className="ez-mpg-fila"
              role="img"
              aria-label={`${tr("ez_mpg_corte")} ${fuente} ${f.etiqueta}, ${numero.format(f.valor)}`}
            >
              <span className="ez-mpg-etq">
                {tr("ez_mpg_corte")} {fuente} {f.etiqueta}
              </span>
              <span className="ez-mpg-pista">
                <span
                  className="ez-mpg-barra ez-mpg-barra-periodo"
                  style={{ width: `${(f.valor / max) * 100}%` }}
                />
              </span>
              <span className="ez-mpg-valor">{numero.format(f.valor)}</span>
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Carga en dos pasos: vista previa (errores y duplicados) y luego guardar. */
function CargaCsv({
  onCerrar,
  onCargado,
  tr,
}: {
  onCerrar: () => void;
  onCargado: () => void;
  tr: Tr;
}) {
  type Vista = {
    filas: {
      fuente: string;
      metrica: string;
      periodo: string;
      desde: string;
      hasta: string;
      etiqueta: string;
      valor: number;
    }[];
    total: number;
    errores: string[];
    vacias: number;
    duplicados: {
      enArchivo: string[];
      contraGuardados: {
        etiqueta: string;
        desde: string;
        hasta: string;
        antes: number;
        ahora: number;
      }[];
    };
  };
  const [csv, setCsv] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [vista, setVista] = useState<Vista | null>(null);
  const [reemplazar, setReemplazar] = useState(false);
  const [estado, setEstado] = useState<{ ok?: string; error?: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (accion: "vista" | "guardar", texto: string) => {
    const r = await fetch("/api/granjas/ingresos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: texto, accion, reemplazar }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error([j.error ?? "Error", ...(j.errores ?? [])].join("\n"));
    return j;
  };
  const elegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setOcupado(true);
    setEstado(null);
    try {
      const texto = await archivo.text();
      setCsv(texto);
      setNombre(archivo.name);
      setVista(await enviar("vista", texto));
    } catch (error) {
      setEstado({ error: (error as Error).message });
    } finally {
      setOcupado(false);
    }
  };
  const guardar = async () => {
    if (!csv) return;
    setOcupado(true);
    try {
      const j = await enviar("guardar", csv);
      setEstado({
        ok: tr("ez_mpg_csvOk")
          .replace("{n}", String(j.guardadas))
          .replace("{o}", String(j.omitidos))
          .replace("{v}", String(j.vacias)),
      });
      setVista(null);
      setCsv(null);
      onCargado();
    } catch (error) {
      setEstado({ error: (error as Error).message });
    } finally {
      setOcupado(false);
    }
  };
  const plantilla = `data:text/csv;charset=utf-8,${encodeURIComponent(PLANTILLA_CSV)}`;
  const nDup = vista?.duplicados.contraGuardados.length ?? 0;
  const bloqueado =
    !vista ||
    vista.errores.length > 0 ||
    vista.duplicados.enArchivo.length > 0 ||
    vista.total === 0;
  return (
    <div className="ez-mpg-panel" role="region" aria-label={tr("ez_mpg_cargarCsv")}>
      <header>
        <h4>{tr("ez_mpg_cargarCsv")}</h4>
        <button type="button" className="ez-cerrar" onClick={onCerrar} aria-label={tr("p_cerrar")}>
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      <p className="ez-mpg-nota">{tr("ez_mpg_csvAyuda")}</p>
      <code className="ez-mpg-columnas">{COLUMNAS.join(",")}</code>
      <div className="ez-mpg-csv-acciones">
        <a className="ez-boton-blanco" href={plantilla} download="plantilla-cortes-ingresos.csv">
          <Download size={14} aria-hidden="true" /> {tr("ez_mpg_plantilla")}
        </a>
        <label className="ez-boton-blanco ez-mpg-archivo">
          <Upload size={14} aria-hidden="true" />
          {ocupado ? tr("ez_mpg_csvSubiendo") : tr("ez_mpg_csvElegir")}
          <input type="file" accept=".csv,text/csv" onChange={elegir} disabled={ocupado} />
        </label>
      </div>
      {vista && (
        <div className="ez-mpg-vista">
          <p className="ez-mpg-nota">
            {tr("ez_mpg_vistaResumen")
              .replace("{archivo}", nombre)
              .replace("{n}", String(vista.total))
              .replace("{v}", String(vista.vacias))}
          </p>
          {vista.filas.length > 0 && (
            <div className="ez-mpg-tabla">
              <table>
                <thead>
                  <tr>
                    <th>{tr("ez_mpg_col_fuente")}</th>
                    <th>{tr("ez_mpg_col_periodo")}</th>
                    <th>{tr("ez_mpg_col_lugar")}</th>
                    <th>{tr("ez_mpg_col_valor")}</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.filas.map((f, i) => (
                    <tr key={i}>
                      <td>
                        {f.fuente} · {f.metrica}
                      </td>
                      <td>
                        {f.periodo} {f.desde} – {f.hasta}
                      </td>
                      <td>{f.etiqueta}</td>
                      <td>{numero.format(f.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(vista.errores.length > 0 || vista.duplicados.enArchivo.length > 0) && (
            <ul className="ez-mpg-errores" role="alert">
              {vista.errores.map((e) => (
                <li key={e}>{e}</li>
              ))}
              {vista.duplicados.enArchivo.map((d) => (
                <li key={d}>
                  {tr("ez_mpg_repetido")}: {d}
                </li>
              ))}
            </ul>
          )}
          {nDup > 0 && (
            <div className="ez-mpg-duplicados" role="status">
              <p>{tr("ez_mpg_duplicados").replace("{n}", String(nDup))}</p>
              <ul>
                {vista.duplicados.contraGuardados.slice(0, 8).map((d) => (
                  <li key={`${d.etiqueta}${d.desde}`}>
                    {d.etiqueta} · {d.desde} – {d.hasta}: {numero.format(d.antes)} →{" "}
                    {numero.format(d.ahora)}
                  </li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={reemplazar}
                  onChange={(e) => setReemplazar(e.target.checked)}
                />{" "}
                {tr("ez_mpg_reemplazarDuplicados")}
              </label>
            </div>
          )}
          <button
            type="button"
            className="ez-boton-negro"
            disabled={bloqueado || ocupado}
            onClick={guardar}
          >
            {tr("ez_mpg_guardarCortes")}
          </button>
        </div>
      )}
      {estado?.ok && (
        <p className="ez-mpg-ok" role="status">
          {estado.ok}
        </p>
      )}
      {estado?.error && (
        <p className="ez-mpg-errores" role="alert">
          {estado.error}
        </p>
      )}
    </div>
  );
}

const SOLICITUD = `Señores Oficial de Información
Dirección General de Migración y Extranjería (DGME)

Con base en la Ley de Acceso a la Información Pública, solicito la siguiente información pública:

Número de entradas (ingresos) al país registradas por la DGME durante 2026, desagregadas por mes, por puesto migratorio (terrestres, aéreos y marítimos) y por nacionalidad, desde enero de 2026 hasta el último mes cerrado disponible.

Solicito recibir la información en formato abierto (CSV o Excel), indicando la fecha de corte de los datos.

Medio para recibir notificaciones: [correo electrónico]
Nombre: [nombre completo]
Documento de identidad: [número]

Atentamente,
[firma]`;

/** Pasos para pedir los datos mensuales por la Ley de Acceso a la Información Pública. */
function ComoPedir({ onCerrar, tr }: { onCerrar: () => void; tr: Tr }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="ez-mpg-panel" role="region" aria-label={tr("ez_mpg_comoPedir")}>
      <header>
        <h4>{tr("ez_mpg_comoPedir")}</h4>
        <button type="button" className="ez-cerrar" onClick={onCerrar} aria-label={tr("p_cerrar")}>
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      <ol className="ez-mpg-pasos">
        <li>{tr("ez_mpg_paso1")}</li>
        <li>{tr("ez_mpg_paso2")}</li>
        <li>{tr("ez_mpg_paso3")}</li>
        <li>{tr("ez_mpg_paso4")}</li>
      </ol>
      <label className="ez-mpg-solicitud">
        <span>{tr("ez_mpg_textoSolicitud")}</span>
        <textarea readOnly value={SOLICITUD} rows={12} />
      </label>
      <button
        type="button"
        className="ez-boton-blanco"
        onClick={() =>
          navigator.clipboard
            ?.writeText(SOLICITUD)
            .then(() => setCopiado(true))
            .catch(() => setCopiado(false))
        }
      >
        <Copy size={14} aria-hidden="true" /> {copiado ? tr("ez_mpg_copiado") : tr("ez_mpg_copiar")}
      </button>
    </div>
  );
}

const mesCorto = (m: string) =>
  new Intl.DateTimeFormat("es-SV", { month: "short", timeZone: "UTC" })
    .format(new Date(`${m}-15T12:00:00Z`))
    .replace(".", "");
const compacto = new Intl.NumberFormat("es-SV", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Los 12 meses del año con las entradas registradas (DGME) y la estimación NO oficial (rayada) del
 * cierre del mes en curso, del mes siguiente y del resto del año. Un mes sin corte ni estimación queda vacío.
 */
function AnioPorMes({
  anual,
  titulo,
  tr,
}: {
  anual: NonNullable<ResumenIngresos["anual"]>;
  titulo: string;
  tr: Tr;
}) {
  const { serie, proximo, cierreActual, porMes, anioEstimado, anio, cerrados } = anual;
  const max = Math.max(1, ...serie.map((m) => Math.max(m.valor ?? 0, porMes[m.mes]?.valor ?? 0)));
  const metodo = (m: "interanual" | "tendencia") => tr(`ez_mpg_metodo_${m}`);
  const nombreLargo = (m: string) =>
    new Intl.DateTimeFormat("es-SV", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${m}-15T12:00:00Z`),
    );
  const rango = (e: { valor: number; bajo: number; alto: number }) => (
    <>
      <strong>≈ {numero.format(e.valor)}</strong> ({numero.format(e.bajo)} – {numero.format(e.alto)}
      )
    </>
  );
  return (
    <div className="ez-mpg-grupo">
      <h4>
        {titulo} · {anio}
      </h4>
      <div className="ez-mpg-anual" role="list" aria-label={`${titulo} ${anio}`}>
        {serie.map((m) => {
          const est = porMes[m.mes] ?? null;
          const arriba = m.valor !== null && !m.parcial ? m.valor : (est?.valor ?? m.valor);
          const etiqueta =
            [
              m.valor !== null
                ? `${numero.format(m.valor)}${m.parcial ? ` (${tr("ez_mpg_parcial")})` : ""}`
                : "",
              est ? `≈ ${numero.format(est.valor)} (${tr("ez_mpg_estimacion")})` : "",
            ]
              .filter(Boolean)
              .join(" · ") || tr("ez_mpv_sinDatos");
          return (
            <div
              key={m.mes}
              role="listitem"
              className="ez-mpg-mesbarra"
              title={`${mesCorto(m.mes)}: ${etiqueta}`}
              aria-label={`${mesCorto(m.mes)}: ${etiqueta}`}
            >
              <span className="ez-mpg-mesvalor">
                {arriba !== null ? (est ? "≈" : "") + compacto.format(arriba) : "—"}
              </span>
              <span className="ez-mpg-columna">
                {/* Estimación rayada detrás; lo registrado (o el acumulado parcial) delante. */}
                {est && (
                  <span
                    className="ez-mpg-relleno ez-mpg-estimado"
                    style={{ height: `${(est.valor / max) * 100}%` }}
                  />
                )}
                {m.valor !== null && (
                  <span
                    className={`ez-mpg-relleno ${m.parcial ? "ez-mpg-parcial" : ""}`}
                    style={{ height: `${(m.valor / max) * 100}%` }}
                  />
                )}
              </span>
              <span className="ez-mpg-mesnombre">{mesCorto(m.mes)}</span>
            </div>
          );
        })}
      </div>
      {proximo && anioEstimado ? (
        <div className="ez-mpg-estimaciones">
          <p>
            <span className="ez-mpg-sello">{tr("ez_mpg_estimacionNoOficial")}</span>{" "}
            {metodo(proximo.metodo)}
          </p>
          {cierreActual && (
            <p>
              {tr("ez_mpg_cierreMes")} {nombreLargo(cierreActual.mes)}: {rango(cierreActual)} ·{" "}
              {tr("ez_mpg_llevaRegistrado").replace("{n}", numero.format(cierreActual.acumulado))}
            </p>
          )}
          <p>
            {tr("ez_mpg_proximoMes")} ({nombreLargo(proximo.mes)}): {rango(proximo)}
          </p>
          <p>
            {tr("ez_mpg_anioEstimado")} {anio}: {rango(anioEstimado)} ·{" "}
            {tr("ez_mpg_mesesRealesEstimados")
              .replace("{r}", String(anioEstimado.reales))
              .replace("{e}", String(anioEstimado.estimados))}
          </p>
        </div>
      ) : (
        <p className="ez-mpg-nota">{tr("ez_mpg_sinEstimacion").replace("{n}", String(cerrados))}</p>
      )}
    </div>
  );
}
