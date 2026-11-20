"use client";
import { useEffect, useRef, useState, type ClipboardEvent, type PointerEvent as EventoPuntero } from "react";
import { ArrowUpRight, Crop, ImagePlus, Link2, Search } from "lucide-react";
import type { Evento } from "@/lib/granjas/eventos";
import type { Busqueda, DatosAfiche } from "@/lib/granjas/imagen-original";
import { Modal } from "../ui";
import { pedir } from "./cliente";

type Seleccion = { via: "api"; url: string; origen: "original" | "fotograma" } | { via: "medio"; medioId: string; origen: "captura" | "fotograma" };
type Recorte = { x: number; y: number; w: number; h: number };
const comprobacionesVacias = { titulo: false, fecha: false, lugar: false, organizador: false };

/**
 * Panel «Buscar imagen original»: publicación de origen → imagen (de la API cuando hay acceso, o una
 * captura recortada) → comprobar el evento → guardar como referencia interna con permiso pendiente.
 */
export function ImagenOriginal({
  evento,
  modoInicial,
  onCerrar,
  onGuardado,
  locale,
}: {
  evento: Evento | null;
  modoInicial: "buscar" | "captura";
  onCerrar: () => void;
  onGuardado: (mensaje: string) => Promise<void>;
  locale: string;
}) {
  const es = locale === "es";
  const t = (a: string, b: string) => (es ? a : b);
  const social = evento?.fuentes.find((f) => /(^|\.)(instagram|facebook)\.com$/.test(f.dominio));
  const [url, setUrl] = useState(evento?.imagenPublicacion?.url ?? social?.url ?? "");
  const [cuenta, setCuenta] = useState(evento?.imagenPublicacion?.cuenta.replace(/^@/, "") ?? "");
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [checks, setChecks] = useState(comprobacionesVacias);
  const [captura, setCaptura] = useState<{ src: string; nombre: string } | null>(null);
  const [mostrarCaptura, setMostrarCaptura] = useState(modoInicial === "captura");
  const [segundo, setSegundo] = useState(1);
  const [datosAfiche, setDatosAfiche] = useState<DatosAfiche | null>(null);
  const [estado, setEstado] = useState({ ocupado: false, error: "", aviso: "" });
  if (!evento) return null;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  const pasado = evento.fecha ? (evento.fechaFin ?? evento.fecha) < hoy : false;
  const fechaLarga = (d: string) => new Intl.DateTimeFormat(es ? "es-SV" : "en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`));
  async function correr<T>(trabajo: () => Promise<T>) {
    setEstado({ ocupado: true, error: "", aviso: "" });
    try {
      const r = await trabajo();
      setEstado({ ocupado: false, error: "", aviso: "" });
      return r;
    } catch (e) {
      setEstado({ ocupado: false, error: (e as Error).message, aviso: "" });
      return null;
    }
  }
  const buscar = () =>
    correr(async () => {
      const r = await pedir<{ busqueda: Busqueda }>("/api/granjas/eventos", { accion: "publicacion_buscar", id: evento.id, url, cuenta: cuenta || undefined });
      setBusqueda(r.busqueda);
      setSeleccion(null);
      if (!r.busqueda.accesible) setMostrarCaptura(true);
    });
  const vincular = () =>
    correr(async () => {
      const r = await pedir<{ nueva: boolean }>("/api/granjas/eventos", { accion: "publicacion_vincular", id: evento.id, url });
      setEstado({ ocupado: false, error: "", aviso: r.nueva ? t("Enlace vinculado como fuente del evento.", "Link added as an event source.") : t("Ese enlace ya era fuente del evento.", "That link was already an event source.") });
    });
  const fotograma = (videoUrl: string) =>
    correr(async () => {
      const r = await pedir<{ medio: { id: string } }>("/api/granjas/eventos", { accion: "fotograma", id: evento.id, videoUrl, segundo });
      setSeleccion({ via: "medio", medioId: r.medio.id, origen: "fotograma" });
    });
  const leerAfiche = (medioId: string) =>
    correr(async () => {
      const r = await pedir<{ datos: DatosAfiche }>("/api/granjas/eventos", { accion: "leer_afiche", id: evento.id, medioId });
      setDatosAfiche(r.datos);
    });
  const guardar = () =>
    correr(async () => {
      await pedir("/api/granjas/eventos", {
        accion: "imagen_original",
        id: evento.id,
        datos: {
          // El enlace tal como lo pegaste (puede traer el @usuario); el servidor lo normaliza.
          url,
          origen: seleccion!.origen,
          cuenta: busqueda?.accesible ? busqueda.cuenta : cuenta,
          ...(seleccion!.via === "api" ? { medioUrl: seleccion!.url } : { medioId: seleccion!.medioId }),
          comprobaciones: checks,
        },
      });
      await onGuardado(t("Referencia guardada. Queda como referencia interna hasta que confirmes el permiso de reutilización.", "Reference saved. It stays internal until you confirm the reuse permission."));
    });
  function abrirArchivo(file: File | null | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const lector = new FileReader();
    lector.onload = () => setCaptura({ src: String(lector.result), nombre: file.name || "captura.png" });
    lector.readAsDataURL(file);
  }
  const pegar = (e: ClipboardEvent) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      setMostrarCaptura(true);
      abrirArchivo(item.getAsFile());
    }
  };
  async function subirRecorte(blob: Blob) {
    await correr(async () => {
      const f = new FormData();
      f.set("archivo", new File([blob], "captura-recortada.png", { type: "image/png" }));
      f.set("licencia", `Captura de ${url || "una publicación"} · referencia interna, permiso pendiente`);
      f.set("generado", "0");
      const r = await fetch("/api/granjas/medios", { method: "POST", body: f });
      const j = (await r.json().catch(() => ({}))) as { medio?: { id: string }; error?: string };
      if (!r.ok || !j.medio) throw new Error(j.error ?? t("No se pudo subir la captura.", "The capture could not be uploaded."));
      setSeleccion({ via: "medio", medioId: j.medio.id, origen: "captura" });
      setCaptura(null);
    });
  }
  const vista = seleccion ? (seleccion.via === "api" ? seleccion.url : `/api/granjas/medios/${seleccion.medioId}`) : null;
  const listo = Boolean(seleccion) && Object.values(checks).every(Boolean);
  return (
    <Modal open onClose={onCerrar} label={t("Imagen original", "Original image")} className="ep-modal eg-original" dismissOnBackdrop>
      <div className="eg-original-cuerpo" onPaste={pegar}>
        <h2>{t("Imagen original", "Original image")}</h2>
        <p className="ep-nota">{evento.titulo}</p>
        {estado.error && (
          <p className="ep-alerta" role="alert">
            {estado.error}
          </p>
        )}
        {estado.aviso && (
          <p className="ep-aviso" role="status">
            {estado.aviso}
          </p>
        )}

        <section aria-label={t("Publicación de origen", "Source post")}>
          <h3>1. {t("Publicación de origen", "Source post")}</h3>
          <div className="eg-original-fila">
            <label className="eg-campo">
              {t("Enlace de Instagram o Facebook", "Instagram or Facebook link")}
              <input type="url" value={url} placeholder="https://www.instagram.com/p/…" onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label className="eg-campo eg-original-cuenta">
              {t("Cuenta (opcional)", "Account (optional)")}
              <input value={cuenta} placeholder="@cuenta" maxLength={31} onChange={(e) => setCuenta(e.target.value)} />
            </label>
          </div>
          <div className="ep-acciones">
            <button className="ep-boton ep-primario" disabled={estado.ocupado || url.length < 12} onClick={() => void buscar()}>
              <Search size={15} />
              {t("Buscar imagen original", "Find original image")}
            </button>
            {/^https:\/\//.test(url) && (
              <a className="ep-boton" href={url} target="_blank" rel="noreferrer noopener">
                {t("Abrir publicación", "Open post")} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
            <button className="ep-boton ep-texto" disabled={estado.ocupado || url.length < 12} onClick={() => void vincular()}>
              <Link2 size={15} />
              {t("Solo vincular el enlace", "Only link it")}
            </button>
          </div>
        </section>

        {busqueda && !busqueda.accesible && (
          <p className="eg-original-motivo" role="status">
            <b>{t("No se puede leer automáticamente:", "Cannot be read automatically:")}</b> {busqueda.motivo}
          </p>
        )}
        {busqueda?.accesible && (
          <section aria-label={t("Imágenes de la publicación", "Post images")}>
            <h3>2. {t("Elige la imagen", "Choose the image")}</h3>
            <p className="ep-nota">
              {busqueda.cuenta} · {busqueda.via === "instagram_propia" ? t("tu cuenta (API de Instagram)", "your account (Instagram API)") : t("Business Discovery (API de Meta)", "Business Discovery (Meta API)")}
              {busqueda.publicado ? ` · ${t("publicado el", "posted on")} ${fechaLarga(busqueda.publicado)}` : ""}
            </p>
            <ul className="eg-original-medios">
              {busqueda.medios.map((m) => {
                const src = m.tipo === "imagen" ? m.url : m.miniatura;
                return (
                  <li key={m.indice}>
                    {src ? (
                      <button
                        className={seleccion?.via === "api" && seleccion.url === src ? "eg-elegida" : ""}
                        aria-pressed={seleccion?.via === "api" && seleccion.url === src}
                        onClick={() => setSeleccion({ via: "api", url: src, origen: m.tipo === "imagen" ? "original" : "fotograma" })}
                      >
                        <img src={src} alt={`${t("Imagen", "Image")} ${m.indice + 1}${m.tipo === "video" ? ` (${t("miniatura del video", "video thumbnail")})` : ""}`} referrerPolicy="no-referrer" />
                      </button>
                    ) : (
                      <span className="ep-nota">{t("Video sin miniatura disponible.", "Video without thumbnail.")}</span>
                    )}
                    {m.tipo === "video" && m.url && (
                      <span className="eg-original-fotograma">
                        <label>
                          {t("Segundo", "Second")}
                          <input type="number" min={0} max={600} value={segundo} onChange={(e) => setSegundo(Number(e.target.value) || 0)} />
                        </label>
                        <button className="ep-boton" disabled={estado.ocupado} onClick={() => void fotograma(m.url!)}>
                          {t("Usar fotograma", "Use frame")}
                        </button>
                      </span>
                    )}
                    {m.tipo === "video" && !m.url && <small className="ep-nota">{t("Meta no entrega el archivo de este video (p. ej., audio con derechos): solo su miniatura.", "Meta does not provide this video file (e.g., licensed audio): only its thumbnail.")}</small>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-label={t("Captura", "Capture")}>
          {!mostrarCaptura ? (
            <button className="ep-boton ep-texto" onClick={() => setMostrarCaptura(true)}>
              <ImagePlus size={15} />
              {t("Subir o pegar captura", "Upload or paste a capture")}
            </button>
          ) : (
            <>
              <h3>{busqueda?.accesible ? "" : "2. "}{t("Subir o pegar captura", "Upload or paste a capture")}</h3>
              <p className="ep-nota">{t("Abre la publicación, toma una captura del afiche y súbela o pégala aquí (⌘V). Después recórtala para quitar la interfaz de la red.", "Open the post, capture the poster and upload or paste it here (⌘V). Then crop out the app interface.")}</p>
              <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={t("Elegir captura", "Choose capture")} onChange={(e) => abrirArchivo(e.target.files?.[0])} />
              {captura && <Recortador src={captura.src} es={es} ocupado={estado.ocupado} onListo={(b) => void subirRecorte(b)} />}
            </>
          )}
        </section>

        {vista && (
          <section aria-label={t("Vista previa", "Preview")}>
            <h3>3. {t("Vista previa completa", "Full preview")}</h3>
            <div className="eg-original-vista">
              <img src={vista} alt={t("Imagen elegida", "Chosen image")} referrerPolicy="no-referrer" />
            </div>
          </section>
        )}

        <section aria-label={t("Datos a confirmar", "Data to confirm")}>
          <h3>{vista ? "4" : "3"}. {t("Comprueba que es este evento", "Check it is this event")}</h3>
          <dl className="eg-original-datos">
            <dt>{t("Título", "Title")}</dt>
            <dd>{evento.titulo}</dd>
            <dt>{t("Fecha del evento", "Event date")}</dt>
            <dd>
              {evento.fecha ? fechaLarga(evento.fecha) : t("por confirmar", "to be confirmed")}
              {pasado && <span className="ep-chip ep-chip-error"> {t("Ya pasó", "Past")}</span>}
            </dd>
            {busqueda?.accesible && busqueda.publicado && (
              <>
                <dt>{t("Fecha de la publicación", "Post date")}</dt>
                <dd>{fechaLarga(busqueda.publicado)} · {t("no es la fecha del evento", "not the event date")}</dd>
              </>
            )}
            <dt>{t("Lugar", "Place")}</dt>
            <dd>{[evento.lugar, evento.municipio, evento.departamento].filter(Boolean).join(", ") || t("por confirmar", "to be confirmed")}</dd>
            <dt>{t("Organizador o cuenta", "Organizer or account")}</dt>
            <dd>{busqueda?.accesible ? busqueda.cuenta : cuenta ? `@${cuenta.replace(/^@/, "")}` : t("sin verificar", "unverified")}</dd>
          </dl>
          {busqueda?.accesible && busqueda.texto && (
            <details>
              <summary>{t("Texto de la publicación", "Post text")}</summary>
              <p className="eg-original-texto">{busqueda.texto}</p>
            </details>
          )}
          {seleccion?.via === "medio" && (
            <button className="ep-boton ep-texto" disabled={estado.ocupado} onClick={() => void leerAfiche(seleccion.medioId)}>
              {t("Leer datos del afiche (Gemini, opcional)", "Read poster data (Gemini, optional)")}
            </button>
          )}
          {datosAfiche && (
            <div className="eg-original-sugerencias">
              <b>{t("Sugerencias del afiche (no se aplican solas):", "Poster suggestions (not applied automatically):")}</b>
              <ul>
                {Object.entries(datosAfiche)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <fieldset className="eg-original-checks">
            <legend>{t("No basta con que coincida el título: podría ser otra edición.", "A matching title is not enough: it could be another edition.")}</legend>
            {(
              [
                ["titulo", t("El título coincide", "The title matches")],
                ["fecha", t("La fecha y el año coinciden", "Date and year match")],
                ["lugar", t("El lugar coincide", "The place matches")],
                ["organizador", t("El organizador o la cuenta es el correcto", "Organizer or account is correct")],
              ] as const
            ).map(([k, etiqueta]) => (
              <label key={k} className="ep-checkbox">
                <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />
                {etiqueta}
              </label>
            ))}
          </fieldset>
        </section>

        <div className="ep-acciones">
          <button className="ep-boton ep-primario" disabled={!listo || estado.ocupado} onClick={() => void guardar()}>
            {t("Guardar referencia", "Save reference")}
          </button>
          <button className="ep-boton" onClick={onCerrar}>
            {t("Cancelar", "Cancel")}
          </button>
        </div>
        <p className="ep-nota">
          {t(
            "Encontrar o capturar una imagen no da permiso para republicarla: queda como referencia interna hasta que confirmes el permiso de reutilización. Ezra no rastrea redes ni descarga en lote.",
            "Finding or capturing an image does not grant permission to republish it: it stays internal until you confirm reuse permission. Ezra does not crawl networks or bulk download.",
          )}
        </p>
      </div>
    </Modal>
  );
}

/** Recorte de la captura: arrastra sobre la imagen o ajusta los valores; se sube solo el área elegida. */
function Recortador({ src, es, ocupado, onListo }: { src: string; es: boolean; ocupado: boolean; onListo: (blob: Blob) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const imagen = useRef<HTMLImageElement | null>(null);
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);
  const [r, setR] = useState<Recorte>({ x: 0, y: 0, w: 0, h: 0 });
  const inicio = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imagen.current = img;
      setTam({ w: img.naturalWidth, h: img.naturalHeight });
      setR({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
  }, [src]);
  const escala = tam ? Math.min(1, 560 / tam.w) : 1;
  useEffect(() => {
    const c = lienzo.current;
    const img = imagen.current;
    if (!c || !img || !tam) return;
    c.width = Math.round(tam.w * escala);
    c.height = Math.round(tam.h * escala);
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, c.width, c.height);
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, r.x, r.y, r.w, r.h, r.x * escala, r.y * escala, r.w * escala, r.h * escala);
    g.strokeStyle = "#4f46e5";
    g.lineWidth = 2;
    g.strokeRect(r.x * escala, r.y * escala, r.w * escala, r.h * escala);
  }, [r, tam, escala]);
  if (!tam) return <p role="status">{es ? "Cargando captura…" : "Loading capture…"}</p>;
  const punto = (e: EventoPuntero<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(tam.w, ((e.clientX - b.left) / b.width) * tam.w)), y: Math.max(0, Math.min(tam.h, ((e.clientY - b.top) / b.height) * tam.h)) };
  };
  const ajustar = (k: keyof Recorte, v: number) => {
    const n = { ...r, [k]: Math.round(Math.max(0, v)) };
    n.w = Math.min(n.w, tam.w - n.x);
    n.h = Math.min(n.h, tam.h - n.y);
    setR(n);
  };
  function usar() {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(r.w));
    c.height = Math.max(1, Math.round(r.h));
    c.getContext("2d")!.drawImage(imagen.current!, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    c.toBlob((b) => b && onListo(b), "image/png");
  }
  return (
    <div className="eg-recorte">
      <canvas
        ref={lienzo}
        aria-label={es ? "Captura: arrastra para elegir el área del afiche" : "Capture: drag to select the poster area"}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          inicio.current = punto(e);
        }}
        onPointerMove={(e) => {
          if (!inicio.current) return;
          const p = punto(e);
          const a = inicio.current;
          setR({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
        }}
        onPointerUp={() => (inicio.current = null)}
      />
      <div className="eg-recorte-valores">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <label key={k}>
            {{ x: es ? "Izquierda" : "Left", y: es ? "Arriba" : "Top", w: es ? "Ancho" : "Width", h: es ? "Alto" : "Height" }[k]}
            <input type="number" min={0} value={Math.round(r[k])} onChange={(e) => ajustar(k, Number(e.target.value) || 0)} />
          </label>
        ))}
        <span className="ep-nota">
          {Math.round(r.w)}×{Math.round(r.h)} px
        </span>
      </div>
      <button className="ep-boton" disabled={ocupado || r.w < 100 || r.h < 100} onClick={usar}>
        <Crop size={15} />
        {es ? "Usar este recorte" : "Use this crop"}
      </button>
    </div>
  );
}
