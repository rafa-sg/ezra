import type { Business } from "@/lib/model";

/** Client for the pilot's existing, server-authorized business API. The server
 * enforces the Clerk session, the admin/client role and the data validation. */
export class BusinessApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function parse<T>(response: Response): Promise<T> {
  let data: { error?: string } & T;
  try {
    data = await response.json();
  } catch {
    throw new BusinessApiError("", response.status);
  }
  if (!response.ok) throw new BusinessApiError(data.error ?? "", response.status);
  return data;
}
export async function listBusinesses(signal?: AbortSignal): Promise<Business[]> {
  const response = await fetch("/api/businesses", { signal, cache: "no-store" });
  return (await parse<{ businesses: Business[] }>(response)).businesses;
}
export async function createBusiness(input: {
  name: string;
  type: Business["type"];
  organizationId: string;
}): Promise<Business> {
  const response = await fetch("/api/businesses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await parse<{ business: Business }>(response)).business;
}
/** Opens the pilot business studio, which keeps its own authorization checks. */
export const studioUrl = (id: string) => `/?business=${encodeURIComponent(id)}`;

/** Accounts known to the pilot access store (admin only, server-enforced). */
export type AccessAccount = {
  username: string;
  organizationId: "owner" | "sgmotos" | "motoxspress";
  displayName: string;
  email: string;
  role: "admin" | "client";
  linked: boolean;
};
export const clientOrganizations = ["sgmotos", "motoxspress"] as const;
export type ClientOrganization = (typeof clientOrganizations)[number];
export async function listAccessAccounts(signal?: AbortSignal): Promise<AccessAccount[]> {
  const response = await fetch("/api/auth/accounts", { signal, cache: "no-store" });
  return (await parse<{ accounts: AccessAccount[] }>(response)).accounts;
}
/** Assigns or changes the client e-mail; the server validates and rebinds. */
export async function saveClientAccess(organizationId: ClientOrganization, email: string) {
  const response = await fetch("/api/auth/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, email }),
  });
  return (await parse<{ account: AccessAccount }>(response)).account;
}

/** Agency logo stored by the server (admin only). */
export type AgencyLogoMeta = { mime: string; size: number; updatedAt: string };
export const AGENCY_LOGO_EVENT = "azra-agency-logo";
export const agencyLogoUrl = (logo: AgencyLogoMeta) =>
  `/api/agency/logo?v=${encodeURIComponent(logo.updatedAt)}`;
export async function getAgencyLogo(signal?: AbortSignal): Promise<AgencyLogoMeta | null> {
  const response = await fetch("/api/agency/logo?meta", { signal, cache: "no-store" });
  return (await parse<{ logo: AgencyLogoMeta | null }>(response)).logo;
}
export async function uploadAgencyLogo(file: File): Promise<AgencyLogoMeta> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/agency/logo", { method: "POST", body: form });
  const { logo } = await parse<{ logo: AgencyLogoMeta }>(response);
  window.dispatchEvent(new Event(AGENCY_LOGO_EVENT));
  return logo;
}
export async function deleteAgencyLogo(): Promise<void> {
  const response = await fetch("/api/agency/logo", { method: "DELETE" });
  await parse<{ logo: null }>(response);
  window.dispatchEvent(new Event(AGENCY_LOGO_EVENT));
}
