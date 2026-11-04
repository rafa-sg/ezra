import { sessionToken } from "./clerk-fixture";

/** Uses the SDK's verified session path with an isolated, offline Clerk API fixture. */
export function createLocalClient(base: string): typeof fetch {
  return async (input, init) => {
    if (String(input).includes("/api/automation/results")) return globalThis.fetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${sessionToken("owner", base)}`);
    return globalThis.fetch(input, { ...init, headers });
  };
}
