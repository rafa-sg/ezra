"use client";
import type { CSSProperties, ReactNode } from "react";

const giros = [-2, 1.5, -1, 2.2, -1.6, 0.8];

/** Post-it cuadrado con chinche roja, centro más claro y la esquina de abajo doblada. */
export function PostIt({
  papel,
  indice = 0,
  tamano = 196,
  children,
  onClick,
  etiqueta,
}: {
  papel: [string, string, string];
  indice?: number;
  tamano?: number;
  children: ReactNode;
  onClick?: () => void;
  etiqueta?: string;
}) {
  const estilo = {
    "--pi-giro": `${giros[indice % giros.length]}deg`,
    "--pi-tam": `${tamano}px`,
    "--pi-1": papel[0],
    "--pi-2": papel[1],
    "--pi-3": papel[2],
  } as CSSProperties;
  const contenido = (
    <>
      <span className="of-papel">{children}</span>
      <span className="of-doblez" aria-hidden="true" />
      <svg className="of-chinche" width="30" height="34" viewBox="0 0 30 34" aria-hidden="true">
        <line x1="13" y1="20" x2="10" y2="32" stroke="#9aa0a6" strokeWidth="2" />
        <circle cx="15" cy="12" r="10" fill="#d23a2f" />
        <circle cx="11" cy="8" r="3.5" fill="#f08a80" />
      </svg>
    </>
  );
  return onClick ? (
    <button type="button" className="of-postit" style={estilo} onClick={onClick} aria-label={etiqueta}>
      {contenido}
    </button>
  ) : (
    <div className="of-postit" style={estilo}>
      {contenido}
    </div>
  );
}
