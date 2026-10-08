"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Copy } from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { AccountError, countryCodes, dialCodes, type CountryCode } from "./model";
import {
  ACCOUNT_CHANGE_EVENT,
  accountStorageKey,
  getAccountService,
  type AccountSnapshot,
} from "./service";

export function accountErrorKey(error: unknown): MessageKey {
  if (!(error instanceof AccountError)) return "errorGeneric";
  const keys: Record<AccountError["code"], MessageKey> = {
    storage: "errorStorage",
    invalidData: "errorInvalidData",
    notConnected: "errorNotConnected",
    duplicate: "errorDuplicateName",
  };
  return keys[error.code];
}
/** Loads the account snapshot and refreshes it when this or another tab saves. */
export function useAccount() {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const load = useCallback(() => {
    getAccountService()
      .get()
      .then((value) => {
        setSnapshot(value);
        setError(null);
      })
      .catch((e) => setError(accountErrorKey(e)));
  }, []);
  useEffect(() => {
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.key === accountStorageKey()) load();
    };
    window.addEventListener(ACCOUNT_CHANGE_EVENT, load);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ACCOUNT_CHANGE_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);
  return { snapshot, error, reload: load };
}
export const initials = (first = "", last = "") =>
  `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase();
export function Field({
  id,
  label,
  required = false,
  error,
  hint,
  children,
}: {
  id: string;
  label: MessageKey;
  required?: boolean;
  error?: MessageKey | null;
  hint?: MessageKey;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className={`az-field ${error ? "has-error" : ""}`}>
      <label htmlFor={id}>
        {t(label)}
        {required && (
          <span className="az-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint && <small className="az-hint">{t(hint)}</small>}
      {error && (
        <small className="az-field-error" id={`${id}-error`} role="alert">
          {t(error)}
        </small>
      )}
    </div>
  );
}
const flags: Record<CountryCode, string> = {
  SV: "🇸🇻",
  GT: "🇬🇹",
  HN: "🇭🇳",
  NI: "🇳🇮",
  CR: "🇨🇷",
  PA: "🇵🇦",
  MX: "🇲🇽",
  US: "🇺🇸",
  ES: "🇪🇸",
};
export function PhoneInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: { country: CountryCode; number: string };
  onChange: (value: { country: CountryCode; number: string }) => void;
  invalid?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="az-phone">
      <span className="az-phone-country">
        <span aria-hidden="true">{flags[value.country]}</span>
        <ChevronDown size={14} aria-hidden="true" />
        <select
          aria-label={t("country")}
          value={value.country}
          onChange={(event) => onChange({ ...value, country: event.target.value as CountryCode })}
        >
          {countryCodes.map((code) => (
            <option key={code} value={code}>
              {flags[code]} {code} {dialCodes[code]}
            </option>
          ))}
        </select>
      </span>
      <span className="az-phone-dial">{dialCodes[value.country]}</span>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={value.number}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => onChange({ ...value, number: event.target.value })}
      />
    </div>
  );
}
export function CopyButton({ value, label }: { value: string; label?: MessageKey }) {
  const { t } = useLanguage();
  const [message, setMessage] = useState<MessageKey | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("copied");
    } catch {
      setMessage("copyFailed");
    }
  }
  return (
    <>
      <button
        type="button"
        className="az-icon az-copy"
        onClick={copy}
        aria-label={t(label ?? "copy")}
      >
        <Copy size={16} />
      </button>
      <span className="az-copy-message" role="status">
        {message ? t(message) : ""}
      </span>
    </>
  );
}
/** Maps Zod issue paths to the first message key per field. */
export function issueKeys(
  issues: { path: PropertyKey[]; code: string; message: string }[],
  overrides: Record<string, MessageKey> = {},
) {
  const result: Record<string, MessageKey> = {};
  for (const issue of issues) {
    const field = issue.path.map(String).join(".");
    if (result[field]) continue;
    // Custom rules already carry the interface key of their message.
    if (issue.code === "custom" && issue.message.startsWith("error")) {
      result[field] = issue.message as MessageKey;
      continue;
    }
    result[field] =
      issue.code === "too_big"
        ? "errorTooLong"
        : (overrides[field] ?? (issue.code === "too_small" ? "errorRequired" : "errorInvalidData"));
  }
  return result;
}
