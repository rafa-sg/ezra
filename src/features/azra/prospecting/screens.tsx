"use client";
import { Circle, ListFilter, Plus, Search, Sparkles } from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { AssetPlaceholder } from "../ui";
import { checklistSteps } from "./model";
import { ProspectingLayout, useProspectingSettings } from "./layout";

export function ProspectAccounts() {
  const { t } = useLanguage();
  const { settings, error, save } = useProspectingSettings();
  // No prospect, report, CRM or widget flow exists yet: every step is open.
  const done = 0;
  return (
    <ProspectingLayout active="prospecting/accounts">
      {error && (
        <p className="az-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className={`az-prospect-grid ${settings?.checklistSkipped ? "is-wide" : ""}`}>
        <div>
          <div className="az-prospect-toolbar">
            <div>
              <h2>{t("allProspects")}</h2>
              <p className="az-muted">{t("allProspectsDescription")}</p>
            </div>
            <div className="az-prospect-filters" title={t("filtersNeedData")}>
              {(["categories", "source", "status"] as const).map((key) => (
                <button key={key} className="az-button" aria-disabled="true">
                  <ListFilter size={18} />
                  {t(key)}
                </button>
              ))}
              <button
                className="az-button az-square"
                aria-disabled="true"
                aria-label={t("searchProspects")}
              >
                <Search size={18} />
              </button>
            </div>
          </div>
          <div className="az-empty az-prospect-empty">
            <span className="az-empty-icon" aria-hidden="true">
              <Search size={26} />
            </span>
            <h2>{t("startProspecting")}</h2>
            <p>{t("startProspectingDescription")}</p>
            <button className="az-button az-primary" aria-disabled="true" title={t("outside")}>
              <Plus size={18} />
              {t("addProspect")}
            </button>
          </div>
        </div>
        {settings && !settings.checklistSkipped && (
          <aside className="az-card az-checklist" aria-labelledby="az-checklist-title">
            <div className="az-checklist-head">
              <h3 id="az-checklist-title">
                {t("gettingStarted")} ({done}/{checklistSteps.length})
              </h3>
              <button
                className="az-text-button"
                onClick={() => save({ ...settings, checklistSkipped: true })}
              >
                {t("skipChecklist")}
              </button>
            </div>
            <div className="az-progress-row">
              <progress max={checklistSteps.length} value={done} aria-label={t("progress")} />
              <span>{Math.round((done / checklistSteps.length) * 100)}%</span>
            </div>
            <ul>
              {checklistSteps.map((step) => (
                <li key={step}>
                  <Circle size={20} aria-hidden="true" />
                  {t(step)}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
      {settings?.checklistSkipped && (
        <button
          className="az-text-button az-show-checklist"
          onClick={() => save({ ...settings, checklistSkipped: false })}
        >
          {t("showChecklist")}
        </button>
      )}
    </ProspectingLayout>
  );
}
const features: { title: MessageKey; description: MessageKey }[] = [
  { title: "featureLeads", description: "featureLeadsDescription" },
  { title: "featureSync", description: "featureSyncDescription" },
  { title: "featureEnrich", description: "featureEnrichDescription" },
];
export function ProspectAi() {
  const { t } = useLanguage();
  return (
    <ProspectingLayout active="prospecting/ai">
      <div className="az-prospect-ai">
        <h2>{t("prospectAiTitle")}</h2>
        <p>{t("prospectAiDescription")}</p>
        <button className="az-button az-primary az-large" aria-disabled="true" title={t("outside")}>
          <Sparkles size={20} />
          {t("createAgent")}
        </button>
        <ul className="az-feature-grid">
          {features.map((feature) => (
            <li key={feature.title} className="az-card">
              <AssetPlaceholder />
              <h3>{t(feature.title)}</h3>
              <p>{t(feature.description)}</p>
            </li>
          ))}
        </ul>
      </div>
    </ProspectingLayout>
  );
}
