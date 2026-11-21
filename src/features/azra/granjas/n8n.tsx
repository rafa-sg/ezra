"use client";
import { useEffect, useState } from "react";
import { Plug, RefreshCw } from "lucide-react";
import { pedir } from "./cliente";
type Estado = {
  estado: string;
  verificado: string | null;
  error: string;
  produccion: boolean;
  publicacionHabilitada: boolean;
  faltantes: string[];
};
export function ConexionN8n({
  g,
  fecha,
}: {
  g: (clave: string) => string;
  fecha: (iso: string) => string;
}) {
  const [datos, setDatos] = useState<Estado | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    pedir<{ n8n: Estado }>("/api/granjas/n8n")
      .then((r) => {
        if (vivo) setDatos(r.n8n);
      })
      .catch(() => {
        if (vivo) setError(g("n8nError"));
      });
    return () => {
      vivo = false;
    };
  }, [g]);
  async function probar() {
    setOcupado(true);
    setError("");
    try {
      setDatos(
        (await pedir<{ n8n: Estado }>("/api/granjas/n8n", { accion: "probar_conexion" })).n8n,
      );
    } catch (e) {
      setError((e as Error).message);
      setDatos((d) => (d ? { ...d, estado: "error" } : d));
    } finally {
      setOcupado(false);
    }
  }
  return (
    <article className="ep-conexion eg-conexion">
      <div className="ep-conexion-icono">
        <Plug size={22} />
      </div>
      <div className="eg-conexion-cuerpo">
        <h3>{g("n8nTitulo")}</h3>
        <p>{g("n8nAyuda")}</p>
        <details className="eg-detalles-tecnicos">
          <summary>{g("detallesTecnicos")}</summary>
          <dl className="eg-datos">
            <dt>{g("n8nEstado")}</dt>
            <dd>{datos ? g(`n8n_${datos.estado}`) : g("n8nCargando")}</dd>
            <dt>{g("verificado")}</dt>
            <dd>{datos?.verificado ? fecha(datos.verificado) : g("nunca")}</dd>
            <dt>{g("n8nEntorno")}</dt>
            <dd>{g(datos?.produccion ? "n8nProduccion" : "n8nPrueba")}</dd>
            <dt>{g("n8nEnvios")}</dt>
            <dd>{g(datos?.publicacionHabilitada ? "n8nHabilitado" : "n8nDeshabilitado")}</dd>
          </dl>
        </details>
        {datos?.faltantes.length ? (
          <p className="ep-nota">
            {g("n8nFaltantes")} {datos.faltantes.join(", ")}
          </p>
        ) : null}
        {(error || datos?.error) && (
          <p className="ep-alerta" role="alert">
            {error || datos?.error}
          </p>
        )}
        <p className="ep-nota">{g("n8nPrivado")}</p>
        <a className="ep-boton" href="/api/granjas/n8n/flujo" download>
          {g("n8nDescargar")}
        </a>
        <button
          type="button"
          className="ep-boton"
          disabled={ocupado || !datos || Boolean(datos.faltantes.length)}
          onClick={() => void probar()}
        >
          <RefreshCw size={15} />
          {g(ocupado ? "n8nProbando" : "n8nProbar")}
        </button>
      </div>
    </article>
  );
}
