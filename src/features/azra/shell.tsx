"use client";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useState, type ReactNode } from "react";
import { LogOut, Sparkles } from "lucide-react";
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
          <Sparkles size={20} />
          <strong>
            ezrá<span> / </span>Spotmi
          </strong>
        </Link>
        <div className="ep-session-options">
          <div className="ep-idiomas" role="group" aria-label={t("language")}>
            <button lang="es" aria-pressed={locale === "es"} onClick={() => setLocale("es")}>
              ES
            </button>
            <button lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
              EN
            </button>
          </div>
          <span className="ep-session-user" title={user.email}>
            {user.email}
          </span>
          <button
            className="ep-session-exit"
            disabled={saliendo}
            onClick={() => void salir()}
            aria-label={t("signOut")}
          >
            <LogOut size={18} />
            <span>{t("signOut")}</span>
          </button>
        </div>
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
export function AzraShell({ children, user }: ShellProps) {
  setAccountScope(user);
  return (
    <LanguageProvider>
      <Shell user={user}>{children}</Shell>
    </LanguageProvider>
  );
}
