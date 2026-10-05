import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { today } from "../src/lib/model";
import { createSeed } from "../src/lib/seed";
import { reconcile } from "../src/lib/workflow";

// The data directory must be set before store.ts is first imported.
const dir = (async () => {
  await mkdir("work", { recursive: true });
  return mkdtemp(path.resolve("work/generation-test-"));
})();
const load = (async () => {
  process.env.EZRA_DATA_DIR = await dir;
  return { ...(await import("../src/lib/automation")), ...(await import("../src/lib/store")) };
})();

/** Real authorized RSS source plus two ideas found by a (fake) search. */
async function setup() {
  const lib = await load;
  await lib.mutateWorkspace((w) => ({
    ...w,
    sources: [
      ...w.sources,
      {
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
      },
    ],
  }));
  const search = await lib.createIdeasJob();
  await lib.recordResult({
    jobId: search.jobId,
    mode: "live",
    status: "completed",
    ideas: ["uno", "dos", "tres"].map((n) => ({
      sourceId: "rss-real",
      title: `Idea ${n}`,
      url: `https://spotmi.example/${n}`,
    })),
    skipped: [],
    attempt: 1,
    completedAt: new Date().toISOString(),
  });
  return (await lib.readAutomation()).ideas;
}
const result = (jobId: string, text: string, over: object = {}) => ({
  jobId,
  mode: "live" as const,
  status: "completed" as const,
  model: "gemini-3.1-flash-lite",
  text,
  prompt: "prompt usado",
  usage: { inputTokens: 1000, outputTokens: 300 },
  attempt: 1,
  completedAt: new Date().toISOString(),
  ...over,
});

test("una propuesta con IA: nota obligatoria, un clic a la vez, borrador etiquetado y gasto", async () => {
  const lib = await load;
  const [first, second, third] = await setup();
  await assert.rejects(() => lib.createDraftJob(first.id), /Tu nota/);
  await lib.setIdeaStatus(first.id, { note: "  Confirmé la fecha en la web oficial.  " });
  const job = await lib.createDraftJob(first.id);
  assert.equal(job.input.note, "Confirmé la fecha en la web oficial.");
  assert.equal(job.input.brand.name, createSeed().brand.name);
  await assert.rejects(() => lib.createDraftJob(first.id), /Idea no encontrada|generándose/);
  await lib.setIdeaStatus(second.id, { note: "Otra nota" });
  await assert.rejects(() => lib.createDraftJob(second.id), /generándose/);

  const before = await lib.readWorkspace();
  await assert.rejects(
    () => lib.recordResult(result(job.jobId, "texto", { model: "otro-modelo" })),
    /modelo distinto/,
  );
  const done = await lib.recordResult(
    result(job.jobId, `Primer párrafo\u0007.\r\n\r\n\r\n\r\nSegundo [verificar].`),
  );
  assert.equal(done.duplicate, false);
  const after = await lib.readWorkspace();
  const post = after.posts[0];
  assert.equal(after.posts.length, before.posts.length + 1);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(post.status, "draft");
  assert.equal(post.aiGenerated, true);
  assert.equal(post.demo, false);
  assert.deepEqual(post.sourceIds, ["rss-real"]);
  assert.equal(post.caption, "Primer párrafo .\n\nSegundo [verificar].");
  assert.ok(after.history.some((e) => e.id === `job-${job.jobId}` && e.postId === post.id));
  const automation = await lib.readAutomation();
  assert.equal(automation.ideas.find((i) => i.id === first.id)?.status, "used");
  const stored = automation.jobs.find((j) => j.jobId === job.jobId)!;
  assert.ok(stored.action === "generate_draft" && stored.result?.prompt === "prompt usado");
  assert.equal(lib.spentUsd(automation), (1000 * 0.25 + 300 * 1.5) / 1e6);

  // Repeated callback: no second draft; a lost draft is recreated once.
  assert.equal((await lib.recordResult(result(job.jobId, "x"))).duplicate, true);
  assert.equal((await lib.readWorkspace()).posts.length, after.posts.length);
  await lib.mutateWorkspace((w) => ({ ...w, posts: w.posts.filter((p) => p.id !== post.id) }));
  await lib.recordResult(result(job.jobId, "Recuperado"));
  assert.ok((await lib.readWorkspace()).posts.some((p) => p.id === post.id));

  // Too long a caption: recorded as failed, no draft, idea stays open.
  const long = await lib.createDraftJob(second.id);
  const count = (await lib.readWorkspace()).posts.length;
  await lib.recordResult(result(long.jobId, "a".repeat(2201)));
  const failed = (await lib.readAutomation()).jobs.find((j) => j.jobId === long.jobId)!;
  assert.equal(failed.status, "failed");
  assert.ok(failed.action === "generate_draft" && failed.result?.errorCode === "texto_invalido");
  assert.equal((await lib.readWorkspace()).posts.length, count);

  // Cap: with USD 4.999 already spent, the next reservation is refused.
  const file = path.join(await dir, "automation.json");
  const data = JSON.parse(await readFile(file, "utf8"));
  const spent = data.jobs.find((j: { jobId: string }) => j.jobId === job.jobId);
  spent.result.usd = 4.999;
  await writeFile(file, JSON.stringify(data));
  await lib.setIdeaStatus(third.id, { note: "Nota" });
  await assert.rejects(() => lib.createDraftJob(third.id), /tope de USD 5/);
});

test("el navegador no puede quitar la etiqueta «Generado con IA»", () => {
  const state = createSeed();
  state.posts[0].aiGenerated = true;
  const next = structuredClone(state);
  next.posts[0].aiGenerated = false;
  next.posts[0].caption = "Editado a mano";
  assert.equal(reconcile(state, next).posts[0].aiGenerated, true);
});
