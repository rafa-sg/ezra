import type {
  AccountUser,
  Company,
  CompanySettings,
  Profile,
  SnapshotId,
  Subaccount,
} from "./model";
import { DemoAccountService } from "./demo";

export type AccountSnapshot = {
  relationshipId: string;
  profile: Profile | null;
  company: Company | null;
};
/** Profile, company and user screens depend only on this contract. A future
 * adapter must authenticate and authorize on its server, never in the UI. */
export interface AccountService {
  readonly mode: "demo" | "live";
  get(): Promise<AccountSnapshot>;
  updateProfile(input: Profile): Promise<Profile>;
  updateCompany(input: Company): Promise<Company>;
  listUsers(): Promise<AccountUser[]>;
  getCompanySettings(): Promise<CompanySettings>;
  /** Demo: stores preferences only; no domain, SSO, support session or script is activated. */
  saveCompanySettings(value: CompanySettings): Promise<CompanySettings>;
  listSubaccounts(): Promise<Subaccount[]>;
  /** Demo: records the name and template only; nothing is provisioned. */
  createSubaccount(input: { name: string; snapshot: SnapshotId }): Promise<Subaccount>;
  setPinned(id: string, pinned: boolean): Promise<Subaccount>;
  listPinnedBusinesses(): Promise<string[]>;
  setPinnedBusiness(id: string, pinned: boolean): Promise<string[]>;
  /** Not available without an authentication backend: always rejects. */
  changePassword(input: { current: string; next: string }): Promise<void>;
  /** Not available without an authentication backend: always rejects. */
  signOutEverywhere(): Promise<void>;
  /** Not available without an authentication backend: always rejects. */
  setupTwoFactor(): Promise<void>;
}
export const ACCOUNT_STORAGE_KEY = "azra:account:demo:v1";
export const ACCOUNT_CHANGE_EVENT = "azra-account";
let service: AccountService | undefined;
export function getAccountService(): AccountService {
  // Single provider selection point for account data.
  return (service ??= new DemoAccountService({
    read: () => localStorage.getItem(ACCOUNT_STORAGE_KEY),
    write: (value) => {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, value);
      window.dispatchEvent(new Event(ACCOUNT_CHANGE_EVENT));
    },
  }));
}
