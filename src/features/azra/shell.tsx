"use client";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, LogOut, Sparkles } from "lucide-react";
import { LanguageProvider, useLanguage } from "./i18n";
import { href } from "./routes";
import { setAccountScope } from "./account/service";
import "./produccion/estudio.css";

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
  return (
    <div className="azra ep-shell">
      <a href="#az-content" className="ep-saltar">
        {t("skip")}
      </a>
      <header className="ep-session-bar">
        <Link href={href("produccion")} className="ep-session-brand">
          <Sparkles size={18} />
          <strong>ezrá</strong>
          <span className="ep-session-espacio">Spotmi</span>
        </Link>
        <MenuCuenta user={user} locale={locale} setLocale={setLocale} salir={salir} saliendo={saliendo} t={t} />
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
  );
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
      <button ref={boton} className="ep-cuenta-boton" aria-expanded={abierto} aria-controls="ep-cuenta-panel" onClick={() => setAbierto(!abierto)}>
        <span className="ep-avatar" aria-hidden="true">
          {iniciales}
        </span>
        <span className="ep-cuenta-nombre">{nombre}</span>
        <ChevronDown size={16} aria-hidden="true" />
        <span className="ep-oculto-visual">{t("account")}</span>
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
