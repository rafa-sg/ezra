import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { FLOW_COOKIE, SESSION_COOKIE, createSession, sign } from "../../src/lib/auth";

const base = "http://127.0.0.1:3105";
const secret = "a".repeat(48);
const clientId = "cliente-de-prueba.apps.googleusercontent.com";

test(
  "Inicio de sesión: rutas protegidas, Google, sesión y cierre",
  { timeout: 90000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directory = await mkdtemp(path.resolve("work/auth-test-"));
    const server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3105"],
      {
        env: {
          ...process.env,
          EZRA_DATA_DIR: directory,
          EZRA_AUTH: "",
          AUTH_GOOGLE_CLIENT_ID: clientId,
          AUTH_GOOGLE_CLIENT_SECRET: "secreto-de-prueba",
          AUTH_SECRET: secret,
          AUTH_ALLOWED_EMAILS: "dueno@example.com",
          EZRA_TO_N8N_SECRET: "",
          N8N_TO_EZRA_SECRET: "",
        },
        stdio: "pipe",
      },
    );
    let logs = "";
    server.stderr.on("data", (chunk) => (logs += chunk.toString()));
    const get = (route: string, cookie?: string, init: RequestInit = {}) =>
      fetch(`${base}${route}`, {
        redirect: "manual",
        ...init,
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(init.headers as object) },
      });
    const crossSite = { "Sec-Fetch-Site": "cross-site" };
    try {
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) {
        try {
          ready = (await get("/login")).status === 200;
        } catch {
          /* The isolated server may still be starting. */
        }
        if (!ready) await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(ready, logs);

      // Without a session: pages go to /login, APIs answer 401, nothing leaks.
      const page = await get("/");
      assert.equal(page.status, 307);
      assert.match(page.headers.get("location") || "", /\/login$/);
      assert.equal((await get("/api/workspace")).status, 401);
      assert.equal((await get("/api/export")).status, 401);
      assert.equal((await get("/api/automation/jobs")).status, 401);
      assert.equal((await get("/api/auth/session")).status, 401);
      // The n8n callback is not behind the session: it answers with its own secret check.
      const callback = await get("/api/automation/results", undefined, { method: "POST" });
      assert.notEqual(callback.status, 307);
      const loginHtml = await (await get("/login")).text();
      assert.match(loginHtml, /Continuar con Google/);
      assert.doesNotMatch(loginHtml, /secreto-de-prueba/);

      // Starting the flow sends the owner to Google with PKCE, state and the loopback return address.
      const start = await get("/api/auth/login");
      assert.equal(start.status, 307);
      const google = new URL(start.headers.get("location") || "");
      assert.equal(google.origin + google.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
      assert.equal(google.searchParams.get("client_id"), clientId);
      assert.equal(google.searchParams.get("redirect_uri"), `${base}/api/auth/callback/google`);
      assert.equal(google.searchParams.get("code_challenge_method"), "S256");
      assert.equal(google.searchParams.get("scope"), "openid email profile");
      assert.ok(google.searchParams.get("state"));
      assert.ok((start.headers.get("set-cookie") || "").includes(`${FLOW_COOKIE}=`));
      assert.doesNotMatch(google.toString(), /secreto-de-prueba/);

      // The return from Google is a cross-site navigation. A forged one is bounced to the login.
      const forged = await get("/api/auth/callback/google?code=x&state=y", undefined, {
        headers: crossSite,
      });
      assert.equal(forged.status, 200);
      assert.match(await forged.text(), /\/login\?error=expired/);
      const denied = await get("/api/auth/callback/google?error=access_denied", undefined, {
        headers: crossSite,
      });
      assert.match(await denied.text(), /error=cancelled/);
      // Any other route still refuses cross-site requests.
      assert.equal((await get("/api/workspace", undefined, { headers: crossSite })).status, 403);

      // A valid session opens the studio; one for another address, a forged one or an old one does not.
      const cookieFor = async (email: string, key = secret) =>
        `${SESSION_COOKIE}=${await createSession({ email, name: "Prueba" }, key)}`;
      const good = await cookieFor("dueno@example.com");
      assert.equal((await get("/api/workspace", good)).status, 200);
      assert.equal((await get("/", good)).status, 200);
      assert.equal(
        (await (await get("/api/auth/session", good)).json()).user.email,
        "dueno@example.com",
      );
      assert.equal((await get("/login", good)).status, 307);
      assert.equal((await get("/api/workspace", await cookieFor("otro@example.com"))).status, 401);
      assert.equal(
        (await get("/api/workspace", await cookieFor("dueno@example.com", "b".repeat(48)))).status,
        401,
      );
      const old = `${SESSION_COOKIE}=${await sign({ email: "dueno@example.com", name: "x", exp: 1 }, secret)}`;
      assert.equal((await get("/api/workspace", old)).status, 401);

      // Signing out clears the cookie, and only a same-origin POST is accepted.
      const out = await get("/api/auth/logout", good, { method: "POST" });
      assert.equal(out.status, 200);
      assert.match(out.headers.get("set-cookie") || "", /Max-Age=0/i);
      const evil = await get("/api/auth/logout", good, {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      });
      assert.equal(evil.status, 403);
    } finally {
      server.kill();
    }
  },
);
