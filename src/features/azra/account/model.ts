import { z } from "zod";
import {
  audienceIds,
  categoryIds,
  goalIds,
  legacyCategories,
  nicheValid,
  nichesFor,
  personalAudiences,
  type Audience,
} from "./catalog";

// Dial codes offered by the phone selector. Only the El Salvador flag is visible
// in the references (#6/#8); the rest are a documented local convenience.
export const countryCodes = ["SV", "GT", "HN", "NI", "CR", "PA", "MX", "US", "ES"] as const;
export type CountryCode = (typeof countryCodes)[number];
export const dialCodes: Record<CountryCode, string> = {
  SV: "+503",
  GT: "+502",
  HN: "+504",
  NI: "+505",
  CR: "+506",
  PA: "+507",
  MX: "+52",
  US: "+1",
  ES: "+34",
};
export const languages = ["es-SV", "en-US"] as const;

const phoneSchema = z.object({
  country: z.enum(countryCodes),
  number: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9 ()-]*$/),
});
export const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  phone: phoneSchema,
  extension: z
    .string()
    .trim()
    .max(10)
    .regex(/^[0-9]*$/),
  language: z.enum(languages),
});
export type Profile = z.infer<typeof profileSchema>;
const detail = z.string().trim().max(120);
/** Shape stored in the browser demo; empty selections are allowed so older records load. */
const companyFields = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(254),
  phone: phoneSchema,
  website: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]),
  audience: z.union([z.literal(""), z.enum(audienceIds)]),
  audienceDetail: detail,
  primaryGoal: z.union([z.literal(""), z.enum(goalIds)]),
  primaryGoalDetail: detail,
  category: z.union([z.literal(""), z.enum(categoryIds)]),
  categoryDetail: detail,
  niche: z.string().max(60),
  nicheDetail: detail,
});
/**
 * Older demo records used `category: "creative"`, an unused `niche` and
 * `primaryUse/primaryUseDetail`. They are mapped explicitly, never discarded:
 * «Creativo» → «Arte, diseño y creatividad»; the old use becomes the main goal.
 */
export function migrateCompany(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const old = raw as Record<string, unknown>;
  const category = typeof old.category === "string" ? old.category : "";
  const next: Record<string, unknown> = {
    audience: "",
    audienceDetail: "",
    categoryDetail: "",
    nicheDetail: "",
    ...old,
    category: legacyCategories[category] ?? category,
  };
  if ("primaryUse" in old && !("primaryGoal" in old)) {
    next.primaryGoal = old.primaryUse === "other" ? "other" : "";
    next.primaryGoalDetail = typeof old.primaryUseDetail === "string" ? old.primaryUseDetail : "";
  }
  delete next.primaryUse;
  delete next.primaryUseDetail;
  // A niche that does not belong to the (mapped) category cannot be kept silently valid.
  if (
    typeof next.niche === "string" &&
    next.niche &&
    !nicheValid(String(next.category), next.niche)
  )
    next.niche = "";
  return next;
}
export const storedCompanySchema = z.preprocess(migrateCompany, companyFields);
export const isPersonal = (audience: string, category: string) =>
  personalAudiences.includes(audience as Audience) || category === "personal";
/**
 * Rules applied when saving. Messages are interface keys. «Otro» details are required
 * only while «Otro» is selected and are cleared otherwise; personal use does not
 * require a business category or niche.
 */
export const companySchema = companyFields
  .transform((c) => ({
    ...c,
    audienceDetail: c.audience === "other" ? c.audienceDetail : "",
    primaryGoalDetail: c.primaryGoal === "other" ? c.primaryGoalDetail : "",
    categoryDetail: c.category === "other" ? c.categoryDetail : "",
    niche: c.category && c.category !== "other" ? c.niche : "",
    nicheDetail: c.niche === "other" && c.category !== "other" ? c.nicheDetail : "",
  }))
  .superRefine((c, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const personal = isPersonal(c.audience, c.category);
    if (!c.audience) fail("audience", "errorRequired");
    else if (c.audience === "other" && !c.audienceDetail)
      fail("audienceDetail", "errorOtherDetail");
    if (!c.primaryGoal) fail("primaryGoal", "errorRequired");
    else if (c.primaryGoal === "other" && !c.primaryGoalDetail)
      fail("primaryGoalDetail", "errorOtherDetail");
    if (!c.category) {
      if (!personal) fail("category", "errorRequired");
    } else if (c.category === "other") {
      if (!c.categoryDetail) fail("categoryDetail", "errorOtherDetail");
    } else if (!c.niche) {
      if (!personal) fail("niche", "errorRequired");
    } else if (!nicheValid(c.category, c.niche)) fail("niche", "errorNicheInvalid");
    else if (c.niche === "other" && !c.nicheDetail) fail("nicheDetail", "errorOtherDetail");
  });
export type Company = z.infer<typeof companyFields>;
export type CompanyDraft = Company;
export { nichesFor };
export const userTypes = ["agencyOwner"] as const;
export const accountUserSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  type: z.enum(userTypes),
  role: z.string().nullable(),
  subaccount: z.string().nullable(),
});
export type AccountUser = z.infer<typeof accountUserSchema>;
// Only templates whose name is readable in the owner's captures. The provider
// shows 123; the rest (and those cropped in the second row) are not invented.
export const snapshotTemplates = [
  { id: "blank", name: null, tag: null },
  { id: "accounting-firm", name: "Accounting Firm", tag: "Finance" },
  { id: "affiliate-marketing-agency", name: "Affiliate Marketing Agency", tag: "Marketing Agency" },
  { id: "appliance-repair-shop", name: "Appliance Repair Shop", tag: "Home Services" },
] as const;
export const snapshotIds = snapshotTemplates.map((item) => item.id) as [
  (typeof snapshotTemplates)[number]["id"],
  ...(typeof snapshotTemplates)[number]["id"][],
];
export type SnapshotId = (typeof snapshotTemplates)[number]["id"];
export const subaccountInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  snapshot: z.enum(snapshotIds),
});
export const subaccountSchema = subaccountInputSchema.extend({
  id: z.string(),
  address: z.string().nullable(),
  pinned: z.boolean(),
  createdAt: z.number(),
});
export type Subaccount = z.infer<typeof subaccountSchema>;
// Address countries offered in the company form (video shows a country select).
export const addressCountries = [
  "SV",
  "GT",
  "HN",
  "NI",
  "CR",
  "PA",
  "MX",
  "US",
  "CA",
  "ES",
  "CO",
  "PE",
  "CL",
  "AR",
  "EC",
  "DO",
  "VE",
  "BR",
  "GB",
] as const;
const url = z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]);
const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
export const addressSchema = z.object({
  street: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(20),
  region: z.string().trim().min(1).max(100),
  country: z.enum(addressCountries),
  timezone: z.string().min(1).max(64),
});
export type Address = z.infer<typeof addressSchema>;
export const sessionTimeouts = ["4h", "8h", "12h", "1d", "2d", "3d", "never"] as const;
export const experienceToggles = [
  "nps",
  "productGuides",
  "dailyUpdates",
  "labsFeatures",
  "sampleData",
] as const;
export type ExperienceToggle = (typeof experienceToggles)[number];
export const featureToggles = [
  "aiEmployee",
  "workflowFeatures",
  "externalAi",
  "domainPurchase",
] as const;
export type FeatureToggle = (typeof featureToggles)[number];
export const SUPPORT_ACCESS_DAYS = 90;
export const companySettingsSchema = z.object({
  address: addressSchema.nullable().default(null),
  features: z
    .object(
      Object.fromEntries(featureToggles.map((k) => [k, z.boolean()])) as Record<
        FeatureToggle,
        z.ZodBoolean
      >,
    )
    .default({ aiEmployee: true, workflowFeatures: true, externalAi: true, domainPurchase: true }),
  whiteLabel: z
    .object({
      whiteLabelDomain: hostname.nullable(),
      apiDomain: hostname.nullable(),
      privacyUrl: url,
      termsUrl: url,
      // Stored only. The demo never executes custom JS nor injects custom CSS.
      customJs: z.string().max(20000),
      customCss: z.string().max(20000),
      theme: z.enum(["light", "dark"]),
    })
    .default({
      whiteLabelDomain: null,
      apiDomain: null,
      privacyUrl: "",
      termsUrl: "",
      customJs: "",
      customCss: "",
      theme: "light",
    }),
  advanced: z
    .object({
      enhancedSecurity: z.boolean(),
      sessionTimeout: z.enum(sessionTimeouts),
      supportAccessUntil: z.number().nullable(),
      experience: z.object(
        Object.fromEntries(experienceToggles.map((k) => [k, z.boolean()])) as Record<
          ExperienceToggle,
          z.ZodBoolean
        >,
      ),
    })
    .default({
      enhancedSecurity: true,
      sessionTimeout: "never",
      supportAccessUntil: null,
      experience: {
        nps: true,
        productGuides: true,
        dailyUpdates: true,
        labsFeatures: false,
        sampleData: true,
      },
    }),
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;
export const hostnameSchema = hostname;
export const accountStoreSchema = z.object({
  version: z.literal(1),
  relationshipId: z.string().startsWith("DEMO-"),
  ownerId: z.string(),
  profile: profileSchema.nullable(),
  company: storedCompanySchema.nullable(),
  subaccounts: z.array(subaccountSchema).default([]),
  companySettings: companySettingsSchema.default(companySettingsSchema.parse({})),
  pinnedBusinesses: z.array(z.string().max(100)).max(100).default([]),
});
export type AccountStore = z.infer<typeof accountStoreSchema>;
export type AccountErrorCode = "storage" | "invalidData" | "notConnected" | "duplicate";
export class AccountError extends Error {
  constructor(public code: AccountErrorCode) {
    super(code);
  }
}
export const emptyProfile: Profile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: { country: "SV", number: "" },
  extension: "",
  language: "es-SV",
};
export const emptyCompany: CompanyDraft = {
  name: "",
  email: "",
  phone: { country: "SV", number: "" },
  website: "",
  audience: "",
  audienceDetail: "",
  primaryGoal: "",
  primaryGoalDetail: "",
  category: "",
  categoryDetail: "",
  niche: "",
  nicheDetail: "",
};
export const formatPhone = (phone: Profile["phone"]) =>
  phone.number ? `${dialCodes[phone.country]} ${phone.number}` : "";
