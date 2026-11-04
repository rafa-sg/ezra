"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Camera, ChevronDown, Eye, EyeOff, Info, Mail } from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { href } from "../routes";
import { emptyProfile, languages, profileSchema, type Profile } from "./model";
import { getAccountService } from "./service";
import { accountErrorKey, Field, initials, issueKeys, PhoneInput, useAccount } from "./fields";

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
function ProfileLayout({
  active,
  children,
}: {
  active: "general" | "security";
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="az-page">
      <div className="az-profile-panel">
        <nav className="az-subnav" aria-label={t("profile")}>
          {(["general", "security"] as const).map((key) => (
            <Link
              key={key}
              href={href(`settings/profile/${key}`)}
              className={key === active ? "is-active" : ""}
              aria-current={key === active ? "page" : undefined}
            >
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="az-profile-content">{children}</div>
      </div>
    </section>
  );
}
export function ProfileGeneral() {
  const { t, locale, setLocale } = useLanguage();
  const { snapshot, error: loadError, reload } = useAccount();
  const [form, setForm] = useState<Profile | null>(null);
  const [errors, setErrors] = useState<Record<string, MessageKey>>({});
  const [status, setStatus] = useState<MessageKey | null>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<MessageKey | null>(null);
  const saved = snapshot
    ? (snapshot.profile ?? { ...emptyProfile, language: locale === "en" ? "en-US" : "es-SV" })
    : null;
  const value = form ?? saved;
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(saved);
  useEffect(() => () => void (image && URL.revokeObjectURL(image)), [image]);
  function update(patch: Partial<Profile>) {
    if (!value) return;
    setForm({ ...value, ...patch });
    setStatus(null);
  }
  function pickImage(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setImageError("errorImageType");
    if (file.size > MAX_IMAGE_BYTES) return setImageError("errorImageSize");
    setImageError(null);
    setImage(URL.createObjectURL(file));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value || busy) return;
    const trimmed = {
      ...value,
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      email: value.email.trim(),
      extension: value.extension.trim(),
      phone: { ...value.phone, number: value.phone.number.trim() },
    };
    const parsed = profileSchema.safeParse(trimmed);
    if (!parsed.success) {
      const found = issueKeys(parsed.error.issues, {
        email: "errorEmail",
        "phone.number": "errorPhone",
        extension: "errorExtension",
      });
      if (!trimmed.email) found.email = "errorRequired";
      return setErrors(found);
    }
    setErrors({});
    setBusy(true);
    setFailure(null);
    try {
      const result = await getAccountService().updateProfile(parsed.data);
      setForm(null);
      setStatus("profileSaved");
      setLocale(result.language === "en-US" ? "en" : "es");
    } catch (e) {
      setFailure(accountErrorKey(e));
    } finally {
      setBusy(false);
    }
  }
  const described = (field: string) => (errors[field] ? `az-profile-${field}-error` : undefined);
  return (
    <ProfileLayout active="general">
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
        <form className="az-card az-profile-form" onSubmit={submit} noValidate>
          <div className="az-card-body">
            <h2>{t("personalDetails")}</h2>
            <div className="az-avatar-row">
              <div className="az-avatar-upload">
                {image ? (
                  <img src={image} alt={t("profileImage")} />
                ) : (
                  <span aria-hidden="true">{initials(value.firstName, value.lastName)}</span>
                )}
                <label className="az-avatar-camera" title={t("changeImage")}>
                  <Camera size={16} />
                  <input
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    aria-label={t("changeImage")}
                    onChange={(event) => pickImage(event.target.files?.[0])}
                  />
                </label>
              </div>
              <div>
                <h3>{t("profileImage")}</h3>
                <p className="az-muted">{t("profileImageHint")}</p>
                {image && <p className="az-hint">{t("profileImageLocal")}</p>}
                {imageError && (
                  <p className="az-field-error" role="alert">
                    {t(imageError)}
                  </p>
                )}
              </div>
            </div>
            <div className="az-form-grid">
              <Field id="az-profile-firstName" label="firstName" required error={errors.firstName}>
                <input
                  id="az-profile-firstName"
                  autoComplete="given-name"
                  value={value.firstName}
                  aria-invalid={!!errors.firstName || undefined}
                  aria-describedby={described("firstName")}
                  onChange={(e) => update({ firstName: e.target.value })}
                />
              </Field>
              <Field id="az-profile-lastName" label="lastName" required error={errors.lastName}>
                <input
                  id="az-profile-lastName"
                  autoComplete="family-name"
                  value={value.lastName}
                  aria-invalid={!!errors.lastName || undefined}
                  aria-describedby={described("lastName")}
                  onChange={(e) => update({ lastName: e.target.value })}
                />
              </Field>
              <Field id="az-profile-email" label="emailField" required error={errors.email}>
                <span className="az-input-icon">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    id="az-profile-email"
                    type="email"
                    autoComplete="email"
                    value={value.email}
                    aria-invalid={!!errors.email || undefined}
                    aria-describedby={described("email")}
                    onChange={(e) => update({ email: e.target.value })}
                  />
                </span>
              </Field>
              <div className="az-phone-row">
                <Field
                  id="az-profile-phone.number"
                  label="phoneField"
                  error={errors["phone.number"]}
                >
                  <PhoneInput
                    id="az-profile-phone.number"
                    value={value.phone}
                    invalid={!!errors["phone.number"]}
                    onChange={(phone) => update({ phone })}
                  />
                </Field>
                <Field id="az-profile-extension" label="extension" error={errors.extension}>
                  <input
                    id="az-profile-extension"
                    inputMode="numeric"
                    placeholder={t("extension")}
                    value={value.extension}
                    aria-invalid={!!errors.extension || undefined}
                    aria-describedby={described("extension")}
                    onChange={(e) => update({ extension: e.target.value })}
                  />
                </Field>
              </div>
              <Field id="az-profile-language" label="platformLanguage">
                <span className="az-select">
                  <select
                    id="az-profile-language"
                    value={value.language}
                    onChange={(e) => update({ language: e.target.value as Profile["language"] })}
                  >
                    {languages.map((code) => (
                      <option key={code} value={code}>
                        {t(code === "es-SV" ? "languageEs" : "languageEn")}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} aria-hidden="true" />
                </span>
              </Field>
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
            <button className="az-button az-primary" disabled={!dirty || busy}>
              {busy ? t("loading") : t("updateProfile")}
            </button>
          </div>
        </form>
      )}
    </ProfileLayout>
  );
}
function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
}: {
  id: string;
  label: MessageKey;
  value: string;
  onChange: (value: string) => void;
  error?: MessageKey;
  autoComplete: string;
}) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  return (
    <Field id={id} label={label} required error={error}>
      <span className="az-password">
        <input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={t(label)}
          autoComplete={autoComplete}
          value={value}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="az-icon"
          aria-label={t("showPassword")}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      </span>
    </Field>
  );
}
export function ProfileSecurity() {
  const { t } = useLanguage();
  const blank = { current: "", next: "", confirm: "" };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof blank, MessageKey>>>({});
  const [passwordResult, setPasswordResult] = useState<MessageKey | null>(null);
  const [signOutResult, setSignOutResult] = useState<MessageKey | null>(null);
  const [twoFactorResult, setTwoFactorResult] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const complete = form.current && form.next && form.confirm;
  function set(field: keyof typeof blank, value: string) {
    setForm({ ...form, [field]: value });
    setPasswordResult(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: typeof errors = {};
    if (form.next.length < 8) found.next = "errorPasswordLength";
    else if (form.next === form.current) found.next = "errorPasswordSame";
    if (form.confirm !== form.next) found.confirm = "errorPasswordMatch";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await getAccountService().changePassword({ current: form.current, next: form.next });
    } catch (e) {
      // Without an authentication backend this always reports that nothing changed.
      setPasswordResult(accountErrorKey(e));
    } finally {
      setBusy(false);
    }
  }
  async function setupTwoFactor() {
    try {
      await getAccountService().setupTwoFactor();
    } catch (e) {
      setTwoFactorResult(accountErrorKey(e));
    }
  }
  async function signOut() {
    try {
      await getAccountService().signOutEverywhere();
    } catch (e) {
      setSignOutResult(accountErrorKey(e));
    }
  }
  return (
    <ProfileLayout active="security">
      <form className="az-card" onSubmit={submit} noValidate>
        <div className="az-card-body">
          <h2>{t("password")}</h2>
          <p className="az-muted az-card-lead">{t("passwordDescription")}</p>
          <PasswordField
            id="az-current-password"
            label="currentPassword"
            autoComplete="current-password"
            value={form.current}
            error={errors.current}
            onChange={(value) => set("current", value)}
          />
          <PasswordField
            id="az-new-password"
            label="newPassword"
            autoComplete="new-password"
            value={form.next}
            error={errors.next}
            onChange={(value) => set("next", value)}
          />
          <PasswordField
            id="az-confirm-password"
            label="confirmPassword"
            autoComplete="new-password"
            value={form.confirm}
            error={errors.confirm}
            onChange={(value) => set("confirm", value)}
          />
          {passwordResult && (
            <p className="az-notice" role="alert">
              {t(passwordResult)}
            </p>
          )}
          <div className="az-card-actions">
            <button
              type="button"
              className="az-button"
              onClick={() => {
                setForm(blank);
                setErrors({});
                setPasswordResult(null);
              }}
            >
              {t("cancel")}
            </button>
            <button className="az-button az-primary" disabled={!complete || busy}>
              {t("updatePassword")}
            </button>
          </div>
        </div>
      </form>
      <div className="az-card az-signout">
        <div>
          <h2>{t("signOutEverywhere")}</h2>
          <p className="az-muted">{t("signOutDescription")}</p>
          {signOutResult && (
            <p className="az-notice" role="alert">
              {t(signOutResult)}
            </p>
          )}
        </div>
        <button type="button" className="az-button az-outline" onClick={signOut}>
          {t("signOutEverywhere")}
        </button>
      </div>
      <div className="az-card az-card-body">
        <h2 className="az-inline-title">
          {t("twoFactorTitle")}
          <Info size={16} aria-label={t("twoFactorTitle")} />
        </h2>
        <p className="az-muted">{t("twoFactorDescription")}</p>
        {twoFactorResult && (
          <p className="az-notice" role="alert">
            {t(twoFactorResult)}
          </p>
        )}
        <div className="az-card-actions">
          <button type="button" className="az-button az-outline" onClick={setupTwoFactor}>
            {t("twoFactorSetup")}
          </button>
        </div>
      </div>
    </ProfileLayout>
  );
}
