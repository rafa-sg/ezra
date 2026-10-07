"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  House,
  Plus,
  Search,
  SquarePen,
  Trash2,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { href } from "../routes";
import { Modal } from "../ui";
import { CopyButton } from "./fields";
import {
  BusinessApiError,
  clientOrganizations,
  listAccessAccounts,
  saveClientAccess,
  type AccessAccount,
  type ClientOrganization,
} from "./businesses";

/** One row per pilot access slot: the administrator and each client organization. */
type Row = {
  id: string;
  name: string;
  email: string;
  type: "agencyOwner" | "clientUser" | "pendingAccess";
  role: string | null;
  subaccount: string | null;
  organizationId: AccessAccount["organizationId"];
  linked: boolean;
};
const orgName: Record<ClientOrganization, string> = {
  sgmotos: "Sgmotos",
  motoxspress: "motoxspress",
};
function toRows(accounts: AccessAccount[]): Row[] {
  const rows: Row[] = accounts.map((a) => ({
    id: a.username,
    name: a.displayName,
    email: a.email,
    type: a.role === "admin" ? "agencyOwner" : "clientUser",
    role: null,
    subaccount: a.organizationId === "owner" ? null : orgName[a.organizationId],
    organizationId: a.organizationId,
    linked: a.linked,
  }));
  for (const org of clientOrganizations)
    if (!accounts.some((a) => a.organizationId === org))
      rows.push({
        id: org,
        name: orgName[org],
        email: "",
        type: "pendingAccess",
        role: null,
        subaccount: orgName[org],
        organizationId: org,
        linked: false,
      });
  return rows;
}
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const PAGE_SIZES = [10, 20, 50];
type FilterKey = "type" | "role" | "subaccount";
const filterMeta: { key: FilterKey; label: MessageKey; icon: LucideIcon }[] = [
  { key: "type", label: "userType", icon: UserRound },
  { key: "role", label: "userRole", icon: UsersRound },
  { key: "subaccount", label: "subaccount", icon: Building2 },
];
export function UsersScreen() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    type: "",
    role: "",
    subaccount: "",
  });
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    listAccessAccounts(controller.signal)
      .then((accounts) => setUsers(toRows(accounts)))
      .catch((e) => {
        if ((e as Error).name !== "AbortError")
          setError(e instanceof BusinessApiError && e.message ? e.message : t("errorGeneric"));
      });
    return () => controller.abort();
  }, [t]);
  // Filter options come from loaded data only; no role or sub-account is invented.
  const options = useMemo(() => {
    const unique = (values: (string | null)[]) => [
      ...new Set(values.filter((v): v is string => !!v)),
    ];
    return {
      type: unique(users?.map((u) => u.type) ?? []),
      role: unique(users?.map((u) => u.role) ?? []),
      subaccount: unique(users?.map((u) => u.subaccount) ?? []),
    };
  }, [users]);
  const label = (key: FilterKey, value: string) =>
    key === "type" ? t(value as MessageKey) : value;
  const matches = (users ?? []).filter((user) => {
    if (filters.type && user.type !== filters.type) return false;
    if (filters.role && user.role !== filters.role) return false;
    if (filters.subaccount && user.subaccount !== filters.subaccount) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [user.name, user.email, user.id].some((field) => field.toLowerCase().includes(needle));
  });
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const current = Math.min(page, pages);
  const visible = matches.slice((current - 1) * pageSize, current * pageSize);
  const from = matches.length ? (current - 1) * pageSize + 1 : 0;
  const range = t("pageRange")
    .replace("{from}", String(from))
    .replace("{to}", String(from ? from + visible.length - 1 : 0))
    .replace("{total}", String(matches.length));
  function setFilter(key: FilterKey, value: string) {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  }
  return (
    <section className="az-page">
      <div className="az-card az-users">
        <h2>{t("users")}</h2>
        <div className="az-toolbar">
          <div className="az-filters" role="group" aria-label={t("filters")}>
            {filterMeta.map(({ key, label: name, icon: Icon }) => (
              <span className="az-chip" key={key}>
                <Icon size={17} aria-hidden="true" />
                <label htmlFor={`az-filter-${key}`}>{t(name)}</label>
                <span className="az-chip-select">
                  <select
                    id={`az-filter-${key}`}
                    value={filters[key]}
                    onChange={(e) => setFilter(key, e.target.value)}
                  >
                    <option value="">{t("all")}</option>
                    {options[key].map((value) => (
                      <option key={value} value={value}>
                        {label(key, value)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} aria-hidden="true" />
                </span>
                <button
                  type="button"
                  className="az-icon"
                  aria-label={`${t("clearFilter")}: ${t(name)}`}
                  disabled={!filters[key]}
                  onClick={() => setFilter(key, "")}
                >
                  <X size={15} />
                </button>
              </span>
            ))}
          </div>
          <div className="az-toolbar-end">
            <label className="az-search-input">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                placeholder={t("userSearch")}
                aria-label={t("search")}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <button className="az-button az-primary" aria-disabled="true" title={t("outside")}>
              <Plus size={18} />
              {t("addUser")}
            </button>
          </div>
        </div>
        {error && (
          <p className="az-error" role="alert">
            {error}
          </p>
        )}
        <div className="az-table-scroll" role="region" aria-label={t("users")}>
          <table className="az-table">
            <thead>
              <tr>
                <th scope="col">{t("name")}</th>
                <th scope="col">{t("emailField")}</th>
                <th scope="col">{t("phoneNumber")}</th>
                <th scope="col">{t("userType")}</th>
                <th scope="col">{t("subaccount")}</th>
                <th scope="col" className="az-col-action">
                  {t("action")}
                </th>
              </tr>
            </thead>
            <tbody>
              {users === null && !error ? (
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
                visible.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="az-user-name">
                        <span className="az-user-avatar" aria-hidden="true">
                          {initialsOf(user.name)}
                        </span>
                        {user.name}
                      </span>
                    </td>
                    <td>
                      <span className="az-user-email">{user.email || t("emailPending")}</span>
                      <span className="az-user-id">
                        {t("id")}: {user.id}
                        <CopyButton value={user.id} />
                      </span>
                    </td>
                    <td>-</td>
                    <td>
                      <span
                        className={`az-pill ${user.type === "pendingAccess" ? "az-priority-warning" : "az-pill-green"}`}
                      >
                        {t(user.type)}
                      </span>
                    </td>
                    <td>{user.subaccount ?? "-"}</td>
                    <td className="az-col-action">
                      {user.organizationId === "owner" ? (
                        <Link
                          className="az-icon"
                          href={href("settings/profile/general")}
                          aria-label={t("editUser")}
                          title={t("editUser")}
                        >
                          <SquarePen size={18} />
                        </Link>
                      ) : (
                        <button
                          className="az-icon"
                          aria-label={`${t(user.email ? "editAccess" : "assignEmail")}: ${user.name}`}
                          title={t(user.email ? "editAccess" : "assignEmail")}
                          onClick={() => setEditing(user)}
                        >
                          <SquarePen size={18} />
                        </button>
                      )}
                      <button
                        className="az-icon"
                        aria-disabled="true"
                        aria-label={t("deleteUser")}
                        title={t("ownerDeleteBlocked")}
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="az-table-footer">
          <nav className="az-breadcrumb" aria-label={t("breadcrumb")}>
            <Link href={href("ai/chat")} aria-label={t("home")}>
              <House size={18} />
            </Link>
            <span aria-hidden="true">/</span>
            <Link href={href("settings/profile/general")}>{t("settings")}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="az-breadcrumb-current">
              {t("users")}
            </span>
          </nav>
          <nav className="az-pagination" aria-label={t("pagination")}>
            <label htmlFor="az-page-size">{t("rowsPerPage")}</label>
            <span className="az-select az-select-small">
              <select
                id="az-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </span>
            <span>{range}</span>
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
      <AccessDialog
        key={editing?.id ?? "closed"}
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={(account) => {
          setUsers((rows) =>
            toRows([
              ...(rows ?? [])
                .filter(
                  (r) => r.type !== "pendingAccess" && r.organizationId !== account.organizationId,
                )
                .map((r) => ({
                  username: r.id,
                  organizationId: r.organizationId,
                  displayName: r.name,
                  email: r.email,
                  role: r.type === "agencyOwner" ? ("admin" as const) : ("client" as const),
                  linked: r.linked,
                })),
              account,
            ]),
          );
          setEditing(null);
        }}
      />
    </section>
  );
}

/** Same rules as the pilot «Accesos de tus clientes»; the server validates again. */
function AccessDialog({
  row,
  onClose,
  onSaved,
}: {
  row: Row | null;
  onClose: () => void;
  onSaved: (account: AccessAccount) => void;
}) {
  const { t } = useLanguage();
  const [email, setEmail] = useState(row?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!row || row.organizationId === "owner" || saving) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveClientAccess(row.organizationId, email));
    } catch (e) {
      setError(e instanceof BusinessApiError && e.message ? e.message : t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }
  const title = row ? `${t(row.email ? "editAccess" : "assignEmail")} · ${row.name}` : "";
  return (
    <Modal open={!!row} onClose={() => !saving && onClose()} label={title}>
      <form className="az-stack" onSubmit={submit}>
        <h2>{title}</h2>
        <p className="az-muted">{t("accessSubtitle")}</p>
        <div className="az-field">
          <label htmlFor="az-access-email">{t("emailField")}</label>
          <input
            id="az-access-email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            disabled={saving}
            value={email}
            placeholder="cliente@email.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          <small className="az-hint">{t("accessHint")}</small>
        </div>
        {error && (
          <p className="az-error" role="alert">
            {error}
          </p>
        )}
        <div className="az-card-actions">
          <button type="button" className="az-button" disabled={saving} onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="az-button az-primary" disabled={saving || !email.trim()}>
            {saving ? t("loading") : t("saveAccess")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
