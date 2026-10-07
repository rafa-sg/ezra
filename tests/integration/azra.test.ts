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
      env: { ...process.env, ...(await clerkTestEnvironment(directory)), EZRA_DATA_DIR: directory },
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
      // A client account is sent back to its own studio, never to the admin panel.
      const configure = await fetch(`${base}/api/auth/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${admin}` },
        body: JSON.stringify({ organizationId: "sgmotos", email: "sgmotos@example.test" }),
      });
      assert.equal(configure.status, 200);
      const client = await get("/azra/ai/chat", sessionToken("sgmotos", base, 180));
      assert.ok([303, 307, 308].includes(client.status));
      assert.equal(new URL(client.headers.get("location")!, base).pathname, "/");
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
      assert.equal((await get("/azra/no-existe", admin)).status, 404);
      // A business studio (sub-account) still opens, and clients keep their entry.
      assert.equal((await get("/?business=sgmotos-main", admin)).status, 200);
      assert.equal((await get("/", sessionToken("sgmotos", base, 180))).status, 200);
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
