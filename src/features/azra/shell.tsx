"use client";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, ChevronUp, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, Sparkles, X } from "lucide-react";
import { LanguageProvider, useLanguage, type MessageKey } from "./i18n";
import { href } from "./routes";
import { setAccountScope } from "./account/service";
import "./produccion/estudio.css";
import "./produccion/tokens.css";

export type ShellUser = {
  email: string;
  displayName: string;
  role: "admin" | "client";
  organizationId: string;
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
  const contraida = useSidebarContraida();
  const [movilAbierta, setMovilAbierta] = useState(false);
  const lateral = useRef<HTMLElement>(null);
  const hamburguesa = useRef<HTMLButtonElement>(null);
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
    <div className="azra ep-shell ez-app" data-sidebar={contraida ? "contraida" : "expandida"}>
      <a href="#az-content" className="ep-saltar">
        {t("skip")}
      </a>
      <aside ref={lateral} id="ez-sidebar" className={`ez-sidebar ${movilAbierta ? "ez-sidebar-abierta" : ""}`} aria-label={tt("ez_sb_navegacion")}>
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
            className="ez-sidebar-plegar"
            onClick={() => guardarSidebarContraida(!contraida)}
            aria-pressed={contraida}
            aria-label={tt(contraida ? "ez_sb_expandir" : "ez_sb_contraer")}
            data-tooltip={tt(contraida ? "ez_sb_expandir" : "ez_sb_contraer")}
          >
            {contraida ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
          </button>
          <button className="ez-sidebar-cerrar" onClick={() => (setMovilAbierta(false), hamburguesa.current?.focus())} aria-label={tt("ez_sb_cerrarMenu")}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {/* El estudio llena este espacio: «Nuevo encargo» y las secciones. */}
        <div id="ez-sidebar-nav" className="ez-sidebar-nav" />
        <div className="ez-sidebar-pie">
          <MenuCuenta user={user} locale={locale} setLocale={setLocale} salir={salir} saliendo={saliendo} t={t} />
        </div>
      </aside>
      {movilAbierta && <div className="ez-sidebar-velo" aria-hidden="true" onClick={() => setMovilAbierta(false)} />}
      <div className="ez-principal">
        <header className="ez-cabecera">
          <button ref={hamburguesa} className="ez-hamburguesa" aria-controls="ez-sidebar" aria-expanded={movilAbierta} aria-label={tt("ez_sb_abrirMenu")} onClick={() => setMovilAbierta(true)}>
            <Menu size={20} aria-hidden="true" />
          </button>
          {/* Título de la página y acciones contextuales (las pone cada sección). */}
          <div id="ez-cabecera-titulo" className="ez-cabecera-titulo" />
          <div id="ez-cabecera-acciones" className="ez-cabecera-acciones" />
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

/* Preferencia de la barra lateral (por navegador): contraída o expandida. */
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
function useSidebarContraida() {
  return useSyncExternalStore(suscribirSidebar, leerSidebar, () => false);
}
function guardarSidebarContraida(valor: boolean) {
  try {
    window.localStorage.setItem(CLAVE_SIDEBAR, valor ? "1" : "0");
  } catch {
    /* Sin almacenamiento (modo privado): la preferencia dura solo esta visita. */
  }
  window.dispatchEvent(new Event("ezra:sidebar"));
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
      if (!panel.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) setAbierto(false);
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
      <button ref={boton} className="ep-cuenta-boton" aria-expanded={abierto} aria-controls="ep-cuenta-panel" onClick={() => setAbierto(!abierto)} data-tooltip={t("ez_sb_perfil" as MessageKey)}>
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
