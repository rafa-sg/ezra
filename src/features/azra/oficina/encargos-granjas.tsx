"use client";
import { Plus } from "lucide-react";
import type { Encargo } from "@/lib/produccion/modelo";
import { PostIt } from "./postit";
import { clases, claseDeAgente, estadoNota, etiquetaNota, infoClase, type Clase } from "./clases";
import "./oficina.css";

/**
 * Encargos en filas horizontales, una por granja, con un post-it por encargo. Los rechazados no se
 * clavan en el tablero (siguen en la lista). Tocar un post-it abre el detalle de siempre.
 */
export function EncargosPorGranja({
  encargos,
  ejecutandoId,
  onAbrir,
  onNuevo,
  onIrGranjas,
}: {
  encargos: Encargo[];
  ejecutandoId: string | null;
  onAbrir: (id: string) => void;
  onNuevo: () => void;
  onIrGranjas: () => void;
}) {
  const grupos = new Map<Clase, Encargo[]>(clases.map((c) => [c, []]));
  for (const e of encargos) if (e.estado !== "rechazado") grupos.get(claseDeAgente(e.agente))!.push(e);
  const filas = clases.filter((c) => c !== "otro" || grupos.get(c)!.length > 0);
  return (
    <div className="of-filas">
      {filas.map((c) => {
        const info = infoClase[c];
        const lista = grupos.get(c)!;
        const cuenta = (estado: string) => lista.filter((e) => estadoNota(e, e.id === ejecutandoId) === estado).length;
        return (
          <section key={c} className="of-fila" style={{ background: info.fondo }} aria-label={info.nombre}>
            <header className="of-fila-cabecera">
              <span className="of-punto" style={{ background: info.papel[1] }} aria-hidden="true" />
              <h2>{info.nombre}</h2>
              <span className="of-resumen">
                {cuenta("trabajando")} en curso · {cuenta("fila") + cuenta("cambios")} en fila · {cuenta("revisar")} por revisar
              </span>
              <span className="of-fila-acciones">
                <button type="button" className="of-enlace" onClick={onIrGranjas}>
                  Ver su sala →
                </button>
                <button type="button" className="of-boton" onClick={onNuevo}>
                  <Plus size={15} aria-hidden="true" /> Clavar post-it
                </button>
              </span>
            </header>
            <div className="of-carril">
              {lista.length === 0 && <p className="of-vacio">Sin post-its todavía.</p>}
              {lista.map((e, i) => {
                const estado = estadoNota(e, e.id === ejecutandoId);
                return (
                  <PostIt key={e.id} papel={info.papel} indice={i} onClick={() => onAbrir(e.id)}>
                    <span className={`of-chip of-chip-${estado}`}>{etiquetaNota[estado]}</span>
                    <span className="of-titulo">{e.titulo}</span>
                    {estado === "trabajando" && <span className="of-progreso" aria-hidden="true"><span /></span>}
                    <span className="of-meta">{e.encargo.slice(0, 70) || "Sin descripción"}</span>
                  </PostIt>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
