"use client";
import { useCallback, useEffect, useState } from "react";
import { House, Info, LogIn, Pin, Plus, Search } from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { AssetPlaceholder, Modal } from "../ui";
import { snapshotTemplates, type SnapshotId, type Subaccount } from "./model";
import { ACCOUNT_CHANGE_EVENT, getAccountService } from "./service";
import { accountErrorKey } from "./fields";

const fill = (text: string, name: string) => text.replace("{name}", name);
/** Sub-account picker anchored to the sidebar (#4, #21) with create flow (#5). */
export function AccountSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Subaccount[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const load = useCallback(() => {
    getAccountService()
      .listSubaccounts()
      .then((value) => {
        setItems(value);
        setError(null);
      })
      .catch((e) => setError(accountErrorKey(e)));
  }, []);
  useEffect(() => {
    if (!open) return;
    load();
    window.addEventListener(ACCOUNT_CHANGE_EVENT, load);
    return () => window.removeEventListener(ACCOUNT_CHANGE_EVENT, load);
  }, [open, load]);
  const needle = query.trim().toLocaleLowerCase();
  const matches = (items ?? []).filter(
    (item) => !needle || item.name.toLocaleLowerCase().includes(needle),
  );
  async function togglePin(item: Subaccount) {
    try {
      await getAccountService().setPinned(item.id, !item.pinned);
    } catch (e) {
      setError(accountErrorKey(e));
    }
  }
  async function create(snapshot: SnapshotId) {
    if (!creating) return;
    try {
      const item = await getAccountService().createSubaccount({ name: creating, snapshot });
      setCreated(fill(t("subaccountCreated"), item.name));
      setQuery("");
      setError(null);
    } catch (e) {
      setError(accountErrorKey(e));
    } finally {
      setCreating(null);
    }
  }
  return (
    <>
      <Modal
        open={open && !creating}
        onClose={() => {
          setCreated(null);
          onClose();
        }}
        label={t("switch")}
        className="az-switcher-dialog"
        dismissOnBackdrop
        hideClose
      >
        <div className="az-account-picker">
          <label className="az-search">
            <Search size={21} aria-hidden="true" />
            <input
              placeholder={t("accountSearch")}
              aria-label={t("accountSearch")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCreated(null);
              }}
            />
          </label>
          <p className="az-overline">{t("allAccounts")}</p>
          {created && (
            <p className="az-notice" role="status">
              {created}
            </p>
          )}
          {error && (
            <p className="az-error" role="alert">
              {t(error)}
            </p>
          )}
          {items === null && !error ? (
            <p className="az-muted">{t("loading")}</p>
          ) : matches.length ? (
            <ul className="az-account-list">
              {matches.map((item) => (
                <li className="az-account-row" key={item.id}>
                  <button onClick={onClose} className="az-account-select" title={t("goToAccount")}>
                    <span className="az-account-avatar" aria-hidden="true">
                      {item.name.charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.address ?? t("addressPending")}</small>
                    </span>
                    <House size={20} aria-hidden="true" />
                  </button>
                  <button
                    className={`az-icon az-pin ${item.pinned ? "is-pinned" : ""}`}
                    aria-label={`${t("pin")}: ${item.name}`}
                    aria-pressed={item.pinned}
                    onClick={() => togglePin(item)}
                  >
                    <Pin size={20} />
                  </button>
                </li>
              ))}
            </ul>
          ) : needle ? (
            <>
              <div className="az-no-match">
                <p>{t("emptyAccounts")}</p>
                <button className="az-text-button" onClick={() => setQuery("")}>
                  {t("clearSearch")}
                </button>
              </div>
              <div className="az-create-card">
                <span className="az-create-plus" aria-hidden="true">
                  <Plus size={20} />
                </span>
                <span className="az-create-text">
                  <strong>{fill(t("createNamed"), query.trim())}</strong>
                  <small>{t("createNamedDescription")}</small>
                </span>
                <button
                  className="az-button az-primary"
                  onClick={() => {
                    setCreated(null);
                    setCreating(query.trim());
                  }}
                >
                  <Plus size={16} />
                  {t("create")}
                </button>
              </div>
            </>
          ) : (
            <p className="az-muted">{t("noSubaccounts")}</p>
          )}
          <p className="az-muted az-demo-explanation">{t("demoDescription")}</p>
        </div>
      </Modal>
      <SnapshotPicker
        open={open && !!creating}
        onCancel={() => setCreating(null)}
        onSelect={create}
      />
    </>
  );
}
const tabs = [
  { key: "snapshotTemplates", count: snapshotTemplates.length },
  { key: "mySnapshots", count: 0 },
  { key: "importedSnapshots", count: 0 },
] as const;
function SnapshotPicker({
  open,
  onCancel,
  onSelect,
}: {
  open: boolean;
  onCancel: () => void;
  onSelect: (id: SnapshotId) => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("snapshotTemplates");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const visible =
    tab === "snapshotTemplates"
      ? snapshotTemplates.filter((item) =>
          (item.name ?? t("blankSnapshot")).toLocaleLowerCase().includes(needle),
        )
      : [];
  return (
    <Modal open={open} onClose={onCancel} label={t("snapshotTitle")} className="az-snapshot-dialog">
      <h2 className="az-snapshot-title">{t("snapshotTitle")}</h2>
      <div className="az-snapshot-body">
        <div className="az-tabs" role="tablist" aria-label={t("snapshotTitle")}>
          {tabs.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? "is-active" : ""}
              onClick={() => setTab(item.key)}
            >
              {t(item.key)} ({item.count})
            </button>
          ))}
        </div>
        <div className="az-snapshot-toolbar">
          <p className="az-hint">{t("snapshotCatalogGap")}</p>
          <label className="az-search-input">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder={t("snapshotSearch")}
              aria-label={t("snapshotSearch")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {visible.length ? (
          <ul className="az-snapshot-grid">
            {visible.map((item) => (
              <li key={item.id} className="az-snapshot-card" tabIndex={-1}>
                <span className={`az-snapshot-tag ${item.tag ? "" : "is-neutral"}`}>
                  {item.tag ?? t("blankSnapshot")}
                </span>
                {item.tag ? (
                  <AssetPlaceholder />
                ) : (
                  <span className="az-snapshot-blank" aria-hidden="true">
                    <Plus size={64} strokeWidth={3} />
                  </span>
                )}
                <strong>{item.name ?? t("blankSnapshot")}</strong>
                <span className="az-snapshot-actions">
                  <button className="az-button az-primary" onClick={() => onSelect(item.id)}>
                    <LogIn size={18} />
                    {t("selectContinue")}
                    <span className="az-visually-hidden">: {item.name ?? t("blankSnapshot")}</span>
                  </button>
                  {item.tag && (
                    <button className="az-button" aria-disabled="true" title={t("outside")}>
                      <Info size={18} />
                      {t("setupGuide")}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="az-muted az-snapshot-empty">
            {tab === "snapshotTemplates" ? t("noSnapshotMatches") : t("noSnapshots")}
          </p>
        )}
      </div>
      <div className="az-snapshot-footer">
        <button className="az-button" onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </Modal>
  );
}
