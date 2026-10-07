import type { Integration, IntegrationInput, ScopeId } from "./model";
import { DemoCredentialService } from "./demo";

/** The UI depends only on this asynchronous contract. A future HTTP adapter
 * must enforce authentication/authorization on its server, not in the UI. */
export interface CredentialService {
  readonly mode: "demo" | "live";
  list(): Promise<Integration[]>;
  get(id: string): Promise<Integration>;
  create(input: IntegrationInput): Promise<Integration>;
  updateScopes(id: string, scopes: ScopeId[]): Promise<Integration>;
  rotate(id: string): Promise<Integration>;
  cancelRotation(id: string): Promise<Integration>;
  revokeToken(id: string, tokenId: string): Promise<Integration>;
  revokeIntegration(id: string): Promise<Integration>;
}
let service: CredentialService | undefined;
export function getCredentialService(): CredentialService {
  // This is the single provider selection point. Never supply real credentials
  // to the browser-storage adapter. It produces unmistakably fake values.
  return (service ??= new DemoCredentialService({
    read: () => localStorage.getItem("azra:credentials:demo:v1"),
    write: (value) => localStorage.setItem("azra:credentials:demo:v1", value),
  }));
}
