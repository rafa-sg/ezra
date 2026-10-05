import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Post, Workspace } from "./model";
import {
  appendHistoryUnqueued,
  dataDirectory,
  enqueueWrite,
  readWorkspace,
  writeJsonAtomic,
} from "./store";
import { editorial, WorkflowError } from "./workflow";

// Automation jobs live apart from workspace.json so the UI PUT and its
// schemaVersion stay untouched. This phase only accepts simulated jobs.
const file = path.join(dataDirectory, "automation.json");
export const secretHeader = "x-automation-secret";
const uuid = z.string().uuid();
const revision = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const errorCode = z.string().regex(/^[a-z0-9_]{1,60}$/);
export const jobRequestSchema = z
  .object({
    postId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    action: z.literal("connection_test"),
    mode: z.literal("simulation"),
  })
  .strict();
export const resultSchema = z
  .object({
    jobId: uuid,
    contentRevision: revision,
    mode: z.literal("simulation"),
    status: z.enum(["completed", "failed"]),
    // A simulation never carries provider evidence of a real publication.
    providerId: z.null().optional(),
    publishedUrl: z.null().optional(),
    errorCode: errorCode.nullable().optional(),
    attempt: z.number().int().min(1).max(20),
    completedAt: z.string().datetime(),
  })
  .strict();
const jobSchema = z.object({
  jobId: uuid,
  postId: z.string(),
  contentRevision: revision,
  action: z.literal("connection_test"),
  mode: z.literal("simulation"),
  requestedAt: z.string().datetime(),
  media: z.array(z.object({ id: z.string(), mime: z.string() })).max(20),
  status: z.enum(["queued", "sent", "delivery_failed", "completed", "failed"]),
  deliveryError: z.string().max(500),
  result: resultSchema.nullable(),
  updatedAt: z.string().datetime(),
});
export const automationSchema = z.object({
  schemaVersion: z.literal(1),
  jobs: z.array(jobSchema).max(5000),
});
export type Job = z.infer<typeof jobSchema>;
export type JobResult = z.infer<typeof resultSchema>;
export type Automation = z.infer<typeof automationSchema>;

/** Fingerprint of everything whose change invalidates an approval. */
export function contentRevision(post: Post, state: Workspace) {
  const sources = post.sourceIds.map((id) => state.sources.find((s) => s.id === id) ?? null);
  const hash = createHash("sha256")
    .update(JSON.stringify([editorial(post), sources, state.brand]))
    .digest("hex");
  return `sha256:${hash}`;
}

export async function readAutomation(): Promise<Automation> {
  try {
    return automationSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, jobs: [] };
    throw new Error(
      "No se pudo leer el archivo de automatización. Se conservó intacto; restaura una copia o revisa el archivo.",
    );
  }
}
async function saveAutomation(state: Automation) {
  await writeJsonAtomic(file, automationSchema.parse(state));
}

function validSecret(value: string | undefined) {
  return typeof value === "string" && value.length >= 32 ? value : undefined;
}
/** Reads configuration on every call; nothing here may reach the browser. */
export function automationConfig() {
  const outbound = validSecret(process.env.EZRA_TO_N8N_SECRET);
  const inbound = validSecret(process.env.N8N_TO_EZRA_SECRET);
  const distinct = !outbound || !inbound || outbound !== inbound;
  let webhook: URL | undefined;
  try {
    const url = new URL(process.env.N8N_WEBHOOK_URL || "");
    // Loopback only: a misconfigured URL must never reach an external service.
    if (
      ["http:", "https:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password
    )
      webhook = url;
  } catch {
    /* Missing or invalid URL leaves the webhook unset. */
  }
  return {
    inbound: distinct ? inbound : undefined,
    outbound: distinct ? outbound : undefined,
    webhook,
  };
}
export function secretMatches(received: string | null, expected: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return received !== null && timingSafeEqual(digest(received), digest(expected));
}

export function createJob(postId: string, now = new Date()) {
  return enqueueWrite(async () => {
    const state = await readWorkspace();
    const post = state.posts.find((p) => p.id === postId);
    if (!post) throw new WorkflowError("Publicación no encontrada.", 404);
    const automation = await readAutomation();
    const at = now.toISOString();
    const job: Job = {
      jobId: crypto.randomUUID(),
      postId,
      contentRevision: contentRevision(post, state),
      action: "connection_test",
      mode: "simulation",
      requestedAt: at,
      media: post.mediaIds.flatMap((id) => {
        const media = state.media.find((m) => m.id === id);
        return media ? [{ id: media.id, mime: media.mime }] : [];
      }),
      status: "queued",
      deliveryError: "",
      result: null,
      updatedAt: at,
    };
    // Persist before sending, so a crash never leaves an untracked job.
    await saveAutomation({ ...automation, jobs: [...automation.jobs, job] });
    return job;
  });
}

/** Sends the job contract to the local webhook and records only the delivery outcome. */
export async function dispatchJob(job: Job, webhook: URL, secret: string) {
  let deliveryError = "";
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", [secretHeader]: secret },
      body: JSON.stringify({
        jobId: job.jobId,
        postId: job.postId,
        contentRevision: job.contentRevision,
        action: job.action,
        mode: job.mode,
        requestedAt: job.requestedAt,
        media: job.media,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) deliveryError = `El receptor respondió HTTP ${response.status}.`;
  } catch {
    deliveryError = "No se pudo contactar al receptor local de automatización.";
  }
  return enqueueWrite(async () => {
    const automation = await readAutomation();
    const current = automation.jobs.find((j) => j.jobId === job.jobId);
    if (!current) throw new WorkflowError("Encargo no encontrado.", 404);
    // A fast callback may already have completed the job; never move it backwards.
    if (current.status === "queued") {
      current.status = deliveryError ? "delivery_failed" : "sent";
      current.deliveryError = deliveryError;
      current.updatedAt = new Date().toISOString();
      await saveAutomation(automation);
    }
    return current;
  });
}

function resultEvent(job: Job, result: JobResult) {
  return {
    id: `job-${job.jobId}`,
    at: new Date().toISOString(),
    title: "Prueba de conexión simulada",
    detail: `Resultado simulado: ${result.status === "completed" ? "completado" : `falló (${result.errorCode || "sin código"})`}. No se publicó nada.`,
    postId: job.postId,
  };
}

export function recordResult(result: JobResult) {
  return enqueueWrite(async () => {
    const automation = await readAutomation();
    const job = automation.jobs.find((j) => j.jobId === result.jobId);
    if (!job) throw new WorkflowError("Encargo no encontrado.", 404);
    if (job.contentRevision !== result.contentRevision)
      throw new WorkflowError("El resultado corresponde a otra versión del contenido.", 409);
    if (job.result) {
      const same =
        job.result.status === result.status &&
        (job.result.errorCode ?? null) === (result.errorCode ?? null);
      if (!same) throw new WorkflowError("Este encargo ya tiene un resultado distinto.", 409);
      // Repairs a missing event if a previous attempt stopped between both writes.
      await appendHistoryUnqueued(resultEvent(job, job.result));
      return { job, duplicate: true };
    }
    job.result = result;
    job.status = result.status;
    job.updatedAt = new Date().toISOString();
    await saveAutomation(automation);
    await appendHistoryUnqueued(resultEvent(job, result));
    return { job, duplicate: false };
  });
}
