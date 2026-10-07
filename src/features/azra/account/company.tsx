"use client";
import { useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import {
  businessCategories,
  businessNiches,
  companySchema,
  emptyCompany,
  primaryUses,
  type CompanyDraft,
} from "./model";
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
  const saved: CompanyDraft | null = snapshot ? (snapshot.company ?? emptyCompany) : null;
  const value = form ?? saved;
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(saved);
  function update(patch: Partial<CompanyDraft>) {
    if (!value) return;
    setForm({ ...value, ...patch });
    setStatus(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value || busy) return;
    const trimmed = {
      ...value,
      name: value.name.trim(),
      email: value.email.trim(),
      website: value.website.trim(),
      primaryUseDetail: value.primaryUseDetail.trim(),
      phone: { ...value.phone, number: value.phone.number.trim() },
    };
    const parsed = companySchema.safeParse(trimmed);
    if (!parsed.success) {
      const found = issueKeys(parsed.error.issues, {
        email: "errorEmail",
        website: "errorUrl",
        "phone.number": "errorPhone",
        category: "errorRequired",
        primaryUse: "errorRequired",
      });
      if (!trimmed.email) found.email = "errorRequired";
      return setErrors(found);
    }
    setErrors({});
    setBusy(true);
    setFailure(null);
    try {
      await getAccountService().updateCompany(parsed.data);
      setForm(null);
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
                <form className="az-card" onSubmit={submit} noValidate>
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
                    <div className="az-form-grid">
                      <Field
                        id="az-company-category"
                        label="businessCategory"
                        required
                        error={errors.category}
                      >
                        <span className="az-select">
                          <select
                            id="az-company-category"
                            value={value.category}
                            {...aria("category")}
                            onChange={(e) =>
                              update({ category: e.target.value as CompanyDraft["category"] })
                            }
                          >
                            <option value="" disabled>
                              {t("businessCategoryPlaceholder")}
                            </option>
                            {businessCategories.map((item) => (
                              <option key={item} value={item}>
                                {t(item)}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={18} aria-hidden="true" />
                        </span>
                      </Field>
                      <Field
                        id="az-company-niche"
                        label="businessNiche"
                        required
                        hint="catalogPending"
                      >
                        <span className="az-select">
                          <select
                            id="az-company-niche"
                            value=""
                            disabled={businessNiches.length === 0}
                          >
                            <option value="">{t("businessNichePlaceholder")}</option>
                          </select>
                          <ChevronDown size={18} aria-hidden="true" />
                        </span>
                      </Field>
                    </div>
                    <Field
                      id="az-company-primaryUse"
                      label="primaryUse"
                      hint="catalogPending"
                      error={errors.primaryUse ?? errors.primaryUseDetail}
                    >
                      <div className="az-joined">
                        <span className="az-select">
                          <select
                            id="az-company-primaryUse"
                            value={value.primaryUse}
                            {...aria("primaryUse")}
                            onChange={(e) =>
                              update({ primaryUse: e.target.value as CompanyDraft["primaryUse"] })
                            }
                          >
                            <option value="" disabled>
                              {t("primaryUsePlaceholder")}
                            </option>
                            {primaryUses.map((item) => (
                              <option key={item} value={item}>
                                {t(item)}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={18} aria-hidden="true" />
                        </span>
                        {value.primaryUse === "other" && (
                          <input
                            aria-label={t("primaryUseDetail")}
                            value={value.primaryUseDetail}
                            maxLength={200}
                            onChange={(e) => update({ primaryUseDetail: e.target.value })}
                          />
                        )}
                      </div>
                    </Field>
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
