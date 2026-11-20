"use client";
import { ArrowUpRight, Plus, Sparkles } from "lucide-react";
import type { ResumenInicio } from "@/lib/produccion/inicio";
import type { Preferencias } from "@/lib/produccion/preferencias-modelo";
import { Pixel } from "../../granjas/pixel";
import { FondoLiquido } from "./fondo-liquido";
import { Ventana } from "./ventana";
import { Linea, equipo, nombreAgente, rolAgente, type DestinoInicio, type Tr } from "./widgets";

const numero = new Intl.NumberFormat("es-SV");

/**
 * Bienvenida: titular con ícono incrustado, esfera de cristal sobre el fondo líquido, estadísticas
 * reales y los agentes asomándose por el borde de un monitor que muestra el Pulso en vivo.
 */
export function Hero({
  datos,
  tr,
  prefs,
  liquido,
  onIr,
  onNuevo,
  onPendientes,
}: {
  datos: ResumenInicio;
  tr: Tr;
  prefs: Preferencias;
  liquido: boolean;
  onIr: (d: DestinoInicio) => void;
  onNuevo: () => void;
  onPendientes: () => void;
}) {
  const presupuesto = datos.consumo.mes.porcentaje;
  const estadisticas = [
    { valor: numero.format(datos.granjasActivas), etiqueta: tr("ez_st_granjas") },
    { valor: numero.format(datos.eventos.enBandeja), etiqueta: tr("ez_st_eventos") },
    { valor: numero.format(datos.eventos.postsListos + datos.eventos.postsSubidos), etiqueta: tr("ez_st_posts") },
    { valor: presupuesto === null ? "—" : `${presupuesto} %`, etiqueta: tr("ez_st_presupuesto") },
  ];
  const ultimos = datos.series.pasado.map((d) => ({ dia: d.dia, v: d.eventos }));
  return (
    <section className="ez-hero" aria-labelledby="ez-hero-titulo">
      {liquido && <FondoLiquido className="ez-hero-liquido" />}
      <div className="ez-hero-contenido">
        <span className="ez-pill ez-hero-pill">
          <Sparkles size={13} aria-hidden="true" />
          {tr("ez_hero_pill")}
        </span>
        <div className="ez-esfera" aria-hidden="true" />
        <h1 id="ez-hero-titulo" className="ez-titulo ez-hero-titulo">
          {tr("ez_hero_l1")}
          <em>
            {tr("ez_hero_l2a")}{" "}
            <span className="ez-icono-texto" aria-hidden="true">
              <Sparkles />
            </span>{" "}
            {tr("ez_hero_l2b")}
          </em>
        </h1>
        <p className="ez-hero-sub">{tr("ez_hero_sub")}</p>
        <div className="ez-hero-acciones">
          <button className="ez-boton-negro" onClick={onPendientes}>
            {datos.pendientes.length ? `${tr("ez_hero_verPendientes")} (${datos.pendientes.length})` : tr("ez_hero_verPulso")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
          <button className="ez-boton-blanco" onClick={onNuevo}>
            <Plus size={16} aria-hidden="true" />
            {tr("p_nuevo")}
          </button>
        </div>
        <dl className="ez-estadisticas">
          {estadisticas.map((e) => (
            <div key={e.etiqueta}>
              <dt>{e.etiqueta}</dt>
              <dd>{e.valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="ez-monitor">
        <div className="ez-monitor-pantalla">
          <Ventana url="ezra.app/pulso">
            <div className="ez-mini">
              <div className="ez-mini-cabecera">
                <strong>{tr("ez_w_grafica")}</strong>
                <span className="ez-chip ez-chip-vivo">{tr("ez_enVivo")}</span>
              </div>
              <div className="ez-mini-total">
                <strong>{numero.format(ultimos.reduce((s, x) => s + x.v, 0))}</strong>
                <small>{tr("ez_mini_eventos")}</small>
              </div>
              <div className="ez-mini-pie">
                <span>
                  <small>{tr("ez_kpi_nuevos")}</small>
                  <strong>{datos.eventos.nuevos}</strong>
                </span>
                <span>
                  <small>{tr("ez_kpi_postsListos")}</small>
                  <strong>{datos.eventos.postsListos}</strong>
                </span>
                <span>
                  <small>{tr("ez_menu_dia")}</small>
                  <strong>{datos.progreso.porcentaje} %</strong>
                </span>
              </div>
              <Linea puntos={ultimos} alto={110} etiqueta={tr("ez_mini_eventos")} />
            </div>
          </Ventana>
        </div>
        <ul className="ez-agentes-asoman" aria-label={tr("ez_w_agentes")}>
          {equipo.map(({ agente, indice, destino }, i) => (
            <li key={agente} style={{ ["--i" as string]: i }}>
              <button className="ez-agente" onClick={() => onIr({ seccion: destino })} aria-describedby={`ez-rol-${agente}`}>
                <Pixel indice={indice} grande />
                <span className="ez-agente-nombre">{nombreAgente(agente, prefs, tr)}</span>
                <span className="ez-agente-rol" role="tooltip" id={`ez-rol-${agente}`}>
                  {rolAgente(agente, prefs, tr)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
