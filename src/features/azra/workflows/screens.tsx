"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Network, Search, UsersRound, Workflow } from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { href } from "../routes";
import { getAccountService } from "../account/service";
import type { Subaccount } from "../account/model";
import { builders, WorkflowError, type Builder, type WorkflowSettings } from "./model";
import { getWorkflowService } from "./service";

const errorKey = (e: unknown): MessageKey =>
  e instanceof WorkflowError
    ? e.code === "storage"
      ? "errorStorage"
      : "errorInvalidData"
    : "errorGeneric";
function useWorkflowSettings() {
  const [settings, setSettings] = useState<WorkflowSettings | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [saved, setSaved] = useState(false);
  const load = useCallback(() => {
    getWorkflowService()
      .get()
      .then(setSettings)
      .catch((e) => setError(errorKey(e)));
  }, []);
  useEffect(load, [load]);
  async function save(next: WorkflowSettings) {
    const previous = settings;
    setSettings(next);
    try {
      setSettings(await getWorkflowService().save(next));
      setSaved(true);
      setError(null);
    } catch (e) {
      setSettings(previous);
      setError(errorKey(e));
    }
  }
  return { settings, error, saved, save };
}
function WorkflowLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <section className="az-page">
      <div className="az-profile-panel az-workflow-panel">
        <nav className="az-subnav" aria-label={t("workflows")}>
          <Link href={href("settings/workflows")} className="is-active" aria-current="page">
            {t("defaultBuilder")}
          </Link>
        </nav>
        <div className="az-profile-content">{children}</div>
      </div>
    </section>
  );
}
const builderMeta: Record<
  Builder,
  { icon: typeof Network; title: MessageKey; description: MessageKey }
> = {
  standard: { icon: Workflow, title: "standardBuilder", description: "standardBuilderDescription" },
  advanced: { icon: Network, title: "advancedBuilder", description: "advancedBuilderDescription" },
};
export function WorkflowSettingsScreen() {
  const { t } = useLanguage();
  const { settings, error, saved, save } = useWorkflowSettings();
  return (
    <WorkflowLayout>
      <div className="az-card az-card-body">
        <h2>{t("defaultBuilderTitle")}</h2>
        <p className="az-muted az-card-lead">{t("defaultBuilderDescription")}</p>
        {error && (
          <p className="az-error" role="alert">
            {t(error)}
          </p>
        )}
        <fieldset className="az-choice-grid" disabled={!settings}>
          <legend>{t("chooseDefaultBuilder")}</legend>
          {builders.map((builder) => {
            const meta = builderMeta[builder];
            const checked = settings?.defaultBuilder === builder;
            return (
              <label
                key={builder}
                aria-label={t(meta.title)}
                className={`az-choice ${checked ? "is-checked" : ""}`}
              >
                <span className="az-choice-icon" aria-hidden="true">
                  <meta.icon size={22} />
                </span>
                <span>
                  <strong>{t(meta.title)}</strong>
                  <small>{t(meta.description)}</small>
                </span>
                <input
                  type="radio"
                  name="az-default-builder"
                  checked={checked}
                  onChange={() => settings && save({ ...settings, defaultBuilder: builder })}
                />
              </label>
            );
          })}
        </fieldset>
        <Link className="az-manage-row" href={href("settings/workflows/subaccounts")}>
          <span className="az-choice-icon" aria-hidden="true">
            <UsersRound size={22} />
          </span>
          <span>
            <strong>{t("builderPerSubaccount")}</strong>
            <small>{t("builderPerSubaccountDescription")}</small>
          </span>
          <span className="az-manage-link">
            {t("manage")} <ChevronRight size={18} aria-hidden="true" />
          </span>
        </Link>
        <p className="az-muted az-report-status" role="status">
          {saved ? t("settingsSaved") : ""}
        </p>
      </div>
    </WorkflowLayout>
  );
}
export function WorkflowSubaccounts() {
  const { t } = useLanguage();
  const { settings, error, saved, save } = useWorkflowSettings();
  const [items, setItems] = useState<Subaccount[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  useEffect(() => {
    getAccountService()
      .listSubaccounts()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  const needle = query.trim().toLocaleLowerCase();
  const matches = (items ?? []).filter((item) => item.name.toLocaleLowerCase().includes(needle));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const current = Math.min(page, pages);
  const visible = matches.slice((current - 1) * pageSize, current * pageSize);
  const from = matches.length ? (current - 1) * pageSize + 1 : 0;
  const builderOf = (id: string) =>
    settings?.overrides[id] ?? settings?.defaultBuilder ?? "standard";
  function setBuilder(ids: string[], builder: Builder) {
    if (!settings) return;
    save({
      ...settings,
      overrides: { ...settings.overrides, ...Object.fromEntries(ids.map((id) => [id, builder])) },
    });
  }
  const allSelected = visible.length > 0 && visible.every((item) => selected.includes(item.id));
  return (
    <WorkflowLayout>
      <div className="az-card az-card-body">
        <div className="az-back-title">
          <Link href={href("settings/workflows")} className="az-icon" aria-label={t("back")}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2>{t("manageBuilderTitle")}</h2>
            <p className="az-muted">{t("builderPerSubaccountDescription")}</p>
          </div>
        </div>
        {error && (
          <p className="az-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="az-table-toolbar">
          {selected.length > 0 && (
            <div className="az-bulk" role="group" aria-label={t("bulkActions")}>
              <span>
                {selected.length} {t("selected")}
              </span>
              {builders.map((builder) => (
                <button
                  key={builder}
                  className="az-button"
                  onClick={() => setBuilder(selected, builder)}
                >
                  {t(builder === "standard" ? "standard" : "advancedOptions")}
                </button>
              ))}
            </div>
          )}
          <label className="az-search-input">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder={t("search")}
              aria-label={t("search")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <div className="az-table-scroll" role="region" aria-label={t("manageBuilderTitle")}>
          <table className="az-table az-table-compact">
            <thead>
              <tr>
                <th scope="col" className="az-col-check">
                  <input
                    type="checkbox"
                    aria-label={t("selectAll")}
                    checked={allSelected}
                    disabled={!visible.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? visible.map((item) => item.id) : [])
                    }
                  />
                </th>
                <th scope="col">{t("subaccounts")}</th>
                <th scope="col">{t("defaultBuilderShort")}</th>
              </tr>
            </thead>
            <tbody>
              {items === null ? (
                <tr>
                  <td colSpan={3} className="az-table-empty">
                    {t("loading")}
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={3} className="az-table-empty">
                    {items.length ? t("noMatches") : t("noSubaccountsWorkflow")}
                  </td>
                </tr>
              ) : (
                visible.map((item) => (
                  <tr key={item.id}>
                    <td className="az-col-check">
                      <input
                        type="checkbox"
                        aria-label={item.name}
                        checked={selected.includes(item.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, item.id]
                              : selected.filter((id) => id !== item.id),
                          )
                        }
                      />
                    </td>
                    <td>{item.name}</td>
                    <td>
                      <div
                        className="az-segmented"
                        role="radiogroup"
                        aria-label={`${t("defaultBuilderShort")}: ${item.name}`}
                      >
                        {builders.map((builder) => (
                          <button
                            key={builder}
                            role="radio"
                            aria-checked={builderOf(item.id) === builder}
                            disabled={!settings}
                            onClick={() => setBuilder([item.id], builder)}
                          >
                            {t(builder === "standard" ? "standard" : "advancedOptions")}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="az-table-footer">
          <p className="az-muted" role="status">
            {saved ? t("settingsSaved") : ""}
          </p>
          <nav className="az-pagination" aria-label={t("pagination")}>
            <label htmlFor="az-wf-page-size">{t("rowsPerPage")}</label>
            <select
              id="az-wf-page-size"
              className="az-plain-select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 20, 50].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <span>
              {t("pageRange")
                .replace("{from}", String(from))
                .replace("{to}", String(from ? from + visible.length - 1 : 0))
                .replace("{total}", String(matches.length))}
            </span>
            <button
              className="az-button"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              {t("previous")}
            </button>
            <button className="az-button az-page-number is-active" aria-current="page">
              {current}
            </button>
            <button
              className="az-button"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              {t("next")}
            </button>
          </nav>
        </div>
      </div>
    </WorkflowLayout>
  );
}
