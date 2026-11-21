"use client";
import { useEffect, useState, type FormEvent } from "react";
import { pedir, type Granja, type Resumen } from "./cliente";

export function SourceDirectory() {
  const [open, setOpen] = useState(false);
  const [farms, setFarms] = useState<Granja[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    pedir<Resumen>("/api/granjas")
      .then(({ granjas }) => {
        if (!active) return;
        setFarms(
          granjas.filter(
            (f) =>
              f.estado !== "archivada" &&
              f.ajustes.purpose === "eventos_el_salvador" &&
              f.grafo.nodos.some((n) => n.agente === "cazador"),
          ),
        );
        setLoaded(true);
      })
      .catch((e) => active && setMessage(e.message));
    return () => {
      active = false;
    };
  }, [open]);
  const farm = farms.find((f) => f.id === selected) ?? farms[0];
  const hunter = farm?.grafo.nodos.find((n) => n.agente === "cazador");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!farm || !hunter || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    try {
      const url = new URL(String(fields.get("url")));
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Ingresá un enlace HTTPS público.");
      if (hunter.fuentes.some((s) => new URL(s.url).href === url.href))
        throw new Error("Ese enlace ya está en esta granja.");
      const sources = [
        ...hunter.fuentes,
        { nombre: String(fields.get("name")).trim(), url: url.href, imagen: "", nota: "" },
      ];
      const policy = farm.politicaFuentes;
      const domains = policy.dominios.some(
        (d) => url.hostname === d || url.hostname.endsWith("." + d),
      )
        ? policy.dominios
        : [...policy.dominios, url.hostname];
      const { granja } = await pedir<{ granja: Granja }>("/api/granjas", {
        accion: "actualizar",
        id: farm.id,
        revision: farm.revision,
        datos: {
          ...farm,
          politicaFuentes: {
            dominios: domains,
            maxFuentesPorPaso: Math.max(policy.maxFuentesPorPaso, sources.length),
          },
        },
        grafo: {
          ...farm.grafo,
          nodos: farm.grafo.nodos.map((n) => (n.id === hunter.id ? { ...n, fuentes: sources } : n)),
        },
      });
      setFarms((items) => items.map((f) => (f.id === granja.id ? granja : f)));
      form.reset();
      setMessage("Fuente guardada. Su conexión aparecerá cuando aporte un evento.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="ez-map-filters" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Fuentes de recolección</summary>
      {open && (
        <div className="ez-source-directory">
          {farm && hunter ? (
            <>
              <label>
                Granja de eventos{" "}
                <select
                  value={farm.id}
                  disabled={busy}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {farms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <ul>
                {hunter.fuentes.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.nombre || s.url}
                    </a>
                  </li>
                ))}
              </ul>
              {hunter.fuentes.length < 10 ? (
                <form onSubmit={save}>
                  <label>
                    Nombre <input name="name" required maxLength={180} />
                  </label>
                  <label>
                    Enlace autorizado{" "}
                    <input type="url" name="url" required placeholder="https://" />
                  </label>
                  <button className="ez-boton-negro" disabled={busy}>
                    Agregar fuente
                  </button>
                </form>
              ) : (
                <p>Esta granja alcanzó el límite de diez fuentes por paso.</p>
              )}
            </>
          ) : (
            <p>
              {loaded
                ? "Creá una granja de Eventos de El Salvador para agregar fuentes."
                : "Cargando fuentes…"}
            </p>
          )}
          <p role="status">{message}</p>
        </div>
      )}
    </details>
  );
}
