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
import type { AccountUser } from "./model";
import { getAccountService } from "./service";
import { accountErrorKey, CopyButton, initials, useAccount } from "./fields";

const PAGE_SIZES = [10, 20, 50];
type FilterKey = "type" | "role" | "subaccount";
const filterMeta: { key: FilterKey; label: MessageKey; icon: LucideIcon }[] = [
  { key: "type", label: "userType", icon: UserRound },
  { key: "role", label: "userRole", icon: UsersRound },
  { key: "subaccount", label: "subaccount", icon: Building2 },
];
export function UsersScreen() {
  const { t } = useLanguage();
  const { snapshot } = useAccount();
  const [users, setUsers] = useState<AccountUser[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    type: "",
    role: "",
    subaccount: "",
  });
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!snapshot) return;
    getAccountService()
      .listUsers()
      .then(setUsers)
      .catch((e) => setError(accountErrorKey(e)));
  }, [snapshot]);
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
    return [`${user.firstName} ${user.lastName}`, user.email, user.phone, user.id].some((field) =>
      field.toLowerCase().includes(needle),
    );
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
            {t(error)}
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
                    {users?.length ? (
                      t("noMatches")
                    ) : (
                      <>
                        {t("noUsers")}{" "}
                        <Link className="az-text-button" href={href("settings/profile/general")}>
                          {t("goToProfile")}
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                visible.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="az-user-name">
                        <span className="az-user-avatar" aria-hidden="true">
                          {initials(user.firstName, user.lastName)}
                        </span>
                        {user.firstName} {user.lastName}
                      </span>
                    </td>
                    <td>
                      <span className="az-user-email">{user.email}</span>
                      <span className="az-user-id">
                        {t("id")}: {user.id}
                        <CopyButton value={user.id} />
                      </span>
                    </td>
                    <td>{user.phone || "-"}</td>
                    <td>
                      <span className="az-pill az-pill-green">{t(user.type)}</span>
                    </td>
                    <td>{user.subaccount ?? "-"}</td>
                    <td className="az-col-action">
                      <Link
                        className="az-icon"
                        href={href("settings/profile/general")}
                        aria-label={t("editUser")}
                        title={t("editUser")}
                      >
                        <SquarePen size={18} />
                      </Link>
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
            <Link href={href("agency")} aria-label={t("home")}>
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
    </section>
  );
}
