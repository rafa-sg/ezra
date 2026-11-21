"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Agente, ContenidoEncargo } from "@/lib/produccion/modelo";
import { periodosVirales, textoPedidoViral, type PeriodoViral } from "@/lib/produccion/virales-texto";

type Tr = (c: string) => string;
type EventoElegible = { id: string; titulo: string; fecha: string | null; fuenteUrl: string; lugar: string; municipio: string; estado: string };
type Proveedor = ContenidoEncargo["proveedor"];
const canales = ["instagram", "spotmi", "tiktok", "facebook", "youtube"] as const;
const nombresCanal: Record<string, string> = { spotmi: "Spotmi web", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube" };
/** Lo que se puede pedir hoy (cada opción es un especialista que ya existe). */
const objetivos: { clave: string; agente: Agente }[] = [
  { clave: "eventos", agente: "cazador" },
  { clave: "virales", agente: "virales" },
  { clave: "post", agente: "redactor_ig" },
  { clave: "guion", agente: "guion" },
  { clave: "video", agente: "edicion" },
  { clave: "descripcion", agente: "descripcion" },
  { clave: "semana", agente: "semana" },
];
const urlValida = (u: string) => {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Nuevo encargo en cuatro pasos (qué, con qué, dónde y opciones) y un resumen antes de crearlo.
 * La IA se toma de la configuración existente y solo se cambia en opciones avanzadas.
 */
export function NuevoEncargo({
  tr,
  proveedorPorDefecto,
  disponibles,
  fechaInicial,
  ocupado,
  onCrear,
  onCerrar,
}: {
  tr: Tr;
  proveedorPorDefecto: Proveedor;
  disponibles: Record<Proveedor, boolean>;
  fechaInicial: string;
  ocupado: boolean;
  onCrear: (contenido: ContenidoEncargo) => void;
  onCerrar: () => void;
}) {
  const [objetivo, setObjetivo] = useState(objetivos.find((o) => o.clave === "post")!);
  const [periodo, setPeriodo] = useState<PeriodoViral>(30);
  const virales = objetivo.agente === "virales";
  const [eventos, setEventos] = useState<EventoElegible[] | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [fuentes, setFuentes] = useState<{ nombre: string; url: string }[]>([]);
  const [instrucciones, setInstrucciones] = useState("");
  const [destinos, setDestinos] = useState<string[]>(["instagram"]);
  const [titulo, setTitulo] = useState("");
  const [proveedor, setProveedor] = useState<Proveedor>(proveedorPorDefecto);
  const [fecha, setFecha] = useState(fechaInicial);
  useEffect(() => {
    let vivo = true;
    fetch("/api/granjas/eventos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { eventos: [] }))
      .then((j: { eventos: EventoElegible[] }) => vivo && setEventos(j.eventos.filter((e) => e.estado === "aprobado")))
      .catch(() => vivo && setEventos([]));
    return () => {
      vivo = false;
    };
  }, []);
  const eventosElegidos = (eventos ?? []).filter((e) => elegidos.includes(e.id));
  // Los eventos elegidos aportan su fuente (URL exacta) y sus datos a las instrucciones.
  const contenido = useMemo<ContenidoEncargo>(() => {
    const deEventos = eventosElegidos.map((e) => ({ nombre: e.titulo.slice(0, 180), url: e.fuenteUrl, imagen: "", nota: "" }));
    const todas = [...deEventos, ...fuentes.filter((f) => urlValida(f.url)).map((f) => ({ nombre: (f.nombre || f.url).slice(0, 180), url: f.url, imagen: "", nota: "" }))];
    const unicas = todas.filter((f, i) => todas.findIndex((x) => x.url === f.url) === i).slice(0, 20);
    const datos = eventosElegidos.map((e) => `- ${e.titulo}${e.fecha ? ` · ${e.fecha}` : ""}${e.lugar || e.municipio ? ` · ${[e.lugar, e.municipio].filter(Boolean).join(", ")}` : ""}`).join("\n");
    const tituloAuto = `${tr(`ez_nuevo_obj_${objetivo.clave}`)}${eventosElegidos[0] ? `: ${eventosElegidos[0].titulo}` : ""}`;
    // Videos virales: solo el tema y el período; sin eventos ni fuentes (las fuentes serán los videos).
    if (objetivo.agente === "virales")
      return {
        titulo: (titulo.trim() || `${tr("ez_nuevo_obj_virales")}: ${instrucciones.trim().replace(/\s+/g, " ")}`).slice(0, 180),
        agente: "virales",
        proveedor,
        canales: (destinos.length ? destinos : ["youtube"]) as ContenidoEncargo["canales"],
        encargo: instrucciones.trim() ? textoPedidoViral(instrucciones.slice(0, 200), periodo) : "",
        resultado: "",
        fuentes: [],
        fechaPrevista: fecha,
      };
    return {
      titulo: (titulo.trim() || tituloAuto).slice(0, 180),
      agente: objetivo.agente,
      proveedor,
      canales: (destinos.length ? destinos : ["spotmi"]) as ContenidoEncargo["canales"],
      encargo: [instrucciones.trim(), datos ? `${tr("ez_nuevo_eventosElegidos")}:\n${datos}` : ""].filter(Boolean).join("\n\n").slice(0, 8000),
      resultado: "",
      fuentes: unicas,
      fechaPrevista: fecha,
    };
  }, [eventosElegidos, fuentes, instrucciones, destinos, titulo, proveedor, fecha, objetivo, periodo, tr]);
  const faltaInfo = virales ? instrucciones.trim().length < 2 : !contenido.encargo.trim() && !contenido.fuentes.length;
  const costo = virales ? tr("ez_virales_costo") : proveedor === "gemini" ? tr("ez_det_costoGemini") : tr("ez_det_costoIntento");
  return (
    <form
      className="ez-nuevo"
      onSubmit={(e) => {
        e.preventDefault();
        if (!faltaInfo && contenido.titulo.length >= 3) onCrear(contenido);
      }}
    >
      <header className="ez-det-cabecera">
        <h2>{tr("p_nuevo")}</h2>
        <button type="button" className="ez-cerrar" onClick={onCerrar} aria-label={tr("p_cerrar")}>
          <X size={18} />
        </button>
      </header>

      <fieldset className="ez-nuevo-paso">
        <legend>
          <b>1</b> {tr("ez_nuevo_que")}
        </legend>
        <div className="ez-nuevo-opciones" role="radiogroup">
          {objetivos.map((o) => (
            <button type="button" key={o.clave} role="radio" aria-checked={objetivo.clave === o.clave} onClick={() => {
                setObjetivo(o);
                if (o.agente === "virales") setDestinos(["youtube", "tiktok", "instagram"]);
              }}>
              <strong>{tr(`ez_nuevo_obj_${o.clave}`)}</strong>
              <small>{tr(`p_${o.agente}_entrega`)}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ez-nuevo-paso">
        <legend>
          <b>2</b> {tr("ez_nuevo_conQue")}
        </legend>
        {virales ? (
          <>
            <p className="ep-nota">{tr("ez_virales_ayuda")}</p>
            <label className="eg-campo">
              {tr("ez_virales_tema")}
              <input value={instrucciones} maxLength={200} onChange={(e) => setInstrucciones(e.target.value)} placeholder={tr("ez_nuevo_ph_virales")} />
            </label>
            <label className="eg-campo">
              {tr("ez_virales_periodo")}
              <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value) as PeriodoViral)}>
                {periodosVirales.map((d) => (
                  <option key={d} value={d}>
                    {d ? tr("ez_virales_ultimos").replace("{n}", String(d)) : tr("ez_virales_siempre")}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
        <p className="ep-nota">{tr("ez_nuevo_conQueAyuda")}</p>
        <details className="ez-nuevo-eventos" open={elegidos.length > 0}>
          <summary>
            {tr("ez_nuevo_eventos")} {elegidos.length ? `(${elegidos.length})` : ""}
          </summary>
          {eventos === null ? (
            <p role="status">{tr("p_cargando")}</p>
          ) : !eventos.length ? (
            <p className="ez-vacio">{tr("ez_nuevo_sinEventos")}</p>
          ) : (
            <ul>
              {eventos.slice(0, 60).map((e) => (
                <li key={e.id}>
                  <label className="ep-checkbox">
                    <input type="checkbox" checked={elegidos.includes(e.id)} onChange={(x) => setElegidos(x.target.checked ? [...elegidos, e.id] : elegidos.filter((i) => i !== e.id))} />
                    <span>
                      {e.titulo}
                      <small>{[e.fecha, e.municipio].filter(Boolean).join(" · ")}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </details>
        <div className="ez-nuevo-fuentes">
          {fuentes.map((f, i) => (
            <div key={i} className="ez-nuevo-fuente">
              <input aria-label={tr("ez_nuevo_fuenteNombre")} placeholder={tr("ez_nuevo_fuenteNombre")} value={f.nombre} maxLength={180} onChange={(x) => setFuentes(fuentes.map((y, j) => (j === i ? { ...y, nombre: x.target.value } : y)))} />
              <input aria-label="URL" placeholder="https://…" value={f.url} aria-invalid={Boolean(f.url) && !urlValida(f.url)} onChange={(x) => setFuentes(fuentes.map((y, j) => (j === i ? { ...y, url: x.target.value.trim() } : y)))} />
              <button type="button" className="ez-cerrar" aria-label={tr("ez_nuevo_quitarFuente")} onClick={() => setFuentes(fuentes.filter((_, j) => j !== i))}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button type="button" className="ez-boton-blanco" onClick={() => setFuentes([...fuentes, { nombre: "", url: "" }])} disabled={fuentes.length >= 10}>
            <Plus size={14} aria-hidden="true" /> {tr("ez_nuevo_agregarFuente")}
          </button>
        </div>
        <label className="eg-campo">
          {tr("ez_nuevo_instrucciones")}
          <textarea rows={4} maxLength={6000} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} placeholder={tr(`ez_nuevo_ph_${objetivo.clave}`)} />
        </label>
          </>
        )}
      </fieldset>

      <fieldset className="ez-nuevo-paso">
        <legend>
          <b>3</b> {tr("ez_nuevo_donde")}
        </legend>
        <div className="ez-nuevo-destinos">
          {canales.map((c) => (
            <label key={c} className="ep-checkbox">
              <input type="checkbox" checked={destinos.includes(c)} onChange={(e) => setDestinos(e.target.checked ? [...destinos, c] : destinos.filter((x) => x !== c))} />
              {nombresCanal[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <details className="ez-nuevo-paso ez-nuevo-avanzado">
        <summary>
          <b>4</b> {tr("ez_nuevo_opciones")}
        </summary>
        <label className="eg-campo">
          {tr("ez_nuevo_titulo")}
          <input value={titulo} maxLength={180} placeholder={contenido.titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        {!virales && (
        <label className="eg-campo">
          {tr("ez_det_ia")}
          <select value={proveedor} onChange={(e) => setProveedor(e.target.value as Proveedor)}>
            {(["gemini", "astra", "claude"] as const).map((p) => (
              <option key={p} value={p}>
                {tr(`p_${p}`)}
                {disponibles[p] ? "" : ` · ${tr("ez_nuevo_noDisponible")}`}
              </option>
            ))}
          </select>
        </label>
        )}
        <label className="eg-campo">
          {tr("ez_det_fechaPrevista")}
          <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </details>

      <section className="ez-nuevo-resumen" aria-label={tr("ez_nuevo_resumen")}>
        <h3>{tr("ez_nuevo_resumen")}</h3>
        <dl>
          <div>
            <dt>{tr("ez_nuevo_que")}</dt>
            <dd>{contenido.titulo}</dd>
          </div>
          <div>
            <dt>{tr("ez_nuevo_conQue")}</dt>
            <dd>
              {virales
                ? `${instrucciones.trim() || "—"} · ${periodo ? tr("ez_virales_ultimos").replace("{n}", String(periodo)) : tr("ez_virales_siempre")}`
                : tr("ez_nuevo_resInfo")
                .replace("{e}", String(eventosElegidos.length))
                .replace("{f}", String(contenido.fuentes.length))
                .replace("{i}", instrucciones.trim() ? tr("ez_nuevo_si") : tr("ez_nuevo_no"))}
            </dd>
          </div>
          <div>
            <dt>{tr("ez_nuevo_donde")}</dt>
            <dd>{contenido.canales.map((c) => nombresCanal[c]).join(", ")}</dd>
          </div>
          <div>
            <dt>{virales ? tr("ez_virales_como") : tr("ez_det_ia")}</dt>
            <dd>
              {virales ? "YouTube" : tr(`p_${proveedor}`)} · {costo}
            </dd>
          </div>
        </dl>
        <p className="ep-nota">{tr("ez_nuevo_noEjecuta")}</p>
        {faltaInfo && <p className="ep-nota ez-det-error">{tr("ez_nuevo_faltaInfo")}</p>}
      </section>

      <div className="ep-acciones">
        <button className="ez-boton-negro" disabled={ocupado || faltaInfo}>
          {tr("ez_nuevo_crear")}
        </button>
        <button type="button" className="ez-boton-blanco" onClick={onCerrar}>
          {tr("p_cancelar")}
        </button>
      </div>
    </form>
  );
}
