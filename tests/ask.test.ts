import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/lib/seed";
import type { Post, Workspace } from "../src/lib/model";
import { periodRange, runTool } from "../src/lib/ask/tools";
import {
  answer,
  geminiError,
  plainText,
  withRetry,
  historySchema,
  takeRateLimit,
  QUESTIONS_PER_MINUTE,
  type Generate,
} from "../src/lib/ask/assistant";

// Wednesday 2026-10-07 23:30 in El Salvador = Thursday 05:30 UTC.
const now = new Date("2026-10-08T05:30:00Z");
function workspace(posts: Partial<Post>[]): Workspace {
  const seed = createSeed(now);
  const base = {
    ...seed.posts[0],
    demo: false,
    caption: "Texto privado 7777-7777 cliente@example.test",
  };
  return {
    ...seed,
    posts: posts.map((post, index) => ({ ...base, id: `p${index}`, ...post }) as Post),
  };
}
const ws = workspace([
  { title: "Hoy IG", status: "planned", channel: "instagram", plannedAt: "2026-10-07T18:00" },
  { title: "Domingo FB", status: "approved", channel: "facebook", plannedAt: "2026-10-11T09:00" },
  {
    title: "Próxima semana",
    status: "planned",
    channel: "instagram",
    plannedAt: "2026-10-12T09:00",
  },
  { title: "Ayer", status: "planned", channel: "instagram", plannedAt: "2026-10-06T09:00" },
  {
    title: "Borrador con fecha",
    status: "draft",
    channel: "facebook",
    plannedAt: "2026-10-07T10:00",
  },
  { title: "Publicado", status: "published", channel: "facebook", plannedAt: "" },
  {
    title: "Ejemplo",
    status: "planned",
    channel: "instagram",
    plannedAt: "2026-10-07T12:00",
    demo: true,
  },
]);

test("los periodos se resuelven en hora de El Salvador (semana de lunes a domingo)", () => {
  assert.deepEqual(periodRange("today", now), { from: "2026-10-07", to: "2026-10-07" });
  assert.deepEqual(periodRange("tomorrow", now), { from: "2026-10-08", to: "2026-10-08" });
  assert.deepEqual(periodRange("this_week", now), { from: "2026-10-05", to: "2026-10-11" });
  assert.deepEqual(periodRange("upcoming", now), { from: "2026-10-07", to: "" });
});

test("las herramientas devuelven solo datos mínimos y excluyen ejemplos", () => {
  const today = runTool("get_scheduled_posts", { period: "today" }, ws, now);
  assert.equal(today.total, 1);
  assert.deepEqual(today.posts, [
    {
      title: "Hoy IG",
      platform: "Instagram",
      format: ws.posts[0].format,
      status: "Fecha prevista",
      date: "2026-10-07",
      weekday: "miércoles",
      time: "18:00",
    },
  ]);
  assert.equal(today.examplesExcluded, 1);
  const week = runTool("get_scheduled_posts", { period: "this_week" }, ws, now);
  assert.equal(week.total, 3);
  const fb = runTool("get_scheduled_posts", { period: "upcoming", platform: "facebook" }, ws, now);
  assert.equal(fb.total, 1);
  const serialized = JSON.stringify([
    today,
    week,
    fb,
    runTool("count_posts_by_status", {}, ws, now),
  ]);
  for (const secret of ["Texto privado", "7777", "@example.test", "caption"])
    assert.ok(!serialized.includes(secret), secret);

  const byStatus = runTool("count_posts_by_status", {}, ws, now);
  assert.equal(byStatus.total, 6);
  assert.equal((byStatus.byStatus as Record<string, number>)["Fecha prevista"], 3);
  const byPlatform = runTool("count_posts_by_platform", { status: "published" }, ws, now);
  assert.deepEqual(byPlatform.byPlatform, { Instagram: 0, Facebook: 1 });
  // Invalid arguments fall back to safe defaults instead of failing.
  assert.equal(runTool("count_posts_by_platform", { status: "x" }, ws, now).total, 6);
});

test("métricas y mensajes se declaran no conectados", () => {
  for (const name of ["get_post_metrics", "get_messages_summary"]) {
    const result = runTool(name, {}, ws, now);
    assert.equal(result.available, false);
    assert.equal(result.status, "no conectado");
  }
  assert.ok("error" in runTool("delete_everything", {}, ws, now));
});

test("el ciclo ejecuta herramientas y devuelve la respuesta del modelo", async () => {
  const requests: Parameters<Generate>[0][] = [];
  const generate: Generate = async (request) => {
    requests.push(structuredClone(request));
    if (requests.length === 1)
      return {
        functionCalls: [{ id: "c1", name: "get_scheduled_posts", args: { period: "today" } }],
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    id: "c1",
                    name: "get_scheduled_posts",
                    args: { period: "today" },
                  },
                  thoughtSignature: "sig",
                },
              ],
            },
          },
        ],
      };
    return { text: "Hoy hay 1 publicación programada." };
  };
  const result = await answer({
    history: [{ role: "user", text: "¿Qué hay programado hoy?" }],
    workspace: ws,
    model: "test-model",
    generate,
    now,
  });
  assert.equal(result.text, "Hoy hay 1 publicación programada.");
  assert.deepEqual(result.toolsUsed, ["get_scheduled_posts"]);
  const second = requests[1];
  assert.equal(second.model, "test-model");
  const contents = second.contents as { role: string; parts: Record<string, unknown>[] }[];
  assert.equal(contents[1].parts[0].thoughtSignature, "sig");
  const response = contents[2].parts[0].functionResponse as { response: { total: number } };
  assert.equal(response.response.total, 1);
  assert.ok((second.config?.maxOutputTokens ?? 0) > 0);
});

test("el ciclo se detiene tras el límite de rondas de herramientas", async () => {
  let calls = 0;
  const generate: Generate = async (request) => {
    calls++;
    if (request.config?.toolConfig) return { text: "Listo." };
    return { functionCalls: [{ name: "count_posts_by_status", args: {} }] };
  };
  const result = await answer({
    history: [{ role: "user", text: "Contá" }],
    workspace: ws,
    model: "m",
    generate,
    now,
  });
  assert.equal(result.text, "Listo.");
  assert.equal(calls, 4);
  await assert.rejects(
    answer({
      history: [{ role: "user", text: "x" }],
      workspace: ws,
      model: "m",
      generate: async () => ({ text: "", candidates: [{ finishReason: "MAX_TOKENS" }] }),
    }),
    /límite de largo/,
  );
});

test("historial, errores de Gemini y límite por minuto", () => {
  assert.ok(historySchema.safeParse([{ role: "user", text: "hola" }]).success);
  assert.ok(!historySchema.safeParse([{ role: "model", text: "hola" }]).success);
  assert.ok(!historySchema.safeParse([]).success);
  assert.ok(!historySchema.safeParse([{ role: "system", text: "x" }]).success);
  assert.equal(geminiError({ status: 429 }).status, 429);
  assert.match(
    geminiError({ status: 400, message: "API key not valid" }).message,
    /GEMINI_API_KEY/,
  );
  assert.match(geminiError({ status: 404 }).message, /GEMINI_MODEL/);
  assert.equal(geminiError(new Error("boom")).status, 502);
  const start = 1_000_000;
  for (let i = 0; i < QUESTIONS_PER_MINUTE; i++) takeRateLimit("u@test", start + i);
  assert.throws(() => takeRateLimit("u@test", start + 10), /preguntas por minuto/);
  takeRateLimit("other@test", start + 10);
  takeRateLimit("u@test", start + 61_000);
});

test("el texto llega plano y con el día de la semana correcto", () => {
  assert.equal(
    plainText("**Instagram**: jueves – *Prueba* (2 * 3)\n## Título"),
    "Instagram: jueves – Prueba (2 * 3)\nTítulo",
  );
  const week = runTool("get_scheduled_posts", { period: "upcoming" }, ws, now);
  assert.equal(week.todayWeekday, "miércoles");
  assert.deepEqual(
    (week.posts as { date: string; weekday: string }[]).map((p) => [p.date, p.weekday]),
    [
      ["2026-10-07", "miércoles"],
      ["2026-10-11", "domingo"],
      ["2026-10-12", "lunes"],
    ],
  );
});

test("una sobrecarga temporal de Gemini se reintenta una vez y luego se explica", async () => {
  let calls = 0;
  const flaky = withRetry(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("high demand"), { status: 503 });
    return { text: "ok" };
  }, 0);
  assert.equal((await flaky({ model: "m", contents: [] })).text, "ok");
  assert.equal(calls, 2);
  const down = withRetry(async () => {
    throw Object.assign(new Error("high demand"), { status: 503 });
  }, 0);
  await assert.rejects(down({ model: "m", contents: [] }));
  assert.match(geminiError({ status: 503 }).message, /saturado/);
  assert.match(geminiError({ status: 504 }).message, /tardó demasiado/);
  let once = 0;
  const invalid = withRetry(async () => {
    once++;
    throw Object.assign(new Error("bad"), { status: 400 });
  }, 0);
  await assert.rejects(invalid({ model: "m", contents: [] }));
  assert.equal(once, 1);
});
