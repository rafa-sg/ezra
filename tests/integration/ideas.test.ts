import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { today, type Workspace } from "../../src/lib/model";

const base = "http://127.0.0.1:3103";
const outbound = "ezra-to-n8n-ideas-secret-0123456789abcdef";
const inbound = "n8n-to-ezra-ideas-secret-0123456789abcdef";
const header = "x-automation-secret";

async function startEzra(env: Record<string, string>) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3103"],
    { env: { ...process.env, ...env }, stdio: "pipe" },
  );
  let logs = "";
  server.stderr.on("data", (chunk) => (logs += chunk.toString()));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/workspace`)).ok)
        return async () => {
          server.kill("SIGTERM");
          await new Promise<void>((resolve) => {
            if (server.exitCode !== null) resolve();
            else server.once("exit", () => resolve());
          });
        };
    } catch {
      /* The isolated server may still be starting. */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  server.kill("SIGTERM");
  throw new Error(`ezrá no arrancó: ${logs}`);
}

/** Fake n8n: answers each source with one same-site idea and one from another site. */
function fakeReader() {
  const state = { expected: outbound, received: [] as Record<string, unknown>[], last: {} };
  const read = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => resolve(body));
    });
  const server: Server = createServer(async (req, res) => {
    const job = JSON.parse(await read(req));
    state.received.push(job);
    if (req.headers[header] !== state.expected) {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200).end("{}");
    const sources = job.sources as { id: string; url: string }[];
    state.last = {
      jobId: job.jobId,
      mode: "live",
      status: "completed",
      ideas: sources.flatMap((s) => [
        {
          sourceId: s.id,
          title: "Festival de las Flores y las Palmas",
          url: new URL("/agenda/flores", s.url).href,
          publishedAt: "2026-10-01T12:00:00Z",
        },
        { sourceId: s.id, title: "Enlace ajeno", url: "https://otro.example/x", publishedAt: null },
      ]),
      skipped: [],
      attempt: 1,
      completedAt: new Date().toISOString(),
    };
    void fetch(`${base}/api/automation/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [header]: inbound },
      body: JSON.stringify(state.last),
    });
  });
  return { state, server };
}
const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)),
  );
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));
const send = (method: string, route: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${route}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const search = () => send("POST", "/api/automation/jobs", { action: "find_ideas", mode: "live" });

test(
  "buscar ideas: fuentes autorizadas, enlaces del mismo sitio, repetición, secretos y n8n apagado",
  { timeout: 120000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directory = await mkdtemp(path.resolve("work/ideas-api-test-"));
    const reader = fakeReader();
    const port = await listen(reader.server);
    const stop = await startEzra({
      EZRA_DATA_DIR: directory,
      N8N_WEBHOOK_URL: `http://127.0.0.1:${port}/webhook/prueba`,
      N8N_IDEAS_WEBHOOK_URL: `http://127.0.0.1:${port}/webhook/ideas`,
      EZRA_TO_N8N_SECRET: outbound,
      N8N_TO_EZRA_SECRET: inbound,
    });
    try {
      // Only demo sources: nothing is sent.
      assert.equal((await search()).status, 422);
      assert.equal(reader.state.received.length, 0);

      const initial: Workspace = await (await fetch(`${base}/api/workspace`)).json();
      const draft = structuredClone(initial);
      const real = {
        id: "rss-propio",
        name: "Agenda propia",
        url: "https://www.spotmi.example/feed.xml",
        kind: "rss" as const,
        status: "approved" as const,
        topics: "",
        notes: "",
        reviewedOn: today(),
        expiresOn: "",
        demo: false,
      };
      draft.sources.push(real, { ...real, id: "nota", kind: "inspiration", url: "" });
      assert.equal((await send("PUT", "/api/workspace", draft)).status, 200);
      const before = JSON.parse(await readFile(path.join(directory, "workspace.json"), "utf8"));

      const sent = await search();
      assert.equal(sent.status, 202);
      const { job } = await sent.json();
      assert.deepEqual(
        (reader.state.received.at(-1)!.sources as { id: string }[]).map((s) => s.id),
        ["rss-propio"],
      );
      let overview;
      for (let i = 0; i < 50; i++) {
        overview = await (await fetch(`${base}/api/automation/ideas`)).json();
        if (overview.latestSearch?.status === "completed") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(overview.latestSearch.jobId, job.jobId);
      assert.equal(overview.latestSearch.accepted, 1);
      assert.equal(overview.latestSearch.rejected, 1);
      assert.equal(overview.ideas.length, 1);
      assert.equal(overview.ideas[0].url, "https://www.spotmi.example/agenda/flores");
      assert.equal(overview.sources["rss-propio"].ideas, 1);

      // Repeated callback: accepted once, no new ideas or history.
      const repeat = await send("POST", "/api/automation/results", reader.state.last, {
        [header]: inbound,
      });
      assert.equal((await repeat.json()).duplicate, true);
      assert.equal((await (await fetch(`${base}/api/automation/ideas`)).json()).ideas.length, 1);

      // Wrong secret n8n → ezrá.
      assert.equal(
        (
          await send("POST", "/api/automation/results", reader.state.last, {
            [header]: outbound,
          })
        ).status,
        401,
      );

      // Ideas never touch posts and history gets exactly one event per search.
      const after: Workspace = JSON.parse(
        await readFile(path.join(directory, "workspace.json"), "utf8"),
      );
      assert.deepEqual(after.posts, before.posts);
      assert.equal(after.revision, before.revision);
      assert.equal(after.history.filter((e) => e.id === `job-${job.jobId}`).length, 1);

      // Discarding hides the idea.
      const ideaId = overview.ideas[0].id;
      assert.equal(
        (await send("PATCH", "/api/automation/ideas", { id: ideaId, status: "discarded" })).status,
        200,
      );
      assert.equal((await (await fetch(`${base}/api/automation/ideas`)).json()).ideas.length, 0);

      // Wrong secret ezrá → n8n, then n8n off: the job is kept as not delivered.
      reader.state.expected = "a-different-secret-the-reader-expects-000";
      assert.equal((await search()).status, 502);
      await close(reader.server);
      const down = await search();
      assert.equal(down.status, 502);
      assert.equal((await down.json()).job.status, "delivery_failed");
    } finally {
      await stop();
    }
  },
);
