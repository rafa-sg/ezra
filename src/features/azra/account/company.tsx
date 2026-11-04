"use client";
import { useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";
import { useLanguage, type MessageKey } from "../i18n";
import { companySchema, emptyCompany, isPersonal, nichesFor, type CompanyDraft } from "./model";
import { audiences, categories, goals } from "./catalog";
import { getAccountService } from "./service";
import { accountErrorKey, CopyButton, Field, issueKeys, PhoneInput, useAccount } from "./fields";
import {
  AddressSection,
  AdvancedTab,
  FeaturesSection,
  SsoTab,
  WhiteLabelTab,
} from "./company-tabs";

const tabs = ["basic", "whiteLabel", "advanced", "sso"] as const;
export function CompanySettings() {
  const { t } = useLanguage();
  const { snapshot, error: loadError, reload } = useAccount();
  const [form, setForm] = useState<CompanyDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, MessageKey>>({});
  const [status, setStatus] = useState<MessageKey | null>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<(typeof tabs)[number]>("basic");
  const [attempted, setAttempted] = useState(false);
  const [nicheCleared, setNicheCleared] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const saved: CompanyDraft | null = snapshot ? (snapshot.company ?? emptyCompany) : null;
  const value = form ?? saved;
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(saved);
  const personal = !!value && isPersonal(value.audience, value.category);
  function validate(draft: CompanyDraft) {
    const trimmed = {
      ...draft,
      name: draft.name.trim(),
      email: draft.email.trim(),
      website: draft.website.trim(),
      phone: { ...draft.phone, number: draft.phone.number.trim() },
    };
    const parsed = companySchema.safeParse(trimmed);
    if (parsed.success) return { parsed: parsed.data, found: {} };
    const found = issueKeys(parsed.error.issues, {
      email: "errorEmail",
      website: "errorUrl",
      "phone.number": "errorPhone",
    });
    if (!trimmed.email) found.email = "errorRequired";
    return { parsed: null, found };
  }
  function update(patch: Partial<CompanyDraft>) {
    if (!value) return;
    const next = { ...value, ...patch };
    setForm(next);
    setStatus(null);
    // Errors appear after a save attempt and then follow the user's corrections.
    if (attempted) setErrors(validate(next).found);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value || busy) return;
    setAttempted(true);
    const { parsed, found } = validate(value);
    if (!parsed) {
      setErrors(found);
      // Move focus to the first invalid field, in visual order.
      const first = [
        ...(formRef.current?.querySelectorAll<HTMLElement>("[id^='az-company-']") ?? []),
      ].find((el) => found[el.id.replace("az-company-", "")]);
      first?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    setFailure(null);
    try {
      await getAccountService().updateCompany(parsed);
      setForm(null);
      setAttempted(false);
      setNicheCleared(false);
      setStatus("companySaved");
    } catch (e) {
      setFailure(accountErrorKey(e));
    } finally {
      setBusy(false);
    }
  }
  const aria = (field: string) => ({
    "aria-invalid": !!errors[field] || undefined,
    "aria-describedby": errors[field] ? `az-company-${field}-error` : undefined,
  });
  return (
    <section className="az-page az-company">
      <h1>{t("companySettings")}</h1>
      <div className="az-tabs" role="tablist" aria-label={t("companySettings")}>
        {tabs.map((key) => (
          <button
            key={key}
            role="tab"
            id={`az-company-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="az-company-panel"
            className={tab === key ? "is-active" : ""}
            onClick={() => setTab(key)}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div id="az-company-panel" role="tabpanel" aria-labelledby={`az-company-tab-${tab}`}>
        {tab === "whiteLabel" && <WhiteLabelTab />}
        {tab === "advanced" && <AdvancedTab />}
        {tab === "sso" && <SsoTab />}
        {tab === "basic" && (
          <>
            <div className="az-title-row">
              <h2>{t("basic")}</h2>
              {snapshot && (
                <div className="az-relationship">
                  <span className="az-muted">{t("relationshipNumber")}</span>
                  <strong>{snapshot.relationshipId}</strong>
                  <CopyButton value={snapshot.relationshipId} label="copy" />
                </div>
              )}
            </div>
            {loadError && (
              <div role="alert" className="az-error">
                {t(loadError)}{" "}
                <button className="az-text-button" onClick={reload}>
                  {t("retry")}
                </button>
              </div>
            )}
            {!value ? (
              !loadError && <p className="az-muted">{t("loading")}</p>
            ) : (
              <div className="az-split">
                <div className="az-split-intro">
                  <h3>{t("companyDetails")}</h3>
                  <p className="az-muted">{t("companyDetailsDescription")}</p>
                </div>
                <form className="az-card" onSubmit={submit} noValidate ref={formRef}>
                  <div className="az-card-body az-stack">
                    <Field id="az-company-name" label="companyName" required error={errors.name}>
                      <input
                        id="az-company-name"
                        autoComplete="organization"
                        value={value.name}
                        {...aria("name")}
                        onChange={(e) => update({ name: e.target.value })}
                      />
                    </Field>
                    <Field id="az-company-email" label="companyEmail" required error={errors.email}>
                      <input
                        id="az-company-email"
                        type="email"
                        autoComplete="email"
                        value={value.email}
                        {...aria("email")}
                        onChange={(e) => update({ email: e.target.value })}
                      />
                    </Field>
                    <Field
                      id="az-company-phone.number"
                      label="companyPhone"
                      error={errors["phone.number"]}
                    >
                      <PhoneInput
                        id="az-company-phone.number"
                        value={value.phone}
                        invalid={!!errors["phone.number"]}
                        onChange={(phone) => update({ phone })}
                      />
                    </Field>
                    <Field id="az-company-website" label="companyWebsite" error={errors.website}>
                      <input
                        id="az-company-website"
                        type="url"
                        autoComplete="url"
                        placeholder={t("companyWebsitePlaceholder")}
                        value={value.website}
                        {...aria("website")}
                        onChange={(e) => update({ website: e.target.value })}
                      />
                    </Field>
                    <ChoiceField
                      field="audience"
                      label="audienceQuestion"
                      required
                      options={audiences}
                      value={value.audience}
                      detail={value.audienceDetail}
                      errors={errors}
                      onChange={(audience) => update({ audience })}
                      onDetail={(audienceDetail) => update({ audienceDetail })}
                    />
                    <ChoiceField
                      field="primaryGoal"
                      label="primaryGoalQuestion"
                      required
                      options={goals}
                      value={value.primaryGoal}
                      detail={value.primaryGoalDetail}
                      errors={errors}
                      onChange={(primaryGoal) => update({ primaryGoal })}
                      onDetail={(primaryGoalDetail) => update({ primaryGoalDetail })}
                    />
                    <div className="az-form-grid">
                      <ChoiceField
                        field="category"
                        label="businessCategory"
                        required={!personal}
                        hint={personal ? "personalOptional" : undefined}
                        options={categories}
                        value={value.category}
                        detail={value.categoryDetail}
                        errors={errors}
                        onChange={(category) => {
                          // Keep the niche only if it still belongs to the new category.
                          const keep = nichesFor(category).some((n) => n.id === value.niche);
                          setNicheCleared(!!value.niche && !keep);
                          update({ category, niche: keep ? value.niche : "" });
                        }}
                        onDetail={(categoryDetail) => update({ categoryDetail })}
                      />
                      {value.category !== "other" && (
                        <ChoiceField
                          field="niche"
                          label="businessNiche"
                          required={!personal && !!value.category}
                          hint={
                            !value.category
                              ? "nicheNeedsCategory"
                              : nicheCleared
                                ? "nicheCleared"
                                : undefined
                          }
                          disabled={!value.category}
                          options={nichesFor(value.category)}
                          value={value.niche}
                          detail={value.nicheDetail}
                          errors={errors}
                          onChange={(niche) => {
                            setNicheCleared(false);
                            update({ niche });
                          }}
                          onDetail={(nicheDetail) => update({ nicheDetail })}
                        />
                      )}
                    </div>
                  </div>
                  <div className="az-card-footer">
                    <p className="az-muted" role="status">
                      {status ? t(status) : t("demoAccountNotice")}
                    </p>
                    {failure && (
                      <p className="az-error" role="alert">
                        {t(failure)}
                      </p>
                    )}
                    <button
                      type="button"
                      className="az-button"
                      disabled={!dirty || busy}
                      onClick={() => {
                        setForm(null);
                        setErrors({});
                        setAttempted(false);
                        setNicheCleared(false);
                      }}
                    >
                      {t("cancel")}
                    </button>
                    <button className="az-button az-primary" disabled={!dirty || busy}>
                      {busy ? t("loading") : t("saveCompany")}
                    </button>
                  </div>
                </form>
              </div>
            )}
            <AddressSection />
            <FeaturesSection />
          </>
        )}
      </div>
    </section>
  );
}

/** Single-select with the shared placeholder and an «Especificá cuál» field for «Otro». */
function ChoiceField<T extends string>({
  field,
  label,
  required = false,
  hint,
  disabled = false,
  options,
  value,
  detail,
  errors,
  onChange,
  onDetail,
}: {
  field: string;
  label: MessageKey;
  required?: boolean;
  hint?: MessageKey;
  disabled?: boolean;
  options: readonly { id: T; label: { es: string; en: string } }[];
  value: string;
  detail: string;
  errors: Record<string, MessageKey>;
  onChange: (value: T | "") => void;
  onDetail: (value: string) => void;
}) {
  const { t, locale } = useLanguage();
  const id = `az-company-${field}`;
  const detailField = `${field}Detail`;
  const detailId = `az-company-${detailField}`;
  const describe = (key: string) => (errors[key] ? `az-company-${key}-error` : undefined);
  return (
    <div className="az-stack-tight">
      <Field id={id} label={label} required={required} error={errors[field]} hint={hint}>
        <span className="az-select">
          <select
            id={id}
            value={value}
            disabled={disabled}
            aria-invalid={!!errors[field] || undefined}
            aria-describedby={describe(field)}
            onChange={(e) => onChange(e.target.value as T | "")}
          >
            <option value="">{t("selectOption")}</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label[locale]}
              </option>
            ))}
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </span>
      </Field>
      {value === "other" && (
        <Field id={detailId} label="specifyOther" required error={errors[detailField]}>
          <input
            id={detailId}
            maxLength={120}
            value={detail}
            aria-invalid={!!errors[detailField] || undefined}
            aria-describedby={describe(detailField)}
            onChange={(e) => onDetail(e.target.value)}
          />
        </Field>
      )}
    </div>
  );
}
