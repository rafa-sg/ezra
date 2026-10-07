"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronDown, House, Info, LogIn, Pin, Plus, Search } from "lucide-react";
import { businessTypeLabels, type Business } from "@/lib/model";
import { useLanguage } from "../i18n";
import { AssetPlaceholder, Modal } from "../ui";
import { snapshotTemplates, type SnapshotId } from "./model";
import { getAccountService } from "./service";
import { BusinessApiError, createBusiness, listBusinesses, studioUrl } from "./businesses";

const fill = (text: string, name: string) => text.replace("{name}", name);
// Organizations accepted by the pilot API for an administrator (src/lib/businesses.ts).
const organizations = [
  { id: "owner", label: "organizationOwner" },
  { id: "sgmotos", label: "Sgmotos" },
  { id: "motoxspress", label: "motoxspress" },
] as const;
const apiMessage = (error: unknown) =>
  error instanceof BusinessApiError && error.message ? error.message : null;
/** Sub-account picker (#4, #21, #5): sub-accounts are the pilot's real businesses. */
export function AccountSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Business[] | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [step, setStep] = useState<"snapshot" | "details">("snapshot");
  const load = useCallback(() => {
    const controller = new AbortController();
    listBusinesses(controller.signal)
      .then((value) => {
        setItems(value);
        setError(null);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError(apiMessage(e) ?? t("errorGeneric"));
      });
    getAccountService()
      .listPinnedBusinesses()
      .then(setPinned)
      .catch(() => setPinned([]));
    return () => controller.abort();
  }, [t]);
  useEffect(() => {
    if (open) return load();
  }, [open, load]);
  const needle = query.trim().toLocaleLowerCase();
  const matches = (items ?? [])
    .filter((item) => !needle || item.name.toLocaleLowerCase().includes(needle))
    .sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
  async function togglePin(item: Business) {
    try {
      setPinned(await getAccountService().setPinnedBusiness(item.id, !pinned.includes(item.id)));
    } catch {
      setError(t("errorStorage"));
    }
  }
  function open_(item: Business) {
    window.location.assign(studioUrl(item.id));
  }
  return (
    <>
      <Modal
        open={open && !creating}
        onClose={onClose}
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
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <p className="az-overline">{t("allAccounts")}</p>
          {error && (
            <p className="az-error" role="alert">
              {error}
            </p>
          )}
          {items === null && !error ? (
            <p className="az-muted">{t("loading")}</p>
          ) : matches.length ? (
            <ul className="az-account-list">
              {matches.map((item) => (
                <li className="az-account-row" key={item.id}>
                  <button
                    onClick={() => open_(item)}
                    className="az-account-select"
                    title={t("openStudio")}
                  >
                    <span className="az-account-avatar" aria-hidden="true">
                      {item.name.charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.organizationName} · {businessTypeLabels[item.type]}
                      </small>
                    </span>
                    <House size={20} aria-hidden="true" />
                  </button>
                  <button
                    className={`az-icon az-pin ${pinned.includes(item.id) ? "is-pinned" : ""}`}
                    aria-label={`${t("pin")}: ${item.name}`}
                    aria-pressed={pinned.includes(item.id)}
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
                    setStep("snapshot");
                    setCreating(query.trim().slice(0, 120));
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
        </div>
      </Modal>
      <SnapshotPicker
        open={open && !!creating && step === "snapshot"}
        onCancel={() => setCreating(null)}
        onSelect={() => setStep("details")}
      />
      <BusinessDetails
        name={creating ?? ""}
        open={open && !!creating && step === "details"}
        onCancel={() => setCreating(null)}
        onCreated={(business) => {
          setCreating(null);
          setQuery("");
          window.location.assign(studioUrl(business.id));
        }}
      />
    </>
  );
}
/** Required pilot fields for a new business; the server validates them again. */
function BusinessDetails({
  name,
  open,
  onCancel,
  onCreated,
}: {
  name: string;
  open: boolean;
  onCancel: () => void;
  onCreated: (business: Business) => void;
}) {
  const { t } = useLanguage();
  const [type, setType] = useState<Business["type"] | "">("");
  const [organizationId, setOrganizationId] = useState("owner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!type || busy) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await createBusiness({ name, type, organizationId }));
    } catch (e) {
      setError(apiMessage(e) ?? t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onCancel} label={t("newBusinessTitle")}>
      <form onSubmit={submit} className="az-stack">
        <h2>{t("newBusinessTitle")}</h2>
        <p className="az-muted">
          {t("newBusinessName")}: <strong>{name}</strong>
        </p>
        <div className="az-field">
          <label htmlFor="az-new-type">
            {t("businessTypeField")}
            <span className="az-required" aria-hidden="true">
              {" "}
              *
            </span>
          </label>
          <span className="az-select">
            <select
              id="az-new-type"
              required
              value={type}
              onChange={(e) => setType(e.target.value as Business["type"])}
            >
              <option value="" disabled>
                {t("businessTypePlaceholder")}
              </option>
              {Object.entries(businessTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={18} aria-hidden="true" />
          </span>
        </div>
        <div className="az-field">
          <label htmlFor="az-new-org">{t("organizationField")}</label>
          <span className="az-select">
            <select
              id="az-new-org"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.label === "organizationOwner" ? t("organizationOwner") : org.label}
                </option>
              ))}
            </select>
            <ChevronDown size={18} aria-hidden="true" />
          </span>
        </div>
        <p className="az-hint">{t("snapshotNotApplied")}</p>
        {error && (
          <p className="az-error" role="alert">
            {error}
          </p>
        )}
        <div className="az-card-actions">
          <button type="button" className="az-button" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button className="az-button az-primary" disabled={!type || busy}>
            {busy ? t("loading") : t("createBusiness")}
          </button>
        </div>
      </form>
    </Modal>
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
