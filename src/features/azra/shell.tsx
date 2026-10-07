"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Sparkles,
  Settings,
  ChevronsUpDown,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Bell,
  CircleHelp,
  Menu,
  Languages,
  MousePointerClick,
  LogOut,
} from "lucide-react";
import { LanguageProvider, useLanguage, type MessageKey } from "./i18n";
import { href, settingsLinks } from "./routes";
import { AccountSwitcher } from "./account/switcher";
import {
  AGENCY_LOGO_EVENT,
  agencyLogoUrl,
  getAgencyLogo,
  type AgencyLogoMeta,
} from "./account/businesses";

// Main menu: only «Pregúntale a la IA» for now; real features are built from here.
const globalLinks = [{ label: "chat", icon: Sparkles, path: "ai/chat" }] satisfies {
  label: MessageKey;
  icon: typeof Sparkles;
  path?: string;
}[];
type ShellUser = { email: string; displayName: string };
export type BusinessShellOptions = {
  name: string;
  logoUrl?: string;
  navigation: (close: () => void) => ReactNode;
  selector: ReactNode;
  status: string;
  onHome: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onReviews: () => void;
};
type ShellProps = { children: ReactNode; user: ShellUser; business?: BusinessShellOptions };
function Shell({ children, user, business }: ShellProps) {
  const { signOut } = useClerk();
  const [signOutError, setSignOutError] = useState(false);
  const [logo, setLogo] = useState<AgencyLogoMeta | null>(null);
  useEffect(() => {
    if (business) return;
    const load = () =>
      getAgencyLogo()
        .then(setLogo)
        .catch(() => setLogo(null));
    load();
    window.addEventListener(AGENCY_LOGO_EVENT, load);
    return () => window.removeEventListener(AGENCY_LOGO_EVENT, load);
  }, [business]);
  const { t, locale, setLocale } = useLanguage();
  const pathname = usePathname();
  const isSettings = !business && pathname.includes("/settings/");
  const isChat = !business && pathname.endsWith("/ai/chat");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  // Identity comes from the authorized session, never another account's demo storage.
  const avatar = (user.displayName || user.email).charAt(0).toUpperCase();
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = sidebarRef.current;
    const focusable = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled)",
        ) ?? [],
      ).filter(
        (element) =>
          element.getClientRects().length && getComputedStyle(element).visibility !== "hidden",
      );
    focusable()[0]?.focus();
    function handleKey(event: KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [mobileOpen]);
  const small = collapsed || isChat;
  function active(path: string) {
    if (path === "settings/workflows")
      return pathname === href(path) || pathname === href("settings/workflows/subaccounts");
    if (path === "settings/integrations") return pathname.startsWith(href(path));
    const prefix = path.replace(/\/(general|services|templates|logs|accounts)$/, "");
    return pathname === href(path) || pathname.startsWith(href(prefix) + "/");
  }
  return (
    <div className={`azra ${small ? "az-is-collapsed" : ""} ${mobileOpen ? "az-mobile-open" : ""}`}>
      <a href="#az-content" className="az-skip">
        {t("skip")}
      </a>
      {mobileOpen && (
        <button className="az-scrim" aria-label={t("close")} onClick={() => setMobileOpen(false)} />
      )}
      <aside ref={sidebarRef} className="az-sidebar" aria-label={t("menu")}>
        <Link
          href={business ? "?view=overview" : href("ai/chat")}
          className="az-logo"
          aria-label={t("brand")}
          onClick={(event) => {
            if (business) {
              event.preventDefault();
              business.onHome();
            }
            setMobileOpen(false);
          }}
        >
          {business?.logoUrl ? (
            <img className="az-logo-image" src={business.logoUrl} alt="" />
          ) : !business && logo ? (
            <img className="az-logo-image" src={agencyLogoUrl(logo)} alt="" />
          ) : (
            /* Default ezrá app icon (src/app/icon.svg) until a white-label logo is saved. */
            <svg className="az-logo-tile" viewBox="0 0 64 64" aria-hidden="true">
              <rect width="64" height="64" rx="14" fill="#7460db" />
              <g fill="#fff" transform="translate(32 32)">
                <ellipse ry="23" rx="7" />
                <ellipse ry="23" rx="7" transform="rotate(60)" />
                <ellipse ry="23" rx="7" transform="rotate(120)" />
                <circle r="8" fill="#d7f2b8" />
              </g>
            </svg>
          )}
        </Link>
        {business ? (
          business.selector
        ) : (
          <button
            className="az-switch"
            onClick={() => setSwitchOpen(true)}
            aria-label={t("switch")}
          >
            <span className="az-switch-symbol" aria-hidden="true">
              <MousePointerClick size={16} />
            </span>
            <span className="az-nav-label">{t("switch")}</span>
            <ChevronsUpDown className="az-nav-label" size={18} />
          </button>
        )}
        {isSettings && (
          <>
            <Link className="az-back" href={href("ai/chat")} onClick={() => setMobileOpen(false)}>
              <ArrowLeft size={18} />
              <span className="az-nav-label">{t("back")}</span>
            </Link>
            <h2 className="az-settings-title az-nav-label">{t("settings")}</h2>
          </>
        )}
        <nav
          className="az-nav"
          aria-label={business ? business.name : t(isSettings ? "settings" : "mainNavigation")}
        >
          {business
            ? business.navigation(() => setMobileOpen(false))
            : isSettings
              ? settingsLinks.map((item) =>
                  item.path ? (
                    <Link
                      key={item.label}
                      className={`az-nav-item ${active(item.path) ? "is-active" : ""}`}
                      href={href(item.path)}
                      aria-current={active(item.path) ? "page" : undefined}
                      title={t(item.label)}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className="az-nav-label">{t(item.label)}</span>
                      {small && <Settings size={19} />}{" "}
                      {item.badge && <span className="az-new az-nav-label">{t("new")}</span>}
                    </Link>
                  ) : (
                    <button
                      key={item.label}
                      className="az-nav-item"
                      aria-disabled="true"
                      title={t("outside")}
                    >
                      <span className="az-nav-label">{t(item.label)}</span>
                      {small && <Settings size={19} />}
                    </button>
                  ),
                )
              : globalLinks.map((item) =>
                  item.path ? (
                    <Link
                      key={item.label}
                      className={`az-nav-item ${active(item.path) ? "is-active" : ""}`}
                      href={href(item.path)}
                      aria-current={active(item.path) ? "page" : undefined}
                      title={t(item.label)}
                      onClick={() => setMobileOpen(false)}
                    >
                      <item.icon size={20} />
                      <span className="az-nav-label">{t(item.label)}</span>
                    </Link>
                  ) : (
                    <button
                      key={item.label}
                      className="az-nav-item"
                      aria-disabled="true"
                      title={`${t(item.label)} — ${t("outside")}`}
                    >
                      <item.icon size={20} />
                      <span className="az-nav-label">{t(item.label)}</span>
                    </button>
                  ),
                )}
        </nav>
        <div className="az-sidebar-bottom">
          {business ? (
            <button
              className="az-nav-item"
              onClick={() => {
                business.onSettings();
                setMobileOpen(false);
              }}
              title={t("settings")}
            >
              <Settings size={21} />
              <span className="az-nav-label">{t("settings")}</span>
            </button>
          ) : (
            !isSettings && (
              <Link
                className="az-nav-item"
                href={href("settings/profile/general")}
                title={t("settings")}
                onClick={() => setMobileOpen(false)}
              >
                <Settings size={21} />
                <span className="az-nav-label">{t("settings")}</span>
              </Link>
            )
          )}
          <button
            className="az-collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={t(small ? "expand" : "collapse")}
            disabled={isChat}
          >
            {small ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>
      <div className="az-workspace">
        <header className="az-header">
          <button
            className="az-icon az-mobile-menu"
            aria-label={t("menu")}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu />
          </button>
          <span
            className={business ? "az-business-status" : "az-demo-label"}
            title={business ? business.name : t("demoDescription")}
          >
            {business ? `${business.name} · ${business.status}` : t("demo")}
          </span>
          <div className="az-header-actions">
            {!business && (
              <div className="az-language-menu">
                <button
                  className="az-circle az-translate"
                  aria-label={t("translate")}
                  title={t("translate")}
                  aria-expanded={languageOpen}
                  aria-controls="az-language-options"
                  onClick={() => setLanguageOpen(!languageOpen)}
                  onKeyDown={(event) => event.key === "Escape" && setLanguageOpen(false)}
                >
                  <Languages size={20} />
                </button>
                {languageOpen && (
                  <div
                    id="az-language-options"
                    className="az-language-options"
                    role="group"
                    aria-label={t("language")}
                  >
                    {(["es", "en"] as const).map((code) => (
                      <button
                        key={code}
                        lang={code}
                        aria-pressed={locale === code}
                        onKeyDown={(event) => event.key === "Escape" && setLanguageOpen(false)}
                        onClick={() => {
                          setLocale(code);
                          setLanguageOpen(false);
                        }}
                      >
                        {code === "es" ? "Español" : "English"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!business && (
              <Link href={href("ai/chat")} className="az-circle az-ai" aria-label={t("chat")}>
                <Sparkles size={22} />
              </Link>
            )}
            {!business && (
              <button
                className="az-circle az-announcement"
                aria-label={t("announcements")}
                title={t("outside")}
                aria-disabled="true"
              >
                <Megaphone size={22} />
              </button>
            )}
            <button
              className="az-circle az-bell"
              onClick={business?.onReviews}
              aria-label={t("notifications")}
              title={business ? t("notifications") : t("outside")}
              aria-disabled={business ? undefined : true}
            >
              <Bell size={22} />
            </button>
            <button
              className="az-circle az-help"
              onClick={business?.onHelp}
              aria-label={t("help")}
              title={business ? t("help") : t("outside")}
              aria-disabled={business ? undefined : true}
            >
              <CircleHelp size={22} />
            </button>
            {business ? (
              <span className="az-circle az-avatar" title={user.email}>
                {avatar}
              </span>
            ) : (
              <Link
                href={href("settings/profile/general")}
                className="az-circle az-avatar"
                aria-label={`${t("profile")}: ${user.email}`}
                title={user.email}
              >
                {avatar}
              </Link>
            )}
            <span className="az-user-email">{user.email}</span>
            <button
              className="az-button az-signout-button"
              aria-label={t("signOut")}
              onClick={() => signOut({ redirectUrl: "/" }).catch(() => setSignOutError(true))}
            >
              <LogOut size={16} />
              <span className="az-nav-label">{t("signOut")}</span>
            </button>
            {signOutError && (
              <span className="az-error" role="alert">
                {t("signOutFailed")}
              </span>
            )}
          </div>
        </header>
        <main id="az-content" tabIndex={-1} className="az-main">
          {children}
        </main>
      </div>
      {!business && <AccountSwitcher open={switchOpen} onClose={() => setSwitchOpen(false)} />}
    </div>
  );
}
export function AzraShell({ children, user, business }: ShellProps) {
  return (
    <LanguageProvider>
      <Shell user={user} business={business}>
        {children}
      </Shell>
    </LanguageProvider>
  );
}
