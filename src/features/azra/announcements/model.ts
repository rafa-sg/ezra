import { z } from "zod";

export const priorities = ["critical", "warning", "general"] as const;
export type Priority = (typeof priorities)[number];
export const frequencies = ["once", "daily", "always"] as const;
export type Frequency = (typeof frequencies)[number];
// Catalog readable in #20 (critical tab) and the owner's video (all tab, page 1).
// The provider lists 54; only legible rows are included. Reselling-related rows
// are left out because the owner excluded reselling from this product. `locked`
// mirrors the padlock (state cannot be changed) vs the pencil in the references.
export const announcementCatalog = [
  { id: "aiPricing", priority: "general", frequency: "once", enabled: true, locked: false },
  { id: "saasBilling", priority: "warning", frequency: "daily", enabled: false, locked: true },
  { id: "desktopReady", priority: "general", frequency: "once", enabled: true, locked: false },
  { id: "desktopPromo", priority: "general", frequency: "always", enabled: true, locked: false },
  { id: "desktopSetup", priority: "general", frequency: "always", enabled: true, locked: false },
  { id: "hipaaPhi", priority: "warning", frequency: "always", enabled: false, locked: true },
  { id: "desktopDownload", priority: "general", frequency: "daily", enabled: true, locked: false },
  { id: "hipaaBaa", priority: "warning", frequency: "always", enabled: false, locked: true },
  { id: "whatsappLite", priority: "general", frequency: "daily", enabled: false, locked: true },
  { id: "billingAddress", priority: "warning", frequency: "daily", enabled: false, locked: true },
  { id: "marketplaceAuth", priority: "warning", frequency: "always", enabled: false, locked: true },
  {
    id: "suspendedSubaccount",
    priority: "critical",
    frequency: "always",
    enabled: false,
    locked: true,
  },
  { id: "taxIdFailed", priority: "critical", frequency: "always", enabled: true, locked: false },
  { id: "hipaaCompliance", priority: "critical", frequency: "daily", enabled: true, locked: false },
  { id: "messageLimit", priority: "critical", frequency: "daily", enabled: true, locked: false },
  { id: "callBlocked", priority: "critical", frequency: "daily", enabled: false, locked: true },
  { id: "walletBalance", priority: "critical", frequency: "daily", enabled: false, locked: true },
  { id: "billingAccount", priority: "critical", frequency: "daily", enabled: false, locked: true },
  { id: "billingAgency", priority: "critical", frequency: "always", enabled: false, locked: true },
  { id: "emailBlocked", priority: "critical", frequency: "daily", enabled: true, locked: false },
  { id: "smsBlocked", priority: "critical", frequency: "daily", enabled: false, locked: true },
  { id: "stripeRevoked", priority: "critical", frequency: "daily", enabled: true, locked: false },
] as const satisfies readonly {
  id: string;
  priority: Priority;
  frequency: Frequency;
  enabled: boolean;
  locked: boolean;
}[];
export type AnnouncementId = (typeof announcementCatalog)[number]["id"];
const ids = announcementCatalog.map((a) => a.id) as [AnnouncementId, ...AnnouncementId[]];
export const announcementStateSchema = z.object({
  version: z.literal(1),
  // Only user changes are stored; locked rows can never appear here.
  enabled: z.partialRecord(z.enum(ids), z.boolean()),
});
export type AnnouncementState = z.infer<typeof announcementStateSchema>;
export class AnnouncementError extends Error {
  constructor(public code: "storage" | "invalidData" | "locked") {
    super(code);
  }
}
