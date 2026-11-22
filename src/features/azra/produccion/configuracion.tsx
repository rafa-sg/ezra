"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  ArrowUpRight,
  Cable,
  Gauge,
  HardDrive,
  LayoutGrid,
  LogOut,
  Moon,
  Palette,
  Search,
  Settings,
  Sparkles,
  Sun,
  UserRound,
  Users,
} from "lucide-react";
import type { ResumenUsoIA } from "@/lib/ia/uso";
import type { Equipo } from "@/lib/equipo/modelo";
import { useLanguage } from "../i18n";
import { SeccionConsumo } from "../granjas/consumo";
import { guardarSidebarContraida, guardarTema, useSidebarContraida, useTema } from "../shell";
import "./configuracion.css";

type Tr = (clave: string) => string;
export const ajustes = ["cuenta", "uso", "general", "apariencia", "almacenamiento"] as const;
export type Ajuste = (typeof ajustes)[number];
/** Destinos fuera de Configuración: se abren en su propia sección (flecha ↗, como «Facturación» en ChatGPT). */
type Externo = "equipo" | "conexiones" | "apps";

/* ── Datos de uso ── */
export function useUsoIA(activo: boolean) {
  const [uso, setUso] = useState<ResumenUsoIA | null>(null);
  const [error, setError] = useState(false);
  const recargar = useCallback(async () => {
    try {
      const r = await fetch("/api/produccion/uso", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setUso(await r.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    if (!activo) return;
    queueMicrotask(() => void recargar());
  }, [activo, recargar]);
  return { uso, error, recargar };
}

/** «Se restablece en 2 h y 39 min» / «en 3 d y 23 h», desde ahora hasta el instante dado. */
function faltaPara(iso: string, tr: Tr) {
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const texto =
    d > 0
      ? `${d} ${tr("cf_d")} ${tr("cf_y")} ${h} h`
      : h > 0
        ? `${h} h ${tr("cf_y")} ${m} min`
        : `${m} min`;
  return `${tr("cf_restableceEn")} ${texto}`;
}
function haceCuanto(iso: string, tr: Tr) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return tr("cf_ahora");
  const h = Math.round(min / 60);
  const texto = min < 60 ? `${min} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} ${tr("cf_d")}`;
  return tr("cf_hace").replace("{n}", texto);
}
/** Lo más gastado entre todos los límites (0–100): es lo que dibuja el círculo. */
export function usoMaximo(uso: ResumenUsoIA, tr: Tr, locale: string) {
  const filas = filasUso(uso, tr, locale).filter((f) => f.restante !== null);
  return filas.length ? Math.max(...filas.map((f) => 100 - f.restante!)) : 0;
}
const usd = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === "es" ? "es-SV" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1 ? 4 : 2,
  }).format(n);
/** Gasto real del mes: Gemini con tus tarifas; Astra y Claude van por tu plan (sin cobro por llamada). */
function lineaGasto(uso: ResumenUsoIA, tr: Tr, locale: string) {
  const n = formato(locale);
  const gemini =
    uso.gemini.costoMes === null ? tr("cf_sinTarifa") : usd(uso.gemini.costoMes, locale);
  return `${tr("cf_gastoMes")}: Gemini ${gemini} (${uso.gemini.llamadasMes} ${tr("cf_llamadas")}) · Claude ${n.format(uso.claude.tokensMes)} ${tr("cf_tokens")} ${tr("cf_enTuPlan")}`;
}
const formato = (locale: string) => new Intl.NumberFormat(locale === "es" ? "es-SV" : "en-US");

type Fila = {
  clave: string;
  titulo: string;
  detalle: string;
  /** Porcentaje restante 0–100; null cuando no hay límite escrito (no se inventa uno). */
  restante: number | null;
  reanuda: string | null;
};
function filasUso(uso: ResumenUsoIA, tr: Tr, locale: string): Fila[] {
  const n = formato(locale);
  const gem = (p: ResumenUsoIA["gemini"]["dia"], titulo: string, clave: string): Fila => ({
    clave,
    titulo,
    detalle:
      p.limite === null
        ? `${n.format(p.usado)} ${tr("cf_tokens")} · ${tr("cf_sinLimite")}`
        : `${n.format(p.usado)} ${tr("cf_de")} ${n.format(p.limite)} ${tr("cf_tokens")}`,
    restante: p.porcentaje === null ? null : Math.max(0, Math.round(100 - p.porcentaje)),
    reanuda: p.reanuda,
  });
  const gpt = (
    v: NonNullable<ResumenUsoIA["chatgpt"]>["cincoHoras"],
    titulo: string,
    clave: string,
  ): Fila[] =>
    v
      ? [
          {
            clave,
            titulo,
            detalle: `${tr("cf_segunOpenAI")} · ${tr("cf_actualizado")} ${haceCuanto(uso.chatgpt!.actualizado, tr)}`,
            restante: Math.max(0, Math.round(100 - v.usado)),
            reanuda: v.reanuda,
          },
        ]
      : [];
  return [
    ...gpt(uso.chatgpt?.cincoHoras ?? null, tr("cf_chatgpt5h"), "gpt-5h"),
    ...gpt(uso.chatgpt?.semanal ?? null, tr("cf_chatgptSemana"), "gpt-semana"),
    gem(uso.gemini.dia, tr("cf_geminiDia"), "gemini-dia"),
    gem(uso.gemini.mes, tr("cf_geminiMes"), "gemini-mes"),
    {
      clave: "intentos",
      titulo: tr("cf_intentos"),
      detalle: `${uso.intentos.usados} ${tr("cf_de")} ${uso.intentos.limite} · Astra ${uso.astra.usados} · Claude ${uso.claude.usados}`,
      restante: Math.max(0, Math.round(100 - uso.intentos.porcentaje)),
      reanuda: uso.intentos.reanuda,
    },
  ];
}
/** Como en Claude: la barra muestra lo usado y va subiendo; naranja desde el 80 %. */
function Barra({ fila, tr }: { fila: Fila; tr: Tr }) {
  const usado = fila.restante === null ? null : 100 - fila.restante;
  const alto = usado !== null && usado >= 80;
  const texto = usado === null ? tr("cf_sinLimiteCorto") : `${usado} % ${tr("cf_usado")}`;
  return (
    <div className="cf-limite">
      <div className="cf-limite-cabeza">
        <strong>{fila.titulo}</strong>
      </div>
      <div className="cf-limite-linea">
        <span>{usado === null ? fila.detalle : fila.reanuda ? faltaPara(fila.reanuda, tr) : tr("cf_restablecido")}</span>
        <span className={alto ? "cf-bajo" : undefined}>{texto}</span>
      </div>
      <div
        className="cf-barra"
        role="progressbar"
        aria-label={fila.titulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usado ?? undefined}
        aria-valuetext={texto}
      >
        {usado !== null && usado > 0 && (
          <span className={alto ? "cf-barra-baja" : undefined} style={{ width: `${usado}%` }} />
        )}
      </div>
      {usado !== null && <small className="cf-limite-detalle">{fila.detalle}</small>}
    </div>
  );
}

/* ── Globo de Consumo (barra lateral) ── */
/**
 * Como el anillo de uso de Codex: «Consumo» no cambia de pantalla, abre un globo con los límites de las
 * tres IAs. «Administrar uso» lleva a Configuración › Uso. Escape o un clic fuera lo cierran.
 */
export function BotonConsumo({
  tr,
  activo,
  deshabilitado,
  onAdministrar,
}: {
  tr: Tr;
  activo: boolean;
  deshabilitado?: boolean;
  onAdministrar: () => void;
}) {
  const { locale } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  // El círculo siempre está visible: se carga al abrir el estudio y se refresca cada minuto.
  const { uso, error, recargar } = useUsoIA(true);
  useEffect(() => {
    const reloj = window.setInterval(() => void recargar(), 60_000);
    return () => window.clearInterval(reloj);
  }, [recargar]);
  useEffect(() => {
    if (abierto) void recargar();
  }, [abierto, recargar]);
  const anillo = uso ? usoMaximo(uso, tr, locale) : null;
  useEffect(() => {
    if (!abierto) return;
    const colocar = () => {
      const r = boton.current?.getBoundingClientRect();
      if (!r) return;
      // Escritorio: a la derecha de la barra, alineado con el botón. Móvil (cajón): encima del botón.
      const angosto = window.innerWidth < 768;
      setPos(
        angosto
          ? { left: Math.max(8, r.left), bottom: window.innerHeight - r.top + 8 }
          : { left: r.right + 10, bottom: Math.max(8, window.innerHeight - r.bottom) },
      );
    };
    colocar();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    const fuera = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node))
        setAbierto(false);
    };
    window.addEventListener("resize", colocar);
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    return () => {
      window.removeEventListener("resize", colocar);
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [abierto]);
  const destino = typeof document === "undefined" ? null : document.querySelector(".ez-app");
  return (
    <>
      <button
        ref={boton}
        className="cf-anillo"
        aria-current={activo ? "page" : undefined}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label={`${tr("p_consumo")}${anillo === null ? "" : ` · ${Math.round(anillo)} % ${tr("cf_usado")}`}`}
        disabled={deshabilitado}
        data-tooltip={`${tr("p_consumo")}${anillo === null ? "" : ` · ${Math.round(anillo)} % ${tr("cf_usado")}`}`}
        onClick={() => setAbierto((a) => !a)}
      >
        {/* Solo el logo de Ezra. El punto rojo avisa cuando algún límite pasa del 80 %. */}
        <Sparkles size={20} strokeWidth={1.75} aria-hidden="true" />
        {anillo !== null && anillo >= 80 && <span className="cf-anillo-punto" aria-hidden="true" />}
      </button>
      {abierto &&
        destino &&
        pos &&
        createPortal(
          <div
            ref={panel}
            className="cf-globo"
            role="dialog"
            aria-label={tr("cf_uso")}
            style={{ left: pos.left, bottom: pos.bottom }}
          >
            <p className="cf-globo-titulo">{tr("cf_limitesIA")}</p>
            {error && <p className="cf-nota">{tr("cf_errorUso")}</p>}
            {!uso && !error && <p className="cf-nota">{tr("cf_cargando")}</p>}
            {uso && filasUso(uso, tr, locale).map((f) => <Barra key={f.clave} fila={f} tr={tr} />)}
            {uso && <p className="cf-nota cf-gasto">{lineaGasto(uso, tr, locale)}</p>}
            <button
              className="cf-globo-accion"
              onClick={() => {
                setAbierto(false);
                window.dispatchEvent(new Event("ezra:navego"));
                onAdministrar();
              }}
            >
              <Settings size={15} aria-hidden="true" />
              {tr("cf_administrarUso")}
            </button>
          </div>,
          destino,
        )}
    </>
  );
}

/* ── Página de Configuración ── */
type ItemAjuste = {
  id: Ajuste | Externo;
  etiqueta: string;
  icono: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  externo?: boolean;
};
export function Configuracion({
  tr,
  g,
  fecha,
  equipo,
  puede,
  onIr,
}: {
  tr: Tr;
  g: (clave: string) => string;
  fecha: (iso: string) => string;
  equipo: Equipo | null;
  /** ¿Puede esta sesión abrir la sección del estudio? (el servidor lo vuelve a comprobar). */
  puede: (seccion: string) => boolean;
  onIr: (seccion: Externo) => void;
}) {
  const { locale } = useLanguage();
  const esPropietario = equipo?.rol === "propietario";
  const { user } = useUser();
  const nombre = user?.fullName || user?.primaryEmailAddress?.emailAddress || "";
  // Solo lo que funciona en Ezra. Equipo, Conexiones y Apps se abren en su propia sección (↗).
  const si = (condicion: boolean, item: ItemAjuste): ItemAjuste[] => (condicion ? [item] : []);
  const todos: { titulo: string; items: ItemAjuste[] }[] = [
    {
      titulo: tr("cf_grupoCuenta"),
      items: [
        { id: "cuenta", etiqueta: tr("cf_cuenta"), icono: UserRound },
        ...si(puede("consumo"), { id: "uso", etiqueta: tr("cf_uso"), icono: Gauge }),
        ...si(esPropietario, {
          id: "equipo",
          etiqueta: tr("eq_titulo"),
          icono: Users,
          externo: true,
        }),
      ],
    },
    {
      titulo: tr("cf_grupoApp"),
      items: [
        { id: "general", etiqueta: tr("cf_general"), icono: Settings },
        { id: "apariencia", etiqueta: tr("cf_apariencia"), icono: Palette },
      ],
    },
    {
      titulo: tr("cf_grupoDatos"),
      items: si(esPropietario, {
        id: "almacenamiento",
        etiqueta: tr("cf_almacenamiento"),
        icono: HardDrive,
      }),
    },
    {
      titulo: tr("cf_grupoIntegraciones"),
      items: [
        ...si(puede("conexiones"), {
          id: "conexiones",
          etiqueta: tr("p_conexiones"),
          icono: Cable,
          externo: true,
        }),
        ...si(puede("apps"), {
          id: "apps",
          etiqueta: tr("ez_apps"),
          icono: LayoutGrid,
          externo: true,
        }),
      ],
    },
  ];
  const grupos = todos.filter((grupo) => grupo.items.length > 0);
  const disponibles = grupos
    .flatMap((x) => x.items)
    .filter((i) => !i.externo)
    .map((i) => i.id as Ajuste);
  const leerPedido = (): Ajuste => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get("ajuste") ?? (q.get("seccion") === "consumo" ? "uso" : null);
    return p && (disponibles as string[]).includes(p) ? (p as Ajuste) : "cuenta";
  };
  const [actual, setActual] = useState<Ajuste>("cuenta");
  useEffect(() => {
    const leer = () => setActual(leerPedido());
    queueMicrotask(leer);
    window.addEventListener("popstate", leer);
    window.addEventListener("ezra:ajuste", leer);
    return () => {
      window.removeEventListener("popstate", leer);
      window.removeEventListener("ezra:ajuste", leer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [busqueda, setBusqueda] = useState("");
  const filtro = busqueda.trim().toLocaleLowerCase();
  function elegir(item: ItemAjuste) {
    if (item.externo) return onIr(item.id as Externo);
    const url = `${window.location.pathname}?seccion=ajustes&ajuste=${item.id}`;
    if (`${window.location.pathname}${window.location.search}` !== url)
      window.history.pushState({ seccion: "ajustes" }, "", url);
    setActual(item.id as Ajuste);
  }
  return (
    <div className="cf-marco">
      <nav className="cf-menu" aria-label={tr("cf_titulo")}>
        <label className="cf-buscar">
          <Search size={16} aria-hidden="true" />
          <span className="ep-oculto-visual">{tr("cf_buscar")}</span>
          <input
            type="search"
            value={busqueda}
            placeholder={tr("cf_buscar")}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        {nombre && !filtro && (
          <div className="cf-grupo">
            <p className="cf-grupo-titulo">{tr("cf_perfil")}</p>
            <button className="cf-item" onClick={() => elegir(grupos[0].items[0])}>
              <span className="cf-avatar" aria-hidden="true">
                {iniciales(nombre)}
              </span>
              <span>{nombre}</span>
            </button>
          </div>
        )}
        {grupos.map((grupo) => {
          const items = grupo.items.filter(
            (i) => !filtro || i.etiqueta.toLocaleLowerCase().includes(filtro),
          );
          if (!items.length) return null;
          return (
            <div key={grupo.titulo} className="cf-grupo">
              <p className="cf-grupo-titulo">{grupo.titulo}</p>
              {items.map((item) => (
                <button
                  key={item.id}
                  className="cf-item"
                  aria-current={!item.externo && actual === item.id ? "page" : undefined}
                  onClick={() => elegir(item)}
                >
                  <item.icono size={17} aria-hidden />
                  <span>{item.etiqueta}</span>
                  {item.externo && (
                    <ArrowUpRight size={15} aria-hidden className="cf-item-externo" />
                  )}
                </button>
              ))}
            </div>
          );
        })}
        {filtro &&
          !grupos.some((x) =>
            x.items.some((i) => i.etiqueta.toLocaleLowerCase().includes(filtro)),
          ) && <p className="cf-nota">{tr("cf_sinResultados")}</p>}
      </nav>
      <section className="cf-contenido" aria-live="polite">
        {actual === "cuenta" && <PaginaCuenta tr={tr} equipo={equipo} />}
        {actual === "uso" && puede("consumo") && (
          <PaginaUso tr={tr} g={g} fecha={fecha} locale={locale} esPropietario={esPropietario} />
        )}
        {actual === "general" && <PaginaGeneral tr={tr} />}
        {actual === "apariencia" && <PaginaApariencia tr={tr} />}
        {actual === "almacenamiento" && esPropietario && (
          <PaginaAlmacenamiento tr={tr} locale={locale} />
        )}
      </section>
    </div>
  );
}
const iniciales = (nombre: string) =>
  nombre
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join("");

function Encabezado({ titulo, ayuda }: { titulo: string; ayuda?: string }) {
  return (
    <header className="cf-encabezado">
      <h2>{titulo}</h2>
      {ayuda && <p>{ayuda}</p>}
    </header>
  );
}
function Renglon({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: string;
  children?: ReactNode;
}) {
  return (
    <div className="cf-renglon">
      <div>
        <strong>{titulo}</strong>
        {ayuda && <p>{ayuda}</p>}
      </div>
      {children && <div className="cf-renglon-control">{children}</div>}
    </div>
  );
}

function PaginaCuenta({ tr, equipo }: { tr: Tr; equipo: Equipo | null }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [saliendo, setSaliendo] = useState(false);
  const correo = user?.primaryEmailAddress?.emailAddress ?? "";
  const nombre = user?.fullName || correo;
  return (
    <>
      <Encabezado titulo={tr("cf_cuenta")} ayuda={tr("cf_cuentaAyuda")} />
      <div className="cf-tarjeta cf-perfil">
        <span className="cf-avatar cf-avatar-grande" aria-hidden="true">
          {iniciales(nombre || "?")}
        </span>
        <div>
          <strong>{nombre || "—"}</strong>
          <p>{correo}</p>
        </div>
      </div>
      <div className="cf-tarjeta">
        <Renglon titulo={tr("cf_rol")} ayuda={tr("cf_rolAyuda")}>
          <span className="cf-chip">{equipo ? tr(`cf_rol_${equipo.rol}`) : "—"}</span>
        </Renglon>
        <Renglon
          titulo={tr("cf_acceso")}
          ayuda={equipo?.secciones.map((s) => tr(`cf_sec_${s}`)).join(" · ") || "—"}
        >
          <span className="cf-chip">
            {equipo?.soloLectura ? tr("cf_soloLectura") : tr("cf_lecturaEscritura")}
          </span>
        </Renglon>
        <Renglon titulo={tr("cf_sesion")} ayuda={tr("cf_sesionAyuda")}>
          <button
            className="ez-boton-blanco"
            disabled={saliendo}
            onClick={() => {
              setSaliendo(true);
              void signOut({ redirectUrl: "/sign-in" }).catch(() => setSaliendo(false));
            }}
          >
            <LogOut size={15} aria-hidden="true" />
            {tr("signOut")}
          </button>
        </Renglon>
      </div>
    </>
  );
}

function PaginaUso({
  tr,
  g,
  fecha,
  locale,
  esPropietario,
}: {
  tr: Tr;
  g: (c: string) => string;
  fecha: (iso: string) => string;
  locale: string;
  esPropietario: boolean;
}) {
  const [pestana, setPestana] = useState<"resumen" | "analitica">("resumen");
  const { uso, error, recargar } = useUsoIA(pestana === "resumen");
  const estadoGemini = uso
    ? uso.gemini.habilitado
      ? "cf_activa"
      : uso.gemini.configurado
        ? "cf_claveSinActivar"
        : "cf_sinClave"
    : null;
  const estadoLocal = (e: ResumenUsoIA["astra"]["estado"]) =>
    e === "prueba_ok" || e === "sesion_ok"
      ? "cf_sesionLista"
      : e === "limite"
        ? "cf_limiteProveedor"
        : e
          ? "cf_sesionPendiente"
          : "cf_sinComprobar";
  return (
    <>
      <Encabezado titulo={tr("cf_uso")} ayuda={tr("cf_usoAyuda")} />
      <div className="cf-pestanas" role="tablist" aria-label={tr("cf_uso")}>
        {(["resumen", "analitica"] as const).map((p) => (
          <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}>
            {tr(`cf_${p}`)}
          </button>
        ))}
      </div>
      {pestana === "analitica" ? (
        <div className="cf-analitica">
          <SeccionConsumo g={g} fecha={fecha} locale={locale} />
        </div>
      ) : (
        <>
          <h3 className="cf-subtitulo">{tr("cf_tusIA")}</h3>
          <p className="cf-nota">{tr("cf_tusIAAyuda")}</p>
          {error && (
            <p className="cf-nota" role="alert">
              {tr("cf_errorUso")}{" "}
              <button className="cf-enlace" onClick={() => void recargar()}>
                {tr("cf_reintentar")}
              </button>
            </p>
          )}
          {!uso && !error && <p className="cf-nota">{tr("cf_cargando")}</p>}
          {uso && (
            <>
              <div className="cf-tarjeta cf-ias">
                <Renglon titulo={`Gemini · ${uso.gemini.modelo}`} ayuda={tr("cf_geminiAyuda")}>
                  <span className="cf-chip">{tr(estadoGemini!)}</span>
                </Renglon>
                <Renglon
                  titulo={tr("cf_astra")}
                  ayuda={`${uso.astra.usados} ${tr("cf_intentosEsteMes")}`}
                >
                  <span className="cf-chip">{tr(estadoLocal(uso.astra.estado))}</span>
                </Renglon>
                <Renglon
                  titulo={tr("cf_claude")}
                  ayuda={`${uso.claude.usados} ${tr("cf_intentosEsteMes")}`}
                >
                  <span className="cf-chip">{tr(estadoLocal(uso.claude.estado))}</span>
                </Renglon>
              </div>
              <h3 className="cf-subtitulo">{tr("cf_limites")}</h3>
              <p className="cf-nota">
                {tr("cf_limitesAyuda")}{" "}
                {esPropietario && (
                  <button className="cf-enlace" onClick={() => setPestana("analitica")}>
                    {tr("cf_cambiarLimites")}
                  </button>
                )}
              </p>
              <div className="cf-tarjeta cf-limites">
                {filasUso(uso, tr, locale).map((f) => (
                  <Barra key={f.clave} fila={f} tr={tr} />
                ))}
              </div>
              <p className="cf-nota">{lineaGasto(uso, tr, locale)}</p>
              {!uso.chatgpt && <p className="cf-nota">{tr("cf_sinCodex")}</p>}
            </>
          )}
        </>
      )}
    </>
  );
}

function PaginaGeneral({ tr }: { tr: Tr }) {
  const { locale, setLocale } = useLanguage();
  return (
    <>
      <Encabezado titulo={tr("cf_general")} />
      <div className="cf-tarjeta">
        <Renglon titulo={tr("language")} ayuda={tr("cf_idiomaAyuda")}>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as "es" | "en")}
            aria-label={tr("language")}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </Renglon>
        <Renglon titulo={tr("cf_zona")} ayuda={tr("cf_zonaAyuda")}>
          <span className="cf-chip">America/El_Salvador</span>
        </Renglon>
      </div>
    </>
  );
}

function PaginaApariencia({ tr }: { tr: Tr }) {
  const tema = useTema();
  const oculta = useSidebarContraida();
  return (
    <>
      <Encabezado titulo={tr("cf_apariencia")} />
      <div className="cf-tarjeta">
        <Renglon titulo={tr("cf_tema")} ayuda={tr("cf_temaAyuda")}>
          <div className="cf-segmentos" role="group" aria-label={tr("cf_tema")}>
            {(
              [
                ["claro", Sun, "cf_claro"],
                ["oscuro", Moon, "cf_oscuro"],
              ] as const
            ).map(([id, Icono, clave]) => (
              <button key={id} aria-pressed={tema === id} onClick={() => guardarTema(id)}>
                <Icono size={15} aria-hidden="true" />
                {tr(clave)}
              </button>
            ))}
          </div>
        </Renglon>
        <Renglon titulo={tr("cf_barra")} ayuda={tr("cf_barraAyuda")}>
          <button
            role="switch"
            aria-checked={!oculta}
            aria-label={tr("cf_barra")}
            className="cf-interruptor"
            onClick={() => guardarSidebarContraida(!oculta)}
          >
            <span />
          </button>
        </Renglon>
      </div>
    </>
  );
}

type Almacen = {
  bytes: { base: number; medios: number };
  conteos: Record<
    "granjas" | "ejecuciones" | "artefactos" | "medios" | "piezas" | "recibos",
    number
  >;
  trabajador: string;
};
function PaginaAlmacenamiento({ tr, locale }: { tr: Tr; locale: string }) {
  const [datos, setDatos] = useState<Almacen | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch("/api/granjas/almacenamiento", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => vivo && setDatos(d))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, []);
  const tam = useMemo(() => {
    const f = new Intl.NumberFormat(locale === "es" ? "es-SV" : "en-US", {
      maximumFractionDigits: 1,
    });
    return (b: number) =>
      b >= 1e9
        ? `${f.format(b / 1e9)} GB`
        : b >= 1e6
          ? `${f.format(b / 1e6)} MB`
          : `${f.format(b / 1e3)} KB`;
  }, [locale]);
  return (
    <>
      <Encabezado titulo={tr("cf_almacenamiento")} ayuda={tr("cf_almacenamientoAyuda")} />
      {error && (
        <p className="cf-nota" role="alert">
          {tr("cf_errorAlmacen")}
        </p>
      )}
      {!datos && !error && <p className="cf-nota">{tr("cf_cargando")}</p>}
      {datos && (
        <>
          <div className="cf-tarjeta">
            <Renglon titulo={tr("cf_baseDatos")} ayuda={tr("cf_baseDatosAyuda")}>
              <span className="cf-chip">{tam(datos.bytes.base)}</span>
            </Renglon>
            <Renglon
              titulo={tr("cf_medios")}
              ayuda={`${datos.conteos.medios} ${tr("cf_archivos")}`}
            >
              <span className="cf-chip">{tam(datos.bytes.medios)}</span>
            </Renglon>
            <Renglon
              titulo={tr("cf_registros")}
              ayuda={`${datos.conteos.granjas} ${tr("cf_c_granjas")} · ${datos.conteos.ejecuciones} ${tr("cf_c_ejecuciones")} · ${datos.conteos.piezas} ${tr("cf_c_piezas")} · ${datos.conteos.recibos} ${tr("cf_c_recibos")}`}
            />
          </div>
          <div className="cf-tarjeta">
            <Renglon titulo={tr("cf_respaldo")} ayuda={tr("cf_respaldoAyuda")}>
              <a
                className="ez-boton-blanco"
                href="/api/granjas/almacenamiento?descargar=1"
                download
              >
                {tr("cf_descargar")}
              </a>
            </Renglon>
          </div>
        </>
      )}
    </>
  );
}
