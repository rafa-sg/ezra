"use client";
import { useEffect, useState } from "react";
import { Workflow } from "lucide-react";
import type { Encargo } from "@/lib/produccion/modelo";
import { pedir, nodoNuevo, type Detalle, type Resumen } from "./cliente";

/** Coloca un encargo guardado como paso de una granja, conservando su vínculo y su versión. */
export function ColocarEnGranja({
  encargo,
  g,
  onListo,
}: {
  encargo: Encargo;
  g: (clave: string) => string;
  onListo: (mensaje: string) => void;
}) {
  const [granjas, setGranjas] = useState<Resumen["granjas"] | null>(null);
  const [destino, setDestino] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    pedir<Resumen>("/api/granjas")
      .then((r) => vivo && setGranjas(r.granjas.filter((x) => x.estado !== "archivada")))
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);
  async function colocar() {
    setOcupado(true);
    setError("");
    try {
      const { granja } = await pedir<Detalle>(`/api/granjas/${destino}`);
      if (granja.grafo.nodos.some((n) => n.encargoId === encargo.id))
        throw new Error(g("yaColocado"));
      const n = granja.grafo.nodos.length;
      const nodo = {
        ...nodoNuevo(
          "agente",
          { x: 40 + (n % 4) * 250, y: 40 + Math.floor(n / 4) * 190 },
          encargo.agente,
          encargo.titulo,
        ),
        // Un resultado manual se trae desde el encargo; la IA del encargo queda como sugerencia, no se ejecuta sola.
        proveedor: "manual" as const,
        instrucciones: encargo.encargo,
        fuentes: encargo.fuentes,
        encargoId: encargo.id,
      };
      await pedir("/api/granjas", {
        accion: "actualizar",
        id: granja.id,
        revision: granja.revision,
        grafo: { ...granja.grafo, nodos: [...granja.grafo.nodos, nodo] },
      });
      onListo(`${g("colocadoEn")} «${granja.nombre}».`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="eg-colocar">
      <p>{g("colocarAyuda")}</p>
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
        </p>
      )}
      {granjas && !granjas.length ? (
        <p className="ep-nota">{g("sinGranjasColocar")}</p>
      ) : (
        <div className="eg-fuente">
          <select
            aria-label={g("elegirGranja")}
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            disabled={!granjas}
          >
            <option value="">{g("elegirGranja")}…</option>
            {(granjas ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ep-boton"
            disabled={!destino || ocupado}
            onClick={() => void colocar()}
          >
            <Workflow size={15} />
            {g("colocar")}
          </button>
        </div>
      )}
    </div>
  );
}
