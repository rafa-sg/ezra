import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Workspace } from "../../src/lib/model";
import type { Automation } from "../../src/lib/automation";

const base = "http://127.0.0.1:3102";
const outbound = "ezra-to-n8n-test-secret-0123456789abcdef";
const inbound = "n8n-to-ezra-test-secret-0123456789abcdef";
const header = "x-automation-secret";

async function startEzra(env: Record<string, string>) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3102"],
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

type Mode = "callback" | "hold";
/** Fake local n8n: checks the header secret and optionally calls back with a simulated result. */
function fakeReceiver() {
  const state = {
    mode: "callback" as Mode,
    expected: outbound,
    received: [] as Record<string, unknown>[],
  };
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
    res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
    if (state.mode === "callback")
      void fetch(`${base}/api/automation/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json", [header]: inbound },
        body: JSON.stringify(simulated(job)),
      });
  });
  return { state, server };
}
const simulated = (job: Record<string, unknown>, status = "completed") => ({
  jobId: job.jobId,
  contentRevision: job.contentRevision,
  mode: "simulation",
  status,
  providerId: null,
  publishedUrl: null,
  errorCode: status === "failed" ? "simulated_failure" : null,
  attempt: 1,
  completedAt: new Date().toISOString(),
});
const listen = (server: Server, port = 0) =>
  new Promise<number>((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)),
  );
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));
const post = (route: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

/** fetch() cannot override Host; this simulates n8n calling from Docker. */
const viaDockerHost = (method: string, route: string, body = "", headers = {}) =>
  new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      `${base}${route}`,
      {
        method,
        headers: {
          Host: "host.docker.internal:3102",
          "Content-Type": "application/json",
          ...headers,
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      },
    );
    req.on("error", reject);
    req.end(body);
  });

test(
  "automatización simulada: ida y vuelta, fallos, secretos, repetición y reinicio",
  { timeout: 120000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directory = await mkdtemp(path.resolve("work/automation-api-test-"));
    const automation = async (): Promise<Automation> =>
      JSON.parse(await readFile(path.join(directory, "automation.json"), "utf8"));
    const workspace = async (): Promise<Workspace> =>
      JSON.parse(await readFile(path.join(directory, "workspace.json"), "utf8"));
    const receiver = fakeReceiver();
    const port = await listen(receiver.server);
    const env = {
      EZRA_DATA_DIR: directory,
      N8N_WEBHOOK_URL: `http://127.0.0.1:${port}/webhook/ezra-test`,
      EZRA_TO_N8N_SECRET: outbound,
      N8N_TO_EZRA_SECRET: inbound,
    };

    // Without secrets every automation request is refused.
    let stop = await startEzra({ ...env, EZRA_TO_N8N_SECRET: "", N8N_TO_EZRA_SECRET: "" });
    try {
      const initial: Workspace = await (await fetch(`${base}/api/workspace`)).json();
      const request = {
        postId: initial.posts[0].id,
        action: "connection_test",
        mode: "simulation",
      };
      assert.equal((await post("/api/automation/jobs", request)).status, 503);
      assert.equal((await post("/api/automation/results", {}, { [header]: inbound })).status, 503);
      assert.equal(receiver.state.received.length, 0);
      assert.deepEqual(await (await fetch(`${base}/api/automation/jobs`)).json(), {
        configured: false,
        latest: null,
      });
    } finally {
      await stop();
    }

    stop = await startEzra(env);
    let heldJob: Record<string, unknown>;
    try {
      const before = await workspace();
      const target = before.posts[0];
      const request = { postId: target.id, action: "connection_test", mode: "simulation" };
      assert.equal((await post("/api/automation/jobs", { ...request, mode: "live" })).status, 422);
      assert.equal(
        (await post("/api/automation/jobs", { ...request, action: "publish" })).status,
        422,
      );

      // Round trip: ezrá → fake n8n → result back into ezrá.
      const sent = await post("/api/automation/jobs", request);
      assert.equal(sent.status, 202);
      const sentText = await sent.text();
      assert.ok(!sentText.includes(outbound) && !sentText.includes(inbound));
      const { job } = JSON.parse(sentText);
      assert.equal(receiver.state.received.at(-1)!.jobId, job.jobId);
      let completed;
      for (let i = 0; i < 50 && !completed; i++) {
        completed = (await automation()).jobs.find(
          (j) => j.jobId === job.jobId && j.status === "completed",
        );
        if (!completed) await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(completed, "el resultado simulado no regresó");
      const statusText = await (await fetch(`${base}/api/automation/jobs`)).text();
      assert.ok(!statusText.includes(outbound) && !statusText.includes(inbound));
      assert.ok(!statusText.includes("webhook"));
      const status = JSON.parse(statusText);
      assert.equal(status.configured, true);
      assert.equal(status.latest.jobId, job.jobId);
      assert.equal(status.latest.status, "completed");
      const after = await workspace();
      assert.deepEqual(after.posts, before.posts);
      assert.equal(after.revision, before.revision);
      assert.equal(after.history.filter((e) => e.id === `job-${job.jobId}`).length, 1);
      const workspaceText = await (await fetch(`${base}/api/workspace`)).text();
      assert.ok(!workspaceText.includes(outbound) && !workspaceText.includes(inbound));

      // Repeated result: same outcome is idempotent, a different one is refused.
      const repeat = await post("/api/automation/results", simulated(job), { [header]: inbound });
      assert.equal(repeat.status, 200);
      assert.equal((await repeat.json()).duplicate, true);
      assert.equal(
        (await post("/api/automation/results", simulated(job, "failed"), { [header]: inbound }))
          .status,
        409,
      );
      assert.equal(
        (await workspace()).history.filter((e) => e.id === `job-${job.jobId}`).length,
        1,
      );

      // n8n in Docker: only the secret-protected results route accepts host.docker.internal.
      const dockerResult = JSON.stringify(simulated(job));
      assert.equal(
        await viaDockerHost("POST", "/api/automation/results", dockerResult, { [header]: inbound }),
        200,
      );
      assert.equal(await viaDockerHost("POST", "/api/automation/results", dockerResult), 401);
      assert.equal(await viaDockerHost("GET", "/api/workspace"), 403);
      assert.equal(
        await viaDockerHost("POST", "/api/automation/jobs", JSON.stringify(request)),
        403,
      );
      assert.equal(await viaDockerHost("GET", "/api/export"), 403);

      // Wrong secret ezrá → n8n: the receiver refuses and the job records the failure.
      receiver.state.expected = "a-different-secret-the-receiver-expects-0000";
      const refused = await post("/api/automation/jobs", request);
      assert.equal(refused.status, 502);
      assert.equal((await refused.json()).job.status, "delivery_failed");

      // Wrong or missing secret n8n → ezrá, and simulated results cannot claim a publication.
      receiver.state.expected = outbound;
      receiver.state.mode = "hold";
      const held = await post("/api/automation/jobs", request);
      assert.equal(held.status, 202);
      heldJob = (await held.json()).job;
      for (const headers of [{}, { [header]: outbound }, { [header]: `${inbound}x` }] as Record<
        string,
        string
      >[])
        assert.equal(
          (await post("/api/automation/results", simulated(heldJob), headers)).status,
          401,
        );
      assert.equal(
        (
          await post(
            "/api/automation/results",
            { ...simulated(heldJob), publishedUrl: "https://www.instagram.com/p/abc/" },
            { [header]: inbound },
          )
        ).status,
        422,
      );
      assert.equal(
        (
          await post(
            "/api/automation/results",
            { ...simulated(heldJob), mode: "live" },
            { [header]: inbound },
          )
        ).status,
        422,
      );

      // Receiver down: the job is still persisted, marked as not delivered.
      await close(receiver.server);
      const down = await post("/api/automation/jobs", request);
      assert.equal(down.status, 502);
      const downJob = (await down.json()).job;
      assert.equal(
        (await automation()).jobs.find((j) => j.jobId === downJob.jobId)!.status,
        "delivery_failed",
      );
    } finally {
      await stop();
    }

    // Restart with a pending job: nothing is resent, and its result is still accepted.
    const receivedBeforeRestart = receiver.state.received.length;
    stop = await startEzra(env);
    try {
      const pending = (await automation()).jobs.find((j) => j.jobId === heldJob.jobId)!;
      assert.equal(pending.status, "sent");
      assert.equal(receiver.state.received.length, receivedBeforeRestart);
      const before = await workspace();
      const late = await post("/api/automation/results", simulated(heldJob, "failed"), {
        [header]: inbound,
      });
      assert.equal(late.status, 200);
      assert.equal((await late.json()).status, "failed");
      const after = await workspace();
      assert.deepEqual(after.posts, before.posts);
      assert.ok(after.history.some((e) => e.id === `job-${heldJob.jobId}`));
      assert.equal((await automation()).jobs.length, 4);
      const unknown = { ...simulated(heldJob), jobId: crypto.randomUUID() };
      assert.equal(
        (await post("/api/automation/results", unknown, { [header]: inbound })).status,
        404,
      );
    } finally {
      await stop();
    }
  },
);
