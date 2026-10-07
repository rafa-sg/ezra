"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  MoreHorizontal,
  Plus,
  Info,
  Shield,
} from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { href } from "../routes";
import { AssetPlaceholder, Modal } from "../ui";
import { CredentialError, scopeIds, type Integration, type ScopeId } from "./model";
import { getCredentialService } from "./service";
const base = "settings/integrations";
function errorKey(error: unknown): MessageKey {
  if (!(error instanceof CredentialError)) return "errorGeneric";
  const keys: Record<CredentialError["code"], MessageKey> = {
    notFound: "notFound",
    storage: "errorStorage",
    invalidData: "errorInvalidData",
    revoked: "errorRevoked",
    rotationExists: "errorRotationExists",
    noRotation: "errorNoRotation",
    invalidToken: "errorInvalidToken",
  };
  return keys[error.code];
}
function ErrorMessage({ error }: { error: MessageKey | null }) {
  const { t } = useLanguage();
  return error ? (
    <p role="alert" className="az-error">
      {t(error)}
    </p>
  ) : null;
}
function TokenValue({ value, masked = false }: { value: string; masked?: boolean }) {
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
      <div className="az-token-value">
        <code>{masked ? "••••••••••••••••••••••••••••••••" : value}</code>
        {!masked && (
          <button className="az-icon" onClick={copy} aria-label={t("copy")}>
            <Copy size={18} />
          </button>
        )}
      </div>
      <span className="az-copy-message" role="status">
        {message ? t(message) : ""}
      </span>
    </>
  );
}
export function ScopePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ScopeId[];
  onChange: (value: ScopeId[]) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="az-scope-picker">
      <label htmlFor="az-scopes">{t("scopes")}</label>
      <details>
        <summary id="az-scopes" aria-disabled={disabled}>
          {value.length ? `${value.length} ${t("selected")}` : t("selectScopes")}
          <ChevronDown size={18} />
        </summary>
        <div className="az-scope-options">
          <label>
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.length === scopeIds.length}
              onChange={(e) => onChange(e.target.checked ? [...scopeIds] : [])}
            />
            {t("selectAll")}
            <span>
              {value.length} {t("of")} {scopeIds.length}
            </span>
          </label>
          {scopeIds.map((scope) => (
            <label key={scope}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={value.includes(scope)}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...value, scope] : value.filter((item) => item !== scope),
                  )
                }
              />
              <span>
                {t(scope)}
                <small>{scope}</small>
              </span>
            </label>
          ))}
        </div>
      </details>
      <p className="az-muted">{t("scopeGap")}</p>
      <p className="az-muted">{t("writeWarning")}</p>
    </div>
  );
}
export function CredentialEntry({ apiKeys = false }: { apiKeys?: boolean }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [error, setError] = useState<MessageKey | null>(null);
  const load = useCallback(() => {
    if (!apiKeys)
      getCredentialService()
        .list()
        .then((items) => {
          const last = items.at(-1);
          if (last) router.replace(href(`${base}/${last.id}`));
        })
        .catch((e) => setError(errorKey(e)));
  }, [apiKeys, router]);
  useEffect(load, [load]);
  return (
    <section className="az-page">
      <h1>{t(apiKeys ? "apiKeys" : "integrations")}</h1>
      <ErrorMessage error={error} />
      {error && (
        <button className="az-button" onClick={load}>
          {t("retry")}
        </button>
      )}
      <div className="az-empty">
        <AssetPlaceholder />
        <h2>{t(apiKeys ? "noKeys" : "emptyTitle")}</h2>
        <p>{t(apiKeys ? "noKeysDescription" : "emptyDescription")}</p>
        {!apiKeys && (
          <button className="az-text-button" aria-disabled="true" title={t("outside")}>
            {t("learn")}
          </button>
        )}
        <Link
          className={`az-button ${apiKeys ? "az-green" : "az-primary"}`}
          href={href(`${base}/new`)}
        >
          <Plus size={18} />
          {t("createIntegration")}
        </Link>
      </div>
    </section>
  );
}
export function CredentialWizard() {
  const { t } = useLanguage();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopes, setScopes] = useState<ScopeId[]>([]);
  const [created, setCreated] = useState<Integration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setCreated(await getCredentialService().create({ name, description, scopes }));
    } catch (e) {
      setError(errorKey(e));
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (created) router.replace(href(`${base}/${created.id}`));
  }
  return (
    <section className="az-page az-credential-page az-wizard">
      <h1>
        {t("integrations")} <span className="az-api-version">{t("apiVersion")}</span>
      </h1>
      <div className="az-tabs">
        <button
          className={step === 0 ? "is-active" : ""}
          disabled={busy}
          onClick={() => setStep(0)}
        >
          {t("basicInfo")}
        </button>
        <button
          className={step === 1 ? "is-active" : ""}
          disabled={!name.trim() || busy}
          onClick={() => setStep(1)}
        >
          {t("scopes")}
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 0) setStep(1);
          else void create();
        }}
      >
        <div className="az-form-panel">
          <div className="az-form-intro">
            <span className="az-form-symbol">
              {step === 0 ? <Info size={28} /> : <Shield size={28} />}
            </span>
            <div>
              <h2>{t(step === 0 ? "basicInfo" : "scopes")}</h2>
              <p className="az-muted">{t(step === 0 ? "basicDescription" : "scopesDescription")}</p>
            </div>
          </div>
          {step === 0 ? (
            <>
              <label htmlFor="az-name">
                {t("name")} <span className="az-required">*</span>
              </label>
              <div className="az-counted-field">
                <input
                  id="az-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                  placeholder={t("namePlaceholder")}
                />
                <span className="az-count">{name.length} / 200</span>
              </div>
              <label htmlFor="az-description">{t("description")}</label>
              <div className="az-counted-field az-counted-area">
                <textarea
                  id="az-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={5}
                  placeholder={t("descriptionPlaceholder")}
                />
                <span className="az-count">{description.length} / 500</span>
              </div>
            </>
          ) : (
            <ScopePicker value={scopes} onChange={setScopes} disabled={busy} />
          )}
          <ErrorMessage error={error} />
        </div>
        <div className="az-form-actions">
          <Link className="az-button" href={href(base)}>
            {t("cancel")}
          </Link>
          <div>
            {step === 1 && (
              <button
                type="button"
                className="az-button"
                disabled={busy}
                onClick={() => setStep(0)}
              >
                {t("previous")}
              </button>
            )}
            <button
              className="az-button az-primary"
              disabled={busy || !name.trim() || (step === 1 && !scopes.length)}
            >
              {t(busy ? "loading" : step === 0 ? "next" : "create")}
            </button>
          </div>
        </div>
      </form>
      <Modal open={!!created} onClose={close} label={t("created")}>
        <div className="az-success">
          <span className="az-success-icon">
            <Check size={32} />
          </span>
          <h2>{t("created")}</h2>
          <p>{t("ready")}</p>
          <p className="az-error">{t("tokenWarning")}</p>
          {created && <TokenValue value={created.tokens[0].value} />}
          <p className="az-muted">{t("demoDescription")}</p>
          <button className="az-button az-primary" onClick={close}>
            {t("close")}
          </button>
        </div>
      </Modal>
    </section>
  );
}
export function CredentialDetail({ id }: { id: string }) {
  const { t, locale } = useLanguage();
  const [item, setItem] = useState<Integration | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [scopes, setScopes] = useState<ScopeId[]>([]);
  const load = useCallback(() => {
    getCredentialService()
      .get(id)
      .then((result) => {
        setItem(result);
        setError(null);
      })
      .catch((e) => setError(errorKey(e)));
  }, [id]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener("storage", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", load);
    };
  }, [load]);
  async function act(operation: () => Promise<Integration>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setItem(await operation());
      setEditing(false);
    } catch (e) {
      setError(errorKey(e));
    } finally {
      setBusy(false);
    }
  }
  const service = getCredentialService();
  const date = item?.rotationEndsAt
    ? new Intl.DateTimeFormat(locale === "es" ? "es-SV" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/El_Salvador",
      }).format(item.rotationEndsAt)
    : "";
  return (
    <section className="az-page az-credential-page">
      <Link className="az-breadcrumb" href={href("settings/api-keys")}>
        <ArrowLeft size={20} />
        {t("apiKeys")}
      </Link>
      <ErrorMessage error={error} />
      {error && (
        <button className="az-button" onClick={load}>
          {t("retry")}
        </button>
      )}
      {!item && !error && <p role="status">{t("loading")}</p>}
      {item && (
        <>
          <div className="az-title-row">
            <h1>{item.name}</h1>
            <details className="az-action-menu">
              <summary aria-label={t("actions")}>
                <MoreHorizontal size={24} />
              </summary>
              <div>
                <button
                  disabled={busy || item.revoked || item.rotationEndsAt !== null}
                  onClick={() => act(() => service.rotate(id))}
                >
                  {t("rotate")}
                </button>
                <button
                  disabled={busy || item.revoked}
                  onClick={() => {
                    setScopes(item.scopes);
                    setEditing(true);
                  }}
                >
                  {t("editScopes")}
                </button>
                <button
                  className="az-danger-text"
                  disabled={busy || item.revoked}
                  onClick={() => act(() => service.revokeIntegration(id))}
                >
                  {t("revoke")}
                </button>
                <Link href={href(`${base}/new`)}>{t("createIntegration")}</Link>
              </div>
            </details>
          </div>
          <p className="az-muted">{item.description}</p>
          <h2>{t("accessToken")}</h2>
          <p className="az-muted">{t("tokenUsage")}</p>
          {item.revoked && (
            <p className="az-warning" role="status">
              {t("revokedDescription")}
            </p>
          )}
          {item.tokens
            .filter(
              (token) => token.state === "active" || token.state === "pending" || item.revoked,
            )
            .map((token) => (
              <article className="az-token-card" key={token.id}>
                <div className="az-token-heading">
                  <h3>{t("accessToken")}</h3>
                  <span className={`az-status az-status-${token.state}`}>
                    {t(token.state === "pending" ? "pendingToken" : token.state)}
                  </span>
                </div>
                <TokenValue value={token.value} masked={token.state !== "pending"} />
                {token.state === "pending" && (
                  <div className="az-token-bottom">
                    <p className="az-muted">
                      {t("promoteAt")} {date}
                    </p>
                    <button
                      className="az-button az-danger"
                      disabled={busy}
                      onClick={() => act(() => service.cancelRotation(id))}
                    >
                      {t("cancelRotation")}
                    </button>
                  </div>
                )}
                {token.state === "active" && (
                  <div className="az-token-bottom">
                    {item.rotationEndsAt && (
                      <p className="az-warning">
                        {t("expireAt")} {date}
                      </p>
                    )}
                    <button
                      className="az-button"
                      disabled={busy}
                      onClick={() => act(() => service.revokeToken(id, token.id))}
                    >
                      {t(item.rotationEndsAt ? "expireNow" : "revokeToken")}
                    </button>
                  </div>
                )}
              </article>
            ))}
          <Modal open={editing} onClose={() => setEditing(false)} label={t("editScopes")}>
            <h2>{t("editScopes")}</h2>
            <ScopePicker value={scopes} onChange={setScopes} disabled={busy} />
            <ErrorMessage error={error} />
            <div className="az-form-actions">
              <button className="az-button" disabled={busy} onClick={() => setEditing(false)}>
                {t("cancel")}
              </button>
              <button
                className="az-button az-primary"
                disabled={busy || !scopes.length}
                onClick={() => act(() => service.updateScopes(id, scopes))}
              >
                {t("save")}
              </button>
            </div>
          </Modal>
        </>
      )}
    </section>
  );
}
