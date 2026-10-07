"use client";
import { ChevronDown, Eye, LayoutGrid, MapPin } from "lucide-react";
import { useLanguage } from "../i18n";
import { coverageKm, gridSizes, hostingProviders } from "./model";
import { ProspectingLayout, useProspectingSettings } from "./layout";

const miles = (km: number) => (km * 0.621371).toFixed(1);
const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
export function ProspectSettings() {
  const { t } = useLanguage();
  const { settings, error, saved, save } = useProspectingSettings();
  return (
    <ProspectingLayout active="prospecting/settings">
      <div className="az-profile-panel az-prospect-settings">
        <nav className="az-subnav" aria-label={t("settings")}>
          <a className="is-active" aria-current="page" href="#az-report-settings">
            {t("reportSettings")}
          </a>
          <button aria-disabled="true" title={t("outside")}>
            {t("migrate")}
          </button>
        </nav>
        <div className="az-profile-content" id="az-report-settings">
          {error && (
            <p className="az-error" role="alert">
              {t(error)}
            </p>
          )}
          <section className="az-card" aria-labelledby="az-heatmaps">
            <div className="az-report-head">
              <div>
                <h2 id="az-heatmaps">{t("heatmapsTitle")}</h2>
                <p className="az-muted">{t("heatmapsDescription")}</p>
              </div>
              <button
                className="az-icon"
                aria-disabled="true"
                aria-label={t("previewReport")}
                title={t("outside")}
              >
                <Eye size={22} />
              </button>
            </div>
            <div className="az-card-body">
              {settings ? (
                <>
                  <div className="az-form-grid">
                    <div className="az-field">
                      <label htmlFor="az-grid-size">
                        <LayoutGrid size={18} aria-hidden="true" /> {t("gridSize")}
                      </label>
                      <span className="az-select">
                        <select
                          id="az-grid-size"
                          value={settings.heatmapGrid}
                          onChange={(e) =>
                            save({
                              ...settings,
                              heatmapGrid: Number(e.target.value) as (typeof gridSizes)[number],
                            })
                          }
                        >
                          {gridSizes.map((n) => (
                            <option key={n} value={n}>
                              {fill(t("gridOption"), { n, points: n * n })}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={18} aria-hidden="true" />
                      </span>
                    </div>
                    <div className="az-field">
                      <label htmlFor="az-coverage">
                        <MapPin size={18} aria-hidden="true" /> {t("coverage")}
                      </label>
                      <span className="az-select">
                        <select
                          id="az-coverage"
                          value={settings.heatmapCoverageKm}
                          onChange={(e) =>
                            save({
                              ...settings,
                              heatmapCoverageKm: Number(
                                e.target.value,
                              ) as (typeof coverageKm)[number],
                            })
                          }
                        >
                          {coverageKm.map((km) => (
                            <option key={km} value={km}>
                              {fill(t("coverageOption"), { mi: miles(km), km })}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={18} aria-hidden="true" />
                      </span>
                    </div>
                  </div>
                  <p className="az-hint az-heatmap-summary">
                    {fill(t("heatmapSummary"), {
                      points: settings.heatmapGrid ** 2,
                      mi: miles(settings.heatmapCoverageKm),
                    })}
                  </p>
                </>
              ) : (
                !error && <p className="az-muted">{t("loading")}</p>
              )}
            </div>
          </section>
          <section className="az-card" aria-labelledby="az-hosting">
            <div className="az-report-head">
              <div>
                <h2 id="az-hosting">{t("websiteHosting")}</h2>
                <p className="az-muted">{t("hostingDescription")}</p>
              </div>
              <button
                className="az-icon"
                aria-disabled="true"
                aria-label={t("previewReport")}
                title={t("outside")}
              >
                <Eye size={22} />
              </button>
            </div>
            <div className="az-card-body">
              {settings ? (
                <fieldset className="az-hosting-grid">
                  <legend className="az-visually-hidden">{t("websiteHosting")}</legend>
                  {hostingProviders.map((provider) => (
                    <label key={provider.id} className="az-check">
                      <input
                        type="checkbox"
                        checked={settings.hosting.includes(provider.id)}
                        onChange={(e) =>
                          save({
                            ...settings,
                            hosting: e.target.checked
                              ? [...settings.hosting, provider.id]
                              : settings.hosting.filter((id) => id !== provider.id),
                          })
                        }
                      />
                      <span>{provider.name}</span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                !error && <p className="az-muted">{t("loading")}</p>
              )}
              <p className="az-muted" role="status">
                {saved ? t("settingsSaved") : ""}
              </p>
            </div>
          </section>
        </div>
      </div>
    </ProspectingLayout>
  );
}
