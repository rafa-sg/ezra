"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Sparkles,
  LayoutDashboard,
  Rocket,
  Search,
  UserRound,
  ContactRound,
  Lightbulb,
  Smartphone,
  Monitor,
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
} from "lucide-react";
import { LanguageProvider, useLanguage, type MessageKey } from "./i18n";
import { href, settingsLinks } from "./routes";
import { AssetPlaceholder } from "./ui";
import { AccountSwitcher } from "./account/switcher";
import { initials, useAccount } from "./account/fields";
const globalLinks = [
  { label: "aiSuite", icon: Sparkles },
  { label: "chat", icon: Sparkles, path: "ai/chat" },
  { label: "launchpad", icon: Rocket },
  { label: "agency", icon: LayoutDashboard, path: "agency" },
  { label: "prospecting", icon: Search, path: "prospecting/accounts" },
  { label: "subaccounts", icon: UserRound },
  { label: "snapshots", icon: ContactRound },
  { label: "ideas", icon: Lightbulb },
  { label: "mobileApp", icon: Smartphone },
  { label: "desktopApp", icon: Monitor },
] satisfies { label: MessageKey; icon: typeof Sparkles; path?: string }[];
function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useLanguage();
  const pathname = usePathname();
  const isSettings = pathname.includes("/settings/");
  const isChat = pathname.endsWith("/ai/chat");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const profile = useAccount().snapshot?.profile;
  const avatar = profile ? initials(profile.firstName, profile.lastName) : "DE";
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = sidebarRef.current;
    const focusable = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>("a[href],button:not(:disabled)") ?? [],
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
          href={href("agency")}
          className="az-logo"
          aria-label={t("brand")}
          onClick={() => setMobileOpen(false)}
        >
          <AssetPlaceholder logo />
        </Link>
        <button className="az-switch" onClick={() => setSwitchOpen(true)} aria-label={t("switch")}>
          <span className="az-switch-symbol" aria-hidden="true">
            <MousePointerClick size={16} />
          </span>
          <span className="az-nav-label">{t("switch")}</span>
          <ChevronsUpDown className="az-nav-label" size={18} />
        </button>
        {isSettings && (
          <>
            <Link className="az-back" href={href("agency")} onClick={() => setMobileOpen(false)}>
              <ArrowLeft size={18} />
              <span className="az-nav-label">{t("back")}</span>
            </Link>
            <h2 className="az-settings-title az-nav-label">{t("settings")}</h2>
          </>
        )}
        <nav className="az-nav" aria-label={t(isSettings ? "settings" : "agency")}>
          {isSettings
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
          {!isSettings && (
            <Link
              className="az-nav-item"
              href={href("settings/profile/general")}
              title={t("settings")}
              onClick={() => setMobileOpen(false)}
            >
              <Settings size={21} />
              <span className="az-nav-label">{t("settings")}</span>
            </Link>
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
          <span className="az-demo-label" title={t("demoDescription")}>
            {t("demo")}
          </span>
          <div className="az-header-actions">
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
            <Link href={href("ai/chat")} className="az-circle az-ai" aria-label={t("chat")}>
              <Sparkles size={22} />
            </Link>
            <button
              className="az-circle az-announcement"
              aria-label={t("announcements")}
              title={t("outside")}
              aria-disabled="true"
            >
              <Megaphone size={22} />
            </button>
            <button
              className="az-circle az-bell"
              aria-label={t("notifications")}
              title={t("outside")}
              aria-disabled="true"
            >
              <Bell size={22} />
            </button>
            <button
              className="az-circle az-help"
              aria-label={t("help")}
              title={t("outside")}
              aria-disabled="true"
            >
              <CircleHelp size={22} />
            </button>
            <Link
              href={href("settings/profile/general")}
              className="az-circle az-avatar"
              aria-label={t("profile")}
            >
              {avatar}
            </Link>
          </div>
        </header>
        <main id="az-content" tabIndex={-1} className="az-main">
          {children}
        </main>
      </div>
      <AccountSwitcher open={switchOpen} onClose={() => setSwitchOpen(false)} />
    </div>
  );
}
export function AzraShell({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <Shell>{children}</Shell>
    </LanguageProvider>
  );
}
