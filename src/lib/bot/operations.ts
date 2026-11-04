import { z } from "zod";
import { WorkflowError } from "../workflow";
import { today } from "../model";
import { runEngine, sampleMoment, type EngineResult } from "./engine";
import {
  behaviorSchema,
  channels,
  conditionTypes,
  actionTypes,
  knowledgeCategories,
  knowledgeSchema,
  ruleSchema,
  spanishIssue,
  type Activity,
  type Bot,
  type Conversation,
  type Rule,
} from "./model";

/** Every change the interface can request. The server validates each one. */
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const message = z.string().trim().min(1, "Escribí un mensaje.").max(2000);
const timeMode = z.enum(["now", "inside", "outside"]);
const knowledgeInput = z.object({
  id: idSchema.optional(),
  title: z.string(),
  content: z.string(),
  category: z.enum(knowledgeCategories),
  keywords: z.array(z.string()).max(20),
  reviewBy: z.string(),
});
const ruleInput = z.object({
  id: idSchema.optional(),
  name: z.string(),
  conditions: z
    .array(z.object({ type: z.enum(conditionTypes), keywords: z.array(z.string()).max(20) }))
    .max(5),
  action: z.enum(actionTypes),
  markPriority: z.boolean(),
  tag: z.string(),
  channels: z.array(z.enum(channels)),
  priority: z.number().int(),
});
export const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("setPaused"), paused: z.boolean() }),
  z.object({
    op: z.literal("saveBehavior"),
    behavior: behaviorSchema.omit({ configuredAt: true }),
  }),
  z.object({ op: z.literal("saveKnowledge"), entry: knowledgeInput }),
  z.object({
    op: z.literal("setKnowledgeStatus"),
    id: idSchema,
    status: z.enum(["draft", "approved", "archived"]),
  }),
  z.object({ op: z.literal("deleteKnowledge"), id: idSchema }),
  z.object({ op: z.literal("saveRule"), rule: ruleInput }),
  z.object({ op: z.literal("setRuleEnabled"), id: idSchema, enabled: z.boolean() }),
  z.object({ op: z.literal("deleteRule"), id: idSchema }),
  z.object({ op: z.literal("addSuggestedRules") }),
  z.object({
    op: z.literal("testRule"),
    id: idSchema,
    message,
    channel: z.enum(channels),
    time: timeMode,
  }),
  z.object({
    op: z.literal("simulate"),
    conversationId: idSchema.optional(),
    message,
    channel: z.enum(channels),
    time: timeMode,
  }),
  z.object({ op: z.literal("clearTests") }),
  z.object({
    op: z.literal("conversation"),
    id: idSchema,
    action: z.enum(["take", "return", "resolve", "reopen", "note", "reply", "tags", "reason"]),
    text: z.string().max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  }),
]);
export type Operation = z.infer<typeof operationSchema>;
export type OperationResult = { engine?: EngineResult; conversationId?: string } | undefined;

const uid = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);
function log(
  bot: Bot,
  at: string,
  action: string,
  detail: string,
  result: Activity["result"] = "ok",
) {
  bot.activity = [
    { id: uid(), at, action, detail: detail.slice(0, 200), result },
    ...bot.activity,
  ].slice(0, 500);
}
const clean = (list: string[]) => [...new Set(list.map((k) => k.trim()).filter(Boolean))];
function find<T extends { id: string }>(list: T[], id: string, what: string) {
  const item = list.find((x) => x.id === id);
  if (!item) throw new WorkflowError(`No se encontró ${what}.`, 404);
  return item;
}
function moment(bot: Bot, mode: "now" | "inside" | "outside", now: Date) {
  if (mode === "now") return now;
  const at = sampleMoment(bot.behavior.humanHours, mode === "inside", now);
  if (!at)
    throw new WorkflowError(
      "Guardá el horario del equipo en Comportamiento para probar este caso.",
      400,
    );
  return at;
}
const outcomeLabels: Record<EngineResult["outcome"], string> = {
  answered: "respondió con conocimiento aprobado",
  clarification: "pidió una aclaración",
  handoff: "derivó a una persona",
  hours: "informó el horario",
  silent: "no respondió",
};

export const suggestedRules: Omit<
  Rule,
  "id" | "createdAt" | "updatedAt" | "testedAt" | "enabled"
>[] = [
  {
    name: "Consulta frecuente",
    event: "message_received",
    conditions: [{ type: "faq_match", keywords: [] }],
    action: "reply_knowledge",
    markPriority: false,
    tag: "",
    channels: [...channels],
    priority: 50,
  },
  {
    name: "Información insuficiente",
    event: "message_received",
    conditions: [{ type: "no_match", keywords: [] }],
    action: "ask_clarification",
    markPriority: false,
    tag: "",
    channels: [...channels],
    priority: 60,
  },
  {
    name: "Solicitud de una persona",
    event: "message_received",
    conditions: [{ type: "human_request", keywords: [] }],
    action: "handoff",
    markPriority: false,
    tag: "atención humana",
    channels: [...channels],
    priority: 10,
  },
  {
    name: "Mensaje fuera de horario humano",
    event: "message_received",
    conditions: [
      { type: "outside_human_hours", keywords: [] },
      { type: "no_match", keywords: [] },
    ],
    action: "inform_hours",
    markPriority: false,
    tag: "",
    channels: [...channels],
    priority: 40,
  },
  {
    name: "Reclamo",
    event: "message_received",
    conditions: [{ type: "complaint", keywords: [] }],
    action: "handoff",
    markPriority: true,
    tag: "reclamo",
    channels: [...channels],
    priority: 5,
  },
];

export function applyOperation(
  bot: Bot,
  operation: Operation,
  { now = new Date(), actor = "" }: { now?: Date; actor?: string } = {},
): OperationResult {
  const at = now.toISOString();
  const day = today(now);
  switch (operation.op) {
    case "setPaused":
      bot.paused = operation.paused;
      log(
        bot,
        at,
        operation.paused ? "Bot pausado" : "Bot reactivado",
        "Solo afecta la configuración y el simulador local.",
      );
      return;
    case "saveBehavior":
      bot.behavior = { ...operation.behavior, configuredAt: at };
      log(bot, at, "Comportamiento guardado", "Cambios de configuración del asistente.");
      return;
    case "saveKnowledge": {
      const input = operation.entry;
      const fields = {
        title: input.title,
        content: input.content,
        category: input.category,
        keywords: clean(input.keywords),
        reviewBy: input.reviewBy,
      };
      if (input.id) {
        const entry = find(bot.knowledge, input.id, "la entrada");
        const wasApproved = entry.status === "approved";
        Object.assign(entry, fields, { updatedAt: at });
        // Any edit sends the entry back to review; archived entries also return as drafts.
        entry.status = "draft";
        delete entry.approvedAt;
        log(
          bot,
          at,
          "Conocimiento editado",
          `${input.title.slice(0, 120)}${wasApproved ? " · vuelve a borrador: requiere aprobación" : ""}`,
        );
      } else {
        bot.knowledge.unshift({
          id: uid(),
          ...fields,
          status: "draft",
          createdAt: at,
          updatedAt: at,
        });
        log(bot, at, "Conocimiento creado", input.title.slice(0, 120));
      }
      const parsed = z.array(knowledgeSchema).safeParse(bot.knowledge);
      if (!parsed.success)
        throw new WorkflowError(spanishIssue(parsed.error.issues[0]?.message), 400);
      return;
    }
    case "setKnowledgeStatus": {
      const entry = find(bot.knowledge, operation.id, "la entrada");
      if (operation.status === "approved" && entry.reviewBy && entry.reviewBy < day)
        throw new WorkflowError(
          "La fecha de revisión ya pasó. Actualizá la entrada antes de aprobarla.",
          400,
        );
      entry.status = operation.status;
      entry.updatedAt = at;
      if (operation.status === "approved") entry.approvedAt = at;
      else delete entry.approvedAt;
      const labels = { approved: "aprobado", archived: "archivado", draft: "devuelto a borrador" };
      log(bot, at, `Conocimiento ${labels[operation.status]}`, entry.title.slice(0, 120));
      return;
    }
    case "deleteKnowledge": {
      const entry = find(bot.knowledge, operation.id, "la entrada");
      if (entry.status === "approved")
        throw new WorkflowError("Archivá la entrada antes de eliminarla.", 400);
      bot.knowledge = bot.knowledge.filter((k) => k.id !== entry.id);
      log(bot, at, "Conocimiento eliminado", entry.title.slice(0, 120));
      return;
    }
    case "saveRule": {
      const input = operation.rule;
      const fields = {
        name: input.name,
        event: "message_received" as const,
        conditions: input.conditions.map((c) => ({
          type: c.type,
          keywords: c.type === "keywords" ? clean(c.keywords) : [],
        })),
        action: input.action,
        markPriority: input.markPriority,
        tag: input.tag.trim(),
        channels: [...new Set(input.channels)],
        priority: input.priority,
      };
      if (fields.conditions.some((c) => c.type === "keywords" && !c.keywords.length))
        throw new WorkflowError("Escribí al menos una palabra clave para esa condición.", 400);
      if (input.id) {
        const rule = find(bot.rules, input.id, "la regla");
        const wasEnabled = rule.enabled;
        // An edited rule must be tested again before it can run.
        Object.assign(rule, fields, { updatedAt: at, testedAt: null, enabled: false });
        log(
          bot,
          at,
          "Regla editada",
          `${input.name.slice(0, 120)}${wasEnabled ? " · desactivada hasta probarla" : ""}`,
        );
      } else {
        bot.rules.push({
          id: uid(),
          ...fields,
          enabled: false,
          createdAt: at,
          updatedAt: at,
          testedAt: null,
        });
        log(bot, at, "Regla creada", input.name.slice(0, 120));
      }
      const parsed = z.array(ruleSchema).safeParse(bot.rules);
      if (!parsed.success)
        throw new WorkflowError(spanishIssue(parsed.error.issues[0]?.message), 400);
      return;
    }
    case "setRuleEnabled": {
      const rule = find(bot.rules, operation.id, "la regla");
      if (operation.enabled && !rule.testedAt)
        throw new WorkflowError("Probá la regla en el simulador antes de habilitarla.", 400);
      rule.enabled = operation.enabled;
      log(bot, at, operation.enabled ? "Regla habilitada" : "Regla desactivada", rule.name);
      return;
    }
    case "deleteRule": {
      const rule = find(bot.rules, operation.id, "la regla");
      bot.rules = bot.rules.filter((r) => r.id !== rule.id);
      log(bot, at, "Regla eliminada", rule.name);
      return;
    }
    case "addSuggestedRules": {
      const existing = new Set(bot.rules.map((r) => r.name));
      const added = suggestedRules.filter((r) => !existing.has(r.name));
      for (const rule of added)
        bot.rules.push({
          ...rule,
          id: uid(),
          enabled: false,
          createdAt: at,
          updatedAt: at,
          testedAt: null,
        });
      log(
        bot,
        at,
        "Reglas sugeridas agregadas",
        `${added.length} reglas, desactivadas hasta probarlas`,
      );
      return;
    }
    case "testRule": {
      const rule = find(bot.rules, operation.id, "la regla");
      const engine = runEngine({
        bot,
        conversation: null,
        message: operation.message,
        channel: operation.channel,
        at: moment(bot, operation.time, now),
        onlyRule: rule,
        day,
      });
      const applied = engine.rule?.id === rule.id;
      if (applied) rule.testedAt = at;
      bot.lastTestAt = at;
      log(
        bot,
        at,
        "Prueba de regla",
        `${rule.name} · ${applied ? `se aplicó y ${outcomeLabels[engine.outcome]}` : "no se aplicó con ese mensaje"}`,
        applied ? "ok" : "blocked",
      );
      return { engine };
    }
    case "simulate": {
      let conversation = operation.conversationId
        ? bot.conversations.find((c) => c.id === operation.conversationId && c.origin === "test")
        : undefined;
      if (!conversation) {
        const number = bot.conversations.filter((c) => c.origin === "test").length + 1;
        conversation = {
          id: uid(),
          origin: "test",
          label: `Prueba local ${number}`,
          channel: operation.channel,
          status: "new",
          control: "bot",
          assignee: "Bot",
          handoffReason: "",
          priority: false,
          tags: [],
          messages: [],
          createdAt: at,
          updatedAt: at,
        };
        bot.conversations = [conversation, ...bot.conversations].slice(0, 50);
      }
      const when = moment(bot, operation.time, now);
      const engine = runEngine({
        bot,
        conversation,
        message: operation.message,
        channel: conversation.channel,
        at: when,
        day,
      });
      push(conversation, { author: "customer", text: operation.message }, at);
      if (engine.reply)
        push(
          conversation,
          {
            author: "bot",
            text: engine.reply,
            ruleId: engine.rule?.id,
            ruleName: engine.rule?.name,
            knowledgeIds: engine.knowledge.map((k) => k.id),
            outcome: engine.outcome,
          },
          at,
        );
      if (engine.outcome === "handoff") {
        conversation.control = "human";
        conversation.status = "human";
        conversation.assignee = "Sin asignar";
        conversation.handoffReason = engine.reason;
      } else if (conversation.control === "bot") conversation.status = "bot";
      else if (conversation.status === "resolved") conversation.status = "human";
      if (engine.priority) conversation.priority = true;
      if (engine.tag && !conversation.tags.includes(engine.tag))
        conversation.tags = [...conversation.tags, engine.tag].slice(0, 10);
      bot.lastTestAt = at;
      log(
        bot,
        at,
        "Prueba en simulador",
        `${conversation.label} · el bot ${outcomeLabels[engine.outcome]}${engine.rule ? ` · ${engine.rule.name}` : ""}`,
      );
      return { engine, conversationId: conversation.id };
    }
    case "clearTests": {
      const count = bot.conversations.filter((c) => c.origin === "test").length;
      bot.conversations = bot.conversations.filter((c) => c.origin !== "test");
      log(bot, at, "Pruebas locales borradas", `${count} conversaciones de prueba`);
      return;
    }
    case "conversation": {
      const conversation = find(bot.conversations, operation.id, "la conversación");
      const who = actor || "Una persona";
      const text = operation.text?.trim() ?? "";
      switch (operation.action) {
        case "take":
          conversation.control = "human";
          conversation.status = "human";
          conversation.assignee = who;
          log(bot, at, "Control tomado", `${conversation.label} · el bot deja de responder`);
          break;
        case "return":
          conversation.control = "bot";
          conversation.status = "bot";
          conversation.assignee = "Bot";
          log(bot, at, "Devuelta al bot", conversation.label);
          break;
        case "resolve":
          conversation.status = "resolved";
          log(bot, at, "Conversación resuelta", conversation.label);
          break;
        case "reopen":
          conversation.status = conversation.control === "human" ? "human" : "bot";
          log(bot, at, "Conversación reabierta", conversation.label);
          break;
        case "note":
        case "reply":
          if (!text) throw new WorkflowError("Escribí un texto.", 400);
          if (operation.action === "reply" && conversation.control !== "human")
            throw new WorkflowError("Tomá el control antes de responder como persona.", 400);
          push(conversation, { author: operation.action === "note" ? "note" : "human", text }, at);
          log(
            bot,
            at,
            operation.action === "note" ? "Nota interna" : "Respuesta de una persona (local)",
            `${conversation.label}${operation.action === "reply" ? " · no se envió a ningún canal" : ""}`,
          );
          break;
        case "tags":
          conversation.tags = clean(operation.tags ?? []).slice(0, 10);
          log(bot, at, "Etiquetas actualizadas", conversation.label);
          break;
        case "reason":
          conversation.handoffReason = text.slice(0, 200);
          log(bot, at, "Motivo de derivación actualizado", conversation.label);
          break;
      }
      conversation.updatedAt = at;
      return;
    }
  }
}

function push(
  conversation: Conversation,
  message: Omit<Conversation["messages"][number], "id" | "at">,
  at: string,
) {
  conversation.messages = [...conversation.messages, { id: uid(), at, ...message }].slice(-200);
  conversation.updatedAt = at;
}
