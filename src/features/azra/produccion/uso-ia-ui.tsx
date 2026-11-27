"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Settings, Sparkles } from "lucide-react";
import type { ResumenUsoIA } from "@/lib/ia/uso";
import { useLanguage } from "../i18n";
import { useVisiblePolling } from "../use-visible-polling";
import "./configuracion.css";
type Tr = (clave: string) => string;
/* ── Datos de uso ── */
export function useUsoIA(activo: boolean) {
  const [uso, setUso] = useState<ResumenUsoIA | null>(null);
  const [error, setError] = useState(false);
  const recargar = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/produccion/uso", { cache: "no-store", signal });
      if (!r.ok) throw new Error(String(r.status));
      setUso(await r.json());
      setError(false);
    } catch (error) {
      if ((error as Error).name !== "AbortError") setError(true);
    }
  }, []);
  useEffect(() => {
    if (!activo) return;
    queueMicrotask(() => void recargar());
  }, [activo, recargar]);
  return { uso, error, recargar };
}

/** «Se restablece en 2 h y 39 min» / «en 3 d y 23 h», desde ahora hasta el instante dado. */
function faltaPara(iso: string, tr: Tr) {
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const texto =
    d > 0
      ? `${d} ${tr("cf_d")} ${tr("cf_y")} ${h} h`
      : h > 0
        ? `${h} h ${tr("cf_y")} ${m} min`
        : `${m} min`;
  return `${tr("cf_restableceEn")} ${texto}`;
}
function haceCuanto(iso: string, tr: Tr) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return tr("cf_ahora");
  const h = Math.round(min / 60);
  const texto = min < 60 ? `${min} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} ${tr("cf_d")}`;
  return tr("cf_hace").replace("{n}", texto);
}
/** Lo más gastado entre todos los límites (0–100): es lo que dibuja el círculo. */
export function usoMaximo(uso: ResumenUsoIA, tr: Tr, locale: string) {
  const filas = filasUso(uso, tr, locale).filter((f) => f.restante !== null);
  return filas.length ? Math.max(...filas.map((f) => 100 - f.restante!)) : 0;
}
const usd = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === "es" ? "es-SV" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1 ? 4 : 2,
  }).format(n);
const formato = (locale: string) => new Intl.NumberFormat(locale === "es" ? "es-SV" : "en-US");

type Fila = {
  clave: string;
  titulo: string;
  detalle: string;
  /** Porcentaje restante 0–100; null cuando no hay límite escrito (no se inventa uno). */
  restante: number | null;
  reanuda: string | null;
};
function filasUso(uso: ResumenUsoIA, tr: Tr, locale: string): Fila[] {
  const n = formato(locale);
  const gem = (p: ResumenUsoIA["gemini"]["dia"], titulo: string, clave: string): Fila => ({
    clave,
    titulo,
    detalle:
      p.limite === null
        ? `${n.format(p.usado)} ${tr("cf_tokens")} · ${tr("cf_sinLimite")}`
        : `${n.format(p.usado)} ${tr("cf_de")} ${n.format(p.limite)} ${tr("cf_tokens")}`,
    restante: p.porcentaje === null ? null : Math.max(0, Math.round(100 - p.porcentaje)),
    reanuda: p.reanuda,
  });
  const gpt = (
    v: NonNullable<ResumenUsoIA["chatgpt"]>["cincoHoras"],
    titulo: string,
    clave: string,
  ): Fila[] =>
    v
      ? [
          {
            clave,
            titulo,
            detalle: `${tr("cf_segunOpenAI")} · ${tr("cf_actualizado")} ${haceCuanto(uso.chatgpt!.actualizado, tr)}`,
            restante: Math.max(0, Math.round(100 - v.usado)),
            reanuda: v.reanuda,
          },
        ]
      : [];
  return [
    ...gpt(uso.chatgpt?.cincoHoras ?? null, tr("cf_chatgpt5h"), "gpt-5h"),
    ...gpt(uso.chatgpt?.semanal ?? null, tr("cf_chatgptSemana"), "gpt-semana"),
    intentos(uso, "astra", tr),
    intentos(uso, "claude", tr),
    gem(uso.gemini.dia, tr("cf_geminiDia"), "gemini-dia"),
    gem(uso.gemini.mes, tr("cf_geminiMes"), "gemini-mes"),
  ];
}
/** Intentos de Ezra de un proveedor, sobre el límite de 30 al mes que comparten Astra y Claude. */
function intentos(uso: ResumenUsoIA, p: "astra" | "claude", tr: Tr): Fila {
  const { limite, reanuda } = uso.intentos;
  return {
    clave: `intentos-${p}`,
    titulo: tr("cf_intentosDeEzra"),
    detalle: `${uso[p].usados} ${tr("cf_de")} ${limite} · ${tr("cf_compartidos")}`,
    restante: Math.max(0, Math.round(100 - (uso[p].usados / limite) * 100)),
    reanuda,
  };
}
type Grupo = { clave: string; titulo: string; filas: Fila[]; nota: string };
/** Cada IA por separado: sus límites y lo que el propio proveedor informó este mes. */
function gruposUso(uso: ResumenUsoIA, tr: Tr, locale: string): Grupo[] {
  const filas = filasUso(uso, tr, locale);
  const de = (prefijo: string) => filas.filter((f) => f.clave.startsWith(prefijo));
  const n = formato(locale);
  const local = (p: "astra" | "claude") => {
    const g = uso[p];
    const partes = [
      `${n.format(g.tokensMes)} ${tr("cf_tokens")}`,
      `${g.llamadasMes} ${tr("cf_llamadas")}`,
    ];
    if (g.sinTokens) partes.push(`${g.sinTokens} ${tr("cf_sinTokens")}`);
    const costo =
      g.costoApiMes === null ? "" : ` · ${tr("cf_equivaleApi")} ${usd(g.costoApiMes, locale)}`;
    return `${tr("cf_esteMes")}: ${partes.join(" · ")}${costo} · ${tr(p === "astra" ? "cf_cubrePlanChatgpt" : "cf_cubrePlanClaude")}`;
  };
  const gemini =
    uso.gemini.costoMes === null ? tr("cf_sinTarifa") : usd(uso.gemini.costoMes, locale);
  return [
    {
      clave: "astra",
      titulo: tr("cf_grupoAstra"),
      filas: [...de("gpt-"), ...de("intentos-astra")],
      nota: local("astra"),
    },
    {
      clave: "claude",
      titulo: tr("cf_grupoClaude"),
      filas: de("intentos-claude"),
      nota: local("claude"),
    },
    {
      clave: "gemini",
      titulo: "Gemini",
      filas: de("gemini-"),
      nota: `${tr("cf_gastoMes")}: ${gemini} · ${uso.gemini.llamadasMes} ${tr("cf_llamadas")}`,
    },
  ];
}
export function GruposUso({ uso, tr, locale }: { uso: ResumenUsoIA; tr: Tr; locale: string }) {
  return (
    <>
      {gruposUso(uso, tr, locale).map((g) => (
        <section key={g.clave} className="cf-grupo-ia" aria-label={g.titulo}>
          <h4>{g.titulo}</h4>
          {g.filas.map((f) => (
            <Barra key={f.clave} fila={f} tr={tr} />
          ))}
          <p className="cf-nota cf-gasto">{g.nota}</p>
        </section>
      ))}
      <p className="cf-nota cf-gasto">
        {tr("cf_compartidosQuedan").replace(
          "{n}",
          String(Math.max(0, uso.intentos.limite - uso.intentos.usados)),
        )}
      </p>
    </>
  );
}
/** Como en Claude: la barra muestra lo usado y va subiendo; naranja desde el 80 %. */
function Barra({ fila, tr }: { fila: Fila; tr: Tr }) {
  const usado = fila.restante === null ? null : 100 - fila.restante;
  const alto = usado !== null && usado >= 80;
  const texto = usado === null ? tr("cf_sinLimiteCorto") : `${usado} % ${tr("cf_usado")}`;
  return (
    <div className="cf-limite">
      <div className="cf-limite-cabeza">
        <strong>{fila.titulo}</strong>
      </div>
      <div className="cf-limite-linea">
        <span>
          {usado === null
            ? fila.detalle
            : fila.reanuda
              ? faltaPara(fila.reanuda, tr)
              : tr("cf_restablecido")}
        </span>
        <span className={alto ? "cf-bajo" : undefined}>{texto}</span>
      </div>
      <div
        className="cf-barra"
        role="progressbar"
        aria-label={fila.titulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usado ?? undefined}
        aria-valuetext={texto}
      >
        {usado !== null && usado > 0 && (
          <span className={alto ? "cf-barra-baja" : undefined} style={{ width: `${usado}%` }} />
        )}
      </div>
      {usado !== null && <small className="cf-limite-detalle">{fila.detalle}</small>}
    </div>
  );
}

/* ── Globo de Consumo (barra lateral) ── */
/**
 * Como el anillo de uso de Codex: «Consumo» no cambia de pantalla, abre un globo con los límites de las
 * tres IAs. «Administrar uso» lleva a Configuración › Uso. Escape o un clic fuera lo cierran.
 */
export function BotonConsumo({
  tr,
  activo,
  deshabilitado,
  onAdministrar,
}: {
  tr: Tr;
  activo: boolean;
  deshabilitado?: boolean;
  onAdministrar: () => void;
}) {
  const { locale } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  // El círculo siempre está visible: se carga al abrir el estudio y se refresca cada minuto.
  const { uso, error, recargar } = useUsoIA(!deshabilitado);
  useVisiblePolling(recargar, deshabilitado ? null : 60_000);
  useEffect(() => {
    if (abierto) void recargar();
  }, [abierto, recargar]);
  const anillo = uso ? usoMaximo(uso, tr, locale) : null;
  useEffect(() => {
    if (!abierto) return;
    const colocar = () => {
      const r = boton.current?.getBoundingClientRect();
      if (!r) return;
      // Escritorio: a la derecha de la barra, alineado con el botón. Móvil (cajón): encima del botón.
      const angosto = window.innerWidth < 768;
      setPos(
        angosto
          ? { left: Math.max(8, r.left), bottom: window.innerHeight - r.top + 8 }
          : { left: r.right + 10, bottom: Math.max(8, window.innerHeight - r.bottom) },
      );
    };
    colocar();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    const fuera = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node))
        setAbierto(false);
    };
    window.addEventListener("resize", colocar);
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    return () => {
      window.removeEventListener("resize", colocar);
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [abierto]);
  const destino = typeof document === "undefined" ? null : document.querySelector(".ez-app");
  return (
    <>
      <button
        ref={boton}
        className="cf-anillo"
        aria-current={activo ? "page" : undefined}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label={`${tr("p_consumo")}${anillo === null ? "" : ` · ${Math.round(anillo)} % ${tr("cf_usado")}`}`}
        disabled={deshabilitado}
        data-tooltip={`${tr("p_consumo")}${anillo === null ? "" : ` · ${Math.round(anillo)} % ${tr("cf_usado")}`}`}
        onClick={() => setAbierto((a) => !a)}
      >
        {/* Solo el logo de Ezra. El punto rojo avisa cuando algún límite pasa del 80 %. */}
        <Sparkles size={20} strokeWidth={1.75} aria-hidden="true" />
        {anillo !== null && anillo >= 80 && <span className="cf-anillo-punto" aria-hidden="true" />}
      </button>
      {abierto &&
        destino &&
        pos &&
        createPortal(
          <div
            ref={panel}
            className="cf-globo"
            role="dialog"
            aria-label={tr("cf_uso")}
            style={{ left: pos.left, bottom: pos.bottom }}
          >
            <p className="cf-globo-titulo">{tr("cf_limitesIA")}</p>
            {/* Solo esta parte se desplaza: el título y «Administrar uso» quedan fijos. */}
            <div className="cf-globo-cuerpo">
              {error && <p className="cf-nota">{tr("cf_errorUso")}</p>}
              {!uso && !error && <p className="cf-nota">{tr("cf_cargando")}</p>}
              {uso && <GruposUso uso={uso} tr={tr} locale={locale} />}
            </div>
            <button
              className="cf-globo-accion"
              onClick={() => {
                setAbierto(false);
                window.dispatchEvent(new Event("ezra:navego"));
                onAdministrar();
              }}
            >
              <Settings size={15} aria-hidden="true" />
              {tr("cf_administrarUso")}
            </button>
          </div>,
          destino,
        )}
    </>
  );
}
