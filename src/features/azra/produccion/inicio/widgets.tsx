"use client";
import { useId, useState } from "react";
import { ArrowUpRight, Camera } from "lucide-react";
import type { ResumenInicio } from "@/lib/produccion/inicio";
import type { Preferencias, WidgetPulso } from "@/lib/produccion/preferencias-modelo";
import { Pixel } from "../../granjas/pixel";

export type DestinoInicio = { seccion: "encargos" | "granjas" | "eventos" | "conexiones" | "consumo" | "calendario"; id?: string };
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

/* ── KPIs ── */
export function WidgetKpis({ datos, tr, onIr }: Props) {
  const dia = datos.consumo.dia;
  const tarjetas = [
    { valor: datos.eventos.nuevos, etiqueta: tr("ez_kpi_nuevos"), ir: "eventos" as const },
    { valor: datos.eventos.aprobados, etiqueta: tr("ez_kpi_aprobados"), ir: "eventos" as const },
    { valor: datos.eventos.postsListos, etiqueta: tr("ez_kpi_postsListos"), extra: `${datos.eventos.postsSubidos} ${tr("ez_kpi_subidos")}`, ir: "eventos" as const },
    {
      valor: dia.usado,
      etiqueta: tr("ez_kpi_tokensHoy"),
      formato: compacto,
      extra: dia.limite ? `${dia.porcentaje ?? 0} % ${tr("ez_kpi_delTope")}` : tr("ez_kpi_sinTope"),
      barra: dia.limite ? Math.min(100, dia.porcentaje ?? 0) : null,
      ir: "consumo" as const,
    },
  ];
  return (
    <div className="ez-kpis">
      {tarjetas.map((t) => (
        <button key={t.etiqueta} className="ez-kpi" onClick={() => onIr({ seccion: t.ir })}>
          <strong>{(t.formato ?? numero).format(t.valor)}</strong>
          <span>{t.etiqueta}</span>
          {t.extra && <small>{t.extra}</small>}
          {t.barra !== undefined && t.barra !== null && (
            <span className="ez-barra" aria-hidden="true">
              <span style={{ width: `${t.barra}%` }} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Gráfica con pestañas (SVG, sin bibliotecas) ── */
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
          <stop offset="0" stopColor="var(--ez-azul)" stopOpacity="0.22" />
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
  // Variación: últimos 7 días contra los 7 anteriores (no aplica a lo que viene).
  const ult = puntos.slice(-7).reduce((s, x) => s + x.v, 0);
  const ant = puntos.slice(-14, -7).reduce((s, x) => s + x.v, 0);
  const delta = p === "proximos" || !ant ? null : Math.round(((ult - ant) / ant) * 1000) / 10;
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
          {delta !== null && <span className={`ez-chip ${delta >= 0 ? "ez-chip-vivo" : ""}`}>{`${delta >= 0 ? "+" : ""}${delta} %`}</span>}
          <small>{tr(p === "proximos" ? "ez_grafica_14" : "ez_grafica_30")}</small>
        </div>
        <Linea puntos={puntos} etiqueta={`${tr(`ez_tab_${p}`)}: ${numero.format(total)}`} />
      </div>
    </div>
  );
}

/* ── Atención ── */
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

/* ── Próximas fechas ── */
export function WidgetProximas({ datos, tr, fecha, onIr }: Props) {
  if (!datos.proximas.length) return <p className="ez-vacio">{tr("ez_sinProximas")}</p>;
  return (
    <ul className="ez-lista">
      {datos.proximas.slice(0, 6).map((p) => (
        <li key={`${p.tipo}-${p.id}`}>
          <button onClick={() => onIr({ seccion: p.tipo === "encargo" ? "encargos" : "eventos", id: p.tipo === "encargo" ? p.id : undefined })}>
            <time dateTime={p.fecha}>{fecha(p.fecha)}</time>
            <span>{p.titulo}</span>
            <span className="ez-chip">{tr(p.tipo === "encargo" ? "ez_encargo" : "ez_evento")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── Instagram ── */
export function WidgetInstagram({ datos, tr, onIr }: Props) {
  const ig = datos.conexiones.find((c) => c.canal === "instagram");
  const conectada = ig && (ig.estado === "conectada_publicacion" || ig.estado === "conectada_lectura");
  return (
    <div className="ez-ig">
      <div className="ez-ig-cuenta">
        <span className="ez-ig-icono" aria-hidden="true">
          <Camera size={18} />
        </span>
        <span>
          <strong>{conectada ? ig.cuenta || "Instagram" : tr("ez_ig_sinConectar")}</strong>
          <small>{conectada ? tr("ez_ig_conectada") : tr("ez_ig_conectarAyuda")}</small>
        </span>
        {conectada && <span className="ez-chip ez-chip-vivo">{tr("ez_enVivo")}</span>}
      </div>
      <div className="ez-ig-numeros">
        <span>
          <strong>{datos.eventos.postsListos}</strong>
          <small>{tr("ez_kpi_postsListos")}</small>
        </span>
        <span>
          <strong>{datos.eventos.postsSubidos}</strong>
          <small>{tr("ez_kpi_subidos")}</small>
        </span>
      </div>
      <button className="ez-boton-blanco" onClick={() => onIr({ seccion: conectada ? "eventos" : "conexiones" })}>
        {tr(conectada ? "ez_ig_verPosts" : "ez_ig_conectar")}
        <ArrowUpRight size={15} />
      </button>
    </div>
  );
}

/* ── Granjas: última ejecución ── */
export function WidgetGranjas({ datos, tr, fecha, onIr, prefs }: Props) {
  if (!datos.granjas.length) return <p className="ez-vacio">{tr("g_sinGranjas")}</p>;
  return (
    <ul className="ez-lista">
      {datos.granjas.map((g) => (
        <li key={g.granjaId}>
          <button onClick={() => onIr({ seccion: "granjas", id: g.granjaId })}>
            <i className="ez-punto" style={{ background: prefs.coloresGranja[g.granjaId] ?? "var(--ez-azul)" }} aria-hidden="true" />
            <span>
              {g.nombre}
              <small>{g.ultima ? `${tr(`ez_ej_${g.ultima.estado}`)} · ${fecha(g.ultima.creado)}` : tr("ez_sinEjecuciones")}</small>
            </span>
            {g.fallidos > 0 && <span className="ep-chip ep-chip-error">{g.fallidos}</span>}
            {g.enRevision > 0 && <span className="ep-chip ep-chip-atencion">{g.enRevision}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── Agentes ── */
export function WidgetAgentes({ datos, tr, onIr, prefs }: Props) {
  const total = (campo: "eventos" | "postsCreados") => datos.series.pasado.reduce((s, d) => s + d[campo], 0);
  const trabajo: Record<string, string> = {
    cazador: `${total("eventos")} ${tr("ez_ag_eventos30")}`,
    verificador: `${datos.eventos.aprobados} ${tr("ez_kpi_aprobados").toLowerCase()}`,
    imagen_evento: `${datos.consumo.imagenesIA.hoy}/${datos.consumo.imagenesIA.limite} ${tr("ez_ag_imagenesHoy")}`,
    redactor_ig: `${total("postsCreados")} ${tr("ez_ag_posts30")}`,
    disenador_post: `${datos.eventos.postsListos} ${tr("ez_kpi_postsListos").toLowerCase()}`,
  };
  return (
    <ul className="ez-equipo">
      {equipo.map(({ agente, indice, destino }) => (
        <li key={agente}>
          <button onClick={() => onIr({ seccion: destino })}>
            <Pixel indice={indice} />
            <strong>{nombreAgente(agente, prefs, tr)}</strong>
            <small>{rolAgente(agente, prefs, tr)}</small>
            <span className="ez-chip">{trabajo[agente]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export const componentes: Record<WidgetPulso, (p: Props) => React.ReactNode> = {
  kpis: WidgetKpis,
  grafica: WidgetGrafica,
  atencion: WidgetAtencion,
  proximas: WidgetProximas,
  instagram: WidgetInstagram,
  granjas: WidgetGranjas,
  agentes: WidgetAgentes,
};
