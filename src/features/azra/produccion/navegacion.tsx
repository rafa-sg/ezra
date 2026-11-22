"use client";
import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";

export type ItemMenu = {
  id: string;
  icono: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  etiqueta: string;
  contador?: number;
  contadorAyuda?: string;
  /** Elemento propio en lugar del botón (por ejemplo, el selector de Apps). */
  elemento?: ReactNode;
};

const sinSuscripcion = () => () => {};
/** Monta en un espacio del shell (barra lateral o cabecera). Sin shell, no dibuja nada fuera de lugar. */
function EnEspacio({ id, children }: { id: string; children: ReactNode }) {
  const destino = useSyncExternalStore(
    sinSuscripcion,
    () => document.getElementById(id),
    () => null,
  );
  return destino ? createPortal(children, destino) : null;
}

/**
 * Barra lateral del estudio: «Nuevo encargo» arriba y las secciones. Contraída, cada botón muestra su
 * nombre como tooltip y lo conserva para el lector de pantalla. Avisa al shell para cerrar el cajón móvil.
 */
export function NavegacionLateral({
  items,
  abajo = [],
  actual,
  tr,
  onIr,
  onNuevo,
  deshabilitado,
}: {
  items: ItemMenu[];
  /** Secciones fijas al pie de la barra (encima de la cuenta). */
  abajo?: ItemMenu[];
  actual: string;
  tr: (c: string) => string;
  onIr: (id: string) => void;
  onNuevo: () => void;
  deshabilitado?: boolean;
}) {
  const avisar = () => window.dispatchEvent(new Event("ezra:navego"));
  const boton = ({ id, icono: Icono, etiqueta, contador, contadorAyuda }: ItemMenu) => (
    <button
      key={id}
      className="ez-sb-item"
      aria-current={actual === id ? "page" : undefined}
      disabled={deshabilitado}
      data-tooltip={contador ? `${etiqueta} · ${contador} ${contadorAyuda ?? ""}`.trim() : etiqueta}
      onClick={() => {
        avisar();
        onIr(id);
      }}
    >
      <Icono size={18} aria-hidden />
      <span className="ez-sb-etiqueta">{etiqueta}</span>
      {contador ? (
        <span className="ez-sb-contador">
          {contador}
          {contadorAyuda && <span className="ez-oculto"> {contadorAyuda}</span>}
        </span>
      ) : null}
    </button>
  );
  return (
    <>
      <EnEspacio id="ez-sidebar-nav">
        <button
          className="ez-sb-nuevo"
          onClick={() => {
            avisar();
            onNuevo();
          }}
          disabled={deshabilitado}
          data-tooltip={tr("p_nuevo")}
        >
          <Plus size={18} aria-hidden="true" />
          <span className="ez-sb-etiqueta">{tr("p_nuevo")}</span>
        </button>
        <nav className="ez-sb-lista" aria-label={tr("productionStudio")}>
          {items.map((item) =>
            item.elemento ? <div key={item.id}>{item.elemento}</div> : boton(item),
          )}
        </nav>
      </EnEspacio>
      {abajo.length > 0 && (
        <EnEspacio id="ez-sidebar-abajo">
          <nav className="ez-sb-lista" aria-label={tr("ez_sb_abajo")}>
            {abajo.map((item) =>
              item.elemento ? <div key={item.id}>{item.elemento}</div> : boton(item),
            )}
          </nav>
        </EnEspacio>
      )}
    </>
  );
}

/** Cabecera superior discreta: título de la página, una línea de ayuda y acciones contextuales. */
export function CabeceraPagina({
  titulo,
  ayuda,
  acciones,
}: {
  titulo: string;
  ayuda?: string;
  acciones?: ReactNode;
}) {
  return (
    <>
      <EnEspacio id="ez-cabecera-titulo">
        <h1>{titulo}</h1>
        {ayuda && <p>{ayuda}</p>}
      </EnEspacio>
      {acciones && <EnEspacio id="ez-cabecera-acciones">{acciones}</EnEspacio>}
    </>
  );
}
