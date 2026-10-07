import {
  AccountError,
  accountStoreSchema,
  companySchema,
  formatPhone,
  profileSchema,
  type AccountStore,
  type AccountUser,
  type Company,
  type Profile,
  type SnapshotId,
  type Subaccount,
  subaccountInputSchema,
  companySettingsSchema,
  type CompanySettings,
} from "./model";
import type { AccountService } from "./service";
import type { DemoStorage } from "../credentials/demo";

/** Browser-only demo. Starts empty: no person, company or user is seeded. */
export class DemoAccountService implements AccountService {
  readonly mode = "demo" as const;
  constructor(
    private storage: DemoStorage,
    private id = () => crypto.randomUUID(),
    private now = () => Date.now(),
  ) {}
  private read(): AccountStore & { fresh?: true } {
    let raw: string | null;
    try {
      raw = this.storage.read();
    } catch {
      throw new AccountError("storage");
    }
    if (!raw) {
      const digits = this.id().replace(/\D/g, "").padEnd(9, "0");
      return {
        fresh: true,
        version: 1,
        relationshipId: `DEMO-${digits.slice(0, 3)}-${digits.slice(3, 6)}`,
        ownerId: `demo-${this.id()}`,
        profile: null,
        company: null,
        subaccounts: [],
        companySettings: companySettingsSchema.parse({}),
      };
    }
    try {
      const parsed = accountStoreSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      /* Fall through: corrupt data is reported, never overwritten. */
    }
    throw new AccountError("invalidData");
  }
  private write(store: AccountStore) {
    // Zod strips the transient `fresh` marker before persisting.
    try {
      this.storage.write(JSON.stringify(accountStoreSchema.parse(store)));
    } catch {
      throw new AccountError("storage");
    }
  }
  async get() {
    const store = this.read();
    // Persist generated identifiers once so they stay stable after reloads.
    if (store.fresh) this.write(store);
    return { relationshipId: store.relationshipId, profile: store.profile, company: store.company };
  }
  async updateProfile(input: Profile) {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) throw new AccountError("invalidData");
    const store = this.read();
    store.profile = parsed.data;
    this.write(store);
    return parsed.data;
  }
  async updateCompany(input: Company) {
    const parsed = companySchema.safeParse(input);
    if (!parsed.success) throw new AccountError("invalidData");
    const store = this.read();
    store.company = parsed.data;
    this.write(store);
    return parsed.data;
  }
  async listUsers(): Promise<AccountUser[]> {
    const { profile, ownerId } = this.read();
    // The only known user is the owner of this local demo, once they saved a profile.
    if (!profile) return [];
    return [
      {
        id: ownerId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phone: formatPhone(profile.phone),
        type: "agencyOwner",
        role: null,
        subaccount: null,
      },
    ];
  }
  async getCompanySettings() {
    return this.read().companySettings;
  }
  async saveCompanySettings(value: CompanySettings) {
    const parsed = companySettingsSchema.safeParse(value);
    if (!parsed.success) throw new AccountError("invalidData");
    const store = this.read();
    store.companySettings = parsed.data;
    this.write(store);
    return parsed.data;
  }
  async listSubaccounts() {
    return this.read().subaccounts;
  }
  async createSubaccount(input: { name: string; snapshot: SnapshotId }) {
    const parsed = subaccountInputSchema.safeParse(input);
    if (!parsed.success) throw new AccountError("invalidData");
    const store = this.read();
    const key = parsed.data.name.toLocaleLowerCase();
    if (store.subaccounts.some((item) => item.name.toLocaleLowerCase() === key))
      throw new AccountError("duplicate");
    const item: Subaccount = {
      ...parsed.data,
      id: `demo-${this.id()}`,
      address: null,
      pinned: false,
      createdAt: this.now(),
    };
    store.subaccounts.push(item);
    this.write(store);
    return item;
  }
  async setPinned(id: string, pinned: boolean) {
    const store = this.read();
    const item = store.subaccounts.find((entry) => entry.id === id);
    if (!item) throw new AccountError("invalidData");
    item.pinned = pinned;
    this.write(store);
    return item;
  }
  async changePassword(): Promise<void> {
    throw new AccountError("notConnected");
  }
  async signOutEverywhere(): Promise<void> {
    throw new AccountError("notConnected");
  }
  async setupTwoFactor(): Promise<void> {
    throw new AccountError("notConnected");
  }
}
