"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, PauseCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type { ResumenConsumo, Tarifas } from "@/lib/granjas/consumo";
import { pedir } from "./cliente";

type Formatos = { g: (clave: string) => string; fecha: (iso: string) => string; locale: string };
const numeroCompacto = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === "es" ? "es-SV" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const numero = (n: number, locale: string) => new Intl.NumberFormat(locale === "es" ? "es-SV" : "en-US").format(n);
const usd = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === "es" ? "es-SV" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 }).format(n);

/** Aviso de presupuesto reutilizable (Consumo y Granjas). Siempre con ícono y texto, nunca solo color. */
export function AvisoPresupuesto({ estado, g, fecha }: { estado: ResumenConsumo["presupuesto"]["estado"]; g: Formatos["g"]; fecha: Formatos["fecha"] }) {
  if (estado.agotado)
    return (
      <p className="ep-alerta eg-presupuesto-alerta" role="alert">
        <PauseCircle size={17} aria-hidden="true" />
        {g("presupuestoAgotado")} {fecha(estado.reanuda!)}.
      </p>
    );
  if (estado.aviso)
    return (
      <p className="eg-presupuesto-aviso" role="status">
        <AlertTriangle size={17} aria-hidden="true" />
        {g("presupuestoAviso80")}
      </p>
    );
  return null;
}

function GraficaDias({ serie, limite, g, locale }: { serie: ResumenConsumo["serie"]; limite: number | null; g: Formatos["g"]; locale: string }) {
  const [activo, setActivo] = useState<number | null>(null);
  const ancho = 720;
  const alto = 220;
  const margen = { izq: 44, der: 12, arr: 14, aba: 26 };
  const maximo = Math.max(1, ...serie.map((d) => d.tokens), limite ?? 0) * 1.08;
  const y = (v: number) => margen.arr + (alto - margen.arr - margen.aba) * (1 - v / maximo);
  const paso = (ancho - margen.izq - margen.der) / serie.length;
  const barra = Math.max(4, paso - 4);
  const etiquetaDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  const d = activo === null ? null : serie[activo];
  return (
    <figure className="eg-grafica">
      <figcaption>{g("c_serie")}</figcaption>
      <div className="eg-grafica-lienzo" onMouseLeave={() => setActivo(null)}>
        <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${g("c_serie")}: ${serie.map((x) => `${etiquetaDia(x.dia)} ${x.tokens}`).join(", ")}`}>
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={margen.izq} x2={ancho - margen.der} y1={y(maximo * t / 1.08)} y2={y(maximo * t / 1.08)} className="eg-grafica-rejilla" />
              <text x={margen.izq - 6} y={y(maximo * t / 1.08) + 4} textAnchor="end" className="eg-grafica-eje">
                {numeroCompacto((maximo * t) / 1.08, locale)}
              </text>
            </g>
          ))}
          {serie.map((x, i) => {
            const cx = margen.izq + i * paso + (paso - barra) / 2;
            const tope = y(x.tokens);
            const base = y(0);
            const h = Math.max(0, base - tope);
            return (
              <g key={x.dia}>
                {h > 0 && (
                  // Barra con extremo superior redondeado (4 px) y apoyada en la base.
                  <path
                    className={`eg-grafica-barra${activo === i ? " eg-activa" : ""}`}
                    d={`M${cx},${base} V${tope + Math.min(4, h)} Q${cx},${tope} ${cx + Math.min(4, barra / 2)},${tope} H${cx + barra - Math.min(4, barra / 2)} Q${cx + barra},${tope} ${cx + barra},${tope + Math.min(4, h)} V${base} Z`}
                  />
                )}
                {i % 5 === 0 && (
                  <text x={cx + barra / 2} y={alto - 8} textAnchor="middle" className="eg-grafica-eje">
                    {etiquetaDia(x.dia)}
                  </text>
                )}
                <rect x={margen.izq + i * paso} y={margen.arr} width={paso} height={alto - margen.arr - margen.aba} fill="transparent" onMouseEnter={() => setActivo(i)} />
              </g>
            );
          })}
          {limite !== null && (
            <g>
              <line x1={margen.izq} x2={ancho - margen.der} y1={y(limite)} y2={y(limite)} className="eg-grafica-limite" />
              <text x={ancho - margen.der} y={y(limite) - 5} textAnchor="end" className="eg-grafica-eje">
                {g("c_limiteDiario")} · {numeroCompacto(limite, locale)}
              </text>
            </g>
          )}
        </svg>
        {d && (
          <div className="eg-grafica-tooltip" style={{ left: `${((margen.izq + activo! * paso + paso / 2) / ancho) * 100}%` }} role="status">
            <strong>{etiquetaDia(d.dia)}</strong>
            <span>
              {numero(d.tokens, locale)} {g("c_tokens")} · {d.llamadas} {g("c_llamadas")}
            </span>
            {d.costo > 0 && <span>{usd(d.costo, locale)}</span>}
            {limite !== null && d.tokens > limite && <span>⚠ {g("c_sobreLimite")}</span>}
          </div>
        )}
      </div>
      <details className="eg-grafica-tabla">
        <summary>{g("c_tabla")}</summary>
        <div className="eg-tabla-desplazable">
          <table>
            <thead>
              <tr>
                <th scope="col">{g("c_diaCol")}</th>
                <th scope="col">{g("c_total")}</th>
                <th scope="col">{g("c_llamadas")}</th>
                <th scope="col">{g("c_costo")}</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((x) => (
                <tr key={x.dia}>
                  <td>{x.dia}</td>
                  <td>{numero(x.tokens, locale)}</td>
                  <td>{x.llamadas}</td>
                  <td>{x.sinTarifa && !x.costo ? g("c_sinTarifa") : usd(x.costo, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

type FilaTarifa = { modelo: string; entrada: string; salida: string; busqueda: string };
const aFilas = (t: Tarifas, modelos: string[]): FilaTarifa[] => {
  const nombres = [...new Set([...Object.keys(t), ...modelos])];
  return nombres.map((m) => ({
    modelo: m,
    entrada: t[m] ? String(t[m].entrada) : "",
    salida: t[m] ? String(t[m].salida) : "",
    busqueda: t[m] ? String(t[m].busqueda) : "",
  }));
};

export function SeccionConsumo({ g, fecha, locale }: Formatos) {
  const [datos, setDatos] = useState<ResumenConsumo | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [limites, setLimites] = useState({ dia: "", mes: "" });
  const [tarifas, setTarifas] = useState<FilaTarifa[]>([]);
  const aplicar = useCallback((r: ResumenConsumo) => {
    setDatos(r);
    setLimites({ dia: r.presupuesto.tokensDia ? String(r.presupuesto.tokensDia) : "", mes: r.presupuesto.tokensMes ? String(r.presupuesto.tokensMes) : "" });
    setTarifas(aFilas(r.tarifas, r.modelos));
  }, []);
  const cargar = useCallback(async () => {
    setError("");
    try {
      aplicar(await pedir<ResumenConsumo>("/api/granjas/consumo"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [aplicar]);
  useEffect(() => {
    let vivo = true;
    pedir<ResumenConsumo>("/api/granjas/consumo")
      .then((r) => vivo && aplicar(r))
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [aplicar]);
  async function guardar(cuerpo: object) {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      aplicar(await pedir<ResumenConsumo>("/api/granjas/consumo", cuerpo));
      setAviso(g("guardado"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  const nombrePaso = (origen: string, paso: string) => (origen === "granja" ? paso : `${g(`c_origen_${origen}`)} · ${paso}`);
  const costoTexto = (a: { costo: number; sinTarifa: number; llamadas: number }) =>
    a.sinTarifa === a.llamadas && a.llamadas > 0 ? g("c_sinTarifa") : `${usd(a.costo, locale)}${a.sinTarifa ? ` (${g("c_parcial")})` : ""}`;
  const tarifasValidas = useMemo(
    () =>
      tarifas.every((f) => {
        const vacia = !f.entrada && !f.salida && !f.busqueda;
        return vacia || ([f.entrada, f.salida, f.busqueda].every((v) => v !== "" && Number(v) >= 0) && /^[A-Za-z0-9._:-]+$/.test(f.modelo));
      }),
    [tarifas],
  );
  if (!datos) return <p role="status">{error || g("cargando")}</p>;
  const est = datos.presupuesto.estado;
  const medidor = (p: typeof est.dia, etiqueta: string) => (
    <div className="eg-medidor">
      <div className="eg-medidor-texto">
        <strong>{etiqueta}</strong>
        <span>
          {numero(p.usado, locale)} {g("c_usado")} · {p.limite ? `${numero(p.limite, locale)} (${p.porcentaje} %)` : g("c_sinLimite")}
        </span>
      </div>
      {p.limite && (
        <div className="eg-medidor-barra" role="meter" aria-valuemin={0} aria-valuemax={p.limite} aria-valuenow={Math.min(p.usado, p.limite)} aria-label={etiqueta}>
          <span style={{ width: `${Math.min(100, p.porcentaje ?? 0)}%` }} className={(p.porcentaje ?? 0) >= 100 ? "eg-lleno" : (p.porcentaje ?? 0) >= 80 ? "eg-alto" : ""} />
        </div>
      )}
      {p.limite && p.usado >= p.limite && (
        <span className="ep-nota">
          {g("c_reanuda")}: {fecha(p.reanuda)}
        </span>
      )}
    </div>
  );
  return (
    <div className="eg-consumo">
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="ep-aviso" role="status">
          {aviso}
        </p>
      )}
      <AvisoPresupuesto estado={est} g={g} fecha={fecha} />
      <div className="eg-kpis">
        {(["hoy", "semana", "mes"] as const).map((p) => (
          <div className="eg-kpi" key={p}>
            <span>{g(`c_${p}`)}</span>
            <strong>{numeroCompacto(datos.periodos[p].tokens, locale)}</strong>
            <small>
              {g("c_tokens")} · {datos.periodos[p].llamadas} {g("c_llamadas")}
              {datos.periodos[p].errores ? ` · ${datos.periodos[p].errores} ${g("c_errores")}` : ""}
            </small>
            <small>
              {g("c_costo")}: {costoTexto(datos.periodos[p])}
            </small>
          </div>
        ))}
      </div>
      <section className="eg-bloque">
        <h2 className="eg-subtitulo">{g("c_presupuesto")}</h2>
        <p className="ep-nota">{g("c_presupuestoAyuda")}</p>
        <div className="eg-medidores">
          {medidor(est.dia, g("c_dia"))}
          {medidor(est.mes, g("c_mesLimite"))}
        </div>
        <form
          className="eg-formulario-linea"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar({
              accion: "presupuesto",
              presupuesto: { tokensDia: limites.dia ? Number(limites.dia) : null, tokensMes: limites.mes ? Number(limites.mes) : null },
            });
          }}
        >
          <label className="eg-campo">
            {g("c_dia")} ({g("c_tokens")})
            <input type="number" min={1000} step={1000} inputMode="numeric" value={limites.dia} placeholder={g("c_sinLimite")} onChange={(e) => setLimites({ ...limites, dia: e.target.value })} />
          </label>
          <label className="eg-campo">
            {g("c_mesLimite")} ({g("c_tokens")})
            <input type="number" min={1000} step={1000} inputMode="numeric" value={limites.mes} placeholder={g("c_sinLimite")} onChange={(e) => setLimites({ ...limites, mes: e.target.value })} />
          </label>
          <button className="ep-boton ep-primario" disabled={ocupado}>
            <Save size={15} />
            {g("guardar")}
          </button>
        </form>
      </section>
      <section className="eg-bloque">
        <div className="eg-bloque-cabecera">
          <h2 className="eg-subtitulo">{g("c_serie")}</h2>
          <button className="ep-boton ep-texto" onClick={() => void cargar()}>
            <RefreshCw size={15} />
            {g("c_actualizar")}
          </button>
        </div>
        <GraficaDias serie={datos.serie} limite={datos.presupuesto.tokensDia} g={g} locale={locale} />
      </section>
      {!datos.caras.length ? (
        <p className="ep-nota">{g("c_vacio")}</p>
      ) : (
        <>
          <div className="eg-dos-tablas">
            <section className="eg-bloque">
              <h2 className="eg-subtitulo">{g("c_porGranja")}</h2>
              <div className="eg-tabla-desplazable">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{g("c_granja")}</th>
                      <th scope="col">{g("c_total")}</th>
                      <th scope="col">{g("c_llamadas")}</th>
                      <th scope="col">{g("c_costo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.porGranja.map((f) => (
                      <tr key={f.clave}>
                        <td>{f.clave.startsWith("origen:") ? g(`c_origen_${f.nombre}`) : f.nombre}</td>
                        <td>{numero(f.tokens, locale)}</td>
                        <td>{f.llamadas}</td>
                        <td>{costoTexto(f)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="eg-bloque">
              <h2 className="eg-subtitulo">{g("c_porPaso")}</h2>
              <div className="eg-tabla-desplazable">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{g("c_paso")}</th>
                      <th scope="col">{g("c_total")}</th>
                      <th scope="col">{g("c_llamadas")}</th>
                      <th scope="col">{g("c_costo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.porPaso.map((f) => (
                      <tr key={f.clave}>
                        <td>{nombrePaso(f.origen, f.paso)}</td>
                        <td>{numero(f.tokens, locale)}</td>
                        <td>{f.llamadas}</td>
                        <td>{costoTexto(f)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <section className="eg-bloque">
            <h2 className="eg-subtitulo">{g("c_caras")}</h2>
            <div className="eg-tabla-desplazable">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{g("c_fecha")}</th>
                    <th scope="col">{g("c_paso")}</th>
                    <th scope="col">{g("c_modelo")}</th>
                    <th scope="col">{g("c_entrada")}</th>
                    <th scope="col">{g("c_salida")}</th>
                    <th scope="col">{g("c_razonamiento")}</th>
                    <th scope="col">{g("c_herramientas")}</th>
                    <th scope="col">{g("c_total")}</th>
                    <th scope="col">{g("c_busqueda")}</th>
                    <th scope="col">{g("c_duracion")}</th>
                    <th scope="col">{g("c_costo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.caras.map((f) => (
                    <tr key={f.id} className={f.error ? "eg-fila-error" : ""}>
                      <td>{fecha(f.fecha)}</td>
                      <td>
                        {f.granja ? `${f.granja} · ` : ""}
                        {nombrePaso(f.origen, f.paso)}
                        {f.error && <small className="eg-error-celda">{f.error}</small>}
                      </td>
                      <td>{f.modelo}</td>
                      <td>{numero(f.prompt_tokens, locale)}</td>
                      <td>{numero(f.candidatos_tokens, locale)}</td>
                      <td>{numero(f.pensamiento_tokens, locale)}</td>
                      <td>{numero(f.herramientas_tokens, locale)}</td>
                      <td>{numero(f.total_tokens, locale)}</td>
                      <td>{f.busqueda ? `${g("c_si")} (${f.consultas_busqueda})` : g("c_no")}</td>
                      <td>{(f.duracion_ms / 1000).toFixed(1)} s</td>
                      <td>{f.costo === null ? g("c_sinTarifa") : usd(f.costo, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <section className="eg-bloque">
        <h2 className="eg-subtitulo">{g("c_tarifas")}</h2>
        <p className="ep-nota">{g("c_tarifasAyuda")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const limpias = Object.fromEntries(
              tarifas
                .filter((f) => f.modelo.trim() && (f.entrada || f.salida || f.busqueda))
                .map((f) => [f.modelo.trim(), { entrada: Number(f.entrada), salida: Number(f.salida), busqueda: Number(f.busqueda) }]),
            );
            void guardar({ accion: "tarifas", tarifas: limpias });
          }}
        >
          <div className="eg-tabla-desplazable">
            <table className="eg-tabla-tarifas">
              <thead>
                <tr>
                  <th scope="col">{g("c_modelo")}</th>
                  <th scope="col">{g("c_entradaM")}</th>
                  <th scope="col">{g("c_salidaM")}</th>
                  <th scope="col">{g("c_busquedaK")}</th>
                  <th scope="col">
                    <span className="eg-oculto">{g("c_quitar")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tarifas.map((f, i) => {
                  const cambiar = (campo: keyof FilaTarifa, valor: string) => setTarifas(tarifas.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
                  return (
                    <tr key={i}>
                      <td>
                        <input aria-label={g("c_nombreModelo")} value={f.modelo} maxLength={80} onChange={(e) => cambiar("modelo", e.target.value)} />
                      </td>
                      {(["entrada", "salida", "busqueda"] as const).map((campo) => (
                        <td key={campo}>
                          <input
                            aria-label={`${f.modelo} · ${g(campo === "entrada" ? "c_entradaM" : campo === "salida" ? "c_salidaM" : "c_busquedaK")}`}
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={f[campo]}
                            onChange={(e) => cambiar(campo, e.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        <button type="button" className="ep-boton ep-texto" aria-label={`${g("c_quitar")} ${f.modelo}`} onClick={() => setTarifas(tarifas.filter((_, j) => j !== i))}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="ep-acciones">
            <button type="button" className="ep-boton" onClick={() => setTarifas([...tarifas, { modelo: "", entrada: "", salida: "", busqueda: "" }])}>
              <Plus size={15} />
              {g("c_agregarModelo")}
            </button>
            <button className="ep-boton ep-primario" disabled={ocupado || !tarifasValidas}>
              <Save size={15} />
              {g("guardar")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
