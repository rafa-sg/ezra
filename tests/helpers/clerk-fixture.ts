/** Offline HTTP regressions: Clerk SDK verifies real RSA signatures against this fake BAPI.
 * Not a live Clerk E2E test. No test bypass exists in application code. */
import { generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: "jwk" }),
  kid: "offline-fixture",
  alg: "RS256",
  use: "sig",
};
export const fixtureUsers = new Map<
  string,
  { email: string; verified?: boolean; banned?: boolean }
>([
  ["owner", { email: "owner@example.test" }],
  ["sgmotos", { email: "sgmotos@example.test" }],
  ["motoxspress", { email: "motoxspress@example.test" }],
  ["outsider", { email: "stranger@example.test" }],
  ["unverified", { email: "owner@example.test", verified: false }],
  ["replacement", { email: "new-sgmotos@example.test" }],
  ["duplicate", { email: "owner@example.test" }],
]);
let endpoint: Promise<string> | undefined;
let unavailable = false;
export function setClerkUnavailable(value: boolean) {
  unavailable = value;
}

function backend() {
  endpoint ||= new Promise<string>((resolve) => {
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (unavailable) {
        res.writeHead(503).end(JSON.stringify({ errors: [{ message: "Fixture offline" }] }));
        return;
      }
      if (req.url === "/v1/jwks") {
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      const id = req.url?.match(/^\/v1\/users\/user_(\w+)$/)?.[1];
      const user = id && fixtureUsers.get(id);
      if (!user) {
        res.writeHead(404).end("{}");
        return;
      }
      res.end(
        JSON.stringify({
          id: `user_${id}`,
          object: "user",
          banned: user.banned || false,
          locked: false,
          primary_email_address_id: `email_${id}`,
          email_addresses: [
            {
              id: `email_${id}`,
              object: "email_address",
              email_address: user.email,
              verification: {
                status: user.verified === false ? "unverified" : "verified",
                strategy: "email_code",
              },
              linked_to: [],
            },
          ],
          phone_numbers: [],
          web3_wallets: [],
          external_accounts: [],
          enterprise_accounts: [],
          public_metadata: {},
          private_metadata: {},
          unsafe_metadata: {},
        }),
      );
    });
    server.listen(0, "127.0.0.1", () => {
      server.unref();
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
  return endpoint;
}

export function sessionToken(user = "owner", base = "http://127.0.0.1:3105", expiresIn = 60) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "RS256", typ: "JWT", kid: jwk.kid })}.${encode({
    iss: "https://offline-fixture.clerk.accounts.dev",
    sub: `user_${user}`,
    sid: `sess_${user}`,
    azp: base,
    iat: now,
    nbf: now - 5,
    exp: now + expiresIn,
    v: 2,
    sts: "active",
    fva: [0, -1],
  })}`;
  return `${payload}.${sign("RSA-SHA256", Buffer.from(payload), keys.privateKey).toString("base64url")}`;
}

export async function clerkTestEnvironment(directory: string) {
  if (!path.resolve(directory).startsWith(path.resolve("work") + path.sep))
    throw new Error("Test data must stay inside work/");
  try {
    await writeFile(
      path.join(directory, "access.json"),
      JSON.stringify({
        schemaVersion: 1,
        accounts: [
          {
            username: "admin",
            organizationId: "owner",
            role: "admin",
            displayName: "Test owner",
            email: "owner@example.test",
            clerkUserId: "",
          },
        ],
      }),
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return {
    CLERK_API_URL: await backend(),
    CLERK_SECRET_KEY: "sk_test_offline_fixture_only",
    // Clave publicable del mismo emisor ficticio: las pruebas no dependen de un .env.local.
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("offline-fixture.clerk.accounts.dev$").toString("base64")}`,
  };
}
