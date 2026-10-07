import {
  CredentialError,
  credentialStoreSchema,
  integrationInputSchema,
  ROTATION_DURATION,
  type Integration,
  type IntegrationInput,
  type ScopeId,
} from "./model";
import type { CredentialService } from "./service";
export interface DemoStorage {
  read(): string | null;
  write(value: string): void;
}

export class DemoCredentialService implements CredentialService {
  readonly mode = "demo" as const;
  constructor(
    private storage: DemoStorage,
    private now = () => Date.now(),
    private id = () => crypto.randomUUID(),
  ) {}
  private read(): Integration[] {
    try {
      const raw = this.storage.read();
      if (!raw) return [];
      const parsed = credentialStoreSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new CredentialError("invalidData");
      return parsed.data.integrations;
    } catch (error) {
      if (error instanceof CredentialError) throw error;
      throw new CredentialError("storage");
    }
  }
  private write(items: Integration[]) {
    try {
      this.storage.write(
        JSON.stringify(credentialStoreSchema.parse({ version: 1, integrations: items })),
      );
    } catch {
      throw new CredentialError("storage");
    }
  }
  private settle(item: Integration): Integration {
    if (item.rotationEndsAt !== null && this.now() >= item.rotationEndsAt) {
      item.tokens = item.tokens.map((token) => ({
        ...token,
        state:
          token.state === "pending" ? "active" : token.state === "active" ? "expired" : token.state,
      }));
      item.rotationEndsAt = null;
    }
    return item;
  }
  async list() {
    const items = this.read();
    const before = JSON.stringify(items);
    items.forEach((item) => this.settle(item));
    if (before !== JSON.stringify(items)) this.write(items);
    return items;
  }
  async get(id: string) {
    const item = (await this.list()).find((item) => item.id === id);
    if (!item) throw new CredentialError("notFound");
    return item;
  }
  private change(id: string, mutate: (item: Integration) => void) {
    // Synchronous read/modify/write inside each async public operation avoids
    // lost updates from overlapping operations in this browser tab.
    const items = this.read();
    const item = items.find((value) => value.id === id);
    if (!item) throw new CredentialError("notFound");
    this.settle(item);
    if (item.revoked) throw new CredentialError("revoked");
    mutate(item);
    this.write(items);
    return item;
  }
  async create(input: IntegrationInput) {
    const parsed = integrationInputSchema.safeParse(input);
    if (!parsed.success) throw new CredentialError("invalidData");
    const items = this.read();
    const item: Integration = {
      ...parsed.data,
      id: this.id(),
      mode: "demo",
      revoked: false,
      createdAt: this.now(),
      rotationEndsAt: null,
      tokens: [
        {
          id: this.id(),
          value: `DEMO-NOT-A-CREDENTIAL-${this.id()}`,
          state: "active",
          createdAt: this.now(),
        },
      ],
    };
    items.push(item);
    this.write(items);
    return item;
  }
  async updateScopes(id: string, scopes: ScopeId[]) {
    return this.change(id, (item) => {
      const parsed = integrationInputSchema.safeParse({ ...item, scopes });
      if (!parsed.success) throw new CredentialError("invalidData");
      item.scopes = parsed.data.scopes;
    });
  }
  async rotate(id: string) {
    return this.change(id, (item) => {
      if (item.rotationEndsAt !== null) throw new CredentialError("rotationExists");
      if (!item.tokens.some((token) => token.state === "active"))
        throw new CredentialError("invalidToken");
      item.tokens.unshift({
        id: this.id(),
        value: `DEMO-NOT-A-CREDENTIAL-${this.id()}`,
        state: "pending",
        createdAt: this.now(),
      });
      item.rotationEndsAt = this.now() + ROTATION_DURATION;
    });
  }
  async cancelRotation(id: string) {
    return this.change(id, (item) => {
      if (item.rotationEndsAt === null) throw new CredentialError("noRotation");
      item.tokens.forEach((token) => {
        if (token.state === "pending") token.state = "revoked";
      });
      item.rotationEndsAt = null;
    });
  }
  async revokeToken(id: string, tokenId: string) {
    return this.change(id, (item) => {
      const token = item.tokens.find((token) => token.id === tokenId);
      if (!token || !["active", "pending"].includes(token.state))
        throw new CredentialError("invalidToken");
      token.state = "revoked";
      if (item.rotationEndsAt !== null) {
        item.tokens.forEach((entry) => {
          if (entry.state === "pending") entry.state = "active";
        });
        item.rotationEndsAt = null;
      }
      if (!item.tokens.some((entry) => entry.state === "active")) item.revoked = true;
    });
  }
  async revokeIntegration(id: string) {
    return this.change(id, (item) => {
      item.revoked = true;
      item.rotationEndsAt = null;
      item.tokens.forEach((token) => {
        if (["active", "pending"].includes(token.state)) token.state = "revoked";
      });
    });
  }
}
