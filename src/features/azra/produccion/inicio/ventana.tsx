import type { ReactNode } from "react";

/** Marco de navegador simulado (tres puntos y barra de dirección) para mostrar UI viva, no capturas. */
export function Ventana({ url, children, className = "", etiqueta }: { url: string; children: ReactNode; className?: string; etiqueta?: string }) {
  return (
    <div className={`ez-ventana ${className}`}>
      <div className="ez-ventana-barra" aria-hidden="true">
        <span className="ez-ventana-puntos">
          <i />
          <i />
          <i />
        </span>
        <span className="ez-ventana-url">{url}</span>
      </div>
      <div className="ez-ventana-cuerpo">{children}</div>
      {etiqueta && <span className="ez-pill ez-ventana-etiqueta">{etiqueta}</span>}
    </div>
  );
}
