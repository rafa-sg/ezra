"use client";
import { useEffect, useState } from "react";
import { Clock, Save } from "lucide-react";
import type { VistaHorario } from "@/lib/granjas/horario";
import type { Granja } from "./cliente";
import { pedir } from "./cliente";

const diasSemana = [1, 2, 3, 4, 5, 6, 0];
export type HorariosRespuesta = { horarios: Record<string, VistaHorario>; ahora: string };

/** Resumen corto para la tarjeta de una granja en la lista. */
export function resumenHorario(
  h: VistaHorario | undefined,
  g: (c: string) => string,
  fecha: (iso: string) => string,
) {
  if (!h?.activa) return g("h_inactivo");
  if (h.pausaMotivo) return `${g("h_pausada")} ${h.pausaMotivo}`;
  return `${g("h_programada")} · ${h.despuesDe ? g("h_proximaEncadenada") : `${h.hora} · ${g("h_proxima")}: ${h.proxima ? fecha(h.proxima) : "—"}`}`;
}

/** Horario diario de una granja: activa, hora, días, máximo, encadenado y cuenta de Instagram. */
export function PanelHorario({
  granja,
  granjas,
  g,
  fecha,
  ocupado,
  onGuardado,
}: {
  granja: Granja;
  granjas: Granja[];
  g: (clave: string) => string;
  fecha: (iso: string) => string;
  ocupado: boolean;
  onGuardado: () => void;
}) {
  const [vista, setVista] = useState<VistaHorario | null>(null);
  const [form, setForm] = useState<{
    activa: boolean;
    hora: string;
    dias: number[];
    despuesDe: string;
    maximo: string;
    cuenta: string;
    acepto: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const proposito = granja.ajustes.purpose;
  const maximoActual =
    proposito === "eventos_el_salvador"
      ? (granja.ajustes.eventos?.maxPorDia ?? 10)
      : proposito === "post_instagram_eventos"
        ? (granja.ajustes.instagram?.postsPorDia ?? 3)
        : null;
  const usaIA = granja.grafo.nodos.some(
    (n) => n.tipo === "agente" && n.proveedor !== "manual" && n.proveedor !== "local",
  );
  useEffect(() => {
    let vivo = true;
    pedir<HorariosRespuesta>("/api/granjas/horarios")
      .then((r) => {
        if (!vivo) return;
        const h = r.horarios[granja.id];
        setVista(h ?? null);
        if (h)
          setForm({
            activa: h.activa,
            hora: h.hora,
            dias: h.dias,
            despuesDe: h.despuesDe ?? "",
            maximo: maximoActual ? String(maximoActual) : "",
            cuenta: granja.ajustes.instagram?.cuenta ?? "@spotmi.sv",
            acepto: false,
          });
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [granja.id, granja.ajustes.instagram?.cuenta, maximoActual]);
  if (!form || !vista)
    return (
      <section className="eg-bloque eg-horario">
        {error ? <p className="ep-alerta">{error}</p> : <p role="status">{g("cargando")}</p>}
      </section>
    );
  const necesitaConsentimiento = form.activa && usaIA && !(vista.activa && vista.consentimiento);
  async function guardar() {
    if (!form) return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const r = await pedir<{ horario: VistaHorario }>("/api/granjas/horarios", {
        granjaId: granja.id,
        horario: {
          activa: form.activa,
          hora: form.hora,
          dias: form.dias,
          despuesDe: form.despuesDe || null,
        },
        aceptoIA: form.acepto,
        ...(maximoActual !== null && form.maximo ? { maximo: Number(form.maximo) } : {}),
        ...(proposito === "post_instagram_eventos" ? { cuenta: form.cuenta } : {}),
      });
      setVista(r.horario);
      setForm({ ...form, acepto: false });
      setAviso(g("h_guardado"));
      onGuardado();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }
  const otras = granjas.filter((x) => x.id !== granja.id && x.estado !== "archivada");
  return (
    <section className="eg-bloque eg-horario" aria-labelledby={`horario-${granja.id}`}>
      <div className="eg-bloque-cabecera">
        <h2 className="eg-subtitulo" id={`horario-${granja.id}`}>
          <Clock size={17} aria-hidden="true" /> {g("h_titulo")}
        </h2>
        <span className="ep-pill">{vista.activa ? g("h_programada") : g("h_inactivo")}</span>
      </div>
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
      <label className="ep-checkbox">
        <input
          type="checkbox"
          checked={form.activa}
          onChange={(e) => setForm({ ...form, activa: e.target.checked })}
        />
        {g("h_activa")}
      </label>
      <div className="eg-formulario-linea">
        <label className="eg-campo">
          {g("h_cuando")}
          <select
            value={form.despuesDe}
            onChange={(e) => setForm({ ...form, despuesDe: e.target.value })}
          >
            <option value="">{g("h_propiaHora")}</option>
            {otras.map((x) => (
              <option key={x.id} value={x.id}>
                {g("h_despuesDe")} «{x.nombre}»
              </option>
            ))}
          </select>
        </label>
        {!form.despuesDe && (
          <label className="eg-campo">
            {g("h_hora")}
            <input
              type="time"
              required
              value={form.hora}
              onChange={(e) => setForm({ ...form, hora: e.target.value })}
            />
          </label>
        )}
        {maximoActual !== null && (
          <label className="eg-campo">
            {g(proposito === "eventos_el_salvador" ? "h_maxEventos" : "h_maxPosts")}
            <input
              type="number"
              min={1}
              max={proposito === "eventos_el_salvador" ? 30 : 20}
              value={form.maximo}
              onChange={(e) => setForm({ ...form, maximo: e.target.value })}
            />
          </label>
        )}
        {proposito === "post_instagram_eventos" && (
          <label className="eg-campo">
            {g("h_cuenta")}
            <input
              maxLength={60}
              value={form.cuenta}
              onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
            />
          </label>
        )}
      </div>
      <fieldset className="eg-dias">
        <legend>{g("h_dias")}</legend>
        {diasSemana.map((d) => (
          <label key={d} className="eg-dia">
            <input
              type="checkbox"
              checked={form.dias.includes(d)}
              onChange={(e) =>
                setForm({
                  ...form,
                  dias: e.target.checked ? [...form.dias, d] : form.dias.filter((x) => x !== d),
                })
              }
            />
            {g(`h_dia_${d}`)}
          </label>
        ))}
      </fieldset>
      {necesitaConsentimiento && (
        <label className="ep-checkbox">
          <input
            type="checkbox"
            checked={form.acepto}
            onChange={(e) => setForm({ ...form, acepto: e.target.checked })}
          />
          {g("h_consentimiento")}
        </label>
      )}
      <dl className="eg-horario-estado">
        <div>
          <dt>{g("h_proxima")}</dt>
          <dd>
            {vista.activa
              ? vista.despuesDe
                ? g("h_proximaEncadenada")
                : vista.proxima
                  ? fecha(vista.proxima)
                  : "—"
              : "—"}
          </dd>
        </div>
        <div>
          <dt>{g("h_ultima")}</dt>
          <dd>
            {vista.ultima
              ? `${fecha(vista.ultima.creado)} · ${g(`ejec_${vista.ultima.estado}`)}`
              : g("h_nunca")}
          </dd>
        </div>
        {vista.pausaMotivo && (
          <div>
            <dt>{g("h_pausada")}</dt>
            <dd>
              {vista.pausaMotivo}
              {vista.pausaHasta ? ` · ${g("h_hasta")} ${fecha(vista.pausaHasta)}` : ""}
            </dd>
          </div>
        )}
        {vista.ultimoError && (
          <div>
            <dt>{g("h_error")}</dt>
            <dd>{vista.ultimoError}</dd>
          </div>
        )}
      </dl>
      <p className="ep-nota">{g("h_ayuda")}</p>
      <div className="ep-acciones">
        <button
          className="ep-boton ep-primario"
          disabled={
            ocupado || guardando || !form.dias.length || (necesitaConsentimiento && !form.acepto)
          }
          onClick={() => void guardar()}
        >
          <Save size={15} />
          {g("guardar")}
        </button>
      </div>
    </section>
  );
}
