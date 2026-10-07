"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { href } from "../routes";
import { ProspectingError, type ProspectingSettings } from "./model";
import { getProspectingService } from "./service";

// Tab order from #38. Widgets has no reference screen, so it stays disabled.
const tabs: { key: MessageKey; path?: string }[] = [
  { key: "accounts", path: "prospecting/accounts" },
  { key: "prospectAi", path: "prospecting/ai" },
  { key: "widgets" },
  { key: "reportBuilder", path: "prospecting/report-builder" },
  { key: "analytics", path: "prospecting/analytics" },
  { key: "settings", path: "prospecting/settings" },
];
export function ProspectingLayout({ active, children }: { active: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <section className="az-page az-prospecting">
      <div className="az-prospecting-head">
        <h1>{t("prospectAccounts")}</h1>
        <button className="az-button az-primary" aria-disabled="true" title={t("outside")}>
          <Plus size={18} />
          {t("addProspect")}
        </button>
      </div>
      <nav className="az-tabs" aria-label={t("prospecting")}>
        {tabs.map((tab) =>
          tab.path ? (
            <Link
              key={tab.key}
              href={href(tab.path)}
              className={tab.path === active ? "is-active" : ""}
              aria-current={tab.path === active ? "page" : undefined}
            >
              {t(tab.key)}
            </Link>
          ) : (
            <button key={tab.key} aria-disabled="true" title={t("outside")}>
              {t(tab.key)}
            </button>
          ),
        )}
      </nav>
      {children}
    </section>
  );
}
export function prospectingErrorKey(error: unknown): MessageKey {
  if (!(error instanceof ProspectingError)) return "errorGeneric";
  return error.code === "storage" ? "errorStorage" : "errorInvalidData";
}
/** Loads and saves demo settings; each change is persisted immediately. */
export function useProspectingSettings() {
  const [settings, setSettings] = useState<ProspectingSettings | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [saved, setSaved] = useState(false);
  const load = useCallback(() => {
    getProspectingService()
      .getSettings()
      .then((value) => {
        setSettings(value);
        setError(null);
      })
      .catch((e) => setError(prospectingErrorKey(e)));
  }, []);
  useEffect(load, [load]);
  async function save(next: ProspectingSettings) {
    const previous = settings;
    setSettings(next);
    setSaved(false);
    try {
      setSettings(await getProspectingService().saveSettings(next));
      setSaved(true);
      setError(null);
    } catch (e) {
      // Never show an unsaved change as if it were stored.
      setSettings(previous);
      setError(prospectingErrorKey(e));
    }
  }
  return { settings, error, saved, save, reload: load };
}
