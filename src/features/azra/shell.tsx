"use client";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Check,
  ChevronUp,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { LanguageProvider, useLanguage, type MessageKey } from "./i18n";
import { href } from "./routes";
import { setAccountScope } from "./account/service";
import type { Equipo } from "@/lib/equipo/modelo";
import "./produccion/estudio.css";
import "./produccion/tokens.css";

export type ShellUser = {
  email: string;
  displayName: string;
  role: "admin" | "client" | "member";
  organizationId: string;
  equipo: Equipo | null;
};
type ShellProps = { children: ReactNode; user: ShellUser };
function Shell({ children, user }: ShellProps) {
  const { t, locale, setLocale } = useLanguage();
  const { signOut } = useClerk();
  const [error, setError] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  async function salir() {
    setSaliendo(true);
    setError(false);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch {
      setError(true);
      setSaliendo(false);
    }
  }
  const tt = (clave: string) => t(clave as MessageKey);
  const tema = useTema();
  const contraida = useSidebarContraida();
  const [movilAbierta, setMovilAbierta] = useState(false);
  const lateral = useRef<HTMLElement>(null);
  const hamburguesa = useRef<HTMLButtonElement>(null);
  const plegar = useRef<HTMLButtonElement>(null);
  const abrir = useRef<HTMLButtonElement>(null);
  // Como en Gemini: la barra se oculta del todo y vuelve deslizándose desde la izquierda. El foco pasa
  // al botón que queda visible (el que se pulsó desaparece con la barra).
  const alternarBarra = () => {
    const ocultar = !contraida;
    guardarSidebarContraida(ocultar);
    requestAnimationFrame(() => (ocultar ? abrir : plegar).current?.focus());
  };
  // Cajón móvil: Escape cierra y devuelve el foco; elegir una sección (evento del estudio) también lo cierra.
  useEffect(() => {
    if (!movilAbierta) return;
    lateral.current?.querySelector<HTMLElement>("a, button")?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMovilAbierta(false);
        hamburguesa.current?.focus();
      }
    };
    const cerrar = () => setMovilAbierta(false);
    document.addEventListener("keydown", tecla);
    window.addEventListener("ezra:navego", cerrar);
    return () => {
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("ezra:navego", cerrar);
    };
  }, [movilAbierta]);
  return (
    <div
      className="azra ep-shell ez-app"
      data-global-theme={tema === "oscuro" ? "dark" : "light"}
      data-sidebar={contraida ? "oculta" : "expandida"}
    >
      <a href="#az-content" className="ep-saltar">
        {t("skip")}
      </a>
      <aside
        ref={lateral}
        id="ez-sidebar"
        className={`ez-sidebar ${movilAbierta ? "ez-sidebar-abierta" : ""}`}
        aria-label={tt("ez_sb_navegacion")}
      >
        <div className="ez-sidebar-cabeza">
          <Link href={href("produccion")} className="ez-sidebar-marca" aria-label="ezrá · Spotmi">
            <span className="ez-logo" aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <span className="ez-sidebar-texto">
              <strong>ezrá</strong>
              <small>Spotmi</small>
            </span>
          </Link>
          <button
            ref={plegar}
            className="ez-sidebar-plegar"
            onClick={alternarBarra}
            aria-controls="ez-sidebar"
            aria-expanded={!contraida}
            aria-label={tt("ez_sb_contraer")}
            title={tt("ez_sb_contraer")}
          >
            <PanelLeftClose size={18} aria-hidden="true" />
          </button>
          <button
            className="ez-sidebar-cerrar"
            onClick={() => (setMovilAbierta(false), hamburguesa.current?.focus())}
            aria-label={tt("ez_sb_cerrarMenu")}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {/* El estudio llena este espacio: «Nuevo encargo» y las secciones. */}
        <div id="ez-sidebar-nav" className="ez-sidebar-nav" />
        {/* Secciones fijas abajo (Consumo), justo encima de la línea y de la cuenta. */}
        <div id="ez-sidebar-abajo" className="ez-sidebar-abajo" />
        <div className="ez-sidebar-pie">
          <MenuCuenta
            user={user}
            locale={locale}
            setLocale={setLocale}
            salir={salir}
            saliendo={saliendo}
            t={t}
          />
        </div>
      </aside>
      {/* Con la barra oculta solo queda este botón, arriba a la izquierda (escritorio). */}
      <button
        ref={abrir}
        className="ez-sidebar-abrir"
        onClick={alternarBarra}
        aria-controls="ez-sidebar"
        aria-expanded={!contraida}
        aria-label={tt("ez_sb_expandir")}
        title={tt("ez_sb_expandir")}
        tabIndex={contraida ? 0 : -1}
      >
        <PanelLeftOpen size={18} aria-hidden="true" />
      </button>
      {movilAbierta && (
        <div
          className="ez-sidebar-velo"
          aria-hidden="true"
          onClick={() => setMovilAbierta(false)}
        />
      )}
      <div className="ez-principal" data-tema={tema}>
        <header className="ez-cabecera">
          <button
            ref={hamburguesa}
            className="ez-hamburguesa"
            aria-controls="ez-sidebar"
            aria-expanded={movilAbierta}
            aria-label={tt("ez_sb_abrirMenu")}
            onClick={() => setMovilAbierta(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          {/* Título de la página y acciones contextuales (las pone cada sección). */}
          <div id="ez-cabecera-titulo" className="ez-cabecera-titulo" />
          <div id="ez-cabecera-acciones" className="ez-cabecera-acciones" />
          <SelectorTema tema={tema} tt={tt} />
        </header>
        {error && (
          <p className="ep-session-error" role="alert">
            {t("signOutFailed")}
          </p>
        )}
        <main id="az-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

/*
 * Tema del estudio (por navegador): claro u oscuro. Migra preferencias anteriores: «líquido» pasa a
 * claro y el interruptor de modo oscuro anterior («ezra:dark») se respeta la primera vez.
 */
type Tema = "claro" | "oscuro";
const CLAVE_TEMA = "ezra:tema";
function leerTema(): Tema {
  try {
    const v = window.localStorage.getItem(CLAVE_TEMA);
    if (v === "claro" || v === "oscuro") return v;
    if (v === "liquido") return "claro";
    return window.localStorage.getItem("ezra:dark") === "1" ? "oscuro" : "claro";
  } catch {
    return "claro";
  }
}
function suscribirTema(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("ezra:tema", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("ezra:tema", cb);
  };
}
export function useTema() {
  const tema = useSyncExternalStore(suscribirTema, leerTema, () => "claro" as Tema);
  // Una vez, al abrir: deja guardada la preferencia migrada (líquido → claro; «ezra:dark» anterior).
  // Lee el almacenamiento, no el valor renderizado: durante la hidratación ese valor es siempre «claro».
  useEffect(() => {
    try {
      const migrado = leerTema();
      if (window.localStorage.getItem(CLAVE_TEMA) !== migrado) guardarTema(migrado);
      window.localStorage.removeItem("ezra:dark");
    } catch {
      /* Sin almacenamiento: el tema dura solo esta visita. */
    }
  }, []);
  return tema;
}
export function guardarTema(tema: Tema) {
  try {
    window.localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    /* Sin almacenamiento: el tema dura solo esta visita. */
  }
  window.dispatchEvent(new Event("ezra:tema"));
}
/** Sol y luna: dos botones pequeños; el activo queda marcado (aria-pressed). Las flechas cambian entre ellos. */
function SelectorTema({ tema, tt }: { tema: Tema; tt: (c: string) => string }) {
  const opciones = [
    { id: "claro" as const, Icono: Sun, etiqueta: tt("ez_tema_usarClaro") },
    { id: "oscuro" as const, Icono: Moon, etiqueta: tt("ez_tema_usarOscuro") },
  ];
  return (
    <div className="ez-tema" role="group" aria-label={tt("ez_tema_global")}>
      {opciones.map(({ id, Icono, etiqueta }) => (
        <button
          key={id}
          data-tema-opcion={id}
          aria-pressed={tema === id}
          aria-label={etiqueta}
          title={etiqueta}
          onClick={() => guardarTema(id)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const otro = id === "claro" ? "oscuro" : "claro";
            guardarTema(otro);
            e.currentTarget.parentElement
              ?.querySelector<HTMLElement>(`[data-tema-opcion="${otro}"]`)
              ?.focus();
          }}
        >
          <Icono size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/* Preferencia de la barra lateral (por navegador): oculta o visible. La clave conserva su nombre anterior. */
const CLAVE_SIDEBAR = "ezra:sidebar-contraida";
function leerSidebar() {
  try {
    return window.localStorage.getItem(CLAVE_SIDEBAR) === "1";
  } catch {
    return false;
  }
}
function suscribirSidebar(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("ezra:sidebar", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("ezra:sidebar", cb);
  };
}
export function useSidebarContraida() {
  return useSyncExternalStore(suscribirSidebar, leerSidebar, () => false);
}
export function guardarSidebarContraida(valor: boolean) {
  try {
    window.localStorage.setItem(CLAVE_SIDEBAR, valor ? "1" : "0");
  } catch {
    /* Sin almacenamiento (modo privado): la preferencia dura solo esta visita. */
  }
  window.dispatchEvent(new Event("ezra:sidebar"));
}
/** Abre Configuración en el estudio; si ya está abierto, sin recargar (el estudio escucha popstate). */
function abrirConfiguracion() {
  const destino = `${href("produccion")}?seccion=ajustes`;
  if (window.location.pathname !== href("produccion")) return window.location.assign(destino);
  window.history.pushState({ seccion: "ajustes" }, "", destino);
  window.dispatchEvent(new PopStateEvent("popstate", { state: { seccion: "ajustes" } }));
  window.dispatchEvent(new Event("ezra:navego"));
}
/** Cuenta, idioma y cierre de sesión en un solo menú (botón con «aria-expanded»; Escape o clic fuera cierran). */
function MenuCuenta({
  user,
  locale,
  setLocale,
  salir,
  saliendo,
  t,
}: {
  user: ShellUser;
  locale: string;
  setLocale: (l: "es" | "en") => void;
  salir: () => Promise<void>;
  saliendo: boolean;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
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
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [abierto]);
  const nombre = user.displayName || user.email;
  const iniciales = nombre
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join("");
  return (
    <div className="ep-cuenta">
      <button
        ref={boton}
        className="ep-cuenta-boton"
        aria-expanded={abierto}
        aria-controls="ep-cuenta-panel"
        onClick={() => setAbierto(!abierto)}
        data-tooltip={t("ez_sb_perfil" as MessageKey)}
      >
        <span className="ep-avatar" aria-hidden="true">
          {iniciales}
        </span>
        <span className="ep-cuenta-nombre">
          <strong>{nombre}</strong>
          <small>
            <Settings size={12} aria-hidden="true" /> {t("ez_sb_perfil" as MessageKey)}
          </small>
        </span>
        <ChevronUp size={16} aria-hidden="true" className="ep-cuenta-flecha" />
        <span className="ep-oculto-visual">{t("ez_sb_perfil" as MessageKey)}</span>
      </button>
      {abierto && (
        <div ref={panel} id="ep-cuenta-panel" className="ep-cuenta-panel">
          <p className="ep-cuenta-email" title={user.email}>
            {user.email}
          </p>
          <div className="ep-cuenta-grupo" role="group" aria-label={t("language")}>
            <span>{t("language")}</span>
            {(["es", "en"] as const).map((l) => (
              <button key={l} lang={l} aria-pressed={locale === l} onClick={() => setLocale(l)}>
                {locale === l && <Check size={14} aria-hidden="true" />}
                {l === "es" ? "Español" : "English"}
              </button>
            ))}
          </div>
          <button
            className="ep-cuenta-salir"
            onClick={() => {
              setAbierto(false);
              abrirConfiguracion();
            }}
          >
            <Settings size={16} aria-hidden="true" />
            {t("cf_titulo" as MessageKey)}
          </button>
          <button className="ep-cuenta-salir" disabled={saliendo} onClick={() => void salir()}>
            <LogOut size={16} aria-hidden="true" />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
export function AzraShell({ children, user }: ShellProps) {
  setAccountScope(user);
  return (
    <LanguageProvider>
      <Shell user={user}>{children}</Shell>
    </LanguageProvider>
  );
}
