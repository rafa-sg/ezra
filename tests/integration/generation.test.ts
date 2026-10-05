import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { today, type Workspace } from "../../src/lib/model";
import { createSeed } from "../../src/lib/seed";

const base = "http://127.0.0.1:3104";
const outbound = "ezra-to-n8n-draft-secret-0123456789abcdef";
const inbound = "n8n-to-ezra-draft-secret-0123456789abcdef";
const header = "x-automation-secret";

async function startEzra(env: Record<string, string>) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3104"],
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

/** Fake n8n + Gemini: answers with a short caption and token usage. Never calls Google. */
function fakeGemini() {
  const state = { received: [] as Record<string, unknown>[], last: {} };
  const read = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => resolve(body));
    });
  const server: Server = createServer(async (req, res) => {
    const job = JSON.parse(await read(req));
    state.received.push(job);
    if (req.headers[header] !== outbound) {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200).end("{}");
    const idea = job.idea as { title: string; note: string };
    state.last = {
      jobId: job.jobId,
      mode: "live",
      status: "completed",
      model: job.model,
      text: `${idea.title}: ${idea.note} #Spotmi`,
      prompt: `Criterios de ${job.brand.name}. <idea>${idea.title}</idea>`,
      usage: { inputTokens: 1200, outputTokens: 250 },
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

test(
  "propuesta con IA: nota, borrador etiquetado, gasto, repetición, secretos y n8n apagado",
  { timeout: 120000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directory = await mkdtemp(path.resolve("work/generation-api-test-"));
    const seed = createSeed();
    seed.sources.push({
      id: "rss-real",
      name: "Agenda propia",
      url: "https://spotmi.example/feed.xml",
      kind: "rss",
      status: "approved",
      topics: "",
      notes: "",
      reviewedOn: today(),
      expiresOn: "",
      demo: false,
    });
    const ideaId = crypto.randomUUID();
    const spareId = crypto.randomUUID();
    await writeFile(path.join(directory, "workspace.json"), JSON.stringify(seed));
    await writeFile(
      path.join(directory, "automation.json"),
      JSON.stringify({
        schemaVersion: 1,
        jobs: [],
        ideas: [
          {
            id: ideaId,
            sourceId: "rss-real",
            jobId: crypto.randomUUID(),
            title: "Festival de las Flores y las Palmas",
            url: "https://spotmi.example/flores",
            publishedAt: null,
            foundAt: new Date().toISOString(),
            status: "new",
          },
          {
            id: spareId,
            sourceId: "rss-real",
            jobId: crypto.randomUUID(),
            title: "Ruta del café",
            url: "https://spotmi.example/cafe",
            publishedAt: null,
            foundAt: new Date().toISOString(),
            status: "new",
            note: "Horario confirmado por teléfono.",
          },
        ],
      }),
    );
    const gemini = fakeGemini();
    const port = await listen(gemini.server);
    // If ezrá cannot start, close the fake server too so the run never hangs.
    const stop = await startEzra({
      EZRA_DATA_DIR: directory,
      N8N_WEBHOOK_URL: `http://127.0.0.1:${port}/webhook/prueba`,
      N8N_DRAFT_WEBHOOK_URL: `http://127.0.0.1:${port}/webhook/propuesta`,
      EZRA_TO_N8N_SECRET: outbound,
      N8N_TO_EZRA_SECRET: inbound,
    }).catch(async (error) => {
      await close(gemini.server);
      throw error;
    });
    const generate = () =>
      send("POST", "/api/automation/jobs", { action: "generate_draft", mode: "live", ideaId });
    try {
      // Without the owner's note nothing is sent.
      assert.equal((await generate()).status, 422);
      assert.equal(gemini.state.received.length, 0);
      const note = "Confirmé la fecha en el sitio de la alcaldía.";
      assert.equal(
        (await send("PATCH", "/api/automation/ideas", { id: ideaId, note })).status,
        200,
      );

      const sent = await generate();
      assert.equal(sent.status, 202);
      const { job } = await sent.json();
      const payload = gemini.state.received.at(-1)!;
      assert.equal((payload.idea as { note: string }).note, note);
      assert.ok(!JSON.stringify(payload).includes(outbound));
      let overview: {
        latestGeneration: { jobId: string; status: string; postId: string | null } | null;
      } = { latestGeneration: null };
      for (let i = 0; i < 50; i++) {
        overview = await (await fetch(`${base}/api/automation/ideas`)).json();
        if (overview.latestGeneration?.status === "completed") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(overview.latestGeneration?.jobId, job.jobId);
      const workspace: Workspace = await (await fetch(`${base}/api/workspace`)).json();
      const post = workspace.posts.find((p) => p.id === overview.latestGeneration?.postId)!;
      assert.equal(post.status, "draft");
      assert.equal(post.aiGenerated, true);
      assert.deepEqual(post.sourceIds, ["rss-real"]);
      assert.match(post.caption, /alcaldía/);
      const spend = await (await fetch(`${base}/api/automation/spend`)).json();
      assert.equal(spend.capUsd, 5);
      assert.equal(spend.spentUsd, (1200 * 0.25 + 250 * 1.5) / 1e6);

      // Repeated callback: still one draft.
      const repeat = await send("POST", "/api/automation/results", gemini.state.last, {
        [header]: inbound,
      });
      assert.equal((await repeat.json()).duplicate, true);
      const again: Workspace = await (await fetch(`${base}/api/workspace`)).json();
      assert.equal(again.posts.filter((p) => p.aiGenerated).length, 1);

      // The browser cannot strip the label.
      const edit = structuredClone(again);
      const mine = edit.posts.find((p) => p.id === post.id)!;
      mine.aiGenerated = false;
      mine.caption = "Lo reescribí yo";
      const saved: Workspace = await (await send("PUT", "/api/workspace", edit)).json();
      assert.equal(saved.posts.find((p) => p.id === post.id)!.aiGenerated, true);

      // Wrong secret n8n → ezrá; then n8n off.
      assert.equal(
        (
          await send("POST", "/api/automation/results", gemini.state.last, {
            [header]: outbound,
          })
        ).status,
        401,
      );
      const stored = JSON.parse(await readFile(path.join(directory, "automation.json"), "utf8"));
      assert.equal(stored.ideas[0].status, "used");
      await close(gemini.server);
      const down = await send("POST", "/api/automation/jobs", {
        action: "generate_draft",
        mode: "live",
        ideaId: spareId,
      });
      assert.equal(down.status, 502);
      assert.equal((await down.json()).job.status, "delivery_failed");
      // A delivery failure reserves nothing: the spend stays as before.
      const after = await (await fetch(`${base}/api/automation/spend`)).json();
      assert.equal(after.spentUsd, spend.spentUsd);
    } finally {
      await stop();
    }
  },
);
