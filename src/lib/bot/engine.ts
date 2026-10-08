import { zone } from "../model";
import {
  lengthLimits,
  usable,
  type Bot,
  type Channel,
  type Conversation,
  type Knowledge,
  type Rule,
  type Weekly,
} from "./model";

/**
 * Deterministic local engine for the «Probar bot» simulator. It is not an AI and never
 * calls a provider: it applies the configured rules over approved, current knowledge only.
 * Customer text is treated as data; nothing in it can change rules or behavior.
 */
export type Outcome = "answered" | "clarification" | "handoff" | "hours" | "silent";
export type EngineResult = {
  reply: string | null;
  outcome: Outcome;
  reason: string;
  rule: { id: string; name: string } | null;
  knowledge: { id: string; title: string }[];
  priority: boolean;
  tag: string;
  insideHumanHours: boolean | null;
};

export function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
const stopwords = new Set(
  "que como cual cuales cuando donde para por con sin una uno unos unas los las del ese esa esto esta este estos estas hay tiene tienen tenes tienes quiero quisiera puedo podes puede pueden saber favor hola buenas buenos dias tardes noches gracias mas muy son sus mis tus usted ustedes the and for you are what how".split(
    " ",
  ),
);
export function tokens(value: string) {
  return normalize(value)
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length >= 3 && !stopwords.has(t));
}
const contains = (haystack: string, needle: string) => {
  const n = normalize(needle).trim();
  return (
    !!n &&
    new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(
      haystack,
    )
  );
};

const humanPatterns = [
  /\b(persona|humano|humana|asesor|asesora|agente|operador|operadora|representante|vendedor|vendedora)\b/,
  /\bhablar con (alguien|una persona|un asesor|una asesora|el encargado|la encargada)\b/,
  /\b(human|agent|real person)\b/,
];
const complaintPatterns = [
  /\b(reclamo|reclamar|queja|quejarme|molest[oa]|pesimo|pesima|estafa|denuncia|enojad[oa]|mal servicio|no sirve|no funciona)\b/,
  /\b(complaint|scam)\b/,
];
const paymentPatterns = [
  /\b(pago|pagos|pagar|pague|pagué|tarjeta|transferencia|cobro|cobraron|cobrar|factura|reembolso|deposito|payment|refund)\b/,
];
const anyMatch = (text: string, patterns: RegExp[]) => patterns.some((p) => p.test(text));

/** Weekday (0 = Monday) and "HH:mm" of a moment in El Salvador. */
export function localMoment(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  return { weekday, time: `${parts.hour}:${parts.minute}` };
}
/** null when no schedule was saved: unknown, never assumed. */
export function insideHours(week: Weekly, at: Date): boolean | null {
  if (!week.some((d) => d.enabled)) return null;
  const { weekday, time } = localMoment(at);
  const day = week[weekday];
  return day.enabled && day.open <= time && time < day.close;
}
const dayNames = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export function nextOpening(week: Weekly, at: Date): string | null {
  if (!week.some((d) => d.enabled)) return null;
  const { weekday, time } = localMoment(at);
  for (let offset = 0; offset < 8; offset++) {
    const index = (weekday + offset) % 7;
    const day = week[index];
    if (!day.enabled) continue;
    if (offset === 0 && time >= day.open) continue;
    const when = offset === 0 ? "hoy" : offset === 1 ? "mañana" : `el ${dayNames[index]}`;
    return `${when} a las ${day.open}`;
  }
  return null;
}

/** Best approved knowledge entries for a message; restricted topics are excluded. */
export function matchKnowledge(bot: Bot, message: string, day?: string) {
  const text = normalize(message);
  const words = new Set(tokens(message));
  return bot.knowledge
    .filter((k) => usable(k, day) && k.category !== "restricted")
    .map((entry) => {
      const keywordHits = entry.keywords.filter((k) => contains(text, k)).length;
      const titleHits = tokens(entry.title).filter((t) => words.has(t)).length;
      const contentHits = Math.min(
        3,
        new Set(tokens(entry.content).filter((t) => words.has(t))).size,
      );
      return { entry, score: keywordHits * 3 + titleHits * 2 + contentHits };
    })
    .filter((m) => m.score >= 3)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 2);
}
function restrictedTopic(bot: Bot, message: string, day?: string): Knowledge | undefined {
  const text = normalize(message);
  const words = new Set(tokens(message));
  return bot.knowledge.find(
    (k) =>
      usable(k, day) &&
      k.category === "restricted" &&
      (k.keywords.some((w) => contains(text, w)) ||
        tokens(k.title).filter((t) => words.has(t)).length >= 1),
  );
}

function trimTo(value: string, limit: number) {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return `${(end > limit * 0.5 ? cut.slice(0, end + 1) : cut).trim()}…`;
}

export function runEngine({
  bot,
  conversation,
  message,
  channel,
  at,
  onlyRule,
  day,
}: {
  bot: Bot;
  conversation: Conversation | null;
  message: string;
  channel: Channel;
  at: Date;
  onlyRule?: Rule;
  day?: string;
}): EngineResult {
  const base = { rule: null, knowledge: [], priority: false, tag: "" };
  const b = bot.behavior;
  const vos = b.address === "vos";
  const insideHuman = insideHours(b.humanHours, at);
  const result = (r: Partial<EngineResult> & Pick<EngineResult, "outcome" | "reason">) => ({
    ...base,
    reply: null,
    insideHumanHours: insideHuman,
    ...r,
  });
  if (bot.paused && !onlyRule)
    return result({
      outcome: "silent",
      reason: "El bot está en pausa en la configuración local; no responde.",
    });
  if (conversation?.control === "human")
    return result({
      outcome: "silent",
      reason:
        "Una persona tiene el control de esta conversación; el bot no responde hasta reactivarlo.",
    });
  if (!b.botAlways && insideHours(b.botHours, at) !== true)
    return result({
      outcome: "silent",
      reason: "Fuera del horario del bot: el mensaje queda para el equipo.",
    });

  const text = normalize(message);
  const signals = {
    human_request: anyMatch(text, humanPatterns),
    complaint: anyMatch(text, complaintPatterns),
    payment: anyMatch(text, paymentPatterns),
  };
  const restricted = restrictedTopic(bot, message, day);
  const matches = matchKnowledge(bot, message, day);
  const holds = (rule: Rule) =>
    rule.conditions.every((c) => {
      switch (c.type) {
        case "faq_match":
          return matches.length > 0;
        case "no_match":
          return matches.length === 0;
        case "outside_human_hours":
          return insideHuman === false;
        case "inside_human_hours":
          return insideHuman === true;
        case "keywords":
          return c.keywords.some((k) => contains(text, k));
        default:
          return signals[c.type];
      }
    });
  const candidates = onlyRule
    ? [onlyRule]
    : bot.rules
        .filter((r) => r.enabled && r.channels.includes(channel))
        .sort((x, y) => x.priority - y.priority || x.createdAt.localeCompare(y.createdAt));
  const rule = candidates.find((r) => (!onlyRule || r.channels.includes(channel)) && holds(r));
  const credit = rule ? { id: rule.id, name: rule.name } : null;
  const ruleExtras = { priority: !!rule?.markPriority, tag: rule?.tag ?? "" };

  const hoursNote = () => {
    if (insideHuman !== false) return "";
    const next = nextOpening(b.humanHours, at);
    return next ? ` El equipo atiende de nuevo ${next}.` : "";
  };
  const handoff = (reason: string, mandatoryName: string, priority = false) => ({
    ...result({
      outcome: "handoff" as const,
      reason,
      reply:
        (b.handoff ||
          (vos
            ? "Te voy a comunicar con una persona del equipo."
            : "Te voy a comunicar con una persona del equipo.")) + hoursNote(),
    }),
    rule: rule?.action === "handoff" ? credit : { id: "mandatory", name: mandatoryName },
    priority: priority || ruleExtras.priority,
    tag: rule?.action === "handoff" ? ruleExtras.tag : "",
  });

  // Mandatory rules come first and cannot be disabled.
  if (signals.human_request)
    return handoff(
      "El cliente pidió hablar con una persona.",
      "Regla obligatoria: derivar solicitudes de atención humana",
    );
  if (signals.complaint)
    return handoff(
      "Reclamo: requiere intervención de una persona.",
      "Regla obligatoria: derivar reclamos",
      true,
    );
  if (signals.payment)
    return handoff(
      "Asunto de pagos: requiere intervención de una persona.",
      "Regla obligatoria: derivar pagos",
      true,
    );
  if (restricted)
    return handoff(
      `Tema que el bot no puede responder: ${restricted.title}.`,
      "Regla obligatoria: temas restringidos",
    );

  const firstReply = !conversation?.messages.some((m) => m.author === "bot");
  const intro = () => {
    if (!firstReply) return "";
    const parts = [b.greeting, b.disclosure].filter(Boolean).join(" ");
    return parts ? `${parts}${b.emojis === "few" ? " 🙂" : ""}\n\n` : "";
  };
  const clarification = () => {
    const lastBot = [...(conversation?.messages ?? [])].reverse().find((m) => m.author === "bot");
    if (lastBot?.outcome === "clarification")
      return handoff(
        "Sigue sin haber información suficiente después de pedir una aclaración.",
        "Regla obligatoria: no inventar respuestas",
      );
    return {
      ...result({
        outcome: "clarification" as const,
        reason: "No hay conocimiento aprobado y vigente que responda la consulta.",
        reply:
          intro() +
          (b.missingInfo ||
            (vos
              ? "No tengo esa información confirmada. ¿Me podés dar más detalles de lo que necesitás?"
              : "No tengo esa información confirmada. ¿Me puedes dar más detalles de lo que necesitas?")),
      }),
      rule:
        rule?.action === "ask_clarification"
          ? credit
          : { id: "mandatory", name: "Regla obligatoria: pedir aclaración cuando faltan datos" },
      ...(rule?.action === "ask_clarification" ? ruleExtras : {}),
    };
  };

  if (!rule) {
    if (matches.length)
      return {
        ...handoff(
          "Hay conocimiento aprobado, pero ninguna regla habilitada permite responder en este canal.",
          "Sin regla aplicable",
        ),
        knowledge: matches.map((m) => ({ id: m.entry.id, title: m.entry.title })),
      };
    return clarification();
  }
  switch (rule.action) {
    case "reply_knowledge":
      if (!matches.length) return clarification();
      return {
        ...result({
          outcome: "answered",
          reason: "Respuesta tomada de conocimiento aprobado y vigente.",
          reply: intro() + trimTo(matches[0].entry.content, lengthLimits[b.length]),
        }),
        rule: credit,
        knowledge: matches.map((m) => ({ id: m.entry.id, title: m.entry.title })),
        ...ruleExtras,
      };
    case "ask_clarification":
      return clarification();
    case "handoff":
      return handoff("La regla deriva esta consulta a una persona.", rule.name);
    case "inform_hours": {
      const next = nextOpening(b.humanHours, at);
      return {
        ...result({
          outcome: "hours",
          reason:
            insideHuman === null
              ? "No hay horario del equipo guardado; no se puede informar cuándo habrá atención."
              : "Informa el horario del equipo.",
          reply:
            intro() +
            [
              b.outOfHours ||
                (vos
                  ? "En este momento el equipo no está disponible."
                  : "En este momento el equipo no está disponible."),
              next ? `Te atenderán ${next}.` : "",
            ]
              .filter(Boolean)
              .join(" "),
        }),
        rule: credit,
        ...ruleExtras,
      };
    }
  }
}

/** A moment inside (or outside) the team's schedule, for the simulator's hour selector. */
export function sampleMoment(week: Weekly, inside: boolean, now = new Date()): Date | null {
  const enabled = week.map((d, i) => ({ ...d, i })).filter((d) => d.enabled);
  if (!enabled.length) return null;
  // Walk forward minute blocks of 30 over the next 8 days from now (deterministic).
  const start = new Date(Math.floor(now.getTime() / 1_800_000) * 1_800_000);
  for (let step = 0; step < 8 * 48; step++) {
    const at = new Date(start.getTime() + step * 1_800_000);
    if (insideHours(week, at) === inside) return at;
  }
  return null;
}
