import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sourceReadable, today, type Post, type Workspace } from "./model";
import {
  appendHistoryUnqueued,
  dataDirectory,
  enqueueWrite,
  readWorkspace,
  writeJsonAtomic,
} from "./store";
import { editorial, WorkflowError } from "./workflow";

// Automation jobs live apart from workspace.json so the UI PUT and its
// schemaVersion stay untouched. Two actions exist: a simulated connection test
// and a read-only search for ideas in authorized sources. Neither publishes.
const file = path.join(dataDirectory, "automation.json");
export const secretHeader = "x-automation-secret";
const uuid = z.string().uuid();
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const revision = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const errorCode = z.string().regex(/^[a-z0-9_]{1,60}$/);
const attempt = z.number().int().min(1).max(20);
export const maxSourcesPerSearch = 10;
export const maxIdeasPerSource = 5;

export const jobRequestSchema = z.discriminatedUnion("action", [
  z
    .object({ postId: id, action: z.literal("connection_test"), mode: z.literal("simulation") })
    .strict(),
  z.object({ action: z.literal("find_ideas"), mode: z.literal("live") }).strict(),
]);
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
    attempt,
    completedAt: z.string().datetime(),
  })
  .strict();
// What n8n may send back after reading sources. Untrusted: every field is
// bounded here and cleaned again before it is stored.
export const ideasResultSchema = z
  .object({
    jobId: uuid,
    mode: z.literal("live"),
    status: z.enum(["completed", "failed"]),
    ideas: z
      .array(
        z
          .object({
            sourceId: id,
            title: z.string().max(1000),
            url: z.string().max(2000),
            publishedAt: z.string().max(80).nullable().optional(),
          })
          .strict(),
      )
      .max(maxSourcesPerSearch * maxIdeasPerSource),
    skipped: z
      .array(z.object({ sourceId: id, reason: z.string().max(300) }).strict())
      .max(maxSourcesPerSearch),
    errorCode: errorCode.nullable().optional(),
    attempt,
    completedAt: z.string().datetime(),
  })
  .strict();
const storedIdeasResult = z.object({
  status: z.enum(["completed", "failed"]),
  accepted: z.number().int().min(0),
  rejected: z.number().int().min(0),
  skipped: z.array(z.object({ sourceId: id, reason: z.string().max(200) })),
  errorCode: errorCode.nullable().optional(),
  attempt,
  completedAt: z.string().datetime(),
});
const jobBase = {
  jobId: uuid,
  requestedAt: z.string().datetime(),
  status: z.enum(["queued", "sent", "delivery_failed", "completed", "failed"]),
  deliveryError: z.string().max(500),
  updatedAt: z.string().datetime(),
};
const connectionJobSchema = z.object({
  ...jobBase,
  action: z.literal("connection_test"),
  mode: z.literal("simulation"),
  postId: z.string(),
  contentRevision: revision,
  media: z.array(z.object({ id: z.string(), mime: z.string() })).max(20),
  result: resultSchema.nullable(),
});
const ideasJobSchema = z.object({
  ...jobBase,
  action: z.literal("find_ideas"),
  mode: z.literal("live"),
  sources: z
    .array(z.object({ id, url: z.string().url(), kind: z.enum(["owned", "rss"]) }))
    .min(1)
    .max(maxSourcesPerSearch),
  result: storedIdeasResult.nullable(),
});
const jobSchema = z.discriminatedUnion("action", [connectionJobSchema, ideasJobSchema]);
export const ideaSchema = z.object({
  id: uuid,
  sourceId: id,
  jobId: uuid,
  title: z.string().min(1).max(200),
  url: z.string().url(),
  publishedAt: z.string().datetime().nullable(),
  foundAt: z.string().datetime(),
  status: z.enum(["new", "discarded", "used"]),
});
export const automationSchema = z.object({
  schemaVersion: z.literal(1),
  jobs: z.array(jobSchema).max(5000),
  ideas: z.array(ideaSchema).max(3000).default([]),
});
export type Job = z.infer<typeof jobSchema>;
export type ConnectionJob = z.infer<typeof connectionJobSchema>;
export type IdeasJob = z.infer<typeof ideasJobSchema>;
export type JobResult = z.infer<typeof resultSchema>;
export type Idea = z.infer<typeof ideaSchema>;
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
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { schemaVersion: 1, jobs: [], ideas: [] };
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
// Loopback only: a misconfigured URL must never reach an external service.
function loopbackUrl(value: string | undefined) {
  try {
    const url = new URL(value || "");
    if (
      ["http:", "https:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password
    )
      return url;
  } catch {
    /* Missing or invalid URL leaves the webhook unset. */
  }
  return undefined;
}
/** Reads configuration on every call; nothing here may reach the browser. */
export function automationConfig() {
  const outbound = validSecret(process.env.EZRA_TO_N8N_SECRET);
  const inbound = validSecret(process.env.N8N_TO_EZRA_SECRET);
  const distinct = !outbound || !inbound || outbound !== inbound;
  return {
    inbound: distinct ? inbound : undefined,
    outbound: distinct ? outbound : undefined,
    webhook: loopbackUrl(process.env.N8N_WEBHOOK_URL),
    ideasWebhook: loopbackUrl(process.env.N8N_IDEAS_WEBHOOK_URL),
  };
}
export function secretMatches(received: string | null, expected: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return received !== null && timingSafeEqual(digest(received), digest(expected));
}

async function persistJob<T extends Job>(job: T): Promise<T> {
  const automation = await readAutomation();
  // Persist before sending, so a crash never leaves an untracked job.
  await saveAutomation({ ...automation, jobs: [...automation.jobs, job] });
  return job;
}
function newJobBase(now: Date) {
  const at = now.toISOString();
  return {
    jobId: crypto.randomUUID(),
    requestedAt: at,
    status: "queued" as const,
    deliveryError: "",
    updatedAt: at,
  };
}

export function createJob(postId: string, now = new Date()) {
  return enqueueWrite(async () => {
    const state = await readWorkspace();
    const post = state.posts.find((p) => p.id === postId);
    if (!post) throw new WorkflowError("Publicación no encontrada.", 404);
    return persistJob({
      ...newJobBase(now),
      action: "connection_test",
      mode: "simulation",
      postId,
      contentRevision: contentRevision(post, state),
      media: post.mediaIds.flatMap((id) => {
        const media = state.media.find((m) => m.id === id);
        return media ? [{ id: media.id, mime: media.mime }] : [];
      }),
      result: null,
    });
  });
}

/** One search per click: only authorized, current, real sources n8n may read. */
export function createIdeasJob(now = new Date()) {
  return enqueueWrite(async () => {
    const state = await readWorkspace();
    const sources = state.sources
      .filter((s) => sourceReadable(s, today(now)))
      .slice(0, maxSourcesPerSearch)
      .map((s) => ({ id: s.id, url: s.url, kind: s.kind as "owned" | "rss" }));
    if (!sources.length)
      throw new WorkflowError(
        "No hay fuentes para leer. Autoriza un sitio propio o un RSS con revisión vigente.",
        422,
      );
    return persistJob({
      ...newJobBase(now),
      action: "find_ideas",
      mode: "live",
      sources,
      result: null,
    });
  });
}

/** The contract sent to n8n: the job minus ezrá's own bookkeeping. */
function jobPayload(job: Job) {
  if (job.action === "connection_test")
    return {
      jobId: job.jobId,
      postId: job.postId,
      contentRevision: job.contentRevision,
      action: job.action,
      mode: job.mode,
      requestedAt: job.requestedAt,
      media: job.media,
    };
  return {
    jobId: job.jobId,
    action: job.action,
    mode: job.mode,
    requestedAt: job.requestedAt,
    sources: job.sources,
    maxIdeasPerSource,
  };
}

/** Sends the job contract to the local webhook and records only the delivery outcome. */
export async function dispatchJob(job: Job, webhook: URL, secret: string) {
  let deliveryError = "";
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", [secretHeader]: secret },
      body: JSON.stringify(jobPayload(job)),
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

function connectionEvent(job: ConnectionJob, result: JobResult) {
  return {
    id: `job-${job.jobId}`,
    at: new Date().toISOString(),
    title: "Prueba de conexión simulada",
    detail: `Resultado simulado: ${result.status === "completed" ? "completado" : `falló (${result.errorCode || "sin código"})`}. No se publicó nada.`,
    postId: job.postId,
  };
}
function ideasEvent(job: IdeasJob, result: z.infer<typeof storedIdeasResult>) {
  return {
    id: `job-${job.jobId}`,
    at: new Date().toISOString(),
    title: "Búsqueda de ideas",
    detail:
      result.status === "completed"
        ? `${result.accepted} ideas nuevas de ${job.sources.length} fuentes${result.skipped.length ? `; ${result.skipped.length} fuentes omitidas` : ""}. No se publicó nada.`
        : `La búsqueda falló (${result.errorCode || "sin código"}). No se publicó nada.`,
  };
}

// Text from the web is data: strip control characters and markup remnants.
function cleanText(value: string, max: number) {
  const invisible = (n: number) =>
    n < 32 || (n >= 127 && n < 160) || (n >= 0x200b && n <= 0x200f) || (n >= 0x202a && n <= 0x202e);
  return Array.from(value.replace(/<[^>]*>/g, " "), (c) => (invisible(c.codePointAt(0)!) ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function sameSite(link: URL, source: URL) {
  const host = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const a = host(link.hostname);
  const b = host(source.hostname);
  return a === b || a.endsWith(`.${b}`);
}
/** Keeps only https links on the same site as their source; never trusts n8n. */
function acceptIdeas(job: IdeasJob, raw: z.infer<typeof ideasResultSchema>, known: Idea[]) {
  const seen = new Set(known.map((i) => i.url));
  const perSource = new Map<string, number>();
  const ideas: Idea[] = [];
  let rejected = 0;
  const foundAt = new Date().toISOString();
  for (const item of raw.ideas) {
    const source = job.sources.find((s) => s.id === item.sourceId);
    const title = cleanText(item.title, 200);
    let link: URL | undefined;
    try {
      link = new URL(item.url);
    } catch {
      /* Rejected below. */
    }
    const count = perSource.get(item.sourceId) || 0;
    if (
      !source ||
      !title ||
      !link ||
      link.protocol !== "https:" ||
      link.username ||
      link.password ||
      !sameSite(link, new URL(source.url)) ||
      count >= maxIdeasPerSource
    ) {
      rejected++;
      continue;
    }
    perSource.set(item.sourceId, count + 1);
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    const published = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    ideas.push({
      id: crypto.randomUUID(),
      sourceId: item.sourceId,
      jobId: job.jobId,
      title,
      url: link.href,
      publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
      foundAt,
      status: "new",
    });
  }
  return { ideas, rejected };
}

/** Validates the callback against the job it answers; accepts only that job's shape. */
export function recordResult(raw: unknown) {
  return enqueueWrite(async () => {
    const jobId = z.object({ jobId: uuid }).passthrough().safeParse(raw);
    if (!jobId.success) throw new WorkflowError("Resultado inválido.", 422);
    const automation = await readAutomation();
    const job = automation.jobs.find((j) => j.jobId === jobId.data.jobId);
    if (!job) throw new WorkflowError("Encargo no encontrado.", 404);
    if (job.action === "connection_test") {
      const parsed = resultSchema.safeParse(raw);
      if (!parsed.success)
        throw new WorkflowError("Resultado inválido. Solo se aceptan resultados simulados.", 422);
      const result = parsed.data;
      if (job.contentRevision !== result.contentRevision)
        throw new WorkflowError("El resultado corresponde a otra versión del contenido.", 409);
      if (job.result) {
        const same =
          job.result.status === result.status &&
          (job.result.errorCode ?? null) === (result.errorCode ?? null);
        if (!same) throw new WorkflowError("Este encargo ya tiene un resultado distinto.", 409);
        // Repairs a missing event if a previous attempt stopped between both writes.
        await appendHistoryUnqueued(connectionEvent(job, job.result));
        return { job, duplicate: true };
      }
      job.result = result;
      job.status = result.status;
      job.updatedAt = new Date().toISOString();
      await saveAutomation(automation);
      await appendHistoryUnqueued(connectionEvent(job, result));
      return { job, duplicate: false };
    }
    const parsed = ideasResultSchema.safeParse(raw);
    if (!parsed.success) throw new WorkflowError("Resultado de búsqueda inválido.", 422);
    if (job.result) {
      const same =
        job.result.status === parsed.data.status &&
        (job.result.errorCode ?? null) === (parsed.data.errorCode ?? null);
      if (!same) throw new WorkflowError("Este encargo ya tiene un resultado distinto.", 409);
      await appendHistoryUnqueued(ideasEvent(job, job.result));
      return { job, duplicate: true };
    }
    const { ideas, rejected } =
      parsed.data.status === "completed"
        ? acceptIdeas(job, parsed.data, automation.ideas)
        : { ideas: [], rejected: 0 };
    job.result = {
      status: parsed.data.status,
      accepted: ideas.length,
      rejected,
      skipped: parsed.data.skipped
        .filter((s) => job.sources.some((source) => source.id === s.sourceId))
        .map((s) => ({ sourceId: s.sourceId, reason: cleanText(s.reason, 200) })),
      errorCode: parsed.data.errorCode ?? null,
      attempt: parsed.data.attempt,
      completedAt: parsed.data.completedAt,
    };
    job.status = parsed.data.status;
    job.updatedAt = new Date().toISOString();
    automation.ideas = [...automation.ideas, ...ideas].slice(-3000);
    await saveAutomation(automation);
    await appendHistoryUnqueued(ideasEvent(job, job.result));
    return { job, duplicate: false };
  });
}

/** Per-source reading summary and the ideas still open, for the Sources screen. */
export function ideasOverview(automation: Automation) {
  const sources: Record<string, { lastReadAt: string; ideas: number; skipped: string }> = {};
  for (const job of automation.jobs) {
    if (job.action !== "find_ideas" || !job.result) continue;
    for (const source of job.sources)
      sources[source.id] = {
        lastReadAt: job.result.completedAt,
        ideas: 0,
        skipped: job.result.skipped.find((s) => s.sourceId === source.id)?.reason || "",
      };
  }
  for (const idea of automation.ideas)
    if (sources[idea.sourceId]) sources[idea.sourceId].ideas++;
    else sources[idea.sourceId] = { lastReadAt: idea.foundAt, ideas: 1, skipped: "" };
  const last = automation.jobs.findLast((j) => j.action === "find_ideas");
  return {
    sources,
    ideas: automation.ideas.filter((i) => i.status === "new"),
    latestSearch:
      last && last.action === "find_ideas"
        ? {
            jobId: last.jobId,
            status: last.status,
            deliveryError: last.deliveryError,
            requestedAt: last.requestedAt,
            accepted: last.result?.accepted ?? 0,
            rejected: last.result?.rejected ?? 0,
          }
        : null,
  };
}

export function setIdeaStatus(ideaId: string, status: "discarded" | "used") {
  return enqueueWrite(async () => {
    const automation = await readAutomation();
    const idea = automation.ideas.find((i) => i.id === ideaId);
    if (!idea) throw new WorkflowError("Idea no encontrada.", 404);
    idea.status = status;
    await saveAutomation(automation);
    return idea;
  });
}
