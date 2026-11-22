"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, Play, RefreshCw } from "lucide-react";
import type { Conexion } from "@/lib/granjas/conexiones";
import "./apps.css";

type Tr = (clave: string) => string;
export type CanalApp = "instagram" | "tiktok" | "facebook" | "youtube";
export const canalesApp: CanalApp[] = ["instagram", "tiktok", "facebook", "youtube"];
export type CuentaApp = {
  canal: CanalApp;
  /** Id de la conexión en Ezra (una por cuenta; puede haber varias por red). */
  conexionId: string;
  alcance: "compartida" | "personal";
  /** Id de la cuenta en la red (canal de YouTube, usuario de Instagram…). */
  id: string;
  nombre: string;
  estado: string;
  verificado: string | null;
  aviso: string;
};

/** Identidad de cada red: nombre, sigla del ícono y lo que se llama «cuenta» en ella. */
export const redes: Record<CanalApp, { nombre: string; sigla: ReactNode; clase: string }> = {
  instagram: { nombre: "Instagram", sigla: "IG", clase: "ez-app-ig" },
  tiktok: { nombre: "TikTok", sigla: "TT", clase: "ez-app-tt" },
  facebook: { nombre: "Facebook", sigla: "f", clase: "ez-app-fb" },
  youtube: {
    nombre: "YouTube",
    sigla: <Play size={15} fill="currentColor" aria-hidden="true" />,
    clase: "ez-app-yt",
  },
};
const conectada = (c: Conexion) =>
  Boolean(c.identidad?.id) &&
  ["conectada_lectura", "conectada_publicacion", "restringida"].includes(c.estado);

/** Cuenta activa por red (por navegador): la usan Apps y, por ejemplo, la búsqueda de Videos virales. */
export function guardarCuentaActiva(c: CuentaApp) {
  try {
    window.localStorage.setItem(`ezra:cuenta-activa:${c.canal}`, c.conexionId);
  } catch {
    /* sin almacenamiento: dura solo esta visita */
  }
}
export function leerCuentaActiva(canal: CanalApp): string | null {
  try {
    return window.localStorage.getItem(`ezra:cuenta-activa:${canal}`);
  } catch {
    return null;
  }
}
/** Cuentas realmente conectadas (lo que guarda Conexiones); nunca se inventan cuentas. */
export function useCuentasApp() {
  const [cuentas, setCuentas] = useState<CuentaApp[] | null>(null);
  const [error, setError] = useState("");
  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/granjas/conexiones", { cache: "no-store" });
      const j = (await r.json()) as { conexiones?: Conexion[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
      setCuentas(
        (j.conexiones ?? [])
          .filter(
            (c): c is Conexion & { canal: CanalApp } =>
              (canalesApp as string[]).includes(c.canal) && conectada(c),
          )
          .map((c) => ({
            canal: c.canal,
            conexionId: c.id!,
            alcance: c.alcance,
            id: c.identidad!.id,
            nombre: c.identidad!.nombre,
            estado: c.estado,
            verificado: c.verificado,
            aviso: c.aviso,
          })),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setCuentas([]);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void cargar());
  }, [cargar]);
  return { cuentas, error, recargar: cargar };
}

/**
 * Botón «Apps» de la barra lateral. Al acercar el cursor (o con clic, toque o teclado) despliega las
 * cuentas conectadas en una columna flotante al lado de la barra, con una aparición escalonada desde
 * el botón (referencia: video 627). Sigue abierto mientras el cursor esté en el botón o el menú; se
 * cierra con Escape, tocando afuera o al elegir. Se dibuja fuera de la barra, sobre la vista actual.
 */
export function BotonApps({
  tr,
  cuentas,
  activa,
  seccionActiva,
  onElegir,
  deshabilitado,
}: {
  tr: Tr;
  cuentas: CuentaApp[] | null;
  activa: CuentaApp | null;
  seccionActiva: boolean;
  onElegir: (c: CuentaApp) => void;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const reloj = useRef<number | null>(null);
  const porTeclado = useRef(false);
  // Al lado de la barra (desde su borde); si no cabe (cajón en el teléfono), debajo del botón.
  const medir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const borde = boton.current?.closest(".ez-sidebar")?.getBoundingClientRect().right ?? r.right;
    const ancho = Math.min(280, window.innerWidth - 16);
    if (borde + 12 + ancho <= window.innerWidth - 8) setPos({ x: borde + 12, y: r.top });
    else
      setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)), y: r.bottom + 6 });
  };
  const abrir = () => {
    if (reloj.current) window.clearTimeout(reloj.current);
    medir();
    setAbierto(true);
  };
  // Un pequeño margen para pasar del botón al menú con calma.
  const cerrarLuego = () => {
    if (reloj.current) window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setAbierto(false), 240);
  };
  const cerrar = (devolverFoco = false) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  };
  useEffect(() => {
    if (!abierto) return;
    if (porTeclado.current) menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    porTeclado.current = false;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar(true);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    const fuera = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node))
        setAbierto(false);
    };
    const mover = () => medir();
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("resize", mover);
    window.addEventListener("scroll", mover, true);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("resize", mover);
      window.removeEventListener("scroll", mover, true);
    };
  }, [abierto]);
  useEffect(() => () => void (reloj.current && window.clearTimeout(reloj.current)), []);

  // Agrupadas por red: varias cuentas de una red quedan bajo su ícono.
  const grupos = canalesApp
    .map((canal) => ({ canal, lista: (cuentas ?? []).filter((c) => c.canal === canal) }))
    .filter((g) => g.lista.length);
  const destino = typeof document !== "undefined" ? document.querySelector(".ez-app") : null;
  let i = 0;
  return (
    <div
      className="ez-apps"
      onPointerEnter={(e) => e.pointerType === "mouse" && abrir()}
      onPointerLeave={(e) => e.pointerType === "mouse" && cerrarLuego()}
    >
      <button
        ref={boton}
        type="button"
        className="ez-sb-item ez-apps-boton"
        aria-current={seccionActiva ? "page" : undefined}
        aria-haspopup="menu"
        aria-expanded={abierto}
        disabled={deshabilitado}
        data-tooltip={tr("ez_apps")}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")
            porTeclado.current = true;
          if (e.key === "ArrowDown" && !abierto) {
            e.preventDefault();
            abrir();
          }
        }}
      >
        <LayoutGrid size={18} aria-hidden="true" />
        <span className="ez-sb-etiqueta">{tr("ez_apps")}</span>
        {activa && (
          <span className={`ez-apps-marca ${redes[activa.canal].clase}`} aria-hidden="true" />
        )}
        <span className="ez-oculto">
          {activa ? ` · ${redes[activa.canal].nombre} ${activa.nombre}` : ""}
        </span>
      </button>
      {abierto &&
        pos &&
        destino &&
        createPortal(
          <div
            ref={menu}
            className="ez-apps-menu"
            role="menu"
            aria-label={tr("ez_apps_conectadas")}
            style={{ left: pos.x, top: pos.y, width: "min(280px, calc(100vw - 16px))" }}
            onPointerEnter={(e) => e.pointerType === "mouse" && abrir()}
            onPointerLeave={(e) => e.pointerType === "mouse" && cerrarLuego()}
          >
            {!cuentas && <p className="ez-apps-vacio">{tr("p_cargando")}</p>}
            {cuentas && !grupos.length && <p className="ez-apps-vacio">{tr("ez_apps_ninguna")}</p>}
            {grupos.map((g) => (
              <div
                key={g.canal}
                className={`ez-apps-grupo ${g.lista.length > 1 ? "ez-apps-varias" : ""}`}
                role="group"
                aria-label={redes[g.canal].nombre}
              >
                {g.lista.length > 1 && (
                  <p className="ez-apps-cabeza" aria-hidden="true">
                    <span className={`ez-apps-icono ez-apps-icono-chico ${redes[g.canal].clase}`}>
                      {redes[g.canal].sigla}
                    </span>
                    {redes[g.canal].nombre} · {g.lista.length} {tr("ez_apps_cuentas")}
                  </p>
                )}
                {g.lista.map((c) => {
                  const esActiva = activa?.conexionId === c.conexionId;
                  return (
                    <button
                      key={c.conexionId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={esActiva}
                      className={`ez-apps-cuenta ${esActiva ? "ez-apps-activa" : ""}`}
                      style={{ animationDelay: `${i++ * 45}ms` }}
                      onClick={() => {
                        cerrar();
                        onElegir(c);
                      }}
                    >
                      <span className={`ez-apps-icono ${redes[c.canal].clase}`} aria-hidden="true">
                        {redes[c.canal].sigla}
                      </span>
                      <span className="ez-apps-texto">
                        <strong>{c.nombre}</strong>
                        <small>
                          {redes[c.canal].nombre} ·{" "}
                          {tr(c.alcance === "personal" ? "cx_personal" : "cx_compartida")}
                        </small>
                      </span>
                      {esActiva && <span className="ez-apps-check">{tr("ez_apps_activa")}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          destino,
        )}
    </div>
  );
}

/**
 * Perfil de una red sin lectura de métricas todavía (TikTok, Facebook): la misma estructura
 * que Instagram (perfil, métricas, contenido reciente) con lo que de verdad hay. Lo que Ezra aún no
 * lee dice «No disponible»; nunca se muestran ceros ni números inventados.
 */
export function PerfilConexion({
  cuenta,
  tr,
  fecha,
  onActualizado,
}: {
  cuenta: CuentaApp;
  tr: Tr;
  fecha: (iso: string) => string;
  onActualizado: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const red = redes[cuenta.canal];
  async function actualizar() {
    setOcupado(true);
    try {
      const r = await fetch("/api/granjas/conexiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "verificar", id: cuenta.conexionId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
      setError("");
      onActualizado();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  const metricas = ["metrica1", "metrica2", "metrica3"].map((k) =>
    tr(`ez_app_${cuenta.canal}_${k}`),
  );
  return (
    <div className="ez-perfil">
      <section className="ez-perfil-cabeza" aria-label={tr("ez_app_perfil")}>
        <span className={`ez-perfil-foto ${red.clase}`} aria-hidden="true">
          {red.sigla}
        </span>
        <div className="ez-perfil-datos">
          <div className="ez-perfil-titulo">
            <h2>{cuenta.nombre}</h2>
            <button
              className="ez-boton-blanco"
              disabled={ocupado}
              onClick={() => void actualizar()}
            >
              <RefreshCw
                size={15}
                className={ocupado ? "eg-girando" : undefined}
                aria-hidden="true"
              />
              {tr("p_actualizar")}
            </button>
          </div>
          <p className="ez-perfil-red">{tr(`ez_app_${cuenta.canal}_cuenta`)}</p>
          {cuenta.aviso && <p className="ez-perfil-desc">{cuenta.aviso}</p>}
          {cuenta.verificado && (
            <p className="ez-perfil-leido">
              {tr("ez_app_verificado")} {fecha(cuenta.verificado)}
            </p>
          )}
          {error && (
            <p className="ep-alerta" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      <section className="ez-perfil-seccion" aria-labelledby="ez-perfil-metricas">
        <h3 id="ez-perfil-metricas">{tr(`ez_app_${cuenta.canal}_tituloMetricas`)}</h3>
        <div className="ez-kpis">
          {metricas.map((m) => (
            <div key={m} className="ez-kpi ez-kpi-nd">
              <strong>{tr("ez_app_noDisponible")}</strong>
              <span>{m}</span>
            </div>
          ))}
        </div>
        <p className="ep-nota">{tr("ez_app_sinLectura").replace("{red}", red.nombre)}</p>
      </section>
      <section className="ez-perfil-seccion" aria-labelledby="ez-perfil-contenido">
        <h3 id="ez-perfil-contenido">{tr(`ez_app_${cuenta.canal}_tituloContenido`)}</h3>
        <p className="ez-vacio">{tr("ez_app_contenidoNoDisponible")}</p>
      </section>
    </div>
  );
}
