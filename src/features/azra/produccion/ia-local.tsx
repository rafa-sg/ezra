"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, Play, RefreshCw } from "lucide-react";
import type { DiagnosticoIA, EstadoIA } from "@/lib/produccion/ia-local";
import { haceCuanto } from "./encargos";

type Tr = (c: string) => string;
type Proveedor = "astra" | "claude";
const tono: Record<EstadoIA, "ok" | "atencion" | "error" | "neutro"> = {
  prueba_ok: "ok",
  sesion_ok: "ok",
  sesion_pendiente: "atencion",
  limite: "atencion",
  incompatible: "error",
  error: "error",
  no_instalado: "neutro",
};

/**
 * Codex local (Astra) y Claude Code local: qué permiten, su estado comprobado y dos acciones
 * separadas. «Verificar» revisa programa, versión, restricciones y sesión sin invocar al modelo;
 * «Probar respuesta» sí lo invoca (usa un intento del plan) y es siempre un clic explícito.
 */
export function ConexionesIALocal({
  tr,
  onCambio,
  onNuevo,
  deshabilitado,
}: {
  tr: Tr;
  onCambio: () => void;
  onNuevo: (p: Proveedor) => void;
  deshabilitado: boolean;
}) {
  const [diag, setDiag] = useState<Record<Proveedor, DiagnosticoIA> | null>(null);
  const [ocupado, setOcupado] = useState<{ p: Proveedor; accion: "verificar" | "probar" } | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    fetch("/api/produccion/ia-local", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Error");
        if (vivo) setDiag(j);
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);
  async function accion(p: Proveedor, accion: "verificar" | "probar") {
    setOcupado({ p, accion });
    setError("");
    try {
      const r = await fetch("/api/produccion/ia-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedor: p, accion }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Error");
      setDiag((d) => (d ? { ...d, [p]: j.diagnostico } : d));
      onCambio();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }
  return (
    <>
      {(["astra", "claude"] as const).map((p) => {
        const d = diag?.[p];
        const listo =
          d && (d.estado === "sesion_ok" || d.estado === "prueba_ok" || d.estado === "limite");
        return (
          <article className="ep-conexion ez-ia-local" key={p} aria-busy={!d || ocupado?.p === p}>
            <div className="ep-conexion-icono">{p === "astra" ? "A" : "✳"}</div>
            <div>
              <h2>{tr(`ez_ia_${p}_titulo`)}</h2>
              <span className={`ep-pill ez-ia-estado ez-ia-${d ? tono[d.estado] : "neutro"}`}>
                {d ? tr(`ez_ia_estado_${d.estado}`) : tr("p_cargando")}
              </span>
              <p>{tr(`ez_ia_${p}_permite`)}</p>
              <p className="ep-nota">{tr("ez_ia_limites")}</p>
              {d && (
                <dl className="ez-ia-datos">
                  {d.version && (
                    <div>
                      <dt>{tr("ez_ia_version")}</dt>
                      <dd>{d.version}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{tr("ez_ia_comprobado")}</dt>
                    <dd>{haceCuanto(d.comprobado, tr)}</dd>
                  </div>
                  <div>
                    <dt>{tr("ez_ia_ultimaPrueba")}</dt>
                    <dd>
                      {d.prueba
                        ? `${tr(`ez_ia_estado_${d.prueba.estado}`)} · ${haceCuanto(d.prueba.en, tr)} · ${(d.prueba.ms / 1000).toFixed(1)} s`
                        : tr("ez_ia_sinPrueba")}
                    </dd>
                  </div>
                </dl>
              )}
              {d && d.estado !== "sesion_ok" && d.estado !== "prueba_ok" && (
                <p className={`ez-ia-detalle ez-ia-${tono[d.estado]}`}>{d.detalle}</p>
              )}
              {d?.incompatibles.length ? (
                <p className="ep-nota">
                  {tr("ez_ia_incompatibles")}: <code>{d.incompatibles.join(", ")}</code>
                </p>
              ) : null}
              <div className="ez-ia-acciones">
                <button
                  className="ep-boton"
                  disabled={Boolean(ocupado)}
                  onClick={() => void accion(p, "verificar")}
                >
                  {ocupado?.p === p && ocupado.accion === "verificar" ? (
                    <Loader2 size={16} className="ez-gira" aria-hidden="true" />
                  ) : (
                    <RefreshCw size={16} aria-hidden="true" />
                  )}
                  {tr("ez_ia_verificar")}
                </button>
                <button
                  className="ep-boton"
                  disabled={Boolean(ocupado) || !listo}
                  onClick={() => void accion(p, "probar")}
                  title={tr("ez_ia_probarAyuda")}
                >
                  {ocupado?.p === p && ocupado.accion === "probar" ? (
                    <Loader2 size={16} className="ez-gira" aria-hidden="true" />
                  ) : (
                    <Play size={16} aria-hidden="true" />
                  )}
                  {tr(
                    ocupado?.p === p && ocupado.accion === "probar"
                      ? "ez_ia_probando"
                      : "ez_ia_probar",
                  )}
                </button>
                <button
                  className="ep-boton"
                  disabled={deshabilitado || !listo}
                  onClick={() => onNuevo(p)}
                >
                  {tr("p_nuevo")}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </div>
              <p className="ep-nota">{tr("ez_ia_probarAyuda")}</p>
            </div>
          </article>
        );
      })}
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
