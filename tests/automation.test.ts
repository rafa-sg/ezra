import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import path from "node:path";
import { createSeed } from "../src/lib/seed";

// The data directory must be set before store.ts is first imported.
const load = (async () => {
  await mkdir("work", { recursive: true });
  process.env.EZRA_DATA_DIR = await mkdtemp(path.resolve("work/automation-test-"));
  return { ...(await import("../src/lib/automation")), ...(await import("../src/lib/store")) };
})();

test("contentRevision cambia con contenido, fuente vinculada o marca", async () => {
  const { contentRevision } = await load;
  const state = createSeed(new Date("2026-10-04T22:00:00.000Z"));
  const post = state.posts[0];
  const base = contentRevision(post, state);
  assert.match(base, /^sha256:[0-9a-f]{64}$/);
  assert.equal(contentRevision(structuredClone(post), structuredClone(state)), base);
  assert.notEqual(contentRevision({ ...post, caption: `${post.caption}!` }, state), base);
  const sourceEdited = structuredClone(state);
  sourceEdited.sources.find((s) => s.id === post.sourceIds[0])!.notes = "otra nota";
  assert.notEqual(contentRevision(post, sourceEdited), base);
  const brandEdited = structuredClone(state);
  brandEdited.brand.voice = "otra voz";
  assert.notEqual(contentRevision(post, brandEdited), base);
  // Planning metadata does not change the approved content.
  assert.equal(contentRevision({ ...post, plannedAt: "2026-10-10T10:00" }, state), base);
});

test("configuración: secretos cortos, iguales o URL no local se rechazan", async () => {
  const { automationConfig } = await load;
  const strong = "a".repeat(32);
  const other = "b".repeat(32);
  const config = (outbound: string, inbound: string, url: string) => {
    process.env.EZRA_TO_N8N_SECRET = outbound;
    process.env.N8N_TO_EZRA_SECRET = inbound;
    process.env.N8N_WEBHOOK_URL = url;
    return automationConfig();
  };
  const ok = config(strong, other, "http://127.0.0.1:5678/webhook/test");
  assert.ok(ok.inbound && ok.outbound && ok.webhook);
  assert.equal(config("corto", other, "http://127.0.0.1:5678/").outbound, undefined);
  const same = config(strong, strong, "http://127.0.0.1:5678/");
  assert.equal(same.inbound, undefined);
  assert.equal(same.outbound, undefined);
  assert.equal(config(strong, other, "https://n8n.example.com/webhook").webhook, undefined);
  assert.equal(config(strong, other, "http://user:pw@localhost:5678/").webhook, undefined);
});

test("un resultado simulado solo se guarda en el encargo y el historial", async () => {
  const { createJob, readAutomation, readWorkspace, recordResult } = await load;
  const before = await readWorkspace();
  const post = before.posts[0];
  const job = await createJob(post.id);
  assert.equal((await readAutomation()).jobs[0].status, "queued");
  const result = {
    jobId: job.jobId,
    contentRevision: job.contentRevision,
    mode: "simulation" as const,
    status: "completed" as const,
    attempt: 1,
    completedAt: new Date().toISOString(),
  };
  assert.equal((await recordResult(result)).duplicate, false);
  assert.equal((await recordResult({ ...result, attempt: 2 })).duplicate, true);
  await assert.rejects(() => recordResult({ ...result, status: "failed" }), /resultado distinto/);
  await assert.rejects(
    () => recordResult({ ...result, contentRevision: `sha256:${"0".repeat(64)}` }),
    /otra versión/,
  );
  const after = await readWorkspace();
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.posts, before.posts);
  assert.equal(after.history.filter((e) => e.id === `job-${job.jobId}`).length, 1);
  assert.equal((await readAutomation()).jobs[0].status, "completed");
});
