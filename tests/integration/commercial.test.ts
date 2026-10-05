import test from "node:test";
import {
  clerkTestEnvironment,
  sessionToken,
  fixtureUsers,
  setClerkUnavailable,
} from "../helpers/clerk-fixture";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { newProduct, createCatalogPosts } from "../../src/lib/catalog";
import { today, type Workspace } from "../../src/lib/model";

const base = "http://127.0.0.1:3105";
const ownerEmail = "owner@example.test";

const send = (route: string, body: unknown, cookie = "", method = "POST") =>
  fetch(`${base}${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { authorization: `Bearer ${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
const get = (route: string, cookie = "") =>
  fetch(`${base}${route}`, { headers: cookie ? { authorization: `Bearer ${cookie}` } : {} });
async function start(directory: string) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3105"],
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
  "correo único: administración, aislamiento entre clientes, catálogo, archivos, revisión y reinicio",
  { timeout: 90000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directory = await mkdtemp(path.resolve("work/commercial-test-"));
    let stop = await start(directory);
    const admin = sessionToken("owner", base, 180);
    const sgmotos = sessionToken("sgmotos", base, 180);
    const motoxspress = sessionToken("motoxspress", base, 180);
    const sgm = "/api/workspace?business=sgmotos-main";
    const moto = "/api/workspace?business=motoxspress-main";
    try {
      for (const route of [
        "/api/businesses",
        sgm,
        moto,
        "/api/media/missing",
        "/api/export",
        "/api/automation/jobs",
        "/api/auth/accounts",
      ])
        assert.equal((await get(route)).status, 401, route);
      assert.equal((await get("/api/auth/session")).headers.get("cache-control"), "no-store");
      // Neither the first stranger nor an unverified matching email can claim ownership.
      assert.equal((await get("/api/businesses", sessionToken("outsider"))).status, 403);
      assert.equal((await get("/api/businesses", sessionToken("unverified"))).status, 403);
      for (const action of ["setup", "login", "logout"])
        assert.equal((await send(`/api/auth/${action}`, {})).status, 410);
      assert.equal((await get("/api/businesses", admin + "tampered")).status, 401);
      assert.equal((await get("/api/businesses", sessionToken("owner", base, -60))).status, 401);
      assert.equal(
        (await get("/api/businesses", sessionToken("owner", "https://untrusted.example"))).status,
        401,
      );
      assert.equal((await get("/api/businesses", sessionToken("sgmotos"))).status, 403);
      assert.equal(
        (await get("/api/auth/session", admin).then((r) => r.json())).account.email,
        ownerEmail,
      );
      assert.equal((await get("/api/businesses", sessionToken("duplicate"))).status, 403);
      const directoryResponse = await get("/api/businesses", admin);
      const businesses = (await directoryResponse.json()).businesses;
      assert.deepEqual(
        businesses.map((b: { id: string }) => b.id),
        ["sgmotos-main", "motoxspress-main", "owner-main"],
      );
      assert.ok(!businesses.some((b: { id: string }) => b.id === "spotmi"));
      for (const organizationId of ["sgmotos", "motoxspress"]) {
        assert.equal(
          (
            await send(
              "/api/auth/accounts",
              { organizationId, email: `${organizationId}@example.test` },
              admin,
            )
          ).status,
          200,
        );
      }
      assert.equal(
        (
          await send(
            "/api/auth/accounts",
            { organizationId: "motoxspress", email: "SGMOTOS@example.test" },
            admin,
          )
        ).status,
        409,
      );
      for (const [cookie, own, foreign] of [
        [sgmotos, sgm, moto],
        [motoxspress, moto, sgm],
      ]) {
        const list = (await (await get("/api/businesses", cookie)).json()).businesses;
        assert.equal(list.length, 1);
        assert.equal((await get(own, cookie)).status, 200);
        assert.equal((await get(foreign, cookie)).status, 404);
        assert.equal((await send(foreign, {}, cookie, "PUT")).status, 404);
        assert.equal((await get("/api/workspace", cookie)).status, 404);
        assert.equal((await get("/api/auth/accounts", cookie)).status, 403);
        assert.equal((await get("/api/automation/jobs", cookie)).status, 403);
        assert.equal((await get("/api/automation/spend", cookie)).status, 403);
        assert.equal(
          (
            await send(
              "/api/auth/accounts",
              { organizationId: "sgmotos", email: "x@example.test" },
              cookie,
            )
          ).status,
          403,
        );
      }
      assert.equal(
        (
          await send(
            "/api/businesses",
            { name: "Ajeno", type: "food", organizationId: "motoxspress" },
            sgmotos,
          )
        ).status,
        403,
      );
      const created = await send(
        "/api/businesses",
        { name: "Comida Sgmotos", type: "food", organizationId: "sgmotos" },
        sgmotos,
      );
      assert.equal(created.status, 201);
      const newBusiness = (await created.json()).business;
      assert.equal(
        (await get(`/api/workspace?business=${newBusiness.id}`, motoxspress)).status,
        404,
      );
      assert.equal(
        (await get("/api/businesses", motoxspress).then((r) => r.json())).businesses.length,
        1,
      );
      assert.equal((await get("/api/automation/jobs?business=sgmotos-main", admin)).status, 503);
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD6kAAAAASUVORK5CYII=",
        "base64",
      );
      const form = new FormData();
      form.set("file", new File([png], "foto-autorizada.png", { type: "image/png" }));
      form.set("origin", "owned");
      const uploaded = await fetch(`${base}/api/media?business=sgmotos-main`, {
        method: "POST",
        headers: { authorization: `Bearer ${sgmotos}` },
        body: form,
      });
      assert.equal(uploaded.status, 200);
      const { media, workspace } = await uploaded.json();
      assert.equal(
        (await get(`/api/media/${media.id}?business=sgmotos-main`, motoxspress)).status,
        404,
      );
      assert.equal(
        (await get(`/api/media/${media.id}?business=motoxspress-main`, motoxspress)).status,
        404,
      );
      assert.deepEqual(
        Buffer.from(
          await (await get(`/api/media/${media.id}?business=sgmotos-main`, sgmotos)).arrayBuffer(),
        ),
        png,
      );
      const product = newProduct();
      product.name = "Moto del piloto";
      product.brand = "Honda";
      product.model = "Modelo confirmado";
      product.priceCents = 200000;
      product.mediaIds = [media.id];
      product.verified = true;
      product.verifiedOn = today();
      product.variants[0].color = "Rojo";
      workspace.catalog.push(product);
      let response = await send(sgm, workspace, sgmotos, "PUT");
      assert.equal(response.status, 200);
      let state: Workspace = await response.json();
      const stale = structuredClone(state);
      state.posts.push(
        ...createCatalogPosts(state.catalog[0], product.variants[0].id, ["instagram", "facebook"]),
      );
      response = await send(sgm, state, sgmotos, "PUT");
      assert.equal(response.status, 200);
      state = await response.json();
      assert.equal(state.posts.length, 2);
      assert.equal(state.posts[0].campaignId, state.posts[1].campaignId);
      state.posts.forEach((p) => {
        p.status = "review";
      });
      response = await send(sgm, state, sgmotos, "PUT");
      assert.equal(response.status, 200);
      state = await response.json();
      state.posts.forEach((p) => {
        p.status = "approved";
        p.checks = { facts: true, rights: true, brand: true };
      });
      response = await send(sgm, state, sgmotos, "PUT");
      assert.equal(response.status, 200);
      state = await response.json();
      const exported = await get(
        `/api/export?business=sgmotos-main&post=${state.posts[0].id}`,
        sgmotos,
      );
      assert.equal(exported.status, 200);
      assert.doesNotMatch(exported.headers.get("content-disposition")!, /no-aprobada/);
      const packageZip = await JSZip.loadAsync(await exported.arrayBuffer());
      assert.match(await packageZip.file("texto.txt")!.async("text"), /Color: Rojo/);
      assert.ok(packageZip.file(`media/${media.filename}`));
      const backup = await JSZip.loadAsync(
        await (await get("/api/export?business=sgmotos-main", sgmotos)).arrayBuffer(),
      );
      assert.ok(backup.file("negocio.json"));
      assert.ok(!backup.file("accounts.json"));
      assert.ok(!backup.file("automation.json"));
      assert.equal(
        JSON.parse(await backup.file("workspace.json")!.async("text")).catalog.length,
        1,
      );
      assert.equal((await get("/api/export?business=sgmotos-main", motoxspress)).status, 404);
      assert.equal((await send(sgm, stale, sgmotos, "PUT")).status, 409);
      state.catalog[0].priceCents = 250000;
      response = await send(sgm, state, sgmotos, "PUT");
      assert.equal(response.status, 200);
      state = await response.json();
      assert.ok(state.posts.every((p) => p.status === "review" && !p.checks.facts));
      assert.equal((await get(moto, motoxspress).then((r) => r.json())).catalog.length, 0);
      assert.equal(
        (await send(sgm, { ...state, businessId: "motoxspress-main" }, sgmotos, "PUT")).status,
        409,
      );
      const rawAccess = await readFile(path.join(directory, "access.json"), "utf8");
      assert.ok(!rawAccess.includes("password") && !rawAccess.includes(admin));
      assert.equal(
        (
          await globalThis.fetch(`${base}${sgm}`, {
            headers: {
              cookie: "ezra_session=" + "a".repeat(43),
              "x-clerk-auth-user-id": "user_owner",
            },
          })
        ).status,
        401,
      );
      setClerkUnavailable(true);
      assert.equal((await get(sgm, sgmotos)).status, 503);
      setClerkUnavailable(false);
      fixtureUsers.set("sgmotos", { email: "sgmotos@example.test", verified: false });
      assert.equal((await get(sgm, sgmotos)).status, 403);
      fixtureUsers.set("sgmotos", { email: "sgmotos@example.test" });
      await stop();
      stop = await start(directory);
      assert.equal((await get(sgm, sgmotos).then((r) => r.json())).catalog[0].priceCents, 250000);
      assert.equal(
        (
          await send(
            "/api/auth/accounts",
            { organizationId: "sgmotos", email: "new-sgmotos@example.test" },
            admin,
          )
        ).status,
        200,
      );
      assert.equal((await get(sgm, sgmotos)).status, 403);
      const renewed = sessionToken("replacement");
      assert.equal((await get(sgm, renewed)).status, 200);
      assert.equal((await get(sgm)).status, 401);
      assert.equal((await get(moto, motoxspress)).status, 200);
      // External origins still cannot mutate a signed-in session.
      assert.equal(
        (
          await fetch(`${base}/api/auth/logout`, {
            method: "POST",
            headers: { authorization: `Bearer ${admin}`, Origin: "https://untrusted.example" },
          })
        ).status,
        403,
      );
    } finally {
      await stop();
    }
  },
);
