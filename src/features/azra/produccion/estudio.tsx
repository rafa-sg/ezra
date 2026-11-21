"use client";
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  CalendarDays,
  Workflow,
  Ticket,
  Gauge,
  Cable,
  Sparkles,
  Download,
  Copy,
  RefreshCw,
  Check,
  Globe,
  MapPin,
  X,
  ShieldCheck,
  ChevronRight,
  House,
  ListTodo,
  History,
  MessageSquareWarning,
  Ban,
  CircleArrowRight,
  Camera,
} from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { useClerk } from "@clerk/nextjs";
import { Modal } from "../ui";
import {
  agentes,
  canales,
  estados,
  proveedores,
  construirEncargo,
  contenidoEncargoSchema,
  comprobacionesVacias,
  type Agente,
  type Encargo,
  type ContenidoEncargo,
  type Produccion,
  siguienteAccion,
} from "@/lib/produccion/modelo";
import type { FichaSpotmi } from "@/lib/produccion/spotmi";
import { Pixel, colores } from "../granjas/pixel";
import { SeccionGranjas } from "../granjas/granjas";
import { ConexionesGranjas } from "../granjas/conexiones";
import { ColocarEnGranja } from "../granjas/colocar";
import { SeccionConsumo } from "../granjas/consumo";
import { SeccionEventos } from "../granjas/eventos";
import { PaginaInstagram } from "../granjas/instagram-pagina";
import { Inicio, type DestinoInicio } from "./inicio";
import { CabeceraPagina, NavegacionLateral } from "./navegacion";
import { DetalleEncargo, VistaEncargos, type AccionEncargo } from "./encargos";
import { NuevoEncargo } from "./nuevo-encargo";
import { ConexionesIALocal } from "./ia-local";
import { AgendaCalendario } from "./agenda";
import { CalendarioVistas } from "./calendario";
import { Bienvenida, leerGuia } from "./bienvenida";
import type { EstadoOnboarding } from "@/lib/produccion/onboarding";
import "./estudio.css";
import "./tokens.css";

// Barra lateral estilo Buffer: Inicio y Encargos arriba; las secciones anteriores siguen igual.
const secciones = [
  "inicio",
  "encargos",
  "granjas",
  "eventos",
  "instagram",
  "calendario",
  "conexiones",
  "consumo",
] as const;
type Seccion = (typeof secciones)[number];
/** Secciones retiradas del menú (equipo, fuentes, cola): sus enlaces abren Granjas. */
const seccionDe = (valor: string | null): Seccion | null =>
  valor === null
    ? null
    : (secciones as readonly string[]).includes(valor)
      ? (valor as Seccion)
      : "granjas";
/** Una línea de ayuda por sección para la cabecera (las descripciones que antes iban dentro de cada página). */
const ayudaSeccion: Partial<Record<Seccion, string>> = {
  encargos: "p_encargosAyuda",
  granjas: "p_colaAyuda",
  eventos: "p_eventosAyuda",
  calendario: "p_calendarioAyuda",
  conexiones: "p_conexionesAyuda",
  consumo: "p_consumoAyuda",
};
type Conexiones = {
  spotmi: string;
  geminiConfigurado: boolean;
  geminiHabilitado: boolean;
  modelo: string | null;
  astraLocal: boolean;
  claudeLocal: boolean;
};
const nombresCanales = {
  spotmi: "Spotmi web",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
};
const vacio = (agente: Agente = "cazador"): ContenidoEncargo => ({
  titulo: "",
  agente,
  proveedor: "astra",
  canales: ["spotmi", "instagram"],
  encargo: "",
  resultado: "",
  fuentes: [],
  fechaPrevista: "",
});
async function datosRespuesta(respuesta: Response) {
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error || String(respuesta.status));
  return datos;
}
export function EstudioProduccion({ soloLectura = false }: { soloLectura?: boolean }) {
  const { signOut } = useClerk();
  const { t, locale } = useLanguage();
  const tr = (clave: string) => t(clave as MessageKey);
  const g = (clave: string) => t(`g_${clave}` as MessageKey);
  const [seccion, setSeccion] = useState<Seccion>("inicio");
  // % del día para la píldora del menú (se recalcula con cada cambio que refresca el Inicio).
  // Contadores de la barra lateral (solo cuando aportan): eventos nuevos por revisar.
  const [eventosNuevos, setEventosNuevos] = useState(0);
  // Detalle de un encargo (lectura y acciones); el editor se abre aparte para cambiar el pedido.
  const [detalle, setDetalle] = useState<string | null>(null);
  const [ejecutandoId, setEjecutandoId] = useState<string | null>(null);
  // Asistente «Nuevo encargo» (con fecha si viene del calendario).
  const [nuevo, setNuevo] = useState<{ fecha: string } | null>(null);
  const [guia, setGuia] = useState<EstadoOnboarding | null>(null);
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  // Cada guardado sube este número y el Inicio vuelve a leer sus datos.
  const [versionInicio, setVersionInicio] = useState(0);
  const [notaCambios, setNotaCambios] = useState("");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [fechasCalendario, setFechasCalendario] = useState<Record<string, string>>({});
  const [especialistas, setEspecialistas] = useState<Agente[]>([...agentes]);
  const [avisoOAuth, setAvisoOAuth] = useState<string | null>(null);
  const [produccion, setProduccion] = useState<Produccion | null>(null);
  const [conexiones, setConexiones] = useState<Conexiones | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [consulta, setConsulta] = useState(false);
  const [fichas, setFichas] = useState<FichaSpotmi[] | null>(null);
  const [consultado, setConsultado] = useState("");
  const [editor, setEditor] = useState<ContenidoEncargo | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [comprobaciones, setComprobaciones] = useState(comprobacionesVacias());
  const [siguienteAgente, setSiguienteAgente] = useState<Agente>("guion");
  const [confirmarIA, setConfirmarIA] = useState(false);
  const actual = produccion?.encargos.find((e) => e.id === seleccionado);
  const modificado =
    editor &&
    (!actual || JSON.stringify(contenidoEncargoSchema.parse(actual)) !== JSON.stringify(editor));
  const encargos = produccion?.encargos ?? [];
  // Menú desplegable de móvil: Escape lo cierra y devuelve el foco al botón.
  useEffect(() => {
    if (soloLectura) return;
    let vivo = true;
    fetch("/api/produccion/inicio", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: { eventos?: { nuevos: number } } | null) =>
          vivo && setEventosNuevos(d?.eventos?.nuevos ?? 0),
      )
      .catch(() => vivo && setEventosNuevos(0));
    return () => {
      vivo = false;
    };
  }, [versionInicio, soloLectura]);
  // Aviso del navegador si cierras o recargas con cambios del encargo sin guardar.
  useEffect(() => {
    if (!modificado) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [modificado]);
  const fecha = (valor: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/El_Salvador",
    }).format(new Date(valor.length === 16 ? `${valor}:00-06:00` : valor));

  async function cargar() {
    setError("");
    try {
      const datos = await datosRespuesta(await fetch("/api/produccion"));
      setProduccion(datos.produccion);
      setConexiones(datos.conexiones);
      if (datos.especialistas) setEspecialistas(datos.especialistas);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (soloLectura) return;
    const controlador = new AbortController();
    fetch("/api/produccion", { signal: controlador.signal })
      .then(datosRespuesta)
      .then((datos) => {
        setProduccion(datos.produccion);
        setConexiones(datos.conexiones);
        if (datos.especialistas) setEspecialistas(datos.especialistas);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controlador.abort();
  }, [soloLectura]);
  useEffect(() => {
    if (soloLectura) return;
    let vivo = true;
    leerGuia().then((v) => {
      if (!vivo || !v) return;
      setGuia(v.estado);
      // La guía se abre sola solo en un estudio sin trabajo y una vez por sesión del navegador.
      let vista = false;
      try {
        vista = sessionStorage.getItem("ezra:guia-vista") === "1";
        sessionStorage.setItem("ezra:guia-vista", "1");
      } catch {
        /* sin almacenamiento: no se abre sola */
        vista = true;
      }
      if (!v.tieneTrabajo && !v.estado.completado && !vista) setGuiaAbierta(true);
    });
    return () => {
      vivo = false;
    };
  }, [soloLectura]);
  useEffect(() => {
    if (soloLectura) return;
    const parametros = new URLSearchParams(window.location.search);
    const pedida = seccionDe(parametros.get("seccion"));
    if (!pedida) return;
    const resultado = parametros.get("conexion");
    // Se conserva la sección en la dirección; el resultado del OAuth se quita (solo se muestra una vez).
    if (resultado)
      window.history.replaceState(
        { seccion: pedida },
        "",
        `${window.location.pathname}?seccion=${pedida}`,
      );
    queueMicrotask(() => {
      setSeccion(pedida);
      if (resultado && /^(instagram|facebook|tiktok):(ok|error)$/.test(resultado))
        setAvisoOAuth(resultado);
    });
  }, [soloLectura]);
  useEffect(() => {
    const atras = () =>
      setSeccion(seccionDe(new URLSearchParams(window.location.search).get("seccion")) ?? "inicio");
    window.addEventListener("popstate", atras);
    return () => window.removeEventListener("popstate", atras);
  }, []);
  function navegar(nueva: Seccion) {
    // La sección queda en la dirección: el botón Atrás vuelve y una recarga no la pierde.
    const url =
      nueva === "inicio"
        ? window.location.pathname
        : `${window.location.pathname}?seccion=${nueva}`;
    if (`${window.location.pathname}${window.location.search}` !== url)
      window.history.pushState({ seccion: nueva }, "", url);
    setSeccion(nueva);
    setAviso("");
  }
  function crear(agente?: Agente, ficha?: FichaSpotmi) {
    if (soloLectura) return;
    // Sin especialista ni ficha: el asistente simplificado. Con ficha de Spotmi: el editor prellenado.
    if (!agente && !ficha) return setNuevo({ fecha: "" });
    agente = agente ?? "cazador";
    setSeleccionado(null);
    setComprobaciones(comprobacionesVacias());
    setConfirmarIA(false);
    const contenido = vacio(agente);
    if (agente === "cazador" && !ficha) {
      contenido.titulo = tr("p_cazaTitulo");
      contenido.encargo = tr("p_cazaNota");
      contenido.fuentes = [
        {
          nombre: "Agenda de turismo de El Salvador (MITUR)",
          url: "https://elsalvador.travel/esp/eventos/",
          imagen: "",
          nota: "",
        },
        {
          nombre: "Ministerio de Cultura",
          url: "https://www.cultura.gob.sv/feed/",
          imagen: "",
          nota: "",
        },
        {
          nombre: "Instituto Salvadoreño de Turismo (ISTU)",
          url: "https://istu.gob.sv/feed/",
          imagen: "",
          nota: "",
        },
      ];
    }
    if (ficha && conexiones) {
      contenido.titulo = ficha.titulo;
      contenido.encargo = [ficha.descripcion, ficha.fecha, ficha.lugar, ficha.departamento]
        .filter(Boolean)
        .join("\n");
      contenido.fuentes = [
        {
          nombre: ficha.titulo,
          url: ficha.fuente || `${conexiones.spotmi}${ficha.ruta}`,
          imagen: ficha.imagen || "",
          nota: ficha.imagenGenerada ? tr("p_ilustracion") : "",
        },
      ];
    }
    setEditor(contenido);
  }
  function abrir(encargo: Encargo) {
    setSeleccionado(encargo.id);
    setEditor(contenidoEncargoSchema.parse(encargo));
    setComprobaciones(encargo.comprobaciones);
    setConfirmarIA(false);
  }
  function cerrar() {
    if (modificado && !window.confirm(tr("p_salirCambios"))) return;
    setEditor(null);
    setSeleccionado(null);
  }
  async function mutar(accion: object, ruta = "/api/produccion") {
    if (!produccion) return null;
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      const datos = await datosRespuesta(
        await fetch(ruta, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...accion, revision: produccion.revision }),
        }),
      );
      setProduccion(datos.produccion);
      setAviso(tr("p_guardado"));
      setVersionInicio((v) => v + 1);
      return datos as { produccion: Produccion; encargoId?: string };
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setOcupado(false);
    }
  }
  async function guardar() {
    if (!editor) return;
    const datos = await mutar({
      accion: seleccionado ? "editar" : "crear",
      ...(seleccionado ? { id: seleccionado } : {}),
      contenido: editor,
    });
    if (datos)
      abrir(
        seleccionado
          ? datos.produccion.encargos.find((e) => e.id === seleccionado)!
          : datos.produccion.encargos[0],
      );
  }
  async function estado(nuevo: Encargo["estado"]) {
    const datos = await mutar({
      accion: "estado",
      id: seleccionado,
      estado: nuevo,
      comprobaciones,
    });
    if (datos)
      abrir(datos.produccion.encargos.find((e) => e.id === (datos.encargoId || seleccionado))!);
  }
  async function pedirCambios() {
    const datos = await mutar({ accion: "cambios", id: seleccionado, nota: notaCambios });
    if (datos) {
      setNotaCambios("");
      abrir(datos.produccion.encargos.find((e) => e.id === seleccionado)!);
    }
  }
  async function rechazar() {
    const datos = await mutar({ accion: "rechazar", id: seleccionado, motivo: motivoRechazo });
    if (datos) {
      setMotivoRechazo("");
      abrir(datos.produccion.encargos.find((e) => e.id === seleccionado)!);
    }
  }
  async function ponerFecha(id: string, fechaPrevista: string) {
    const datos = await mutar({ accion: "fecha", id, fechaPrevista });
    if (datos) setFechasCalendario((f) => ({ ...f, [id]: "" }));
  }
  /** Acciones del detalle, por id (no dependen del editor abierto). */
  async function accionEncargo(a: AccionEncargo) {
    if (a.tipo === "ejecutar") {
      setEjecutandoId(a.id);
      try {
        const datos = await mutar({ id: a.id, confirmar: true }, "/api/produccion/generar");
        if (datos?.encargoId && datos.encargoId !== a.id) setDetalle(datos.encargoId);
        // Si falló, se recarga para ver el fallo que quedó en el historial (el resultado anterior se conserva).
        if (!datos)
          setProduccion((await datosRespuesta(await fetch("/api/produccion"))).produccion);
      } finally {
        setEjecutandoId(null);
      }
      return;
    }
    if (a.tipo === "estado")
      await mutar({
        accion: "estado",
        id: a.id,
        estado: a.estado,
        comprobaciones: a.comprobaciones,
      });
    if (a.tipo === "cambios") await mutar({ accion: "cambios", id: a.id, nota: a.nota });
    if (a.tipo === "rechazar") await mutar({ accion: "rechazar", id: a.id, motivo: a.motivo });
    if (a.tipo === "fecha")
      await mutar({ accion: "fecha", id: a.id, fechaPrevista: a.fechaPrevista });
  }
  const encargoDetalle = detalle ? encargos.find((x) => x.id === detalle) : undefined;
  function ir(d: DestinoInicio) {
    navegar(d.seccion);
    if (d.seccion === "encargos" && d.id && produccion?.encargos.some((x) => x.id === d.id))
      setDetalle(d.id);
  }
  async function derivar() {
    const datos = await mutar({ accion: "derivar", id: seleccionado, agente: siguienteAgente });
    if (datos) abrir(datos.produccion.encargos.find((e) => e.id === datos.encargoId)!);
  }
  async function copiar() {
    if (!actual) return;
    try {
      await navigator.clipboard.writeText(construirEncargo(actual));
      setAviso(tr("p_copiado"));
    } catch {
      setError(tr("p_error"));
    }
  }
  async function generar() {
    const datos = await mutar(
      { id: seleccionado, confirmar: confirmarIA },
      "/api/produccion/generar",
    );
    if (datos)
      abrir(datos.produccion.encargos.find((e) => e.id === (datos.encargoId || seleccionado))!);
    else {
      const datos = await datosRespuesta(await fetch("/api/produccion"));
      setProduccion(datos.produccion);
    }
  }
  async function consultar() {
    setConsulta(true);
    setError("");
    try {
      const datos = await datosRespuesta(await fetch("/api/produccion/spotmi"));
      setFichas(datos.fichas);
      setConsultado(datos.consultado);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConsulta(false);
    }
  }
  function tarjetaEncargo(encargo: Encargo) {
    return (
      <button className="ep-tarea" key={encargo.id} onClick={() => setDetalle(encargo.id)}>
        <span className="ep-tarea-meta">
          <span>{tr(`p_${encargo.agente}_titulo`)}</span>
          <ArrowUpRight size={16} />
        </span>
        <strong>{encargo.titulo}</strong>
        <span className="ep-siguiente">
          <CircleArrowRight size={15} aria-hidden="true" />
          {tr(`p_sig_${siguienteAccion(encargo)}`)}
        </span>
        <span className="ep-chips">
          {encargo.canales.map((c) => (
            <span key={c}>{nombresCanales[c]}</span>
          ))}
        </span>
        <span className="ep-tarea-pie">
          <span>{tr(`p_${encargo.proveedor}`)}</span>
          <span>{encargo.fechaPrevista ? fecha(encargo.fechaPrevista) : tr("p_sinFecha")}</span>
        </span>
      </button>
    );
  }
  const navegacion = [
    { id: "inicio", icono: House, etiqueta: "p_inicio" },
    { id: "encargos", icono: ListTodo, etiqueta: "p_encargos" },
    { id: "granjas", icono: Workflow, etiqueta: "p_cola" },
    { id: "eventos", icono: Ticket, etiqueta: "p_eventos" },
    { id: "instagram", icono: Camera, etiqueta: "p_instagram" },
    { id: "calendario", icono: CalendarDays, etiqueta: "p_calendario" },
    { id: "conexiones", icono: Cable, etiqueta: "p_conexiones" },
    { id: "consumo", icono: Gauge, etiqueta: "p_consumo" },
  ] as const;
  const visiblesEn = (actual?: Agente) =>
    agentes.filter((a) => especialistas.includes(a) || a === actual);
  return (
    <div className="ep-estudio">
      {soloLectura && (
        <header className="ep-cabecera">
          <a
            className="ep-marca"
            href={conexiones?.spotmi || "https://spotmi.com.sv"}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin size={25} />
            spotmi<span>·</span>
          </a>
          <span className="ep-local">
            <span />
            {tr("p_estudioLocal")}
          </span>
          <button
            className="ep-boton ep-primario"
            disabled={!produccion || soloLectura}
            onClick={() => crear()}
          >
            <Plus size={17} />
            {tr("p_nuevo")}
          </button>
        </header>
      )}
      <div className="ep-marco">
        {/* Navegación en la barra superior: píldora «Menú · % del día» y «Nuevo encargo». */}
        <NavegacionLateral
          items={navegacion.map(({ id, icono, etiqueta }) => ({
            id,
            icono,
            etiqueta: tr(etiqueta),
            ...(id === "encargos"
              ? {
                  contador: encargos.filter((e) => e.estado === "revision").length,
                  contadorAyuda: tr("ez_porRevisar"),
                }
              : {}),
            ...(id === "eventos"
              ? { contador: eventosNuevos, contadorAyuda: tr("ez_sb_nuevos") }
              : {}),
          }))}
          actual={soloLectura ? "" : seccion}
          tr={tr}
          onIr={(id) => navegar(id as Seccion)}
          onNuevo={() => crear()}
          deshabilitado={soloLectura || !produccion}
        />
        {!soloLectura && (
          <CabeceraPagina
            titulo={tr(navegacion.find((n) => n.id === seccion)?.etiqueta ?? "p_inicio")}
            ayuda={ayudaSeccion[seccion] ? tr(ayudaSeccion[seccion]!) : undefined}
            acciones={
              seccion === "calendario" ? (
                <a className="ez-boton-blanco" href="/api/produccion/calendario" download>
                  <Download size={15} aria-hidden="true" />
                  {tr("p_exportarIcs")}
                </a>
              ) : seccion === "conexiones" ? (
                <a className="ez-boton-blanco" href="/api/produccion/exportar">
                  <Download size={15} aria-hidden="true" />
                  {tr("p_respaldo")}
                </a>
              ) : undefined
            }
          />
        )}
        <div
          className={`ep-cuerpo ${seccion === "inicio" && !soloLectura ? "ep-cuerpo-ancho" : ""}`}
        >
          {soloLectura ? (
            <div className="ep-acceso-nuevo">
              <div>
                <strong>{tr("p_vistaNueva")}</strong>
                <p>{tr("p_vistaNuevaAyuda")}</p>
              </div>
              <button
                className="ep-boton"
                onClick={() =>
                  signOut({ redirectUrl: "/sign-in" }).catch(() => setError(tr("signOutFailed")))
                }
              >
                {tr("switchAccount")}
                <ArrowUpRight size={16} />
              </button>
            </div>
          ) : null}
          {error && (
            <div className="ep-alerta" role="alert">
              {error}
              <button onClick={() => void cargar()}>{tr("p_reintentar")}</button>
            </div>
          )}
          {aviso && (
            <p className="ep-aviso" role="status">
              <Check size={16} />
              {aviso}
            </p>
          )}
          {!soloLectura && !produccion && !error && <p role="status">{tr("p_cargando")}</p>}
          {soloLectura && (
            <>
              <section className="ep-hero">
                <div className="ep-hero-copy">
                  <p className="ep-eyebrow">
                    <span />
                    {tr("p_kicker")}
                  </p>
                  <h1>
                    {tr("p_titulo")}
                    <br />
                    <em>{tr("p_destino")}</em>
                  </h1>
                  <p className="ep-intro">{tr("p_intro")}</p>
                  <div className="ep-acciones">
                    <button
                      className="ep-boton ep-primario"
                      disabled={!produccion || soloLectura}
                      onClick={() => crear("cazador")}
                    >
                      <Plus size={17} />
                      {tr("p_nuevo")}
                    </button>
                    <button
                      className="ep-boton ep-texto"
                      disabled={soloLectura}
                      onClick={() => navegar("granjas")}
                    >
                      {tr("p_fuentesCta")}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="ep-datos">
                    <span>
                      <b>11</b> {tr("p_roles")}
                    </span>
                    <span>
                      <b>04</b> {tr("p_canales")}
                    </span>
                    <span>
                      <ShieldCheck size={15} />
                      {tr("p_control")}
                    </span>
                  </div>
                </div>
                <div className="ep-hero-ilustracion" aria-hidden="true">
                  <div className="ep-orbita" />
                  <div className="ep-terminal">
                    <span>SPOTMI CREATIVE LAB</span>
                    <span className="ep-terminal-luz" />
                  </div>
                  <div className="ep-personajes">
                    <Pixel indice={1} />
                    <Pixel indice={0} grande />
                    <Pixel indice={5} />
                  </div>
                  <div className="ep-ruta">
                    {["p_paso1", "p_paso2", "p_paso3", "p_paso4"].map((p, i) => (
                      <span key={p}>
                        <b>0{i + 1}</b>
                        {tr(p)}
                        {i < 3 && <ChevronRight size={12} />}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
              <section>
                <div className="ep-seccion-cabecera">
                  <div>
                    <p className="ep-eyebrow">01 / {tr("p_equipo")}</p>
                    <h2>{tr("p_equipoTitulo")}</h2>
                    <p>{tr("p_equipoAyuda")}</p>
                  </div>
                  <span className="ep-numero">11</span>
                </div>
                <div className="ep-agentes">
                  {agentes.map((agente, i) => (
                    <button
                      className="ep-agente"
                      key={agente}
                      onClick={() => crear(agente)}
                      disabled={!produccion || soloLectura}
                      style={{ "--agente": colores[i] } as CSSProperties}
                    >
                      <div className="ep-agente-arriba">
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <ArrowUpRight size={19} />
                      </div>
                      <div className="ep-agente-arte">
                        <Pixel indice={i} />
                      </div>
                      <h3>{tr(`p_${agente}_titulo`)}</h3>
                      <p>{tr(`p_${agente}_texto`)}</p>
                      <span className="ep-agente-entrega">{tr(`p_${agente}_entrega`)}</span>
                      <span className="ep-agente-accion">
                        {tr("p_asignar")}
                        <ArrowRight size={15} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              {!soloLectura && (
                <section className="ep-recientes">
                  <div className="ep-seccion-cabecera">
                    <h2>{tr("p_recientes")}</h2>
                    <button className="ep-boton ep-texto" onClick={() => navegar("granjas")}>
                      {tr("p_mas")}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  {encargos.length ? (
                    <div className="ep-recientes-lista">
                      {encargos.slice(0, 3).map(tarjetaEncargo)}
                    </div>
                  ) : (
                    <div className="ep-vacio">
                      <Workflow size={29} />
                      <h3>{tr("p_sinEncargos")}</h3>
                      <p>{tr("p_vacioAyuda")}</p>
                      <button
                        className="ep-boton"
                        disabled={!produccion || soloLectura}
                        onClick={() => crear()}
                      >
                        <Plus size={17} />
                        {tr("p_nuevo")}
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
          {!soloLectura && seccion === "inicio" && produccion && (
            <Inicio
              tr={tr}
              fecha={fecha}
              onIr={ir}
              onNuevo={() => crear()}
              onGuia={() => setGuiaAbierta(true)}
              guia={guia}
              version={versionInicio}
            />
          )}
          {!soloLectura && seccion === "encargos" && (
            <VistaEncargos
              encargos={encargos}
              tr={tr}
              locale={locale}
              ejecutandoId={ejecutandoId}
              onAbrir={(id) => setDetalle(id)}
              tablero={
                <>
                  <div className="ep-kanban">
                    {estados
                      .filter((x) => x !== "rechazado")
                      .map((estado) => (
                        <section key={estado} className="ep-columna">
                          <h2>
                            <span className={`ep-estado ep-${estado}`} />
                            {tr(`p_${estado}`)}
                            <span>{encargos.filter((e) => e.estado === estado).length}</span>
                          </h2>
                          {encargos.filter((e) => e.estado === estado).map(tarjetaEncargo)}
                        </section>
                      ))}
                  </div>
                  {encargos.some((e) => e.estado === "rechazado") && (
                    <details className="ep-rechazados">
                      <summary>
                        {tr("p_rechazados")} (
                        {encargos.filter((e) => e.estado === "rechazado").length})
                      </summary>
                      <div className="ep-rechazados-lista">
                        {encargos.filter((e) => e.estado === "rechazado").map(tarjetaEncargo)}
                      </div>
                    </details>
                  )}
                </>
              }
            />
          )}
          {!soloLectura && seccion === "granjas" && (
            <>
              <SeccionGranjas g={g} tr={tr} fecha={fecha} />
            </>
          )}
          {!soloLectura && seccion === "eventos" && (
            <>
              <SeccionEventos g={g} fecha={fecha} locale={locale} />
            </>
          )}
          {!soloLectura && seccion === "instagram" && (
            <PaginaInstagram g={g} tr={tr} fecha={fecha} />
          )}
          {!soloLectura && seccion === "consumo" && (
            <>
              <SeccionConsumo g={g} fecha={fecha} locale={locale} />
            </>
          )}
          {!soloLectura && seccion === "calendario" && (
            <>
              <CalendarioVistas
                tr={tr}
                locale={locale}
                version={versionInicio}
                onAbrirEncargo={(id) => setDetalle(id)}
                onNuevoEnDia={(dia) => setNuevo({ fecha: `${dia}T09:00` })}
                onMoverEncargo={async (id, dia) => {
                  const e = encargos.find((x) => x.id === id);
                  // Se conserva la hora; solo cambia el día.
                  if (e)
                    await ponerFecha(
                      id,
                      `${dia}${(e.fechaPrevista || "T09:00").slice(10) || "T09:00"}`,
                    );
                }}
              />
              <details className="ez-cal-lista">
                <summary>{tr("ez_cal_verLista")}</summary>
                <AgendaCalendario
                  tr={tr}
                  fecha={fecha}
                  locale={locale}
                  version={versionInicio}
                  onAbrirEncargo={(id) => {
                    const e = encargos.find((x) => x.id === id);
                    if (e) abrir(e);
                  }}
                />
              </details>
              {encargos.some((e) => !e.fechaPrevista && e.estado !== "rechazado") && (
                <section className="ep-sin-fecha">
                  <h2 className="eg-subtitulo">{tr("p_sinFechaTitulo")}</h2>
                  <ul>
                    {encargos
                      .filter((e) => !e.fechaPrevista && e.estado !== "rechazado")
                      .map((e) => (
                        <li key={e.id}>
                          <span>
                            <strong>{e.titulo}</strong>
                            <small>
                              {tr(`p_${e.estado}`)} · v{e.version}
                            </small>
                          </span>
                          <form
                            className="ep-asignar-fecha"
                            onSubmit={(x) => {
                              x.preventDefault();
                              void ponerFecha(e.id, fechasCalendario[e.id] ?? "");
                            }}
                          >
                            <input
                              type="datetime-local"
                              aria-label={`${tr("p_fecha")}: ${e.titulo}`}
                              value={fechasCalendario[e.id] ?? ""}
                              onChange={(x) =>
                                setFechasCalendario({ ...fechasCalendario, [e.id]: x.target.value })
                              }
                            />
                            <button
                              className="ep-boton"
                              disabled={ocupado || !fechasCalendario[e.id]}
                            >
                              {tr("p_asignarFecha")}
                            </button>
                          </form>
                        </li>
                      ))}
                  </ul>
                </section>
              )}
            </>
          )}
          {!soloLectura && seccion === "conexiones" && (
            <>
              <div className="ep-conexiones">
                {/* Codex y Claude Code locales: estado comprobado, «Verificar» y «Probar respuesta» por separado. */}
                <ConexionesIALocal
                  tr={tr}
                  onCambio={() => void cargar()}
                  deshabilitado={!produccion || soloLectura}
                  onNuevo={(proveedor) => {
                    crear("guion");
                    setEditor({ ...vacio("guion"), proveedor });
                  }}
                />
                {proveedores
                  .filter((p) => p === "gemini")
                  .map((proveedor) => (
                    <article className="ep-conexion" key={proveedor}>
                      <div className="ep-conexion-icono">✦</div>
                      <div>
                        <h2>{tr(`p_${proveedor}`)}</h2>
                        <span className="ep-pill">
                          {tr(
                            proveedor === "gemini"
                              ? conexiones?.geminiHabilitado
                                ? "p_habilitada"
                                : conexiones?.geminiConfigurado
                                  ? "p_configurada"
                                  : "p_pendienteConexion"
                              : (
                                    proveedor === "astra"
                                      ? conexiones?.astraLocal
                                      : conexiones?.claudeLocal
                                  )
                                ? "p_localInstalado"
                                : "p_localNoInstalado",
                          )}
                        </span>
                        <p>{tr(`p_${proveedor}Ayuda`)}</p>
                        <button
                          className="ep-boton"
                          disabled={!produccion || soloLectura}
                          onClick={() => {
                            crear("guion");
                            setEditor({ ...vacio("guion"), proveedor });
                          }}
                        >
                          {tr("p_nuevo")}
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                <article className="ep-conexion">
                  <div className="ep-conexion-icono">
                    <Globe />
                  </div>
                  <div>
                    <h2>{g("spotmiLectura")}</h2>
                    <span className="ep-pill">
                      {tr(consultado ? "p_conectado" : "p_sinComprobar")}
                    </span>
                    <p>{tr("p_spotmiAyuda")}</p>
                    <code>{conexiones?.spotmi}</code>
                    <button
                      className="ep-boton"
                      disabled={consulta}
                      onClick={() => void consultar()}
                    >
                      <RefreshCw size={16} />
                      {tr(consulta ? "p_consultando" : "p_consultar")}
                    </button>
                    {fichas && (
                      <p className="ep-nota" role="status">
                        {fichas.length} {g("fichasLeidas")}
                        {consultado ? ` · ${fecha(consultado)}` : ""}
                      </p>
                    )}
                  </div>
                </article>
              </div>
              <ConexionesGranjas g={g} fecha={fecha} aviso={avisoOAuth} />
            </>
          )}
        </div>
      </div>
      <Bienvenida
        abierta={guiaAbierta}
        tr={tr}
        onCerrar={() => {
          setGuiaAbierta(false);
          setVersionInicio((v) => v + 1);
        }}
        onCambio={(e) => {
          setGuia(e);
          if (e.encargoId) void cargar();
        }}
        onAbrirEncargo={async (id) => {
          setGuiaAbierta(false);
          const datos = await datosRespuesta(await fetch("/api/produccion"));
          setProduccion(datos.produccion);
          navegar("encargos");
          const e = (datos.produccion as Produccion).encargos.find((x) => x.id === id);
          if (e) abrir(e);
        }}
        onIrGranjas={() => {
          setGuiaAbierta(false);
          navegar("granjas");
        }}
      />
      <footer className="ep-pie">
        <span>
          ezrá<span>·</span> Estudio Spotmi
        </span>
        <span>{tr("p_control")}</span>
      </footer>
      <Modal
        open={Boolean(nuevo)}
        onClose={() => setNuevo(null)}
        label={tr("p_nuevo")}
        className="ep-modal ez-det-modal"
        hideClose
      >
        {nuevo && (
          <NuevoEncargo
            tr={tr}
            fechaInicial={nuevo.fecha}
            ocupado={ocupado}
            proveedorPorDefecto={
              conexiones?.geminiHabilitado
                ? "gemini"
                : conexiones?.astraLocal
                  ? "astra"
                  : conexiones?.claudeLocal
                    ? "claude"
                    : "astra"
            }
            disponibles={{
              gemini: Boolean(conexiones?.geminiHabilitado),
              astra: Boolean(conexiones?.astraLocal),
              claude: Boolean(conexiones?.claudeLocal),
            }}
            onCerrar={() => setNuevo(null)}
            onCrear={async (contenido) => {
              const datos = await mutar({ accion: "crear", contenido });
              if (datos) {
                setNuevo(null);
                setDetalle(datos.produccion.encargos[0]?.id ?? null);
              }
            }}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(encargoDetalle) && !editor}
        onClose={() => setDetalle(null)}
        label={encargoDetalle?.titulo ?? tr("p_encargos")}
        className="ep-modal ez-det-modal"
        dismissOnBackdrop
        hideClose
      >
        {encargoDetalle && (
          <DetalleEncargo
            key={`${encargoDetalle.id}-${encargoDetalle.version}-${encargoDetalle.estado}`}
            e={encargoDetalle}
            tr={tr}
            locale={locale}
            fecha={fecha}
            ocupado={ocupado}
            ejecutando={ejecutandoId === encargoDetalle.id}
            usosRestantes={null}
            onAccion={(a) => void accionEncargo(a)}
            onEditar={(x) => abrir(x)}
            onCerrar={() => setDetalle(null)}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(editor)}
        onClose={cerrar}
        label={actual?.titulo || tr("p_nuevo")}
        className="ep-modal"
        hideClose
      >
        {editor && (
          <>
            <div className="ep-editor-cabecera">
              <div>
                <p className="ep-eyebrow">{tr(`p_${editor.agente}_titulo`)}</p>
                <h2>{actual ? actual.titulo : tr("p_nuevo")}</h2>
                {actual && (
                  <span className="ep-pill">
                    {tr(`p_${actual.estado}`)} · {tr("p_version")} {actual.version}
                  </span>
                )}
              </div>
              <button className="ep-boton ep-icono" aria-label={tr("p_cerrar")} onClick={cerrar}>
                <X size={21} />
              </button>
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
            {actual && (
              <p className="ep-siguiente ep-siguiente-editor">
                <CircleArrowRight size={16} aria-hidden="true" />
                <span>
                  <b>{tr("p_siguiente")}:</b> {tr(`p_sig_${siguienteAccion(actual)}`)}
                </span>
              </p>
            )}
            {actual && (actual.estado === "revision" || actual.estado === "rechazado") && (
              <section className="ep-revisar" aria-label={tr("p_revisarTitulo")}>
                <h3>
                  {tr(actual.estado === "rechazado" ? "p_rechazadoTitulo" : "p_revisarTitulo")} ·{" "}
                  {tr("p_version")} {actual.version}
                </h3>
                {actual.estado === "rechazado" && actual.notaCambios && (
                  <p className="ep-alerta">
                    <Ban size={16} aria-hidden="true" /> {tr("p_motivoRechazo")}:{" "}
                    {actual.notaCambios}
                  </p>
                )}
                <div className="ep-revisar-contenido">
                  {actual.resultado || tr("p_sinResultado")}
                </div>
                <h4>{tr("p_revisarMedios")}</h4>
                {actual.fuentes.some((f) => f.imagen) ? (
                  <div className="ep-revisar-medios">
                    {actual.fuentes
                      .filter((f) => f.imagen)
                      .map((f) => (
                        <figure key={f.imagen}>
                          <img
                            src={f.imagen}
                            alt={`${tr("p_imagenDe")} ${f.nombre}`}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          <figcaption>
                            {f.nombre}
                            {f.nota ? ` · ${f.nota}` : ""}
                          </figcaption>
                        </figure>
                      ))}
                  </div>
                ) : (
                  <p className="ep-nota">{tr("p_revisarSinMedios")}</p>
                )}
                <h4>{tr("p_revisarFuentes")}</h4>
                {actual.fuentes.length ? (
                  <ul className="ep-revisar-fuentes">
                    {actual.fuentes.map((f) => (
                      <li key={f.url}>
                        <a href={f.url} target="_blank" rel="noreferrer noopener">
                          {f.nombre} <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ep-alerta">{tr("p_revisarSinFuentes")}</p>
                )}
                {actual.estado === "revision" && (
                  <div className="ep-revisar-acciones">
                    <fieldset className="ep-revisar-checks">
                      <legend>{tr("p_comprobaciones")}</legend>
                      {(["hechos", "derechos", "marca"] as const).map((c) => (
                        <label className="ep-checkbox" key={c}>
                          <input
                            type="checkbox"
                            checked={comprobaciones[c]}
                            onChange={(e) =>
                              setComprobaciones({ ...comprobaciones, [c]: e.target.checked })
                            }
                          />
                          {tr(`p_${c}`)}
                        </label>
                      ))}
                    </fieldset>
                    <button
                      className="ep-boton ep-primario"
                      disabled={
                        Boolean(modificado) ||
                        ocupado ||
                        !Object.values(comprobaciones).every(Boolean) ||
                        !actual.fuentes.length
                      }
                      onClick={() => void estado("aprobado")}
                    >
                      <ShieldCheck size={17} />
                      {tr("p_aprobarVersion")} {actual.version}
                    </button>
                    <p className="ep-nota">{tr("p_aprobarNoPublica")}</p>
                    <form
                      className="ep-pedir-cambios"
                      onSubmit={(x) => {
                        x.preventDefault();
                        void pedirCambios();
                      }}
                    >
                      <label className="ep-campo">
                        {tr("p_pedirCambiosCampo")}
                        <textarea
                          rows={2}
                          maxLength={2000}
                          value={notaCambios}
                          onChange={(x) => setNotaCambios(x.target.value)}
                        />
                      </label>
                      <button
                        className="ep-boton"
                        disabled={Boolean(modificado) || ocupado || notaCambios.trim().length < 3}
                      >
                        <MessageSquareWarning size={16} />
                        {tr("p_pedirCambios")}
                      </button>
                    </form>
                    <form
                      className="ep-pedir-cambios"
                      onSubmit={(x) => {
                        x.preventDefault();
                        void rechazar();
                      }}
                    >
                      <label className="ep-campo">
                        {tr("p_rechazarCampo")}
                        <textarea
                          rows={2}
                          maxLength={2000}
                          value={motivoRechazo}
                          onChange={(x) => setMotivoRechazo(x.target.value)}
                        />
                      </label>
                      <button
                        className="ep-boton ep-peligro"
                        disabled={Boolean(modificado) || ocupado || motivoRechazo.trim().length < 3}
                      >
                        <Ban size={16} />
                        {tr("p_rechazar")}
                      </button>
                      <p className="ep-nota">{tr("p_rechazarAyuda")}</p>
                    </form>
                  </div>
                )}
              </section>
            )}
            <details
              className="ep-editar"
              key={`${actual?.id ?? "nuevo"}-${actual?.estado ?? ""}`}
              open={!actual || !["revision", "aprobado", "rechazado"].includes(actual.estado)}
            >
              <summary>
                {tr(
                  !actual
                    ? "p_editarNuevo"
                    : ["revision", "aprobado", "rechazado"].includes(actual.estado)
                      ? "p_editarPlegado"
                      : "p_editarEncargo",
                )}
              </summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void guardar();
                }}
                className="ep-formulario"
              >
                <label>
                  {tr("p_tituloCampo")}
                  <input
                    required
                    minLength={3}
                    maxLength={180}
                    value={editor.titulo}
                    onChange={(e) => setEditor({ ...editor, titulo: e.target.value })}
                  />
                </label>
                <div className="ep-dos">
                  <label>
                    {tr("p_agente")}
                    <select
                      aria-label={tr("p_agente")}
                      value={editor.agente}
                      onChange={(e) => setEditor({ ...editor, agente: e.target.value as Agente })}
                    >
                      {visiblesEn(editor.agente).map((a) => (
                        <option value={a} key={a}>
                          {tr(`p_${a}_titulo`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr("p_proveedor")}
                    <select
                      aria-label={tr("p_proveedor")}
                      value={editor.proveedor}
                      onChange={(e) =>
                        setEditor({ ...editor, proveedor: e.target.value as Encargo["proveedor"] })
                      }
                    >
                      {proveedores.map((p) => (
                        <option value={p} key={p}>
                          {tr(`p_${p}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend>{tr("p_canales")}</legend>
                  <div className="ep-canales">
                    {canales.map((c) => (
                      <label className="ep-checkbox" key={c}>
                        <input
                          type="checkbox"
                          checked={editor.canales.includes(c)}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              canales: e.target.checked
                                ? [...editor.canales, c]
                                : editor.canales.filter((v) => v !== c),
                            })
                          }
                        />
                        {nombresCanales[c]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label>
                  {tr("p_nota")}
                  <textarea
                    aria-label={tr("p_nota")}
                    rows={4}
                    maxLength={8000}
                    value={editor.encargo}
                    onChange={(e) => setEditor({ ...editor, encargo: e.target.value })}
                  />
                </label>
                {editor.agente === "edicion" && <p className="ep-nota">{tr("p_sinRender")}</p>}
                <fieldset>
                  <legend>{tr("p_material")}</legend>
                  {editor.fuentes.map((fuente, i) => (
                    <div key={i} className="ep-fuente">
                      <div className="ep-dos">
                        <label>
                          {tr("p_fuenteNombre")}
                          <input
                            required
                            value={fuente.nombre}
                            maxLength={180}
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                fuentes: editor.fuentes.map((f, j) =>
                                  j === i ? { ...f, nombre: e.target.value } : f,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          {tr("p_fuenteUrl")}
                          <input
                            required
                            type="url"
                            value={fuente.url}
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                fuentes: editor.fuentes.map((f, j) =>
                                  j === i ? { ...f, url: e.target.value } : f,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        {tr("p_imagenUrl")}
                        <input
                          type="url"
                          value={fuente.imagen}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              fuentes: editor.fuentes.map((f, j) =>
                                j === i ? { ...f, imagen: e.target.value } : f,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        {tr("p_fuenteNota")}
                        <input
                          value={fuente.nota}
                          maxLength={2000}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              fuentes: editor.fuentes.map((f, j) =>
                                j === i ? { ...f, nota: e.target.value } : f,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="ep-boton ep-texto"
                        onClick={() =>
                          setEditor({
                            ...editor,
                            fuentes: editor.fuentes.filter((_, j) => i !== j),
                          })
                        }
                      >
                        <X size={15} />
                        {tr("p_quitarFuente")}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="ep-boton"
                    disabled={editor.fuentes.length >= 20}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        fuentes: [...editor.fuentes, { nombre: "", url: "", imagen: "", nota: "" }],
                      })
                    }
                  >
                    <Plus size={16} />
                    {tr("p_agregarFuente")}
                  </button>
                </fieldset>
                <label>
                  {tr("p_resultado")}
                  <textarea
                    aria-label={tr("p_resultado")}
                    rows={7}
                    maxLength={24000}
                    value={editor.resultado}
                    onChange={(e) => setEditor({ ...editor, resultado: e.target.value })}
                  />
                </label>
                <p className="ep-nota">{tr("p_resultadoAyuda")}</p>
                <label>
                  {tr("p_fecha")}
                  <input
                    type="datetime-local"
                    value={editor.fechaPrevista}
                    onChange={(e) => setEditor({ ...editor, fechaPrevista: e.target.value })}
                  />
                </label>
                <p className="ep-nota">{tr("p_fechaAyuda")}</p>
                <div className="ep-editor-acciones">
                  <button
                    type="submit"
                    className="ep-boton ep-primario"
                    disabled={ocupado || !editor.canales.length}
                  >
                    {tr(ocupado ? "p_procesando" : "p_guardar")}
                  </button>
                  <button type="button" className="ep-boton" onClick={cerrar}>
                    {tr("p_cerrar")}
                  </button>
                </div>
              </form>
            </details>
            {actual && (
              <section className="ep-handoff">
                {actual.notaCambios && (
                  <p className="ep-alerta ep-cambios-pedidos" role="status">
                    <MessageSquareWarning size={16} aria-hidden="true" />
                    {tr("p_cambiosPedidos")}: {actual.notaCambios}
                  </p>
                )}
                {modificado && <p className="ep-nota">{tr("p_guardarPrimero")}</p>}
                {!modificado && (
                  <ColocarEnGranja key={actual.id} encargo={actual} g={g} onListo={setAviso} />
                )}
                <div className="ep-acciones">
                  <button
                    className="ep-boton"
                    disabled={Boolean(modificado) || ocupado}
                    onClick={() => void copiar()}
                  >
                    <Copy size={16} />
                    {tr("p_copiar")}
                  </button>
                  {!modificado && (
                    <a className="ep-boton" href={`/api/produccion/exportar?id=${actual.id}`}>
                      <Download size={16} />
                      {tr("p_exportar")}
                    </a>
                  )}
                  <button
                    className="ep-boton"
                    disabled={Boolean(modificado) || ocupado}
                    onClick={() => void estado("preparando")}
                  >
                    {tr("p_preparar")}
                  </button>
                </div>
                <div className="ep-gemini">
                  <p>{tr(`p_${actual.proveedor}Ayuda`)}</p>
                  {actual.proveedor !== "gemini" && actual.agente === "cazador" && (
                    <p>{tr("p_localSinBusqueda")}</p>
                  )}
                  <label className="ep-checkbox">
                    <input
                      type="checkbox"
                      checked={confirmarIA}
                      onChange={(e) => setConfirmarIA(e.target.checked)}
                    />
                    {tr("p_confirmarProveedor")}
                  </label>
                  <button
                    className="ep-boton"
                    disabled={
                      !(actual.proveedor === "gemini"
                        ? conexiones?.geminiHabilitado
                        : actual.proveedor === "astra"
                          ? conexiones?.astraLocal
                          : conexiones?.claudeLocal) ||
                      !confirmarIA ||
                      Boolean(modificado) ||
                      ocupado
                    }
                    onClick={() => void generar()}
                  >
                    <Sparkles size={16} />
                    {tr(ocupado ? "p_generandoProveedor" : "p_ejecutar")}
                  </button>
                </div>
                {actual.estado === "aprobado" && (
                  <div className="ep-continuar">
                    <label>
                      {tr("p_agenteSiguiente")}
                      <select
                        value={siguienteAgente}
                        onChange={(e) => setSiguienteAgente(e.target.value as Agente)}
                      >
                        {visiblesEn(siguienteAgente).map((a) => (
                          <option key={a} value={a}>
                            {tr(`p_${a}_titulo`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="ep-boton ep-primario"
                      disabled={Boolean(modificado) || ocupado}
                      onClick={() => void derivar()}
                    >
                      {tr("p_auditoriaPaso")}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                <div>
                  {actual.busquedaHtml && (
                    <iframe
                      title={tr("p_sugerencias")}
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https:"><base target="_blank">${actual.busquedaHtml}`}
                    />
                  )}
                </div>
                <div className="ep-revision">
                  {actual.estado !== "revision" &&
                    actual.estado !== "aprobado" &&
                    actual.estado !== "rechazado" && (
                      <button
                        className="ep-boton"
                        disabled={Boolean(modificado) || ocupado || !actual.resultado.trim()}
                        onClick={() => void estado("revision")}
                      >
                        {tr("p_revisar")}
                        <ArrowRight size={16} />
                      </button>
                    )}

                  {actual.estado === "aprobado" && (
                    <form
                      className="ep-pedir-cambios"
                      onSubmit={(x) => {
                        x.preventDefault();
                        void pedirCambios();
                      }}
                    >
                      <label className="ep-campo">
                        {tr("p_pedirCambiosCampo")}
                        <textarea
                          rows={3}
                          maxLength={2000}
                          required
                          minLength={3}
                          value={notaCambios}
                          onChange={(x) => setNotaCambios(x.target.value)}
                        />
                      </label>
                      <button
                        className="ep-boton"
                        disabled={Boolean(modificado) || ocupado || notaCambios.trim().length < 3}
                      >
                        <MessageSquareWarning size={16} />
                        {tr("p_pedirCambios")}
                      </button>
                      <p className="ep-nota">{tr("p_pedirCambiosAprobado")}</p>
                    </form>
                  )}
                </div>
                <details className="ep-historial">
                  <summary>
                    <History size={16} aria-hidden="true" />
                    {tr("p_historial")} ({actual.historial.length})
                  </summary>
                  {!actual.historial.length ? (
                    <p className="ep-nota">{tr("p_historialVacio")}</p>
                  ) : (
                    <ol>
                      {[...actual.historial].reverse().map((h, i) => (
                        <li key={`${h.fecha}-${i}`}>
                          <span className="ep-historial-meta">
                            <b>v{h.version}</b> · {tr(`p_h_${h.accion}`)} · {fecha(h.fecha)}
                          </span>
                          {h.nota && (
                            <span className="ep-historial-nota">
                              {h.accion === "fecha" && /^\d{4}-/.test(h.nota)
                                ? fecha(h.nota)
                                : h.nota}
                            </span>
                          )}
                          {h.resultado && (
                            <details>
                              <summary>{tr("p_verTexto")}</summary>
                              <pre>{h.resultado}</pre>
                            </details>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </details>
              </section>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
