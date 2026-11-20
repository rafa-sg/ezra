"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
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

/**
 * Navegación del estudio: píldora negra «Menú · N % del día» en el centro de la barra y botón
 * «Nuevo encargo» a la derecha. El menú se cierra con Escape o al hacer clic fuera, y devuelve el foco.
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
