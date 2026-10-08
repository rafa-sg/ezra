"use client";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus, Search, SlidersHorizontal, Mic, AudioLines, ArrowUp, FileText } from "lucide-react";
import { useLanguage } from "./i18n";
import { useActiveBusiness } from "./account/active-business";

type Turn = { role: "user" | "model"; text: string };
/** The server accepts up to 20 turns; older ones are dropped, starting on a question. */
const HISTORY_LIMIT = 20;
const QUESTION_LIMIT = 2000;

async function ask(businessId: string, history: Turn[], signal: AbortSignal) {
  const response = await fetch(`/api/ask?business=${encodeURIComponent(businessId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ history }),
    signal,
  });
  let data: { text?: string; error?: string } = {};
  try {
    data = await response.json();
  } catch {
    /* Non-JSON failure: handled below with a generic message. */
  }
  if (!response.ok || !data.text) throw new Error(data.error ?? "");
  return data.text;
}

/** Ask AI. Remount (via key) when the active business changes, so a conversation
 * never mixes data from two businesses. The conversation lives only in memory. */
export function Chat() {
  const { active } = useActiveBusiness();
  return <Conversation key={active?.id ?? "none"} />;
}

function Conversation() {
  const { t } = useLanguage();
  const { active, failed } = useActiveBusiness();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, loading]);

  const question = draft.trim();
  const canSend = !!active && !loading && question.length > 0;
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend || !active) return;
    const next = [...turns, { role: "user" as const, text: question }];
    let history = next.slice(-HISTORY_LIMIT);
    if (history[0].role !== "user") history = history.slice(1);
    setTurns(next);
    setDraft("");
    setError("");
    setLoading(true);
    controller.current = new AbortController();
    try {
      const text = await ask(active.id, history, controller.current.signal);
      setTurns((current) => [...current, { role: "model", text }]);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // The unanswered question goes back to the box so it can be retried.
      setTurns((current) => current.slice(0, -1));
      setDraft(question);
      setError((e as Error).message || t("askNetworkError"));
    } finally {
      setLoading(false);
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }
  function reset() {
    controller.current?.abort();
    setTurns([]);
    setDraft("");
    setError("");
    setLoading(false);
  }

  return (
    <div className="az-chat">
      <aside className="az-chat-sidebar">
        <h2>{t("chatGreeting")}</h2>
        <button type="button" onClick={reset} disabled={!turns.length && !error}>
          <Plus size={19} />
          {t("newChat")}
        </button>
        {(
          [
            { key: "search", icon: Search },
            { key: "chatTemplates", icon: FileText },
            { key: "customize", icon: SlidersHorizontal },
          ] as const
        ).map((item) => (
          <button key={item.key} type="button" aria-disabled="true" title={t("notAvailableYet")}>
            <item.icon size={19} />
            {t(item.key)}
          </button>
        ))}
        {active && (
          <div className="az-chat-account" title={`${t("workingWith")}: ${active.name}`}>
            {active.name.charAt(0).toUpperCase()} <span>{active.name}</span>
          </div>
        )}
      </aside>
      <section className={`az-chat-content${turns.length ? " has-turns" : ""}`}>
        {turns.length === 0 ? (
          <div className="az-chat-greeting">
            <h1>{t("chatFirst")}</h1>
            <h2>{t("chatDescription")}</h2>
            <p>{t("chatStart")}</p>
          </div>
        ) : (
          <div className="az-chat-log" aria-live="polite">
            {turns.map((turn, index) => (
              <div key={index} className={`az-chat-turn is-${turn.role}`}>
                <span className="az-visually-hidden">
                  {turn.role === "user" ? t("you") : t("assistant")}:{" "}
                </span>
                {turn.text}
              </div>
            ))}
            {loading && (
              <div className="az-chat-turn is-model is-loading" role="status">
                <span className="az-chat-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {t("askLoading")}
              </div>
            )}
            <div ref={end} />
          </div>
        )}
        {error && (
          <p className="az-chat-error" role="alert">
            {error}
          </p>
        )}
        <form className="az-composer" onSubmit={send}>
          <textarea
            aria-label={t("askAnything")}
            placeholder={
              active ? t("askAnything") : t(failed ? "askNoBusinessFailed" : "askNoBusiness")
            }
            value={draft}
            maxLength={QUESTION_LIMIT}
            disabled={!active}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div>
            <button type="button" className="az-icon" disabled aria-label={t("attach")}>
              <Plus size={22} />
            </button>
            <span />
            <button type="button" className="az-icon" disabled aria-label={t("microphone")}>
              <Mic size={21} />
            </button>
            <button type="button" className="az-icon" disabled aria-label={t("voice")}>
              <AudioLines size={21} />
            </button>
            <button
              type="submit"
              className="az-icon az-send"
              disabled={!canSend}
              aria-label={t("send")}
            >
              <ArrowUp size={22} />
            </button>
          </div>
        </form>
        <p className="az-muted">{t("askScope")}</p>
      </section>
    </div>
  );
}
