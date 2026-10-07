import { z } from "zod";

// Only permissions actually readable in the supplied references. The remaining
// entries of the pictured 24-item catalog require the owner's confirmation.
export const scopeIds = [
  "companies.readonly",
  "locations.write",
  "locations.readonly",
  "saas/company.read",
  "saas/company.write",
  "saas/location.read",
  "saas/location.write",
  "snapshots.readonly",
] as const;
export type ScopeId = (typeof scopeIds)[number];
export const integrationInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(500),
  scopes: z
    .array(z.enum(scopeIds))
    .min(1)
    .transform((values) => [...new Set(values)]),
});
export type IntegrationInput = z.infer<typeof integrationInputSchema>;
export const tokenSchema = z.object({
  id: z.string(),
  value: z.string().startsWith("DEMO-NOT-A-CREDENTIAL-"),
  state: z.enum(["active", "pending", "revoked", "expired"]),
  createdAt: z.number(),
});
export const integrationSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().max(500),
  scopes: z.array(z.enum(scopeIds)),
  mode: z.literal("demo"),
  createdAt: z.number(),
  revoked: z.boolean(),
  rotationEndsAt: z.number().nullable(),
  tokens: z.array(tokenSchema),
});
export type Integration = z.infer<typeof integrationSchema>;
export type CredentialToken = z.infer<typeof tokenSchema>;
export const credentialStoreSchema = z.object({
  version: z.literal(1),
  integrations: z.array(integrationSchema),
});
export const ROTATION_DURATION = 7 * 24 * 60 * 60 * 1000;
export type CredentialErrorCode =
  | "notFound"
  | "revoked"
  | "rotationExists"
  | "noRotation"
  | "invalidToken"
  | "storage"
  | "invalidData";
export class CredentialError extends Error {
  constructor(public code: CredentialErrorCode) {
    super(code);
  }
}
