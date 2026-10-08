import { z } from "zod";
import { today } from "../model";

/**
 * «Bot de atención» configuration for one business, stored in its own bot.json.
 * Everything here is local: no channel is connected and no message is ever sent.
 */
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const text = (max: number) => z.string().trim().max(max);

export const channels = ["whatsapp", "messenger", "instagram"] as const;
export type Channel = (typeof channels)[number];
export const channelLabels: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  messenger: "Facebook Messenger",
  instagram: "Instagram",
};

export const knowledgeCategories = [
  "business",
  "products",
  "hours",
  "location",
  "policies",
  "faq",
  "links",
  "restricted",
] as const;
export type KnowledgeCategory = (typeof knowledgeCategories)[number];
export const categoryLabels: Record<KnowledgeCategory, string> = {
  business: "Descripción del negocio",
  products: "Productos y servicios",
  hours: "Horarios",
  location: "Ubicación y zonas de atención",
  policies: "Entregas, cambios y garantías",
  faq: "Preguntas frecuentes",
  links: "Enlaces autorizados",
  restricted: "Temas que el bot no puede responder",
};
export const knowledgeStatusLabels = {
  draft: "Borrador",
  approved: "Aprobada",
  archived: "Archivada",
} as const;

export const knowledgeSchema = z
  .object({
    id,
    title: text(160).min(1, "Escribí un título."),
    content: text(4000).min(1, "Escribí el contenido."),
    category: z.enum(knowledgeCategories),
    keywords: z.array(text(40).min(1)).max(20).default([]),
    status: z.enum(["draft", "approved", "archived"]),
    reviewBy: z.union([z.literal(""), day]).default(""),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    approvedAt: z.string().datetime().optional(),
  })
  .refine(
    (entry) =>
      entry.category !== "links" ||
      entry.content
        .split(/\s+/)
        .filter(Boolean)
        .every((link) => /^https:\/\/[^\s]+$/.test(link)),
    {
      message: "Los enlaces autorizados deben ser direcciones https, una por línea.",
      path: ["content"],
    },
  );
export type Knowledge = z.infer<typeof knowledgeSchema>;

const weekly = z
  .array(z.object({ enabled: z.boolean(), open: time, close: time }))
  .length(7)
  .refine((days) => days.every((d) => !d.enabled || d.open < d.close), {
    message: "La hora de cierre debe ser posterior a la de apertura.",
  });
export type Weekly = z.infer<typeof weekly>;
/** Index 0 = Monday … 6 = Sunday. */
export const weekdayNames = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export const emptyWeek = (): Weekly =>
  Array.from({ length: 7 }, () => ({ enabled: false, open: "08:00", close: "17:00" }));

export const behaviorSchema = z.object({
  assistantName: text(60),
  disclosure: text(300),
  tone: z.enum(["friendly", "professional", "formal"]),
  address: z.enum(["vos", "tu"]),
  length: z.enum(["short", "medium", "detailed"]),
  emojis: z.enum(["none", "few"]),
  greeting: text(500),
  outOfHours: text(500),
  missingInfo: text(500),
  handoff: text(500),
  languages: z
    .array(z.enum(["es", "en"]))
    .min(1)
    .max(2),
  botAlways: z.boolean(),
  botHours: weekly,
  humanHours: weekly,
  configuredAt: z.string().datetime().nullable(),
});
export type Behavior = z.infer<typeof behaviorSchema>;
export const toneLabels = { friendly: "Cercano", professional: "Profesional", formal: "Formal" };
export const lengthLabels = { short: "Corta", medium: "Media", detailed: "Detallada" };
export const lengthLimits = { short: 280, medium: 600, detailed: 1200 };

export const conditionTypes = [
  "faq_match",
  "no_match",
  "human_request",
  "complaint",
  "payment",
  "outside_human_hours",
  "inside_human_hours",
  "keywords",
] as const;
export const conditionLabels: Record<(typeof conditionTypes)[number], string> = {
  faq_match: "Hay conocimiento aprobado que responde la consulta",
  no_match: "No hay información suficiente",
  human_request: "El cliente pide hablar con una persona",
  complaint: "El mensaje es un reclamo",
  payment: "El mensaje trata sobre pagos",
  outside_human_hours: "Fuera del horario del equipo",
  inside_human_hours: "Dentro del horario del equipo",
  keywords: "Contiene palabras clave",
};
export const actionTypes = [
  "reply_knowledge",
  "ask_clarification",
  "handoff",
  "inform_hours",
] as const;
export const actionLabels: Record<(typeof actionTypes)[number], string> = {
  reply_knowledge: "Responder con la entrada aprobada",
  ask_clarification: "Pedir una aclaración",
  handoff: "Pausar el bot y derivar a una persona",
  inform_hours: "Informar cuándo habrá atención",
};
export const ruleSchema = z.object({
  id,
  name: text(80).min(1, "Escribí un nombre para la regla."),
  enabled: z.boolean(),
  event: z.literal("message_received"),
  conditions: z
    .array(
      z.object({
        type: z.enum(conditionTypes),
        keywords: z.array(text(40).min(1)).max(20).default([]),
      }),
    )
    .min(1, "Agregá al menos una condición.")
    .max(5),
  action: z.enum(actionTypes),
  markPriority: z.boolean(),
  tag: text(40),
  channels: z.array(z.enum(channels)).min(1, "Elegí al menos un canal.").max(3),
  priority: z.number().int().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  testedAt: z.string().datetime().nullable(),
});
export type Rule = z.infer<typeof ruleSchema>;

export const authors = ["customer", "bot", "human", "note"] as const;
export const conversationStatuses = ["new", "bot", "human", "resolved"] as const;
export const conversationStatusLabels = {
  new: "Nueva",
  bot: "En atención del bot",
  human: "Requiere atención humana",
  resolved: "Resuelta",
} as const;
export const messageSchema = z.object({
  id,
  at: z.string().datetime(),
  author: z.enum(authors),
  text: text(2000).min(1),
  ruleId: z.string().max(80).optional(),
  ruleName: z.string().max(120).optional(),
  knowledgeIds: z.array(id).max(5).optional(),
  outcome: z.string().max(40).optional(),
});
export const conversationSchema = z.object({
  id,
  // Only local tests exist in this stage; "real" is reserved for a future connected channel.
  origin: z.enum(["test", "real"]),
  label: text(60).min(1),
  channel: z.enum(channels),
  status: z.enum(conversationStatuses),
  control: z.enum(["bot", "human"]),
  assignee: text(80),
  handoffReason: text(200),
  priority: z.boolean(),
  tags: z.array(text(40).min(1)).max(10),
  messages: z.array(messageSchema).max(200),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;

export const activitySchema = z.object({
  id,
  at: z.string().datetime(),
  action: text(80),
  detail: text(200),
  result: z.enum(["ok", "blocked", "error"]),
});
export type Activity = z.infer<typeof activitySchema>;

export const botSchema = z.object({
  schemaVersion: z.literal(1),
  businessId: id,
  revision: z.number().int().nonnegative(),
  paused: z.boolean(),
  behavior: behaviorSchema,
  knowledge: z.array(knowledgeSchema).max(500),
  rules: z.array(ruleSchema).max(50),
  conversations: z.array(conversationSchema).max(50),
  activity: z.array(activitySchema).max(500),
  lastTestAt: z.string().datetime().nullable(),
});
export type Bot = z.infer<typeof botSchema>;

export function emptyBot(businessId: string): Bot {
  return {
    schemaVersion: 1,
    businessId,
    revision: 0,
    paused: false,
    behavior: {
      assistantName: "",
      disclosure: "",
      tone: "friendly",
      address: "vos",
      length: "short",
      emojis: "none",
      greeting: "",
      outOfHours: "",
      missingInfo: "",
      handoff: "",
      languages: ["es"],
      botAlways: true,
      botHours: emptyWeek(),
      humanHours: emptyWeek(),
      configuredAt: null,
    },
    knowledge: [],
    rules: [],
    conversations: [],
    activity: [],
    lastTestAt: null,
  };
}

/** Only approved entries whose review date has not passed may support an answer. */
export function usable(entry: Knowledge, day = today()) {
  return entry.status === "approved" && (!entry.reviewBy || entry.reviewBy >= day);
}

export type SetupStep = { key: string; title: string; done: boolean; detail: string; href: string };
/** Each step reflects saved data; nothing is marked as done by visiting a screen. */
export function setupSteps(bot: Bot, day = today()): SetupStep[] {
  const has = (categories: KnowledgeCategory[]) =>
    categories.filter((c) => bot.knowledge.some((k) => k.category === c && usable(k, day)));
  const info = has(["business", "hours", "location"]);
  const knowledge = has(["products", "policies", "faq"]);
  const b = bot.behavior;
  const behaviorDone = !!b.configuredAt && !!b.assistantName && !!b.greeting && !!b.missingInfo;
  const handoffDone = !!b.handoff && b.humanHours.some((d) => d.enabled);
  const testedAfterSetup = !!bot.lastTestAt;
  return [
    {
      key: "info",
      title: "Completar información del negocio",
      done: info.length === 3,
      detail:
        info.length === 3
          ? "Descripción, horarios y ubicación aprobados."
          : `Aprobá una entrada de descripción, horarios y ubicación (${info.length} de 3).`,
      href: "bot/knowledge",
    },
    {
      key: "knowledge",
      title: "Agregar conocimiento",
      done: knowledge.length > 0,
      detail: knowledge.length
        ? "Hay productos, políticas o preguntas frecuentes aprobadas."
        : "Aprobá al menos un producto, política o pregunta frecuente.",
      href: "bot/knowledge",
    },
    {
      key: "behavior",
      title: "Definir comportamiento",
      done: behaviorDone,
      detail: behaviorDone
        ? "Nombre, saludo y respuesta ante falta de información guardados."
        : "Guardá el nombre del asistente, el saludo y la respuesta cuando falta información.",
      href: "bot/behavior",
    },
    {
      key: "handoff",
      title: "Configurar derivación a una persona",
      done: handoffDone,
      detail: handoffDone
        ? "Mensaje de derivación y horario del equipo guardados."
        : "Guardá el mensaje de derivación y al menos un día del horario del equipo.",
      href: "bot/behavior",
    },
    {
      key: "test",
      title: "Probar respuestas",
      done: testedAfterSetup,
      detail: testedAfterSetup
        ? "Ya hay pruebas registradas en el simulador."
        : "Enviá un mensaje en el simulador local.",
      href: "bot/test",
    },
    {
      key: "channels",
      title: "Conectar canales en una etapa posterior",
      done: false,
      detail: "Pendiente de la integración con GHL. Hoy no hay canales conectados.",
      href: "bot/connections",
    },
  ];
}
export function setupStatus(bot: Bot, day = today()) {
  const steps = setupSteps(bot, day);
  const ready = steps.slice(0, 4).every((s) => s.done);
  if (ready) return steps[4].done ? "Listo para pruebas locales" : "Configurado, sin probar";
  return steps.slice(0, 4).some((s) => s.done) ? "Configuración en progreso" : "Bot sin configurar";
}

/** Our own validation messages are Spanish sentences; library defaults are replaced. */
export function spanishIssue(message?: string) {
  return message?.endsWith(".")
    ? message
    : "Datos inválidos: revisá los campos e intentá de nuevo.";
}
