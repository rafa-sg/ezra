"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownUp,
  Bell,
  Flag,
  Layers,
  Lock,
  MousePointerClick,
  Pencil,
  Plus,
  Search,
  Activity,
} from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { AnnouncementError, priorities, type AnnouncementId, type Priority } from "./model";
import { getAnnouncementService, type Announcement } from "./service";

const errorKey = (e: unknown): MessageKey =>
  e instanceof AnnouncementError
    ? (
        { storage: "errorStorage", invalidData: "errorInvalidData", locked: "errorLocked" } as const
      )[e.code]
    : "errorGeneric";
const priorityLabel: Record<Priority, MessageKey> = {
  critical: "critical",
  warning: "warning",
  general: "generalPriority",
};
type SortKey = "name" | "priority" | "frequency" | "enabled";
const order = { critical: 0, warning: 1, general: 2, once: 0, daily: 1, always: 2 } as const;
export function AnnouncementsScreen() {
  const { t } = useLanguage();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [tab, setTab] = useState<Priority | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  useEffect(() => {
    getAnnouncementService()
      .list()
      .then(setItems)
      .catch((e) => setError(errorKey(e)));
  }, []);
  async function toggle(id: AnnouncementId, enabled: boolean) {
    try {
      setItems(await getAnnouncementService().setEnabled(id, enabled));
      setError(null);
    } catch (e) {
      setError(errorKey(e));
    }
  }
  const name = (id: AnnouncementId) => t(`ann_${id}` as MessageKey);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = (items ?? []).filter(
    (item) =>
      (tab === "all" || item.priority === tab) &&
      name(item.id).toLocaleLowerCase().includes(needle),
  );
  if (sort) {
    const value = (item: Announcement) =>
      sort.key === "name"
        ? name(item.id)
        : sort.key === "enabled"
          ? Number(item.enabled)
          : order[item[sort.key]];
    filtered.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y)) * sort.dir;
    });
  }
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = filtered.length ? (current - 1) * pageSize + 1 : 0;
  const header = (key: SortKey | null, label: MessageKey, Icon: typeof Bell) => (
    <th
      scope="col"
      aria-sort={
        sort && key && sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined
      }
    >
      <span className="az-th">
        <Icon size={16} aria-hidden="true" />
        {t(label)}
        {key && (
          <button
            className="az-icon az-sort"
            aria-label={`${t("sortBy")}: ${t(label)}`}
            onClick={() => {
              setSort(sort?.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 });
            }}
          >
            <ArrowDownUp size={14} />
          </button>
        )}
      </span>
    </th>
  );
  return (
    <section className="az-page az-announcements">
      <div className="az-prospecting-head">
        <div>
          <h1>{t("announcementsTitle")}</h1>
          <p className="az-muted">{t("announcementsDescription")}</p>
        </div>
        <button className="az-button az-primary" aria-disabled="true" title={t("outside")}>
          <Plus size={18} />
          {t("addAnnouncement")}
        </button>
      </div>
      <div className="az-card az-announcements-card">
        <div className="az-table-toolbar az-ann-toolbar">
          <div className="az-pill-tabs" role="tablist" aria-label={t("priority")}>
            {(["all", ...priorities] as const).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "is-active" : ""}
                onClick={() => {
                  setTab(key);
                  setPage(1);
                }}
              >
                {t(key === "all" ? "allTab" : priorityLabel[key])}
              </button>
            ))}
          </div>
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
        {error && (
          <p className="az-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="az-table-scroll" role="region" aria-label={t("announcementsTitle")}>
          <table className="az-table">
            <thead>
              <tr>
                {header("name", "announcementsTitle", Bell)}
                {header("priority", "priority", Flag)}
                {header(null, "sourceColumn", Layers)}
                {header("frequency", "frequency", Activity)}
                {header("enabled", "statusColumn", Flag)}
                {header(null, "actionsColumn", MousePointerClick)}
              </tr>
            </thead>
            <tbody>
              {items === null && !error ? (
                <tr>
                  <td colSpan={6} className="az-table-empty">
                    {t("loading")}
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="az-table-empty">
                    {t("noMatches")}
                  </td>
                </tr>
              ) : (
                visible.map((item) => (
                  <tr key={item.id}>
                    <td>{name(item.id)}</td>
                    <td>
                      <span className={`az-pill az-priority-${item.priority}`}>
                        {t(priorityLabel[item.priority])}
                      </span>
                    </td>
                    <td>
                      <span className="az-pill az-pill-gray">{t("standardSource")}</span>
                    </td>
                    <td>{t(item.frequency)}</td>
                    <td>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.enabled}
                        aria-label={name(item.id)}
                        disabled={item.locked}
                        title={item.locked ? t("lockedAnnouncement") : undefined}
                        className="az-switch-toggle"
                        onClick={() => toggle(item.id, !item.enabled)}
                      >
                        <span />
                      </button>
                    </td>
                    <td>
                      {item.locked ? (
                        <span
                          className="az-icon"
                          role="img"
                          aria-label={t("lockedAnnouncement")}
                          title={t("lockedAnnouncement")}
                        >
                          <Lock size={17} />
                        </span>
                      ) : (
                        <button
                          className="az-icon"
                          aria-disabled="true"
                          aria-label={`${t("editAnnouncement")}: ${name(item.id)}`}
                          title={t("outside")}
                        >
                          <Pencil size={17} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="az-table-footer">
          <p className="az-hint">{t("announcementCatalogGap")}</p>
          <nav className="az-pagination" aria-label={t("pagination")}>
            <label htmlFor="az-ann-page-size">{t("rowsPerPage")}</label>
            <select
              id="az-ann-page-size"
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
                .replace("{total}", String(filtered.length))}
            </span>
            <button
              className="az-button"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              {t("previous")}
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={`az-button az-page-number ${n === current ? "is-active" : ""}`}
                aria-current={n === current ? "page" : undefined}
                aria-label={`${t("page")} ${n}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
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
    </section>
  );
}
