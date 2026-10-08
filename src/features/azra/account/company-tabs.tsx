"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Lightbulb,
  Maximize2,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { AssetPlaceholder, Modal } from "../ui";
import {
  addressCountries,
  addressSchema,
  companySettingsSchema,
  experienceToggles,
  featureToggles,
  hostnameSchema,
  sessionTimeouts,
  SUPPORT_ACCESS_DAYS,
  type Address,
  type CompanySettings,
  type ExperienceToggle,
  type FeatureToggle,
} from "./model";
import { getAccountService } from "./service";
import { accountErrorKey, CopyButton, Field, issueKeys } from "./fields";
import {
  agencyLogoUrl,
  BusinessApiError,
  deleteAgencyLogo,
  getAgencyLogo,
  uploadAgencyLogo,
  type AgencyLogoMeta,
} from "./businesses";

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
/** Loads company settings once and saves whole-object updates. */
function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const load = useCallback(() => {
    getAccountService()
      .getCompanySettings()
      .then(setSettings)
      .catch((e) => setError(accountErrorKey(e)));
  }, []);
  useEffect(load, [load]);
  // Sections edit independent parts; merge each patch into freshly read
  // settings so one section never overwrites another section's changes.
  async function save(patch: Partial<CompanySettings>) {
    const previous = settings;
    if (settings) setSettings({ ...settings, ...patch });
    try {
      const service = getAccountService();
      const fresh = await service.getCompanySettings();
      setSettings(await service.saveCompanySettings({ ...fresh, ...patch }));
      setError(null);
      return true;
    } catch (e) {
      setSettings(previous);
      setError(accountErrorKey(e));
      return false;
    }
  }
  return { settings, error, save };
}
function Section({
  title,
  description,
  children,
}: {
  title: MessageKey;
  description: MessageKey;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="az-split az-company-section">
      <div className="az-split-intro">
        <h3>{t(title)}</h3>
        <p className="az-muted">{t(description)}</p>
      </div>
      <div className="az-card">{children}</div>
    </div>
  );
}
function Footer({
  dirty,
  status,
  onCancel,
}: {
  dirty: boolean;
  status: MessageKey | null;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="az-card-footer">
      <p className="az-muted" role="status">
        {status ? t(status) : ""}
      </p>
      <button type="button" className="az-button" disabled={!dirty} onClick={onCancel}>
        {t("cancel")}
      </button>
      <button className="az-button az-primary" disabled={!dirty}>
        {t("saveCompany")}
      </button>
    </div>
  );
}
function Toggle({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="az-switch-toggle"
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
function ErrorLine({ error }: { error: MessageKey | null }) {
  const { t } = useLanguage();
  return error ? (
    <p className="az-error" role="alert">
      {t(error)}
    </p>
  ) : null;
}

type AddressDraft = Omit<Address, "country"> & { country: Address["country"] | "" };
const emptyAddress: AddressDraft = {
  street: "",
  city: "",
  postalCode: "",
  region: "",
  country: "",
  timezone: "",
};
export function AddressSection() {
  const { t, locale } = useLanguage();
  const { settings, error, save } = useCompanySettings();
  const [draft, setDraft] = useState<AddressDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, MessageKey>>({});
  const [status, setStatus] = useState<MessageKey | null>(null);
  const saved: AddressDraft = settings?.address ?? emptyAddress;
  const value = draft ?? saved;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const countryName = useMemo(() => {
    const names = new Intl.DisplayNames([locale === "es" ? "es-SV" : "en-US"], { type: "region" });
    return (code: string) => names.of(code) ?? code;
  }, [locale]);
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const set = (patch: Partial<AddressDraft>) => {
    setDraft({ ...value, ...patch });
    setStatus(null);
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const parsed = addressSchema.safeParse(value);
    if (!parsed.success)
      return setErrors(issueKeys(parsed.error.issues, { country: "errorRequired" }));
    setErrors({});
    if (await save({ address: parsed.data })) {
      setDraft(null);
      setStatus("sectionSaved");
    }
  }
  const input = (key: "street" | "city" | "postalCode" | "region", label: MessageKey) => (
    <Field id={`az-address-${key}`} label={label} required error={errors[key]}>
      <input
        id={`az-address-${key}`}
        value={value[key]}
        aria-invalid={!!errors[key] || undefined}
        aria-describedby={errors[key] ? `az-address-${key}-error` : undefined}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </Field>
  );
  return (
    <Section title="addressTitle" description="addressDescription">
      <form onSubmit={submit} noValidate>
        <div className="az-card-body az-stack">
          <ErrorLine error={error} />
          {input("street", "street")}
          <div className="az-form-grid">
            {input("city", "city")}
            {input("postalCode", "postalCode")}
            {input("region", "region")}
            <Field id="az-address-country" label="countryField" required error={errors.country}>
              <span className="az-select">
                <select
                  id="az-address-country"
                  value={value.country}
                  onChange={(e) => set({ country: e.target.value as Address["country"] })}
                >
                  <option value="" disabled>
                    {t("countryPlaceholder")}
                  </option>
                  {addressCountries.map((code) => (
                    <option key={code} value={code}>
                      {countryName(code)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </span>
            </Field>
          </div>
          <Field id="az-address-timezone" label="timezone" required error={errors.timezone}>
            <span className="az-select">
              <select
                id="az-address-timezone"
                value={value.timezone}
                onChange={(e) => set({ timezone: e.target.value })}
              >
                <option value="" disabled>
                  {t("timezonePlaceholder")}
                </option>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} aria-hidden="true" />
            </span>
          </Field>
        </div>
        <Footer
          dirty={dirty}
          status={status}
          onCancel={() => {
            setDraft(null);
            setErrors({});
          }}
        />
      </form>
    </Section>
  );
}

const featureMeta: Record<FeatureToggle, { title: MessageKey; description: MessageKey }> = {
  aiEmployee: { title: "aiEmployee", description: "aiEmployeeDescription" },
  workflowFeatures: {
    title: "workflowFeatures",
    description: "workflowFeaturesDescription",
  },
  externalAi: {
    title: "externalAiFeature",
    description: "externalAiDescription",
  },
  domainPurchase: {
    title: "domainPurchaseFeature",
    description: "domainPurchaseDescription",
  },
};
export function FeaturesSection() {
  const { t } = useLanguage();
  const { settings, error, save } = useCompanySettings();
  return (
    <Section title="featuresTitle" description="featuresDescription">
      <div className="az-card-body">
        <ErrorLine error={error} />
        <ul className="az-feature-toggles">
          {featureToggles.map((key) => {
            const meta = featureMeta[key];
            return (
              <li key={key}>
                <div className="az-toggle-row">
                  <Toggle
                    label={t(meta.title)}
                    checked={settings?.features[key] ?? false}
                    disabled={!settings}
                    onChange={(checked) =>
                      settings && save({ features: { ...settings.features, [key]: checked } })
                    }
                  />
                  <div>
                    <strong>{t(meta.title)}</strong>
                    <p className="az-muted">{t(meta.description)}</p>
                  </div>
                </div>
                <div className="az-toggle-actions">
                  <button className="az-button" aria-disabled="true" title={t("outside")}>
                    <Lightbulb size={16} />
                    {t("moreInfo")}
                  </button>
                  <button className="az-button" aria-disabled="true" title={t("outside")}>
                    <Wrench size={16} />
                    {t("configure")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** Saved on the local server (admin only); shown in the sidebar logo tile. */
function LogoSection() {
  const { t } = useLanguage();
  const [saved, setSaved] = useState<AgencyLogoMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  // undefined = no change; File = replace; null = delete.
  const [draft, setDraft] = useState<{ file: File; url: string } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    getAgencyLogo(controller.signal)
      .then((logo) => {
        setSaved(logo);
        setLoaded(true);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError(errorText(e, t("errorGeneric")));
      });
    return () => controller.abort();
  }, [t]);
  useEffect(() => () => void (draft && URL.revokeObjectURL(draft.url)), [draft]);
  const shown = draft === undefined ? (saved ? agencyLogoUrl(saved) : null) : (draft?.url ?? null);
  function pick(file: File | undefined) {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return setError(t("errorImageType"));
    if (file.size > 2.5 * 1024 * 1024) return setError(t("errorImageSize"));
    setError(null);
    setStatus(null);
    setDraft({ file, url: URL.createObjectURL(file) });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (draft === undefined || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (draft) setSaved(await uploadAgencyLogo(draft.file));
      else {
        await deleteAgencyLogo();
        setSaved(null);
      }
      setDraft(undefined);
      setStatus(draft ? "logoSaved" : "logoDeleted");
    } catch (e) {
      setError(errorText(e, t("errorGeneric")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="logoTitle" description="logoDescription">
      <form onSubmit={submit}>
        <div className="az-card-body">
          <div
            className="az-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files[0]);
            }}
          >
            <div className="az-logo-preview">
              {shown ? <img src={shown} alt={t("logoTitle")} /> : <AssetPlaceholder logo />}
            </div>
            <div>
              <p>{t("logoDrop")}</p>
              <p className="az-hint">{t("logoHintSaved")}</p>
              <div className="az-card-actions az-start">
                <input
                  ref={inputRef}
                  type="file"
                  hidden
                  accept={LOGO_TYPES.join(",")}
                  onChange={(e) => {
                    pick(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="az-button"
                  disabled={!loaded || busy}
                  onClick={() => inputRef.current?.click()}
                >
                  {shown ? t("replace") : t("uploadLogo")}
                </button>
                {shown && (
                  <button
                    type="button"
                    className="az-button az-danger az-square-small"
                    aria-label={t("deleteLogo")}
                    disabled={busy}
                    onClick={() => {
                      setDraft(saved ? null : undefined);
                      setStatus(null);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {error && (
                <p className="az-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="az-card-footer">
          <p className="az-muted" role="status">
            {busy ? t("loading") : status ? t(status) : ""}
          </p>
          <button
            type="button"
            className="az-button"
            disabled={draft === undefined || busy}
            onClick={() => setDraft(undefined)}
          >
            {t("cancel")}
          </button>
          <button className="az-button az-primary" disabled={draft === undefined || busy}>
            {t("saveCompany")}
          </button>
        </div>
      </form>
    </Section>
  );
}
const errorText = (error: unknown, fallback: string) =>
  error instanceof BusinessApiError && error.message ? error.message : fallback;
type WhiteLabel = CompanySettings["whiteLabel"];
function DomainField({
  id,
  label,
  help,
  placeholder,
  value,
  onSave,
}: {
  id: string;
  label: MessageKey;
  help: MessageKey;
  placeholder: MessageKey;
  value: string | null;
  onSave: (domain: string | null) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  return (
    <Field id={id} label={label} error={error} hint={value ? "domainPendingDns" : help}>
      {value ? (
        <div className="az-domain-chip">
          <code>{value}</code>
          <CopyButton value={value} />
          <button
            type="button"
            className="az-icon"
            aria-label={t("removeDomain")}
            onClick={() => onSave(null)}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="az-inline-add">
          <input
            id={id}
            value={text}
            placeholder={t(placeholder)}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
          />
          <button
            type="button"
            className="az-button"
            disabled={!text.trim()}
            onClick={async () => {
              const parsed = hostnameSchema.safeParse(text);
              if (!parsed.success) return setError("errorHostname");
              if (await onSave(parsed.data)) setText("");
            }}
          >
            <Plus size={16} />
            {t("addDomain")}
          </button>
        </div>
      )}
    </Field>
  );
}
function CodeSection({
  title,
  description,
  value,
  language,
  onSave,
}: {
  title: MessageKey;
  description: MessageKey;
  value: string;
  language: string;
  onSave: (code: string) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<MessageKey | null>(null);
  const code = draft ?? value;
  const lines = Math.max(1, code.split("\n").length);
  return (
    <Section title={title} description={description}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (draft !== null && (await onSave(draft))) {
            setDraft(null);
            setStatus("sectionSaved");
          }
        }}
      >
        <div className="az-card-body">
          <div className={`az-code ${expanded ? "is-expanded" : ""}`}>
            <pre aria-hidden="true">
              {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
            </pre>
            <textarea
              aria-label={`${t(title)} (${language})`}
              spellCheck={false}
              value={code}
              onChange={(e) => {
                setDraft(e.target.value);
                setStatus(null);
              }}
            />
            <div className="az-code-tools">
              <CopyButton value={code} />
              <button
                type="button"
                className="az-icon"
                aria-label={t("expandEditor")}
                aria-pressed={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          <p className="az-hint">{t("codeStoredOnly")}</p>
        </div>
        <Footer
          dirty={draft !== null && draft !== value}
          status={status}
          onCancel={() => setDraft(null)}
        />
      </form>
    </Section>
  );
}
export function WhiteLabelTab() {
  const { t } = useLanguage();
  const { settings, error, save } = useCompanySettings();
  const [policies, setPolicies] = useState<Pick<WhiteLabel, "privacyUrl" | "termsUrl"> | null>(
    null,
  );
  const [policyErrors, setPolicyErrors] = useState<Record<string, MessageKey>>({});
  const [policyStatus, setPolicyStatus] = useState<MessageKey | null>(null);
  const [theme, setTheme] = useState<WhiteLabel["theme"] | null>(null);
  const [themeStatus, setThemeStatus] = useState<MessageKey | null>(null);
  if (!settings) return <p className={error ? "az-error" : "az-muted"}>{t(error ?? "loading")}</p>;
  const wl = settings.whiteLabel;
  const saveWl = (patch: Partial<WhiteLabel>) => save({ whiteLabel: { ...wl, ...patch } });
  const policyValue = policies ?? { privacyUrl: wl.privacyUrl, termsUrl: wl.termsUrl };
  const themeValue = theme ?? wl.theme;
  return (
    <div className="az-company-tab">
      <h2 className="az-tab-title">{t("whiteLabel")}</h2>
      <ErrorLine error={error} />
      <LogoSection />
      <Section title="domainsTitle" description="domainsDescription">
        <div className="az-card-body az-stack">
          <DomainField
            id="az-wl-domain"
            label="whiteLabelDomain"
            help="whiteLabelDomainHelp"
            placeholder="whiteLabelDomainPlaceholder"
            value={wl.whiteLabelDomain}
            onSave={(whiteLabelDomain) => saveWl({ whiteLabelDomain })}
          />
          <DomainField
            id="az-api-domain"
            label="apiDomain"
            help="apiDomainHelp"
            placeholder="apiDomainPlaceholder"
            value={wl.apiDomain}
            onSave={(apiDomain) => saveWl({ apiDomain })}
          />
        </div>
      </Section>
      <Section title="policiesTitle" description="policiesDescription">
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = companySettingsSchema.shape.whiteLabel.safeParse({
              ...wl,
              privacyUrl: policyValue.privacyUrl.trim(),
              termsUrl: policyValue.termsUrl.trim(),
            });
            if (!parsed.success)
              return setPolicyErrors(
                issueKeys(parsed.error.issues, { privacyUrl: "errorUrl", termsUrl: "errorUrl" }),
              );
            setPolicyErrors({});
            if (await save({ whiteLabel: parsed.data })) {
              setPolicies(null);
              setPolicyStatus("sectionSaved");
            }
          }}
        >
          <div className="az-card-body az-stack">
            {(["privacyUrl", "termsUrl"] as const).map((key) => (
              <Field key={key} id={`az-wl-${key}`} label={key} error={policyErrors[key]}>
                <input
                  id={`az-wl-${key}`}
                  type="url"
                  placeholder={t(
                    key === "privacyUrl" ? "privacyUrlPlaceholder" : "termsUrlPlaceholder",
                  )}
                  value={policyValue[key]}
                  aria-invalid={!!policyErrors[key] || undefined}
                  aria-describedby={policyErrors[key] ? `az-wl-${key}-error` : undefined}
                  onChange={(e) => {
                    setPolicies({ ...policyValue, [key]: e.target.value });
                    setPolicyStatus(null);
                  }}
                />
              </Field>
            ))}
          </div>
          <Footer
            dirty={
              !!policies &&
              JSON.stringify(policies) !==
                JSON.stringify({ privacyUrl: wl.privacyUrl, termsUrl: wl.termsUrl })
            }
            status={policyStatus}
            onCancel={() => {
              setPolicies(null);
              setPolicyErrors({});
            }}
          />
        </form>
      </Section>
      <CodeSection
        title="customJsTitle"
        description="customJsDescription"
        language="JavaScript"
        value={wl.customJs}
        onSave={(customJs) => saveWl({ customJs })}
      />
      <CodeSection
        title="customCssTitle"
        description="customCssDescription"
        language="CSS"
        value={wl.customCss}
        onSave={(customCss) => saveWl({ customCss })}
      />
      <Section title="themeTitle" description="themeDescription">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (theme && (await saveWl({ theme }))) {
              setTheme(null);
              setThemeStatus("themePending");
            }
          }}
        >
          <div className="az-card-body">
            <fieldset className="az-theme-grid">
              <legend className="az-visually-hidden">{t("themeTitle")}</legend>
              {(["light", "dark"] as const).map((key) => (
                <label
                  key={key}
                  className={`az-theme-option ${themeValue === key ? "is-checked" : ""}`}
                >
                  <span className="az-theme-label">
                    <input
                      type="radio"
                      name="az-theme"
                      checked={themeValue === key}
                      onChange={() => {
                        setTheme(key);
                        setThemeStatus(null);
                      }}
                    />
                    {t(key === "light" ? "themeLight" : "themeDark")}
                  </span>
                  <span className={`az-theme-preview is-${key}`} aria-hidden="true">
                    <span className="az-theme-side" />
                    <span className="az-theme-main" />
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          <Footer
            dirty={!!theme && theme !== wl.theme}
            status={themeStatus}
            onCancel={() => setTheme(null)}
          />
        </form>
      </Section>
    </div>
  );
}

const warnings: Partial<Record<ExperienceToggle, MessageKey>> = {
  nps: "npsWarn",
  productGuides: "productGuidesWarn",
  dailyUpdates: "dailyUpdatesWarn",
};
function ConfirmDisable({
  toggle,
  onCancel,
  onConfirm,
}: {
  toggle: ExperienceToggle | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  const [ack, setAck] = useState(false);
  const name = toggle ? t(toggle) : "";
  return (
    <Modal
      open={!!toggle}
      onClose={() => {
        setAck(false);
        onCancel();
      }}
      label={fill(t("disableWarnTitle"), { name })}
    >
      <span className="az-warn-icon" aria-hidden="true">
        <CircleAlert size={20} />
      </span>
      <h2>{fill(t("disableWarnTitle"), { name })}</h2>
      {toggle && warnings[toggle] && (
        <p className="az-muted az-modal-text">{t(warnings[toggle]!)}</p>
      )}
      <label className="az-check az-ack">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>{t("churnAck")}</span>
      </label>
      <div className="az-card-actions">
        <button
          className="az-button"
          onClick={() => {
            setAck(false);
            onCancel();
          }}
        >
          {t("cancel")}
        </button>
        <button
          className="az-button az-danger"
          disabled={!ack}
          onClick={() => {
            setAck(false);
            onConfirm();
          }}
        >
          {fill(t("disableName"), { name })}
        </button>
      </div>
    </Modal>
  );
}
export function AdvancedTab() {
  const { t, locale } = useLanguage();
  const { settings, error, save } = useCompanySettings();
  const [confirming, setConfirming] = useState<ExperienceToggle | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [now] = useState(() => Date.now());
  if (!settings) return <p className={error ? "az-error" : "az-muted"}>{t(error ?? "loading")}</p>;
  const adv = settings.advanced;
  const saveAdv = (patch: Partial<typeof adv>) => save({ advanced: { ...adv, ...patch } });
  const supportActive = adv.supportAccessUntil !== null && adv.supportAccessUntil > now;
  const grant = () => saveAdv({ supportAccessUntil: now + SUPPORT_ACCESS_DAYS * 86_400_000 });
  const until = adv.supportAccessUntil
    ? new Date(adv.supportAccessUntil).toLocaleDateString(locale === "es" ? "es-SV" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  function setExperience(key: ExperienceToggle, value: boolean) {
    saveAdv({ experience: { ...adv.experience, [key]: value } });
  }
  return (
    <div className="az-company-tab">
      <h2 className="az-tab-title">{t("advanced")}</h2>
      <ErrorLine error={error} />
      <Section title="enhancedSecurity" description="enhancedSecurityDescription">
        <div className="az-card-body">
          <h3>{t("enhancedSecurityCard")}</h3>
          <p className="az-muted">{t("enhancedSecurityBody")}</p>
          <ol className="az-numbered">
            <li>{t("enhancedItem1")}</li>
            <li>{t("enhancedItem2")}</li>
            <li>{t("enhancedItem3")}</li>
          </ol>
          <p className="az-recommend">
            <Lightbulb size={16} aria-hidden="true" />
            {t("enhancedRecommend")}
          </p>
          <fieldset className="az-choice-grid">
            <legend className="az-visually-hidden">{t("enhancedSecurityCard")}</legend>
            {([true, false] as const).map((on) => (
              <label
                key={String(on)}
                aria-label={t(on ? "enabled" : "disabledOption")}
                className={`az-choice ${adv.enhancedSecurity === on ? "is-checked" : ""}`}
              >
                <span>
                  <strong>{t(on ? "enabled" : "disabledOption")}</strong>
                  <small>{t(on ? "enabledDescription" : "disabledDescription")}</small>
                </span>
                <input
                  type="radio"
                  name="az-enhanced"
                  checked={adv.enhancedSecurity === on}
                  onChange={() => saveAdv({ enhancedSecurity: on })}
                />
              </label>
            ))}
          </fieldset>
        </div>
      </Section>
      <Section title="sessionTimeoutTitle" description="sessionTimeoutDescription">
        <div className="az-card-body">
          <p>{t("sessionTimeoutBody")}</p>
          <span className="az-select az-select-narrow">
            <select
              aria-label={t("sessionTimeoutTitle")}
              value={adv.sessionTimeout}
              onChange={(e) =>
                saveAdv({ sessionTimeout: e.target.value as (typeof sessionTimeouts)[number] })
              }
            >
              {sessionTimeouts.map((key) => (
                <option key={key} value={key}>
                  {t(`t${key}` as MessageKey)}
                </option>
              ))}
            </select>
            <ChevronDown size={18} aria-hidden="true" />
          </span>
        </div>
      </Section>
      <Section title="supportTitle" description="supportDescription">
        <div className="az-card-body">
          <div className="az-toggle-row">
            <Toggle
              label={t("supportTitle")}
              checked={supportActive}
              onChange={(checked) => (checked ? grant() : setRevoking(true))}
            />
            <strong>{t("supportTitle")}</strong>
          </div>
          {supportActive && (
            <>
              <p className="az-success-note">
                <CheckCircle2 size={16} aria-hidden="true" />
                {fill(t("supportActive"), { date: until })}
              </p>
              <p className="az-hint">{t("supportDemo")}</p>
              <div className="az-card-actions">
                <button className="az-button" onClick={grant}>
                  {t("extendAccess")}
                </button>
                <button className="az-button az-danger" onClick={() => setRevoking(true)}>
                  {t("revokeAccess")}
                </button>
              </div>
            </>
          )}
        </div>
      </Section>
      <Section title="experienceTitle" description="experienceDescription">
        <div className="az-card-body">
          <ul className="az-experience">
            {experienceToggles.map((key) => (
              <li key={key} className="az-toggle-row">
                <Toggle
                  label={t(key)}
                  checked={adv.experience[key]}
                  onChange={(checked) =>
                    !checked && warnings[key] ? setConfirming(key) : setExperience(key, checked)
                  }
                />
                <div>
                  <strong>{t(key)}</strong>
                  <p className="az-muted">{t(`${key}Description` as MessageKey)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>
      <ConfirmDisable
        toggle={confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) setExperience(confirming, false);
          setConfirming(null);
        }}
      />
      <Modal open={revoking} onClose={() => setRevoking(false)} label={t("revokeTitle")}>
        <h2>{t("revokeTitle")}</h2>
        <p className="az-muted az-modal-text">{t("revokeBody")}</p>
        <p className="az-warning-box">
          <AlertTriangle size={18} aria-hidden="true" />
          {t("revokeWarning")}
        </p>
        <div className="az-card-actions">
          <button className="az-button" onClick={() => setRevoking(false)}>
            {t("cancel")}
          </button>
          <button
            className="az-button az-danger"
            onClick={async () => {
              await saveAdv({ supportAccessUntil: null });
              setRevoking(false);
            }}
          >
            {t("revokeAccess")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
export function SsoTab() {
  const { t } = useLanguage();
  const [message, setMessage] = useState(false);
  return (
    <div className="az-company-tab az-card az-card-body az-sso">
      <div className="az-title-row">
        <h2>{t("sso")}</h2>
        <button className="az-text-button" aria-disabled="true" title={t("outside")}>
          {t("moreInfo")} <ExternalLink size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="az-muted">{t("ssoDescription")}</p>
      <div className="az-sso-body">
        <AssetPlaceholder />
        <button className="az-button az-primary" onClick={() => setMessage(true)}>
          {t("enableSso")}
        </button>
        {message && (
          <p className="az-notice" role="alert">
            {t("ssoPending")}
          </p>
        )}
      </div>
    </div>
  );
}
