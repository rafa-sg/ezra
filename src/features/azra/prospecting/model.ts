import { z } from "zod";

// Report sections readable in #5, in their pictured order. The list continues
// below the crop; nothing after "website performance" is invented.
export const reportSections = [
  { id: "address", children: [] },
  { id: "overallScore", children: [] },
  {
    id: "businessDetails",
    children: ["chatWidget", "textEnabledNumber", "websiteHosting", "reviewReplies"],
  },
  { id: "technoStack", children: [] },
  { id: "googleBusinessProfile", children: [] },
  { id: "listings", children: [] },
  { id: "onlineReputation", children: ["googleReviews", "facebookReviews"] },
  { id: "websitePerformance", children: [] },
] as const;
export type SectionId = (typeof reportSections)[number]["id"];
export type ItemId = SectionId | (typeof reportSections)[number]["children"][number];
export const sectionIds = reportSections.map((s) => s.id) as [SectionId, ...SectionId[]];
export const itemIds = reportSections.flatMap((s) => [s.id, ...s.children]) as [
  ItemId,
  ...ItemId[],
];
// Hosting services in #39 and their pictured default selection.
export const hostingProviders = [
  { id: "wordpress", name: "WordPress", initial: true },
  { id: "leadconnector", name: "LeadConnector", initial: true },
  { id: "leadconnectorAi", name: "LeadConnector AI Studio", initial: true },
  { id: "wix", name: "Wix", initial: false },
  { id: "webflow", name: "Webflow", initial: false },
  { id: "framer", name: "Framer", initial: false },
  { id: "squarespace", name: "Squarespace", initial: false },
] as const;
// Heatmap defaults. Only 3 x 3 / 1.9 mi are visible in #39; the other steps are
// a documented assumption so the owner can use the setting (premium gating removed).
export const gridSizes = [3, 5, 7] as const;
export const coverageKm = [3, 5, 10] as const;
export type HostingId = (typeof hostingProviders)[number]["id"];
const hostingIds = hostingProviders.map((h) => h.id) as [HostingId, ...HostingId[]];
// Getting-started steps in #38. Completion depends on features not yet built.
export const checklistSteps = [
  "stepAddProspect",
  "stepShareReport",
  "stepSendToCrm",
  "stepCaptureLeads",
  "stepAutoDiscover",
] as const;

export const prospectingSettingsSchema = z
  .object({
    version: z.literal(1),
    order: z.array(z.enum(sectionIds)),
    disabled: z.array(z.enum(itemIds)),
    hosting: z.array(z.enum(hostingIds)),
    checklistSkipped: z.boolean(),
    heatmapGrid: z.union([z.literal(3), z.literal(5), z.literal(7)]).default(3),
    heatmapCoverageKm: z.union([z.literal(3), z.literal(5), z.literal(10)]).default(3),
  })
  .refine(
    (value) =>
      value.order.length === sectionIds.length && new Set(value.order).size === sectionIds.length,
    { message: "order must be a permutation of the known sections" },
  );
export type ProspectingSettings = z.infer<typeof prospectingSettingsSchema>;
export const defaultProspectingSettings = (): ProspectingSettings => ({
  version: 1,
  order: [...sectionIds],
  // #5 pictures every visible section checked.
  disabled: [],
  hosting: hostingProviders.filter((h) => h.initial).map((h) => h.id),
  checklistSkipped: false,
  heatmapGrid: 3,
  heatmapCoverageKm: 3,
});
export type ProspectingErrorCode = "storage" | "invalidData";
export class ProspectingError extends Error {
  constructor(public code: ProspectingErrorCode) {
    super(code);
  }
}
