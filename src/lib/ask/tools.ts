import { statusLabels, today, zone, type Post, type Status, type Workspace } from "../model";

/**
 * Read-only tools Gemini may call to answer Ask AI questions. Each one receives the
 * workspace of the business the signed-in account is allowed to see and returns the
 * minimum fields needed: no captions, contacts, emails, phones or message bodies.
 */
export const periods = ["today", "tomorrow", "this_week", "next_7_days", "upcoming"] as const;
export type Period = (typeof periods)[number];
const platforms = ["instagram", "facebook"] as const;
const statuses = Object.keys(statusLabels) as Status[];
const platformLabels = { instagram: "Instagram", facebook: "Facebook" } as const;
/** Planned posts count as scheduled; approved ones with a date are about to be. */
const scheduledStatuses: Status[] = ["planned", "approved"];
const MAX_POSTS = 25;

export const toolDeclarations = [
  {
    name: "get_scheduled_posts",
    description:
      "Lista las publicaciones con fecha prevista (estado «Fecha prevista» o «Aprobado» con fecha) del negocio activo en un periodo. Fechas en hora de El Salvador.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: [...periods],
          description:
            "today = hoy, tomorrow = mañana, this_week = semana actual de lunes a domingo, next_7_days = desde hoy y 7 días, upcoming = todas desde hoy.",
        },
        platform: { type: "string", enum: [...platforms] },
      },
      required: ["period"],
    },
  },
  {
    name: "count_posts_by_status",
    description:
      "Cuenta las publicaciones del negocio activo por estado (borrador, por revisar, aprobado, fecha prevista, publicado manualmente, rechazado).",
    parametersJsonSchema: {
      type: "object",
      properties: { platform: { type: "string", enum: [...platforms] } },
    },
  },
  {
    name: "count_posts_by_platform",
    description:
      "Cuenta las publicaciones del negocio activo por plataforma (Instagram, Facebook), opcionalmente de un solo estado.",
    parametersJsonSchema: {
      type: "object",
      properties: { status: { type: "string", enum: statuses } },
    },
  },
  {
    name: "get_post_metrics",
    description:
      "Métricas de las publicaciones (alcance, me gusta, comentarios, interacciones). Indica si la fuente está conectada.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "get_messages_summary",
    description:
      "Resumen de mensajes recibidos (quién escribió, cuándo y por qué canal). Indica si la fuente está conectada.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
];
export type ToolName = (typeof toolDeclarations)[number]["name"];

/** Local calendar day "YYYY-MM-DD" plus n days, computed on the date itself. */
function addDays(day: string, n: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
/** Inclusive date range of a period, resolved in the business timezone. */
export function periodRange(period: Period, now = new Date()) {
  const day = today(now);
  switch (period) {
    case "today":
      return { from: day, to: day };
    case "tomorrow":
      return { from: addDays(day, 1), to: addDays(day, 1) };
    case "this_week": {
      const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
      return { from: addDays(day, -weekday), to: addDays(day, 6 - weekday) };
    }
    case "next_7_days":
      return { from: day, to: addDays(day, 7) };
    case "upcoming":
      return { from: day, to: "" };
  }
}

const notConnected = (what: string) => ({
  available: false,
  status: "no conectado",
  detail: `${what} no está conectado en ezrá. No hay datos para responder.`,
});
/** Posts marked as examples never count as real business data. */
const realPosts = (workspace: Workspace) => workspace.posts.filter((post) => !post.demo);
const pick = <T extends string>(value: unknown, allowed: readonly T[]) =>
  allowed.includes(value as T) ? (value as T) : undefined;

export function runTool(
  name: string,
  args: Record<string, unknown> | undefined,
  workspace: Workspace,
  now = new Date(),
): Record<string, unknown> {
  const posts = realPosts(workspace);
  const examples = workspace.posts.length - posts.length;
  const context = {
    business: workspace.brand.name,
    timezone: zone,
    today: today(now),
    todayWeekday: weekday(today(now)),
  };
  switch (name) {
    case "get_scheduled_posts": {
      const period = pick(args?.period, periods) ?? "upcoming";
      const platform = pick(args?.platform, platforms);
      const { from, to } = periodRange(period, now);
      const matches = posts
        .filter(
          (post) =>
            scheduledStatuses.includes(post.status) &&
            post.plannedAt &&
            post.plannedAt.slice(0, 10) >= from &&
            (!to || post.plannedAt.slice(0, 10) <= to) &&
            (!platform || post.channel === platform),
        )
        .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt));
      return {
        ...context,
        period,
        from,
        to: to || "sin límite",
        platform: platform ? platformLabels[platform] : "todas",
        total: matches.length,
        posts: matches.slice(0, MAX_POSTS).map(summary),
        truncated: matches.length > MAX_POSTS,
        examplesExcluded: examples,
      };
    }
    case "count_posts_by_status": {
      const platform = pick(args?.platform, platforms);
      const scoped = posts.filter((post) => !platform || post.channel === platform);
      return {
        ...context,
        platform: platform ? platformLabels[platform] : "todas",
        total: scoped.length,
        byStatus: Object.fromEntries(
          statuses.map((status) => [
            statusLabels[status],
            scoped.filter((post) => post.status === status).length,
          ]),
        ),
        note: "«Publicado manualmente» lo marca el equipo; ezrá no está conectado a Instagram ni Facebook.",
        examplesExcluded: examples,
      };
    }
    case "count_posts_by_platform": {
      const status = pick(args?.status, statuses);
      const scoped = posts.filter((post) => !status || post.status === status);
      return {
        ...context,
        status: status ? statusLabels[status] : "todos",
        total: scoped.length,
        byPlatform: Object.fromEntries(
          platforms.map((p) => [
            platformLabels[p],
            scoped.filter((post) => post.channel === p).length,
          ]),
        ),
        examplesExcluded: examples,
      };
    }
    case "get_post_metrics":
      return notConnected("Ninguna fuente de métricas (Instagram, Facebook u otra)");
    case "get_messages_summary":
      return notConnected("Ninguna fuente de mensajes (WhatsApp, Instagram, Facebook u otra)");
    default:
      return { error: "Herramienta desconocida." };
  }
}

/** Weekday names are computed here; the model must not work them out itself. */
const weekdays = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const weekday = (day: string) => weekdays[new Date(`${day}T12:00:00Z`).getUTCDay()];
function summary(post: Post) {
  return {
    title: post.title.length > 80 ? `${post.title.slice(0, 79)}…` : post.title,
    platform: platformLabels[post.channel],
    format: post.format,
    status: statusLabels[post.status],
    date: post.plannedAt.slice(0, 10),
    weekday: weekday(post.plannedAt.slice(0, 10)),
    time: post.plannedAt.slice(11, 16),
  };
}
