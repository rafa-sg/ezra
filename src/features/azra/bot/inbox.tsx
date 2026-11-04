"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  Bot as BotIcon,
  CheckCircle2,
  Hand,
  RotateCcw,
  StickyNote,
  User,
  UserRound,
} from "lucide-react";
import {
  channelLabels,
  channels,
  conversationStatusLabels,
  conversationStatuses,
  type Bot,
  type Channel,
  type Conversation,
  type Message,
} from "@/lib/bot/model";
import { displayDate } from "@/lib/model";
import { href } from "../routes";
import { useBot } from "./data";

const time = (iso: string) =>
  displayDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const authorLabels = {
  customer: "Cliente",
  bot: "Bot (simulado)",
  human: "Persona",
  note: "Nota interna",
};

export function MessageBubble({ message, bot }: { message: Message; bot: Bot }) {
  const Icon = { customer: UserRound, bot: BotIcon, human: User, note: StickyNote }[message.author];
  const knowledge = (message.knowledgeIds ?? [])
    .map((id) => bot.knowledge.find((k) => k.id === id)?.title)
    .filter(Boolean);
  return (
    <div className={`bt-bubble is-${message.author}`}>
      <p className="bt-bubble-meta">
        <Icon size={13} aria-hidden="true" /> {authorLabels[message.author]} · {time(message.at)}
      </p>
      <p className="bt-bubble-text">{message.text}</p>
      {message.author === "bot" && (message.ruleName || knowledge.length > 0) && (
        <p className="bt-bubble-source">
          {message.ruleName && `Regla: ${message.ruleName}`}
          {knowledge.length > 0 && ` · Conocimiento: ${knowledge.join(", ")}`}
        </p>
      )}
    </div>
  );
}

export function Inbox() {
  const { bot, run, busy } = useBot();
  const [selectedId, setSelectedId] = useState("");
  const [channel, setChannel] = useState<"" | Channel>("");
  const [status, setStatus] = useState<"" | Conversation["status"]>("");
  const [owner, setOwner] = useState<"" | "bot" | "human">("");
  const [origin, setOrigin] = useState<"test" | "real">("test");
  const [query, setQuery] = useState("");
  if (!bot) return null;
  const q = query.trim().toLowerCase();
  const list = bot.conversations
    .filter(
      (c) =>
        c.origin === origin &&
        (!channel || c.channel === channel) &&
        (!status || c.status === status) &&
        (!owner || c.control === owner) &&
        (!q ||
          c.label.toLowerCase().includes(q) ||
          c.messages.some((m) => m.author !== "note" && m.text.toLowerCase().includes(q))),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selected = list.find((c) => c.id === selectedId) ?? list[0];
  return (
    <div className="bt-stack">
      <div className="bt-toolbar bt-filters">
        <div role="group" aria-label="Origen" className="bt-segment">
          {(["test", "real"] as const).map((o) => (
            <button
              key={o}
              aria-pressed={origin === o}
              className={origin === o ? "is-active" : ""}
              onClick={() => setOrigin(o)}
            >
              {o === "test" ? "Pruebas locales" : "Reales"}
            </button>
          ))}
        </div>
        <label>
          Canal
          <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="">Todos</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {channelLabels[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">Todos</option>
            {conversationStatuses.map((s) => (
              <option key={s} value={s}>
                {conversationStatusLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsable
          <select value={owner} onChange={(e) => setOwner(e.target.value as typeof owner)}>
            <option value="">Todos</option>
            <option value="bot">Bot</option>
            <option value="human">Persona</option>
          </select>
        </label>
        <label className="bt-search">
          Buscar
          <input
            type="search"
            value={query}
            placeholder="Nombre o texto"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {origin === "real" && list.length === 0 ? (
        <div className="bt-empty">
          <h2>Sin conversaciones reales</h2>
          <p>
            Los canales no están conectados. Las conversaciones reales aparecerán aquí cuando
            autorices una conexión directa con cada plataforma.
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="bt-empty">
          <h2>
            {bot.conversations.some((c) => c.origin === "test")
              ? "Sin resultados"
              : "Sin conversaciones de prueba"}
          </h2>
          <p>
            {bot.conversations.some((c) => c.origin === "test")
              ? "Ninguna conversación coincide con los filtros."
              : "No se crean contactos ni historiales de ejemplo. Probá el bot y tus pruebas aparecerán aquí rotuladas como «Prueba local»."}
          </p>
          <Link className="az-button" href={href("bot/test")}>
            Ir a Probar bot
          </Link>
        </div>
      ) : (
        <div className="bt-inbox">
          <ul className="bt-inbox-list" aria-label="Conversaciones">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  className={c.id === selected?.id ? "is-active" : ""}
                  aria-current={c.id === selected?.id ? "true" : undefined}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="bt-inbox-title">
                    {c.label}
                    {c.priority && <span className="bt-badge is-warning">Prioridad</span>}
                  </span>
                  <span className="az-muted bt-small">
                    {channelLabels[c.channel]} · {conversationStatusLabels[c.status]}
                  </span>
                  <span className="bt-inbox-preview">
                    {c.messages.filter((m) => m.author !== "note").at(-1)?.text ?? "Sin mensajes"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected && <Thread conversation={selected} bot={bot} busy={busy} run={run} />}
        </div>
      )}
    </div>
  );
}

function Thread({
  conversation,
  bot,
  busy,
  run,
}: {
  conversation: Conversation;
  bot: Bot;
  busy: boolean;
  run: ReturnType<typeof useBot>["run"];
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("note");
  const [tags, setTags] = useState(conversation.tags.join(", "));
  const [reason, setReason] = useState(conversation.handoffReason);
  const [shownFor, setShownFor] = useState(conversation.id);
  if (shownFor !== conversation.id) {
    setShownFor(conversation.id);
    setTags(conversation.tags.join(", "));
    setReason(conversation.handoffReason);
    setText("");
  }
  const act = (action: "take" | "return" | "resolve" | "reopen") =>
    run({ op: "conversation", id: conversation.id, action });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await run({ op: "conversation", id: conversation.id, action: mode, text })) setText("");
  }
  const human = conversation.control === "human";
  return (
    <>
      <section className="bt-inbox-thread" aria-label={`Historial de ${conversation.label}`}>
        <div className="bt-thread">
          {conversation.messages.map((m) => (
            <MessageBubble key={m.id} message={m} bot={bot} />
          ))}
        </div>
        <form className="bt-thread-compose" onSubmit={submit}>
          <div role="group" aria-label="Tipo de texto" className="bt-segment">
            <button
              type="button"
              aria-pressed={mode === "note"}
              className={mode === "note" ? "is-active" : ""}
              onClick={() => setMode("note")}
            >
              Nota interna
            </button>
            <button
              type="button"
              aria-pressed={mode === "reply"}
              className={mode === "reply" ? "is-active" : ""}
              disabled={!human}
              title={human ? undefined : "Tomá el control para responder como persona"}
              onClick={() => setMode("reply")}
            >
              Respuesta de una persona
            </button>
          </div>
          <label className="az-visually-hidden" htmlFor="bt-compose">
            {mode === "note" ? "Nota interna" : "Respuesta"}
          </label>
          <textarea
            id="bt-compose"
            rows={2}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="az-muted bt-small">
            {mode === "note"
              ? "Solo visible para el equipo."
              : "Se guarda localmente; no se envía a ningún canal."}
          </p>
          <button
            className="az-button ec-primary"
            disabled={busy || !text.trim() || (mode === "reply" && !human)}
          >
            Guardar
          </button>
        </form>
      </section>
      <aside className="bt-inbox-info" aria-label="Información de la conversación">
        <span className="bt-badge is-test">
          {conversation.origin === "test" ? "Prueba local" : "Real"}
        </span>
        <dl className="bt-result">
          <div>
            <dt>Canal</dt>
            <dd>{channelLabels[conversation.channel]}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{conversationStatusLabels[conversation.status]}</dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd>{human ? `Persona · ${conversation.assignee}` : "Bot"}</dd>
          </div>
        </dl>
        {human && (
          <p className="bt-banner" role="status">
            El bot no responde en esta conversación hasta devolvérsela.
          </p>
        )}
        <div className="bt-actions bt-actions-stack">
          {!human ? (
            <button className="az-button" disabled={busy} onClick={() => act("take")}>
              <Hand size={15} /> Tomar control
            </button>
          ) : (
            <button className="az-button" disabled={busy} onClick={() => act("return")}>
              <BotIcon size={15} /> Devolver al bot
            </button>
          )}
          {conversation.status !== "resolved" ? (
            <button className="az-button" disabled={busy} onClick={() => act("resolve")}>
              <CheckCircle2 size={15} /> Resolver
            </button>
          ) : (
            <button className="az-button" disabled={busy} onClick={() => act("reopen")}>
              <RotateCcw size={15} /> Reabrir
            </button>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run({ op: "conversation", id: conversation.id, action: "reason", text: reason });
          }}
        >
          <label>
            Motivo de derivación
            <textarea
              rows={2}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="az-button" disabled={busy}>
            Guardar motivo
          </button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run({
              op: "conversation",
              id: conversation.id,
              action: "tags",
              tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            });
          }}
        >
          <label>
            Etiquetas (separadas por coma)
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <button className="az-button" disabled={busy}>
            Guardar etiquetas
          </button>
        </form>
      </aside>
    </>
  );
}
