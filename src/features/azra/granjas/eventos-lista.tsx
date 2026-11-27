"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Image as Imagen, MapPin, MoreHorizontal } from "lucide-react";
import type { EventSummary } from "@/lib/event-summary";
import type { Evento } from "@/lib/granjas/eventos";
import "./eventos-lista.css";

type G = (clave: string) => string;

/**
 * Confianza discreta: un punto de color y el nivel en palabras. El desglose y el aviso de que no es
 * una garantía están en el texto accesible y al pasar el cursor; el porcentaje no se presenta como
 * certeza.
 */
export function IndicadorConfianza({ g, confianza }: { g: G; confianza: Evento["confianza"] }) {
  const p = confianza.puntos;
  const nivel = p >= 80 ? "alta" : p >= 50 ? "media" : "baja";
  const desglose = confianza.desglose
    .map((l) => `${l.concepto}: ${l.puntos > 0 ? "+" : ""}${l.puntos}`)
    .join(" · ");
  const explicacion = `${g("ev_conf_nombre")}: ${g(`ev_conf_nivel_${nivel}`)} (${p}/100). ${desglose}. ${g("ev_conf_limite")}`;
  return (
    <span className={`ev-confianza ev-conf-${nivel}`} title={explicacion}>
      <i aria-hidden="true" />
      <span aria-hidden="true">
        {g("ev_conf_nombre")} {g(`ev_conf_nivel_${nivel}`)}
      </span>
      <span className="ez-oculto">{explicacion}</span>
    </span>
  );
}

export type AccionMenu = {
  clave: string;
  etiqueta: string;
  onClick: () => void;
  peligro?: boolean;
  deshabilitada?: boolean;
};

/** Menú de acciones secundarias: botón con aria-expanded; Escape, Tab o un clic fuera lo cierran. */
export function MenuAcciones({ etiqueta, acciones }: { etiqueta: string; acciones: AccionMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();
  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [
          ...(lista.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
        ];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    const fuera = (e: PointerEvent) => {
      if (!lista.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node))
        setAbierto(false);
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [abierto]);
  if (!acciones.length) return null;
  return (
    <div className="ev-menu">
      <button
        ref={boton}
        type="button"
        className="ep-boton ev-menu-boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={etiqueta}
        title={etiqueta}
        onClick={() => setAbierto(!abierto)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {abierto && (
        <ul
          ref={lista}
          id={id}
          role="menu"
          className="ev-menu-lista"
          onBlur={(e) =>
            !e.currentTarget.contains(e.relatedTarget as Node) &&
            !boton.current?.contains(e.relatedTarget as Node) &&
            setAbierto(false)
          }
        >
          {acciones.map((a) => (
            <li key={a.clave} role="none">
              <button
                type="button"
                role="menuitem"
                className={a.peligro ? "ev-menu-peligro" : ""}
                disabled={a.deshabilitada}
                onClick={() => {
                  setAbierto(false);
                  a.onClick();
                }}
              >
                {a.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Fila compacta de la bandeja: miniatura, título, fecha y lugar, fuente; estado y «Revisar». */
export function FilaEvento({
  g,
  evento: e,
  categoria,
  fecha,
  lugar,
  origen,
  notaImagen,
  precio,
  onRevisar,
  onAnticipar,
  acciones,
}: {
  g: G;
  evento: EventSummary;
  categoria: string;
  fecha: ReactNode;
  lugar: ReactNode;
  origen: string;
  notaImagen: string | null;
  precio: string;
  onRevisar: () => void;
  onAnticipar?: () => void;
  acciones: AccionMenu[];
}) {
  const [rota, setRota] = useState(false);
  return (
    <li className={`ev-fila ev-fila-${e.estadoVisible}`}>
      <div className="ev-miniatura" aria-hidden="true">
        {e.imagenMedioId && !rota ? (
          <img
            src={`/api/granjas/medios/${e.imagenMedioId}?thumbnail=160`}
            width={80}
            height={80}
            decoding="async"
            alt=""
            loading="lazy"
            onError={() => setRota(true)}
          />
        ) : (
          <span className="ev-miniatura-vacia">
            <Imagen size={18} aria-hidden="true" />
            <small>{categoria}</small>
          </span>
        )}
      </div>
      <div className="ev-fila-cuerpo">
        <h3 className="ev-titulo">
          <button type="button" onClick={onRevisar} onPointerEnter={onAnticipar} onFocus={onAnticipar}>
            {e.titulo}
          </button>
        </h3>
        <p className="ev-dato">
          <CalendarDays size={14} aria-hidden="true" />
          <span>{fecha}</span>
        </p>
        <p className="ev-dato">
          <MapPin size={14} aria-hidden="true" />
          <span>{lugar}</span>
        </p>
        <p className="ev-fuente">
          <span>{origen}</span>
          <IndicadorConfianza g={g} confianza={e.confianza} />
          {notaImagen && <span className="ev-nota-imagen">{notaImagen}</span>}
        </p>
      </div>
      <div className="ev-fila-lado">
        <span className="ev-estados">
          <span className={`ep-pill ev-pill-${e.estadoVisible}`}>
            {g(`ev_estado_${e.estadoVisible}`)}
          </span>
          {e.changesCount > 0 && (
            <span className="ep-pill eg-pill-actualizado">{g("ev_actualizado")}</span>
          )}
        </span>
        <span className={`ev-precio ${e.precioDesde ? "" : "ev-por-confirmar"}`}>{precio}</span>
        <span className="ev-acciones">
          <button
            type="button"
            className="ep-boton ep-primario"
            onClick={onRevisar}
            onPointerEnter={onAnticipar}
            onFocus={onAnticipar}
            aria-label={`${g("ev_revisar")}: ${e.titulo}`}
          >
            {g("ev_revisar")}
          </button>
          <MenuAcciones etiqueta={`${g("ev_masAcciones")}: ${e.titulo}`} acciones={acciones} />
        </span>
      </div>
    </li>
  );
}
