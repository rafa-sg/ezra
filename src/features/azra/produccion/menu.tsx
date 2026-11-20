"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Menu } from "lucide-react";

export type ItemMenu = { id: string; icono: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; etiqueta: string; contador?: number };

const sinSuscripcion = () => () => {};
/** Monta en un espacio de la barra superior si existe; si no, en su lugar. */
function EnBarra({ id, children }: { id: string; children: React.ReactNode }) {
  // En el servidor no hay barra; en el navegador se busca el espacio que dejó el shell.
  const destino = useSyncExternalStore(
    sinSuscripcion,
    () => document.getElementById(id),
    () => null,
  );
  return destino ? createPortal(children, destino) : <div className="ez-barra-respaldo">{children}</div>;
}

/** Anillo con el % del día (SVG). */
function AnilloDia({ porcentaje, tr }: { porcentaje: number; tr: (c: string) => string }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="ez-anillo" title={`${porcentaje} % ${tr("ez_menu_dia")} · ${tr("ez_menu_diaAyuda")}`}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="3" />
        <circle cx="12" cy="12" r={r} fill="none" stroke="url(#ez-anillo-grad)" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - porcentaje / 100)} transform="rotate(-90 12 12)" />
        <defs>
          <linearGradient id="ez-anillo-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#7c74ff" />
            <stop offset="1" stopColor="#3b6cff" />
          </linearGradient>
        </defs>
      </svg>
      <span>
        {porcentaje} %<span className="ez-oculto"> {tr("ez_menu_dia")}</span>
      </span>
    </span>
  );
}

/**
 * Barra de secciones (escritorio): todas visibles en una cápsula, la activa marcada con una píldora
 * negra que se desliza. La posición del indicador se escribe como variables CSS (sin re-render).
 */
function BarraNav({ items, actual, porcentaje, tr, onIr, deshabilitado }: { items: ItemMenu[]; actual: string; porcentaje: number | null; tr: (c: string) => string; onIr: (id: string) => void; deshabilitado?: boolean }) {
  const nav = useRef<HTMLElement>(null);
  // Ancho que necesita la barra con todos los nombres: si no cabe, pasa a íconos (el activo conserva su nombre).
  const natural = useRef(0);
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const colocar = () => {
      if (!el.classList.contains("ez-nav-compacta")) natural.current = el.scrollWidth;
      const disponible = el.parentElement?.clientWidth ?? Number.POSITIVE_INFINITY;
      el.classList.toggle("ez-nav-compacta", natural.current > disponible);
      const activo = el.querySelector<HTMLElement>("button[aria-current]");
      el.style.setProperty("--ez-ind-x", `${activo ? activo.offsetLeft : 0}px`);
      el.style.setProperty("--ez-ind-w", `${activo ? activo.offsetWidth : 0}px`);
      el.classList.toggle("ez-nav-con-activo", Boolean(activo));
    };
    colocar();
    const obs = new ResizeObserver(colocar);
    obs.observe(el);
    if (el.parentElement) obs.observe(el.parentElement);
    el.querySelectorAll("button").forEach((b) => obs.observe(b));
    return () => obs.disconnect();
  }, [actual, items]);
  return (
    <nav ref={nav} className="ez-nav-barra" aria-label={tr("productionStudio")}>
      <span className="ez-nav-indicador" aria-hidden="true" />
      {items.map(({ id, icono: Icono, etiqueta, contador }) => (
        <button key={id} aria-current={actual === id ? "page" : undefined} disabled={deshabilitado} onClick={() => onIr(id)} title={etiqueta}>
          <Icono size={16} aria-hidden />
          <span className="ez-nav-etiqueta">{etiqueta}</span>
          {contador ? (
            <span className="ez-nav-contador" aria-label={`${contador} ${tr("ez_porRevisar")}`}>
              {contador}
            </span>
          ) : null}
        </button>
      ))}
      {porcentaje !== null && <AnilloDia porcentaje={porcentaje} tr={tr} />}
    </nav>
  );
}

/**
 * Navegación del estudio: en escritorio, todas las secciones en la barra; en pantallas angostas,
 * la píldora negra «Menú · N % del día». Botón «Nuevo encargo» a la derecha. El menú se cierra con Escape o al hacer clic fuera, y devuelve el foco.
 */
export function MenuEstudio({
  items,
  actual,
  porcentaje,
  tr,
  onIr,
  onNuevo,
  deshabilitado,
}: {
  items: ItemMenu[];
  actual: string;
  porcentaje: number | null;
  tr: (c: string) => string;
  onIr: (id: string) => void;
  onNuevo: () => void;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const primero = panel.current?.querySelector<HTMLButtonElement>("button[aria-current]") ?? panel.current?.querySelector<HTMLButtonElement>("button");
    primero?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
      // Foco atrapado dentro del menú mientras está abierto.
      if (e.key === "Tab" && panel.current) {
        const botones = [...panel.current.querySelectorAll<HTMLButtonElement>("button")];
        const i = botones.indexOf(document.activeElement as HTMLButtonElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          botones.at(-1)?.focus();
        } else if (!e.shiftKey && i === botones.length - 1) {
          e.preventDefault();
          botones[0]?.focus();
        }
      }
    };
    const fuera = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [abierto]);
  const actualItem = items.find((i) => i.id === actual);
  return (
    <>
      <EnBarra id="ez-barra-centro">
        <BarraNav items={items} actual={actual} porcentaje={porcentaje} tr={tr} onIr={onIr} deshabilitado={deshabilitado} />
        <div className="ez-menu">
          <button
            ref={boton}
            className="ez-menu-pildora"
            aria-expanded={abierto}
            aria-controls="ez-menu-panel"
            disabled={deshabilitado}
            onClick={() => setAbierto(!abierto)}
          >
            <Menu size={16} aria-hidden="true" />
            <span className="ez-menu-texto">{actualItem ? actualItem.etiqueta : tr("ez_menu")}</span>
            {porcentaje !== null && (
              <span className="ez-menu-dia" title={tr("ez_menu_diaAyuda")}>
                {porcentaje} %<span className="ez-oculto"> {tr("ez_menu_dia")}</span>
              </span>
            )}
          </button>
          {abierto && (
            <div ref={panel} id="ez-menu-panel" className="ez-menu-panel" role="navigation" aria-label={tr("productionStudio")}>
              {items.map(({ id, icono: Icono, etiqueta, contador }) => (
                <button
                  key={id}
                  aria-current={actual === id ? "page" : undefined}
                  onClick={() => {
                    onIr(id);
                    setAbierto(false);
                    boton.current?.focus();
                  }}
                >
                  <Icono size={18} aria-hidden />
                  <span>{etiqueta}</span>
                  {contador ? <span className="ez-contador">{contador}</span> : null}
                </button>
              ))}
              {porcentaje !== null && (
                <p className="ez-menu-nota">
                  <span className="ez-barra" aria-hidden="true">
                    <span style={{ width: `${porcentaje}%` }} />
                  </span>
                  {porcentaje} % {tr("ez_menu_dia")} · {tr("ez_menu_diaAyuda")}
                </p>
              )}
            </div>
          )}
        </div>
      </EnBarra>
      <EnBarra id="ez-barra-accion">
        <button className="ez-boton-negro ez-cta" onClick={onNuevo} disabled={deshabilitado}>
          {tr("p_nuevo")}
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </EnBarra>
    </>
  );
}
