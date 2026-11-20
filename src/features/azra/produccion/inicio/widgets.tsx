"use client";
import { useId, useState } from "react";
import { AlertTriangle, ArrowUpRight, CircleDot } from "lucide-react";
import type { ResumenInicio } from "@/lib/produccion/inicio";
import type { Preferencias, WidgetPulso } from "@/lib/produccion/preferencias-modelo";
import { Pixel } from "../../granjas/pixel";

export type DestinoInicio = { seccion: "encargos" | "granjas" | "eventos" | "conexiones" | "consumo" | "calendario" | "instagram"; id?: string; filtro?: string };
export type Tr = (clave: string) => string;
type Props = { datos: ResumenInicio; tr: Tr; fecha: (iso: string) => string; onIr: (d: DestinoInicio) => void; onNuevo: () => void; prefs: Preferencias };

const numero = new Intl.NumberFormat("es-SV");
const compacto = new Intl.NumberFormat("es-SV", { notation: "compact", maximumFractionDigits: 1 });

/** Agentes del equipo: los especialistas reales de las granjas, con su robot y a dónde llevan. */
export const equipo: { agente: string; indice: number; destino: DestinoInicio["seccion"] }[] = [
  { agente: "cazador", indice: 0, destino: "granjas" },
  { agente: "verificador", indice: 3, destino: "eventos" },
  { agente: "imagen_evento", indice: 2, destino: "eventos" },
  { agente: "redactor_ig", indice: 1, destino: "eventos" },
  { agente: "disenador_post", indice: 4, destino: "eventos" },
];
export const nombreAgente = (a: string, prefs: Preferencias, tr: Tr) => prefs.agentes[a]?.nombre || tr(`p_${a}_titulo`);
export const rolAgente = (a: string, prefs: Preferencias, tr: Tr) => prefs.agentes[a]?.rol || tr(`p_${a}_texto`);

/* ── 1. Requiere tu atención ── */
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
export function WidgetAtencion({ datos, tr, onIr, onNuevo }: Props) {
  const sugerido = !datos.pendientes.length ? datos.siguiente : null;
  return (
    <ul className="ez-filas">
      {sugerido && (
        <li className="ez-fila">
          <span>
            <strong>{tr(`p_sp_${sugerido.accion}`)}</strong>
            {sugerido.titulo && <small>{sugerido.titulo}</small>}
          </span>
          <button
            className="ez-boton-blanco"
            onClick={() => (sugerido.accion === "primer_encargo" || sugerido.accion === "nuevo_encargo" ? onNuevo() : onIr({ seccion: sugerido.seccion as DestinoInicio["seccion"], id: sugerido.id }))}
          >
            {tr(`p_spb_${sugerido.accion}`)}
          </button>
        </li>
      )}
      {datos.pendientes.map((p, i) => (
        <li key={`${p.tipo}-${p.id ?? i}`} className="ez-fila">
          <span>
            <strong>{p.titulo}</strong>
            <small>{p.detalle}</small>
          </span>
          <span className={`ep-chip ${chipPendiente[p.tipo]?.clase ?? "ep-chip-neutro"}`}>{tr(chipPendiente[p.tipo]?.clave ?? "p_chip_revision")}</span>
          <button className="ez-boton-blanco" onClick={() => onIr({ seccion: p.seccion, id: p.id })}>
            {tr(accionPendiente[p.tipo] ?? "p_ac_abrir")}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── 2. En ejecución y bloqueados ── */
export function WidgetEjecucion({ datos, tr, fecha, onIr }: Props) {
  const { trabajando, bloqueados } = datos.trabajo;
  if (!trabajando.length && !bloqueados.length) return <p className="ez-vacio">{tr("ez_w_ejecucion_vacio")}</p>;
  return (
    <ul className="ez-lista">
      {bloqueados.map((b) => (
        <li key={`b-${b.tipo}-${b.id}`}>
          <button className="ez-bloqueado" onClick={() => onIr({ seccion: b.tipo === "granja" ? "granjas" : "encargos", id: b.id })}>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              {b.titulo}
              <small>
                {tr(b.tipo === "granja" ? "ez_w_bloqueadaGranja" : "ez_w_falloEncargo")}: {b.detalle}
                {b.desde ? ` · ${fecha(b.desde)}` : ""}
              </small>
            </span>
          </button>
        </li>
      ))}
      {trabajando.map((t) => (
        <li key={`t-${t.id}`}>
          <button onClick={() => onIr({ seccion: "granjas", id: t.id })}>
            <CircleDot size={15} aria-hidden="true" />
            <span>
              {t.titulo}
              <small>
                {t.detalle} · {tr("ez_w_desde")} {fecha(t.desde)}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── 3. Eventos por revisar ── */
export function WidgetEventos({ datos, tr, onIr }: Props) {
  const { porRevisar } = datos.trabajo;
  if (!porRevisar.length) return <p className="ez-vacio">{tr("ez_w_eventos_vacio")}</p>;
  return (
    <>
      <ul className="ez-lista">
        {porRevisar.map((e) => (
          <li key={e.id}>
            <button onClick={() => onIr({ seccion: "eventos" })}>
              <time dateTime={e.fecha ?? undefined}>{e.fecha ?? tr("ez_dc_sinFecha")}</time>
              <span>
                {e.titulo}
                <small>
                  {e.departamento ?? tr("ez_mapa_sinUbicacion")} · {tr("ez_w_confianza")} {e.confianza} %
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {datos.eventos.nuevos > porRevisar.length && (
        <button className="ez-boton-blanco ez-widget-mas" onClick={() => onIr({ seccion: "eventos" })}>
          {tr("ez_w_verTodos")} ({datos.eventos.nuevos}) <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      )}
    </>
  );
}

/* ── 4. Contenido listo ── */
export function WidgetListo({ datos, tr, fecha, onIr }: Props) {
  const { listo } = datos.trabajo;
  if (!listo.length) return <p className="ez-vacio">{tr("ez_w_listo_vacio")}</p>;
  return (
    <ul className="ez-lista">
      {listo.map((c) => (
        <li key={`${c.tipo}-${c.id}`}>
          <button onClick={() => onIr(c.tipo === "encargo" ? { seccion: "encargos", id: c.id } : { seccion: "instagram" })}>
            <span>
              {c.titulo}
              <small>
                {tr(`ez_dest_${c.estado}`)} · {fecha(c.fecha)}
              </small>
            </span>
            <span className={`ez-est ${c.estado === "confirmada_por_usuario" ? "ez-est-hecho" : "ez-est-atencion"}`}>{tr(c.tipo === "encargo" ? "ez_w_encargo" : "ez_w_post")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── 5. Conexiones y actividad reciente ── */
const conectada = (estado: string) => estado === "conectada_publicacion" || estado === "conectada_lectura";
export function WidgetConexiones({ datos, tr, fecha, onIr }: Props) {
  const accion = (a: string) => {
    const clave = `ez_act_${a.replace(/\./g, "_")}`;
    const texto = tr(clave);
    return texto === clave ? a : texto;
  };
  return (
    <div className="ez-conex">
      <ul className="ez-conex-lista">
        {datos.conexiones.map((c) => (
          <li key={c.canal}>
            <button onClick={() => onIr({ seccion: "conexiones" })}>
              <i className={conectada(c.estado) ? "ez-ok" : c.error ? "ez-mal" : "ez-gris"} aria-hidden="true" />
              <span>
                {c.canal === "spotmi" ? "Spotmi web" : c.canal.charAt(0).toUpperCase() + c.canal.slice(1)}
                <small>{conectada(c.estado) ? c.cuenta || tr("ez_ig_conectada") : tr(`ez_conex_${c.estado}`)}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h4>{tr("ez_w_actividad")}</h4>
      {datos.trabajo.actividad.length ? (
        <ul className="ez-actividad">
          {datos.trabajo.actividad.map((a, i) => (
            <li key={`${a.fecha}-${i}`}>
              <span>{accion(a.accion)}</span>
              <time dateTime={a.fecha}>{fecha(a.fecha)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ez-vacio">{tr("ez_w_sinActividad")}</p>
      )}
    </div>
  );
}

/* ── Consumo de Gemini: hoy y mes, cada uno con su tope (mismo cálculo que la pantalla Consumo) ── */
export function WidgetConsumo({ datos, tr, onIr }: Props) {
  const filas = [
    { clave: "hoy", p: datos.consumo.dia, tope: "ez_w_topeDiario" },
    { clave: "mes", p: datos.consumo.mes, tope: "ez_w_topeMensual" },
  ];
  return (
    <div className="ez-consumo">
      {filas.map(({ clave, p, tope }) => (
        <button key={clave} className="ez-consumo-fila" onClick={() => onIr({ seccion: "consumo" })}>
          <span>
            <strong>{tr(`ez_w_gemini_${clave}`)}</strong>
            <small>
              {compacto.format(p.usado)} {tr("ez_w_tokens")}
              {p.limite ? ` ${tr("ez_w_de")} ${compacto.format(p.limite)} (${tr(tope)})` : ` · ${tr("ez_kpi_sinTope")}`}
            </small>
          </span>
          <strong className="ez-consumo-pct">{p.porcentaje === null ? "—" : `${p.porcentaje} %`}</strong>
          {p.limite !== null && (
            <span className="ez-barra" aria-hidden="true">
              <span style={{ width: `${Math.min(100, p.porcentaje ?? 0)}%` }} />
            </span>
          )}
        </button>
      ))}
      <p className="ep-nota">
        {tr("ez_w_imagenesIA")}: {datos.consumo.imagenesIA.hoy}/{datos.consumo.imagenesIA.limite}
      </p>
    </div>
  );
}

/* ── Gráfica de los últimos 30 días (SVG) ── */
const pestanas = ["eventos", "posts", "consumo", "proximos"] as const;
type Pestana = (typeof pestanas)[number];
function serie(datos: ResumenInicio, p: Pestana) {
  if (p === "proximos") return datos.series.futuro.map((d) => ({ dia: d.dia, v: d.proximas }));
  return datos.series.pasado.map((d) => ({ dia: d.dia, v: p === "eventos" ? d.eventos : p === "posts" ? d.postsCreados + d.postsSubidos : d.tokens }));
}
export function Linea({ puntos, alto = 150, etiqueta }: { puntos: { dia: string; v: number }[]; alto?: number; etiqueta: string }) {
  const id = useId();
  const ancho = 600;
  const max = Math.max(1, ...puntos.map((p) => p.v));
  const x = (i: number) => (puntos.length < 2 ? 0 : (i / (puntos.length - 1)) * ancho);
  const y = (v: number) => alto - 8 - (v / max) * (alto - 24);
  const camino = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const ultimo = puntos.at(-1);
  return (
    <svg className="ez-linea" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" role="img" aria-label={etiqueta}>
      <defs>
        <linearGradient id={`${id}-relleno`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--ez-azul)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--ez-azul)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {puntos.length > 1 && <path d={`${camino} L${ancho},${alto} L0,${alto} Z`} fill={`url(#${id}-relleno)`} />}
      <path d={camino} fill="none" stroke="var(--ez-azul)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {ultimo && <circle cx={x(puntos.length - 1)} cy={y(ultimo.v)} r="4" fill="var(--ep-tarjeta)" stroke="var(--ez-azul)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
export function WidgetGrafica({ datos, tr }: Props) {
  const [p, setP] = useState<Pestana>("eventos");
  const puntos = serie(datos, p);
  const total = puntos.reduce((s, x) => s + x.v, 0);
  const panel = useId();
  return (
    <div className="ez-grafica">
      <div className="ez-pestanas" role="tablist" aria-label={tr("ez_w_grafica")}>
        {pestanas.map((x) => (
          <button key={x} role="tab" aria-selected={p === x} aria-controls={panel} onClick={() => setP(x)}>
            {tr(`ez_tab_${x}`)}
          </button>
        ))}
      </div>
      <div id={panel} role="tabpanel">
        <div className="ez-grafica-total">
          <strong>{(p === "consumo" ? compacto : numero).format(total)}</strong>
          <small>{tr(p === "proximos" ? "ez_grafica_14" : "ez_grafica_30")}</small>
        </div>
        <Linea puntos={puntos} etiqueta={`${tr(`ez_tab_${p}`)}: ${numero.format(total)}`} />
      </div>
    </div>
  );
}

/* ── Agentes (opcional, oculto por defecto) ── */
export function WidgetAgentes({ tr, onIr, prefs }: Props) {
  return (
    <ul className="ez-equipo">
      {equipo.map(({ agente, indice, destino }) => (
        <li key={agente}>
          <button onClick={() => onIr({ seccion: destino })}>
            <Pixel indice={indice} />
            <strong>{nombreAgente(agente, prefs, tr)}</strong>
            <small>{rolAgente(agente, prefs, tr)}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

export const componentes: Record<WidgetPulso, (p: Props) => React.ReactNode> = {
  atencion: WidgetAtencion,
  ejecucion: WidgetEjecucion,
  eventos: WidgetEventos,
  listo: WidgetListo,
  conexiones: WidgetConexiones,
  consumo: WidgetConsumo,
  grafica: WidgetGrafica,
  agentes: WidgetAgentes,
};
