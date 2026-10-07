import { z } from "zod";

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
// Catalogs only contain values readable in #8. The full lists are pending.
export const businessCategories = ["creative"] as const;
export const businessNiches = [] as const;
export const primaryUses = ["other"] as const;

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
export const companySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(254),
  phone: phoneSchema,
  website: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]),
  category: z.enum(businessCategories),
  // No niche option is visible in #8, so the value cannot be required yet.
  niche: z.string().max(100),
  primaryUse: z.enum(primaryUses),
  primaryUseDetail: z.string().trim().max(200),
});
export type Company = z.infer<typeof companySchema>;
export type CompanyDraft = Omit<Company, "category" | "primaryUse"> & {
  category: Company["category"] | "";
  primaryUse: Company["primaryUse"] | "";
};
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
  company: companySchema.nullable(),
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
  category: "",
  niche: "",
  primaryUse: "",
  primaryUseDetail: "",
};
export const formatPhone = (phone: Profile["phone"]) =>
  phone.number ? `${dialCodes[phone.country]} ${phone.number}` : "";
