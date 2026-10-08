import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { clerkTestEnvironment, sessionToken } from "../helpers/clerk-fixture";

const base = "http://127.0.0.1:3106";
const get = (route: string, token = "") =>
  fetch(`${base}${route}`, {
    redirect: "manual",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
async function start(directory: string) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3106"],
    {
      env: {
        ...process.env,
        ...(await clerkTestEnvironment(directory)),
        EZRA_DATA_DIR: directory,
        // Never reach Gemini from tests, even if .env.local has a real key.
        GEMINI_API_KEY: "",
      },
      stdio: "pipe",
    },
  );
  let logs = "";
  server.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await get("/api/auth/session")).ok)
        return async () => {
          server.kill("SIGTERM");
          if (server.exitCode === null)
            await new Promise<void>((resolve) => server.once("exit", () => resolve()));
        };
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  server.kill("SIGTERM");
  throw new Error(`No se pudo iniciar el servidor aislado: ${logs}`);
}
test(
  "panel ezrá: reutiliza la sesión Clerk del piloto y protege las rutas por rol",
  { timeout: 90000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directory = await mkdtemp(path.resolve("work/azra-test-"));
    const stop = await start(directory);
    const admin = sessionToken("owner", base, 180);
    try {
      const anonymous = await get("/azra/ai/chat");
      assert.ok([303, 307, 308].includes(anonymous.status), String(anonymous.status));
      assert.match(anonymous.headers.get("location") ?? "", /\/sign-in$/);
      for (const token of [sessionToken("outsider", base), admin + "tampered"]) {
        const denied = await get("/azra/settings/company", token);
        assert.ok([303, 307, 308].includes(denied.status));
      }
      const page = await get("/azra/ai/chat", admin);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /ezrá/);
      assert.match(html, /owner@example\.test/);
      // Sub-accounts are the pilot's real businesses, served by its authorized API.
      const businesses = (await (await get("/api/businesses", admin)).json()).businesses;
      assert.ok(businesses.length >= 3);
      // Clients use the same panel: Ask AI and their own profile, never agency settings.
      const configure = await fetch(`${base}/api/auth/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${admin}` },
        body: JSON.stringify({ organizationId: "sgmotos", email: "sgmotos@example.test" }),
      });
      assert.equal(configure.status, 200);
      const clientToken = sessionToken("sgmotos", base, 180);
      assert.equal((await get("/azra/content", clientToken)).status, 200);
      const clientChat = await get("/azra/ai/chat", clientToken);
      assert.equal(clientChat.status, 200);
      assert.match(await clientChat.text(), /sgmotos@example\.test/);
      assert.equal((await get("/azra/settings/profile/general", clientToken)).status, 200);
      for (const adminOnly of ["/azra/settings/company", "/azra/settings/users"]) {
        const blocked = await get(adminOnly, clientToken);
        assert.ok([303, 307, 308].includes(blocked.status), adminOnly);
        assert.equal(
          new URL(blocked.headers.get("location")!, base).pathname,
          "/azra/ai/chat",
          adminOnly,
        );
      }
      // Shared presentation must not widen the client organization boundary.
      const sgToken = sessionToken("sgmotos", base, 180);
      const ownBusinesses = (await (await get("/api/businesses", sgToken)).json()).businesses;
      assert.ok(ownBusinesses.length > 0);
      assert.ok(
        ownBusinesses.every((b: { organizationId: string }) => b.organizationId === "sgmotos"),
      );
      assert.equal((await get("/api/workspace?business=sgmotos-main", sgToken)).status, 200);
      assert.equal((await get("/api/workspace?business=motoxspress-main", sgToken)).status, 404);
      assert.equal((await get("/api/auth/accounts", sgToken)).status, 403);
      assert.equal((await get("/api/export?business=motoxspress-main", sgToken)).status, 404);
      // Ask AI: session required, business scoped to the account, key stays server-side.
      const ask = (business: string, token: string, history: unknown) =>
        fetch(`${base}/api/ask${business ? `?business=${business}` : ""}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ history }),
        });
      const question = [{ role: "user", text: "¿Qué hay programado hoy?" }];
      assert.equal((await ask("sgmotos-main", "", question)).status, 401);
      assert.equal((await ask("", sgToken, question)).status, 400);
      assert.equal((await ask("motoxspress-main", sgToken, question)).status, 404);
      assert.equal((await ask("sgmotos-main", sgToken, [])).status, 400);
      const noKey = await ask("sgmotos-main", sgToken, question);
      assert.equal(noKey.status, 503);
      assert.match((await noKey.json()).error, /GEMINI_API_KEY/);
      // «Bot de atención»: empty start, per-business storage, optimistic revision, isolation.
      const bot = (business: string, token: string, body?: unknown) =>
        fetch(`${base}/api/bot${business ? `?business=${business}` : ""}`, {
          method: body ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      assert.equal((await bot("sgmotos-main", "")).status, 401);
      assert.equal((await bot("motoxspress-main", sgToken)).status, 404);
      assert.equal((await bot("", sgToken)).status, 400);
      const fresh = await (await bot("sgmotos-main", sgToken)).json();
      assert.equal(fresh.bot.revision, 0);
      assert.deepEqual(fresh.bot.conversations, []);
      assert.ok(fresh.connections.channels.every((c: { botEnabled: boolean }) => !c.botEnabled));
      assert.equal(fresh.connections.ghl, "not_connected");
      const created = await bot("sgmotos-main", sgToken, {
        revision: 0,
        op: "saveKnowledge",
        entry: {
          title: "Garantía",
          content: "Prueba de integración.",
          category: "policies",
          keywords: ["garantía"],
          reviewBy: "",
        },
      });
      assert.equal(created.status, 200);
      assert.equal((await created.json()).bot.knowledge[0].status, "draft");
      // A stale revision never overwrites newer changes.
      assert.equal(
        (await bot("sgmotos-main", sgToken, { revision: 0, op: "setPaused", paused: true })).status,
        409,
      );
      assert.equal((await bot("sgmotos-main", sgToken, { revision: 1, op: "nope" })).status, 400);
      // Writing another business is refused; its bot stays empty.
      assert.equal(
        (await bot("motoxspress-main", sgToken, { revision: 0, op: "setPaused", paused: true }))
          .status,
        404,
      );
      const other = await (await bot("motoxspress-main", admin)).json();
      assert.deepEqual(other.bot.knowledge, []);
      const persisted = await (await bot("sgmotos-main", admin)).json();
      assert.equal(persisted.bot.knowledge[0].title, "Garantía");
      for (const page of [
        "/azra/bot",
        "/azra/bot/conversations",
        "/azra/bot/test",
        "/azra/bot/connections",
      ])
        assert.equal((await get(page, sgToken)).status, 200, page);
      // The pilot entry and its login keep working.
      assert.equal((await get("/sign-in")).status, 200);
      // Administration no longer lands on the old «Mi panel»: it opens «Pregúntale a la IA».
      const home = await get("/", admin);
      assert.ok([303, 307, 308].includes(home.status));
      assert.equal(new URL(home.headers.get("location")!, base).pathname, "/azra/ai/chat");
      // «Pregúntale a la IA» is the panel home; removed pages redirect there.
      for (const old of [
        "/azra",
        "/azra/agency",
        "/azra/prospecting/accounts",
        "/azra/prospecting/analytics",
      ]) {
        const moved = await get(old, admin);
        assert.ok([303, 307, 308].includes(moved.status), old);
        assert.equal(new URL(moved.headers.get("location")!, base).pathname, "/azra/ai/chat", old);
      }
      // Settings keeps only Mi perfil, Empresa and Usuarios; removed sections open Mi perfil.
      for (const old of [
        "/azra/settings",
        "/azra/settings/billing",
        "/azra/settings/workflows",
        "/azra/settings/workflows/premium",
        "/azra/settings/phone",
        "/azra/settings/email/services",
        "/azra/settings/system-email/templates",
        "/azra/settings/announcements",
        "/azra/settings/domain-purchase",
        "/azra/settings/integrations",
        "/azra/settings/integrations/abc",
        "/azra/settings/api-keys",
        "/azra/settings/affiliates",
        "/azra/settings/menu-links",
        "/azra/settings/audit/logs",
        "/azra/settings/storage",
      ]) {
        const moved = await get(old, admin);
        assert.ok([303, 307, 308].includes(moved.status), old);
        assert.equal(
          new URL(moved.headers.get("location")!, base).pathname,
          "/azra/settings/profile/general",
          old,
        );
      }
      for (const kept of ["/azra/settings/company", "/azra/settings/users"])
        assert.equal((await get(kept, admin)).status, 200, kept);
      assert.equal((await get("/azra/no-existe", admin)).status, 404);
      // The old studio is gone: every signed-in entry opens Ask AI; visitors get the login.
      for (const [route, token] of [
        ["/?business=sgmotos-main", admin],
        ["/", clientToken],
      ] as const) {
        const entry = await get(route, token);
        assert.ok([303, 307, 308].includes(entry.status), route);
        assert.equal(new URL(entry.headers.get("location")!, base).pathname, "/azra/ai/chat");
      }
      assert.equal((await get("/")).status, 200);
      // The Users screen reads the real access accounts through the pilot API.
      const accounts = (await (await get("/api/auth/accounts", admin)).json()).accounts;
      assert.ok(accounts.some((a: { email: string }) => a.email === "sgmotos@example.test"));
      // Agency logo: stored on the server, admin only, content-sniffed.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      const upload = (bytes: Buffer, name: string, token: string) => {
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(bytes)]), name);
        return fetch(`${base}/api/agency/logo`, {
          method: "POST",
          body: form,
          headers: { authorization: `Bearer ${token}` },
        });
      };
      assert.equal((await (await get("/api/agency/logo?meta", admin)).json()).logo, null);
      assert.equal((await get("/api/agency/logo")).status, 401);
      assert.equal((await get("/api/agency/logo", sessionToken("sgmotos", base, 180))).status, 403);
      assert.equal((await upload(png, "logo.png", sessionToken("sgmotos", base, 180))).status, 403);
      // A renamed text file is rejected: the type comes from the bytes, not the name.
      assert.equal((await upload(Buffer.from("not an image"), "fake.png", admin)).status, 422);
      const saved = await upload(png, "logo.png", admin);
      assert.equal(saved.status, 200);
      const served = await get("/api/agency/logo", admin);
      assert.equal(served.headers.get("content-type"), "image/png");
      assert.equal(served.headers.get("x-content-type-options"), "nosniff");
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
      const first = (await (await get("/api/agency/logo?meta", admin)).json()).logo.updatedAt;
      assert.equal((await upload(png, "again.png", admin)).status, 200);
      const second = (await (await get("/api/agency/logo?meta", admin)).json()).logo.updatedAt;
      assert.notEqual(first, second);
      const removed = await fetch(`${base}/api/agency/logo`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${admin}` },
      });
      assert.equal(removed.status, 200);
      assert.equal((await get("/api/agency/logo", admin)).status, 404);
    } finally {
      await stop();
    }
  },
);
