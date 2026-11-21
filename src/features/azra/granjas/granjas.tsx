"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Copy,
  Pause,
  Play,
  Archive,
  Save,
  Square,
  RotateCcw,
  ArrowLeft,
  Bot,
  Image as Imagen,
  Film,
  ShieldCheck,
  Send,
  Users,
} from "lucide-react";
import { agentes, type Agente } from "@/lib/produccion/modelo";
import { Modal } from "../ui";
import { validarGrafo, estadosTrabajando, type TipoNodo } from "@/lib/granjas/modelo";
import { Lienzo } from "./lienzo";
import { Inspector, type AccionesPaso } from "./inspector";
import { VistaPrevia } from "./vista-previa";
import { AvisoPresupuesto } from "./consumo";
import { PanoramaGranjas } from "./panorama";
import { PanelHorario, resumenHorario, type HorariosRespuesta } from "./horario";
import {
  pedir,
  nodoNuevo,
  type ConexionesRespuesta,
  type Detalle,
  type Grafo,
  type MedioResumen,
  type Nodo,
  type Resumen,
} from "./cliente";
import "./granjas.css";

/** Recetas del flujo diario de Spotmi: se muestran primero; las demás quedan en «Otras recetas». */
const recetasDestacadas = ["eventos_el_salvador", "post_instagram_eventos"];

/** Granjas: flujos de agentes conectados, ejecutados por el trabajador local y revisados por el propietario. */
export function SeccionGranjas({
  g,
  tr,
  fecha,
}: {
  g: (clave: string) => string;
  tr: (clave: string) => string;
  fecha: (iso: string) => string;
}) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [grafo, setGrafo] = useState<Grafo | null>(null);
  const [nombre, setNombre] = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!aviso) return;
    const reloj = setTimeout(() => setAviso(""), 4000);
    return () => clearTimeout(reloj);
  }, [aviso]);
  const [consentimiento, setConsentimiento] = useState<{ abierto: boolean; acepto: boolean }>({
    abierto: false,
    acepto: false,
  });
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [horarios, setHorarios] = useState<HorariosRespuesta["horarios"]>({});
  const [conexiones, setConexiones] = useState<ConexionesRespuesta | null>(null);

  const cargarResumen = useCallback(async () => {
    try {
      const [r, h] = await Promise.all([
        pedir<Resumen>("/api/granjas"),
        pedir<HorariosRespuesta>("/api/granjas/horarios"),
      ]);
      setResumen(r);
      setHorarios(h.horarios);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const cargarDetalle = useCallback(async (id: string, reiniciar = false) => {
    try {
      const d = await pedir<Detalle>(`/api/granjas/${id}`);
      setDetalle(d);
      if (reiniciar) {
        setGrafo(d.granja.grafo);
        setNombre(d.granja.nombre);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<Resumen>("/api/granjas"),
      pedir<ConexionesRespuesta>("/api/granjas/conexiones"),
      pedir<HorariosRespuesta>("/api/granjas/horarios"),
    ])
      .then(([r, c, h]) => {
        if (!vivo) return;
        setResumen(r);
        setConexiones(c);
        setHorarios(h.horarios);
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);
  // El estado se consulta al backend: si se cierra la pestaña, el trabajo sigue y al volver se recupera.
  const activa =
    Boolean(detalle?.ultima && ["en_curso"].includes(detalle.ultima.estado)) ||
    Boolean(
      detalle?.ultima?.pasos.some(
        (p) => estadosTrabajando.includes(p.estado) || p.estado === "en_cola",
      ),
    );
  useEffect(() => {
    if (!abierta) return;
    const reloj = setInterval(() => void cargarDetalle(abierta), activa ? 2000 : 10000);
    return () => clearInterval(reloj);
  }, [abierta, activa, cargarDetalle]);

  const modificado = Boolean(
    detalle &&
    grafo &&
    (JSON.stringify(grafo) !== JSON.stringify(detalle.granja.grafo) ||
      nombre !== detalle.granja.nombre),
  );
  const problemas = useMemo(() => (grafo ? validarGrafo(grafo) : []), [grafo]);
  const pasos = useMemo(
    () => new Map((detalle?.ultima?.pasos ?? []).map((p) => [p.nodoId, p])),
    [detalle],
  );
  const artefactos = useMemo(
    () => new Map((detalle?.artefactos ?? []).map((a) => [a.id, a])),
    [detalle],
  );
  const traspasos = useMemo(() => {
    const activas = new Set<string>();
    if (!detalle?.ultima || !grafo) return activas;
    const ahora = Date.parse(detalle.ahora);
    for (const a of grafo.aristas) {
      const origen = pasos.get(a.desde);
      const destino = pasos.get(a.hacia);
      if (
        origen?.fin &&
        destino &&
        ahora - Date.parse(origen.fin) < 8000 &&
        origen.salidas.some((s) => destino.entradas.includes(s))
      )
        activas.add(a.id);
    }
    return activas;
  }, [detalle, grafo, pasos]);

  async function ejecutar<T>(trabajo: () => Promise<T>, exito?: string): Promise<T | null> {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      const r = await trabajo();
      if (exito) setAviso(exito);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setOcupado(false);
      if (abierta) await cargarDetalle(abierta);
    }
  }
  async function abrir(id: string) {
    setAbierta(id);
    setSeleccionado(null);
    setDetalle(null);
    setGrafo(null);
    await cargarDetalle(id, true);
  }
  async function crearDesde(cuerpo: object) {
    const r = await ejecutar(
      () => pedir<{ granja: { id: string } }>("/api/granjas", cuerpo),
      g("granjaCreada"),
    );
    await cargarResumen();
    if (r) await abrir(r.granja.id);
  }
  async function actualizar(cambios: {
    estado?: "activa" | "pausada" | "archivada";
    guardar?: boolean;
  }) {
    if (!detalle || !grafo) return;
    const r = await ejecutar(
      () =>
        pedir<{ granja: Detalle["granja"] }>("/api/granjas", {
          accion: "actualizar",
          id: detalle.granja.id,
          revision: detalle.granja.revision,
          ...(cambios.guardar ? { grafo, datos: { ...detalle.granja, nombre } } : {}),
          ...(cambios.estado ? { estado: cambios.estado } : {}),
        }),
      cambios.guardar ? g("guardado") : g("estadoCambiado"),
    );
    if (r) {
      await cargarDetalle(detalle.granja.id, true);
      await cargarResumen();
    }
  }
  const cambiarNodo = (nodo: Nodo) =>
    grafo && setGrafo({ ...grafo, nodos: grafo.nodos.map((n) => (n.id === nodo.id ? nodo : n)) });
  const mover = (id: string, x: number, y: number) =>
    setGrafo(
      (actual) =>
        actual && {
          ...actual,
          nodos: actual.nodos.map((n) =>
            n.id === id
              ? {
                  ...n,
                  posicion: {
                    x: Math.max(-4000, Math.min(4000, x)),
                    y: Math.max(-4000, Math.min(4000, y)),
                  },
                }
              : n,
          ),
        },
    );
  function conectar(desde: string, hacia: string) {
    if (!grafo) return;
    if (grafo.aristas.some((a) => a.desde === desde && a.hacia === hacia))
      return setError(g("yaConectado"));
    const siguiente = {
      ...grafo,
      aristas: [...grafo.aristas, { id: crypto.randomUUID(), desde, hacia }],
    };
    const nuevos = validarGrafo(siguiente).filter(
      (p) => !problemas.some((q) => q.mensaje === p.mensaje),
    );
    if (nuevos.length) return setError(nuevos.map((p) => p.mensaje).join(" "));
    setError("");
    setGrafo(siguiente);
  }
  function agregar(tipo: TipoNodo) {
    if (!grafo) return;
    const x = 40 + (grafo.nodos.length % 4) * 250;
    const y = 40 + Math.floor(grafo.nodos.length / 4) * 190;
    const agente = resumen?.especialistas[0] ?? "cazador";
    const nodo = nodoNuevo(
      tipo,
      { x, y },
      tipo === "agente" ? agente : null,
      tipo === "agente" ? g(`agente_${agente}`) : "",
    );
    setGrafo({ ...grafo, nodos: [...grafo.nodos, nodo] });
    setSeleccionado(nodo.id);
  }
  const acciones: AccionesPaso = {
    ejecutarSolo: (nodoId, ia) =>
      void ejecutar(
        () =>
          pedir("/api/granjas/ejecuciones", {
            accion: "iniciar",
            granjaId: abierta,
            nodoId,
            confirmarIA: ia,
          }),
        g("pasoEnCola"),
      ),
    reintentar: (pasoId, ia) =>
      void ejecutar(
        () => pedir("/api/granjas/ejecuciones", { accion: "reintentar", pasoId, confirmarIA: ia }),
        g("pasoEnCola"),
      ),
    manual: (pasoId, contenido, nota, medioId) =>
      void ejecutar(
        () =>
          pedir("/api/granjas/ejecuciones", { accion: "manual", pasoId, contenido, nota, medioId }),
        g("manualGuardado"),
      ),
    importar: (pasoId) =>
      void ejecutar(
        () => pedir("/api/granjas/ejecuciones", { accion: "importar", pasoId }),
        g("importado"),
      ),
    aprobar: (pasoId, comprobaciones) =>
      void ejecutar(
        () => pedir("/api/granjas/ejecuciones", { accion: "aprobar", pasoId, comprobaciones }),
        g("aprobadoOk"),
      ),
    editarArtefacto: (artefactoId, contenido, nota) =>
      void ejecutar(
        () =>
          pedir("/api/granjas/ejecuciones", {
            accion: "editar_artefacto",
            artefactoId,
            contenido,
            nota,
          }),
        g("versionGuardada"),
      ),
    subir: async (archivo, licencia, generado) => {
      const datos = new FormData();
      datos.set("archivo", archivo);
      datos.set("licencia", licencia);
      if (generado) datos.set("generado", "1");
      const r = await ejecutar(async () => {
        const respuesta = await fetch("/api/granjas/medios", { method: "POST", body: datos });
        const cuerpo = await respuesta.json();
        if (!respuesta.ok) throw new Error(cuerpo.error);
        return cuerpo.medio as MedioResumen;
      }, g("archivoGuardado"));
      await cargarResumen();
      return r;
    },
  };
  const iaEnGranja =
    grafo?.nodos.filter(
      (n) => n.tipo === "agente" && n.proveedor !== "manual" && n.proveedor !== "local",
    ) ?? [];
  const ultima = detalle?.ultima;

  async function guardarEspecialistas(visibles: Agente[]) {
    const r = await ejecutar(
      () => pedir<{ visibles: Agente[] }>("/api/granjas/especialistas", { visibles }),
      g("especialistasGuardados"),
    );
    if (r && resumen) setResumen({ ...resumen, especialistas: r.visibles });
  }

  if (!resumen) return <p role="status">{error || g("cargando")}</p>;

  if (!abierta) {
    const tarjetaReceta = (r: Resumen["recetas"][number]) => (
      <button
        key={r.clave}
        className="eg-receta"
        disabled={ocupado}
        onClick={() => {
          // Cada clic crea otra granja: si ya hay una igual activa, se pide confirmación.
          const existente = resumen.granjas.find(
            (x) => x.receta === r.clave && x.estado !== "archivada",
          );
          if (
            existente &&
            !window.confirm(`${g("recetaYaExiste")} «${existente.nombre}». ${g("recetaCrearOtra")}`)
          )
            return;
          void crearDesde({ accion: "receta", clave: r.clave });
        }}
      >
        {r.formato === "video" ? (
          <Film size={20} />
        ) : r.formato === "carrusel" ? (
          <Imagen size={20} />
        ) : (
          <Send size={20} />
        )}
        <strong>{g(`receta_${r.clave}`)}</strong>
        <span>{g(`receta_${r.clave}_ayuda`)}</span>
        <small>
          {r.pasos} {g("pasosMin")}
        </small>
      </button>
    );
    const destacadas = resumen.recetas.filter((r) => recetasDestacadas.includes(r.clave));
    // Una receta sin pasos (la guía turística, aún sin interfaz) no se ofrece.
    const otras = resumen.recetas.filter(
      (r) => !recetasDestacadas.includes(r.clave) && r.pasos > 0,
    );
    const archivadas = resumen.granjas.filter((x) => x.estado === "archivada").length;
    const visibles = verArchivadas ? resumen.granjas.filter((x) => x.estado === "archivada") : [];
    return (
      <div className="eg-granjas">
        {error && (
          <p className="ep-alerta" role="alert">
            {error}
          </p>
        )}
        {aviso && (
          <p className="ep-aviso" role="status">
            {aviso}
          </p>
        )}
        <AvisoPresupuesto estado={resumen.presupuesto} g={g} fecha={fecha} />
        <PanoramaGranjas g={g} tr={tr} fecha={fecha} onAbrir={(id) => void abrir(id)} />
        <section>
          <h2 className="eg-subtitulo">{g("recetas")}</h2>
          <div className="eg-recetas">
            {destacadas.map(tarjetaReceta)}
            <button
              className="eg-receta"
              disabled={ocupado}
              onClick={() =>
                void crearDesde({
                  accion: "crear",
                  datos: {
                    nombre: g("granjaNueva"),
                    objetivo: "",
                    formato: "publicacion",
                    canales: ["spotmi"],
                    politicaFuentes: {
                      dominios: [
                        "elsalvador.travel",
                        "cultura.gob.sv",
                        "istu.gob.sv",
                        "spotmi.com.sv",
                      ],
                      maxFuentesPorPaso: 5,
                    },
                    ajustes: { zonaHoraria: "America/El_Salvador" },
                  },
                })
              }
            >
              <Plus size={20} />
              <strong>{g("granjaVacia")}</strong>
              <span>{g("granjaVaciaAyuda")}</span>
            </button>
          </div>
          {otras.length > 0 && (
            <details className="eg-otras-recetas">
              <summary>
                {g("otrasRecetas")} ({otras.length})
              </summary>
              <div className="eg-recetas">{otras.map(tarjetaReceta)}</div>
            </details>
          )}
        </section>
        <section>
          {/* Las granjas en uso están arriba (panorama); aquí quedan las archivadas, para restaurarlas. */}
          <div className="eg-bloque-cabecera">
            <h2 className="eg-subtitulo">{tr("ez_archivadas")}</h2>
            <label className="ep-checkbox">
              <input
                type="checkbox"
                checked={verArchivadas}
                onChange={(e) => setVerArchivadas(e.target.checked)}
              />
              {g("verArchivadas")}
              {archivadas > 0 && !verArchivadas ? ` · ${archivadas} ${g("archivadasOcultas")}` : ""}
            </label>
          </div>
          {verArchivadas && !visibles.length && <p className="ep-nota">{g("sinGranjas")}</p>}
          <div className="eg-lista">
            {visibles.map((gr) => (
              <button
                key={gr.id}
                className={`eg-tarjeta-granja eg-${gr.estado}`}
                onClick={() => void abrir(gr.id)}
              >
                <span className="ep-pill">{g(`granja_${gr.estado}`)}</span>
                <strong>{gr.nombre}</strong>
                <span>
                  {gr.grafo.nodos.length} {g("pasosMin")} ·{" "}
                  {gr.canales.map((c) => c).join(", ") || "—"}
                </span>
                {gr.estado !== "archivada" && (
                  <small className="eg-tarjeta-horario">
                    {resumenHorario(horarios[gr.id], g, fecha)}
                  </small>
                )}
                <small>
                  {g("actualizada")} {fecha(gr.actualizado)}
                </small>
              </button>
            ))}
          </div>
        </section>
        <details className="eg-especialistas">
          <summary>
            <Users size={16} aria-hidden="true" />
            {g("especialistas")} ({resumen.especialistas.length}/{agentes.length})
          </summary>
          <p className="ep-nota">{g("especialistasAyuda")}</p>
          <fieldset className="eg-especialistas-lista">
            <legend className="eg-oculto">{g("especialistas")}</legend>
            {agentes.map((a) => {
              const marcado = resumen.especialistas.includes(a);
              return (
                <label className="ep-checkbox" key={a}>
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={ocupado || (marcado && resumen.especialistas.length === 1)}
                    onChange={() =>
                      void guardarEspecialistas(
                        marcado
                          ? resumen.especialistas.filter((x) => x !== a)
                          : [...resumen.especialistas, a],
                      )
                    }
                  />
                  {g(`agente_${a}`)}
                </label>
              );
            })}
          </fieldset>
        </details>
      </div>
    );
  }

  return (
    <div className="eg-granjas">
      <div className="eg-barra">
        <button
          className="ep-boton ep-texto"
          onClick={() =>
            modificado && !window.confirm(g("salirSinGuardar"))
              ? null
              : (setAbierta(null), void cargarResumen())
          }
        >
          <ArrowLeft size={16} />
          {g("volver")}
        </button>
        {detalle && grafo && (
          <>
            <label className="eg-nombre">
              <span className="eg-oculto">{g("nombreGranja")}</span>
              <input value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
            </label>
            <span className="ep-pill">{g(`granja_${detalle.granja.estado}`)}</span>
            <div className="ep-acciones">
              <button
                className="ep-boton ep-primario"
                disabled={
                  ocupado || !modificado || problemas.length > 0 || nombre.trim().length < 2
                }
                onClick={() => void actualizar({ guardar: true })}
              >
                <Save size={15} />
                {g("guardar")}
              </button>
              <button
                className="ep-boton"
                disabled={ocupado || modificado}
                onClick={() => void crearDesde({ accion: "duplicar", id: detalle.granja.id })}
              >
                <Copy size={15} />
                {g("duplicar")}
              </button>
              {detalle.granja.estado === "activa" ? (
                <button
                  className="ep-boton"
                  disabled={ocupado || modificado}
                  onClick={() => void actualizar({ estado: "pausada" })}
                >
                  <Pause size={15} />
                  {g("pausarGranja")}
                </button>
              ) : (
                <button
                  className="ep-boton"
                  disabled={ocupado || modificado}
                  onClick={() => void actualizar({ estado: "activa" })}
                >
                  {detalle.granja.estado === "archivada" ? (
                    <RotateCcw size={15} />
                  ) : (
                    <Play size={15} />
                  )}
                  {g(detalle.granja.estado === "archivada" ? "restaurarGranja" : "activarGranja")}
                </button>
              )}
              {detalle.granja.estado !== "archivada" && (
                <button
                  className="ep-boton"
                  disabled={ocupado || modificado}
                  onClick={() =>
                    window.confirm(g("archivarConfirma")) &&
                    void actualizar({ estado: "archivada" })
                  }
                >
                  <Archive size={15} />
                  {g("archivar")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="ep-aviso" role="status">
          {aviso}
        </p>
      )}
      {modificado && <p className="ep-nota">{g("sinGuardar")}</p>}
      {problemas.length > 0 && (
        <ul className="eg-faltantes" role="alert">
          {problemas.map((p) => (
            <li key={p.mensaje}>{p.mensaje}</li>
          ))}
        </ul>
      )}
      {!detalle || !grafo ? (
        <p role="status">{g("cargando")}</p>
      ) : (
        <>
          <div className="eg-ejecucion">
            <div>
              <strong>{ultima ? g(`ejec_${ultima.estado}`) : g("sinEjecuciones")}</strong>
              {ultima && (
                <span className="ep-nota">
                  {" "}
                  · {fecha(ultima.creado)} ·{" "}
                  {ultima.alcance === "completa" ? g("granjaCompleta") : g("unPaso")}
                </span>
              )}
              {detalle.resumenEventos &&
                (detalle.resumenEventos.verificado || detalle.resumenEventos.llamadas > 0) && (
                  <p className="eg-resumen-ejecucion">
                    {detalle.resumenEventos.verificado && (
                      <>
                        <b>{detalle.resumenEventos.nuevos}</b> {g("r_nuevos")} ·{" "}
                        <b>{detalle.resumenEventos.actualizados}</b> {g("r_actualizados")} ·{" "}
                        <b>{detalle.resumenEventos.duplicados}</b> {g("r_duplicados")}
                        {detalle.resumenEventos.fuentesSumadas
                          ? ` (${detalle.resumenEventos.fuentesSumadas} ${g("r_fuentesSumadas")})`
                          : ""}{" "}
                        · <b>{detalle.resumenEventos.conImagen}</b> {g("r_conImagen")} ·{" "}
                      </>
                    )}
                    <b>{new Intl.NumberFormat("es-SV").format(detalle.resumenEventos.tokens)}</b>{" "}
                    {g("r_tokens")} ({detalle.resumenEventos.llamadas} {g("r_llamadas")}
                    {detalle.resumenEventos.errores
                      ? `, ${detalle.resumenEventos.errores} ${g("r_conError")}`
                      : ""}
                    ) ·{" "}
                    {detalle.resumenEventos.costo === null
                      ? g("r_sinTarifa")
                      : `${g("r_costo")} US$ ${detalle.resumenEventos.costo.toFixed(4)}`}
                  </p>
                )}
            </div>
            <div className="ep-acciones">
              <button
                className="ep-boton ep-primario"
                disabled={
                  ocupado || modificado || detalle.granja.estado !== "activa" || !grafo.nodos.length
                }
                onClick={() => setConsentimiento({ abierto: true, acepto: false })}
              >
                <Play size={15} />
                {g("ejecutarGranja")}
              </button>
              {ultima &&
                ["en_curso", "esperando_dueno", "bloqueada", "fallida"].includes(ultima.estado) && (
                  <button
                    className="ep-boton"
                    disabled={ocupado}
                    onClick={() =>
                      void ejecutar(
                        () =>
                          pedir("/api/granjas/ejecuciones", {
                            accion: "pausar",
                            ejecucionId: ultima.id,
                          }),
                        g("pausada"),
                      )
                    }
                  >
                    <Pause size={15} />
                    {g("pausar")}
                  </button>
                )}
              {ultima?.estado === "pausada" && (
                <button
                  className="ep-boton"
                  disabled={ocupado}
                  onClick={() =>
                    void ejecutar(
                      () =>
                        pedir("/api/granjas/ejecuciones", {
                          accion: "reanudar",
                          ejecucionId: ultima.id,
                        }),
                      g("reanudada"),
                    )
                  }
                >
                  <RotateCcw size={15} />
                  {g("reanudar")}
                </button>
              )}
              {ultima && !["cancelada", "completada"].includes(ultima.estado) && (
                <button
                  className="ep-boton eg-peligro"
                  disabled={ocupado}
                  onClick={() =>
                    window.confirm(g("cancelarConfirma")) &&
                    void ejecutar(
                      () =>
                        pedir("/api/granjas/ejecuciones", {
                          accion: "cancelar",
                          ejecucionId: ultima.id,
                        }),
                      g("cancelada"),
                    )
                  }
                >
                  <Square size={15} />
                  {g("cancelar")}
                </button>
              )}
            </div>
          </div>
          {detalle.granja.estado !== "archivada" && (
            <PanelHorario
              granja={detalle.granja}
              granjas={resumen.granjas}
              g={g}
              fecha={fecha}
              ocupado={ocupado}
              onGuardado={() => {
                void cargarDetalle(detalle.granja.id);
                void cargarResumen();
              }}
            />
          )}
          <div className="eg-agregar" role="toolbar" aria-label={g("agregarPaso")}>
            <span>{g("agregarPaso")}:</span>
            <button className="ep-boton" onClick={() => agregar("agente")}>
              <Bot size={15} />
              {g("nodo_agente")}
            </button>
            <button className="ep-boton" onClick={() => agregar("medios")}>
              <Imagen size={15} />
              {g("nodo_medios")}
            </button>
            <button className="ep-boton" onClick={() => agregar("render")}>
              <Film size={15} />
              {g("nodo_render")}
            </button>
            <button className="ep-boton" onClick={() => agregar("revision")}>
              <ShieldCheck size={15} />
              {g("nodo_revision")}
            </button>
            <button className="ep-boton" onClick={() => agregar("publicacion")}>
              <Send size={15} />
              {g("nodo_publicacion")}
            </button>
          </div>
          <div className="eg-editor">
            <Lienzo
              grafo={grafo}
              pasos={pasos}
              faltantes={detalle.faltantes}
              seleccionado={seleccionado}
              traspasos={traspasos}
              etiqueta={g("lienzo")}
              g={g}
              onSeleccionar={setSeleccionado}
              onMover={mover}
              onConectar={conectar}
            />
            {seleccionado && grafo.nodos.some((n) => n.id === seleccionado) ? (
              <Inspector
                key={seleccionado}
                nodo={grafo.nodos.find((n) => n.id === seleccionado)!}
                grafo={grafo}
                paso={pasos.get(seleccionado)}
                artefactos={artefactos}
                aprobado={Boolean(
                  detalle.aprobaciones.find((a) => a.pasoId === pasos.get(seleccionado)?.id)
                    ?.vigente,
                )}
                faltantes={detalle.faltantes[seleccionado] ?? []}
                resumen={resumen}
                guardado={!modificado}
                ocupado={ocupado}
                g={g}
                tr={tr}
                fecha={fecha}
                onCambiar={cambiarNodo}
                onEliminar={() => {
                  setGrafo({
                    nodos: grafo.nodos.filter((n) => n.id !== seleccionado),
                    aristas: grafo.aristas.filter(
                      (a) => a.desde !== seleccionado && a.hacia !== seleccionado,
                    ),
                  });
                  setSeleccionado(null);
                }}
                onConectar={conectar}
                onDesconectar={(id) =>
                  setGrafo({ ...grafo, aristas: grafo.aristas.filter((a) => a.id !== id) })
                }
                acciones={acciones}
              />
            ) : (
              <aside className="eg-inspector eg-vacio">
                <p>{g("eligePaso")}</p>
                <ol className="eg-orden">
                  {grafo.nodos.map((n) => (
                    <li key={n.id}>
                      <button className="ep-boton ep-texto" onClick={() => setSeleccionado(n.id)}>
                        {n.titulo} ·{" "}
                        {pasos.get(n.id)
                          ? g(`estado_${pasos.get(n.id)!.estado}`)
                          : g("sinEjecutar")}
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </div>
          {detalle.piezas.map((v) => (
            <VistaPrevia
              key={v.pieza.id}
              vista={v}
              conexiones={conexiones?.conexiones ?? []}
              medios={resumen.medios}
              ocupado={ocupado}
              g={g}
              fecha={fecha}
              onGuardar={async (contenido) =>
                void (await ejecutar(
                  () =>
                    pedir("/api/granjas/piezas", {
                      accion: "editar",
                      piezaId: v.pieza.id,
                      version: v.pieza.version,
                      contenido,
                    }),
                  g("versionGuardada"),
                ))
              }
              onAprobar={(comprobaciones) =>
                void ejecutar(
                  () =>
                    pedir("/api/granjas/piezas", {
                      accion: "aprobar",
                      piezaId: v.pieza.id,
                      hash: v.pieza.hash,
                      comprobaciones,
                    }),
                  g("aprobadoOk"),
                )
              }
              onSimular={(destinos) =>
                ejecutar(() =>
                  pedir("/api/granjas/piezas", {
                    accion: "simular",
                    piezaId: v.pieza.id,
                    destinos,
                  }),
                )
              }
              onAutorizar={(destinos, confirmacion) =>
                void ejecutar(
                  () =>
                    pedir("/api/granjas/piezas", {
                      accion: "autorizar",
                      piezaId: v.pieza.id,
                      hash: v.pieza.hash,
                      destinos,
                      confirmacion,
                    }),
                  g("autorizado"),
                )
              }
              onResolver={(reciboId, resultado, enlace) =>
                void ejecutar(
                  () =>
                    pedir("/api/granjas/piezas", {
                      accion: "resolver",
                      reciboId,
                      resultado,
                      enlace,
                    }),
                  g("guardado"),
                )
              }
            />
          ))}
          {detalle.ejecuciones.length > 0 && (
            <details className="eg-historial">
              <summary>
                {g("historial")} ({detalle.ejecuciones.length})
              </summary>
              <ul>
                {detalle.ejecuciones.map((e) => (
                  <li key={e.id}>
                    {fecha(e.creado)} · {g(`ejec_${e.estado}`)} ·{" "}
                    {e.alcance === "completa" ? g("granjaCompleta") : g("unPaso")} ·{" "}
                    {g("revisionGranja")} {e.revisionGranja}
                    {e.consentimiento.ia ? ` · ${g("conIA")}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <Modal
        open={consentimiento.abierto}
        onClose={() => setConsentimiento({ abierto: false, acepto: false })}
        label={g("ejecutarGranja")}
        className="ep-modal"
        dismissOnBackdrop
      >
        <div className="eg-guia">
          <h2>{g("ejecutarGranja")}</h2>
          <p>{g("ejecutarAyuda")}</p>
          {iaEnGranja.length > 0 ? (
            <>
              <p>{g("pasosIA")}</p>
              <ul>
                {iaEnGranja.map((n) => (
                  <li key={n.id}>
                    {n.titulo} · {tr(`p_${n.proveedor}`)}{" "}
                    {resumen.ia[n.proveedor as "astra" | "claude" | "gemini"]
                      ? ""
                      : `(${g("noDisponible")})`}
                  </li>
                ))}
              </ul>
              <label className="ep-checkbox">
                <input
                  type="checkbox"
                  checked={consentimiento.acepto}
                  onChange={(e) =>
                    setConsentimiento({ ...consentimiento, acepto: e.target.checked })
                  }
                />
                {g("consentimientoGranja")}
              </label>
            </>
          ) : (
            <p className="ep-nota">{g("sinIA")}</p>
          )}
          <p className="ep-nota">{g("macDespierta")}</p>
          <div className="ep-acciones">
            <button
              className="ep-boton ep-primario"
              disabled={ocupado || (iaEnGranja.length > 0 && !consentimiento.acepto)}
              onClick={() => {
                const acepto = consentimiento.acepto;
                setConsentimiento({ abierto: false, acepto: false });
                void ejecutar(
                  () =>
                    pedir("/api/granjas/ejecuciones", {
                      accion: "iniciar",
                      granjaId: abierta,
                      confirmarIA: acepto,
                    }),
                  g("ejecucionIniciada"),
                );
              }}
            >
              <Play size={15} />
              {g("iniciar")}
            </button>
            <button
              className="ep-boton"
              onClick={() => setConsentimiento({ abierto: false, acepto: false })}
            >
              {tr("p_cancelar")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
