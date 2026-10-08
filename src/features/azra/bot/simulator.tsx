"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, RotateCcw } from "lucide-react";
import { channelLabels, channels, type Channel } from "@/lib/bot/model";
import type { EngineResult } from "@/lib/bot/engine";
import { href } from "../routes";
import { useBot } from "./data";
import { ResultDetails, TimeSelect, type TimeMode } from "./result";
import { MessageBubble } from "./inbox";

/** Local simulator: deterministic engine, never an AI provider, never a real channel. */
export function Simulator() {
  const { bot, run, busy } = useBot();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [time, setTime] = useState<TimeMode>("now");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<EngineResult | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const conversation = bot?.conversations.find((c) => c.id === conversationId);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [conversation?.messages.length]);
  if (!bot) return null;
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    const outcome = await run({ op: "simulate", conversationId, message: text, channel, time });
    if (outcome?.engine) {
      setResult(outcome.engine);
      setConversationId(outcome.conversationId);
      setMessage("");
    }
  }
  function reset() {
    setConversationId(undefined);
    setResult(null);
    setMessage("");
  }
  const tests = bot.conversations.filter((c) => c.origin === "test");
  const testCount = tests.length;
  return (
    <div className="bt-sim">
      <section className="bt-card bt-sim-chat" aria-label="Simulador">
        <p className="bt-sim-label">Prueba local: no envía mensajes</p>
        <div className="bt-form-grid">
          <label>
            Conversación de prueba
            <select
              value={conversation?.id ?? ""}
              onChange={(e) => {
                setConversationId(e.target.value || undefined);
                setResult(null);
              }}
            >
              <option value="">Nueva conversación</option>
              {tests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.control === "human" ? " · con una persona" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Canal a representar
            <select
              value={conversation?.channel ?? channel}
              disabled={!!conversation}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              {channels.map((c) => (
                <option key={c} value={c}>
                  {channelLabels[c]}
                </option>
              ))}
            </select>
          </label>
          <TimeSelect value={time} onChange={setTime} />
        </div>
        {bot.paused && (
          <p className="bt-banner" role="status">
            El bot está en pausa (configuración local): no va a responder.
          </p>
        )}
        {conversation?.control === "human" && (
          <p className="bt-banner" role="status">
            Una persona tiene el control de esta conversación: el bot no responde hasta devolvérsela
            en <Link href={href("bot/conversations")}>Conversaciones</Link>.
          </p>
        )}
        <div className="bt-thread" aria-live="polite">
          {!conversation?.messages.length ? (
            <p className="az-muted bt-thread-empty">
              Escribí como si fueras un cliente. Las respuestas son simuladas por un motor local con
              tus reglas y tu conocimiento aprobado; no es una IA conectada.
            </p>
          ) : (
            conversation.messages.map((m) => <MessageBubble key={m.id} message={m} bot={bot} />)
          )}
          <div ref={end} />
        </div>
        <form className="bt-sim-input" onSubmit={send}>
          <label className="az-visually-hidden" htmlFor="bt-sim-message">
            Mensaje de prueba
          </label>
          <input
            id="bt-sim-message"
            maxLength={2000}
            value={message}
            placeholder="Mensaje de prueba del cliente…"
            onChange={(e) => setMessage(e.target.value)}
          />
          <button
            className="az-icon az-send"
            disabled={busy || !message.trim()}
            aria-label="Enviar mensaje de prueba"
          >
            <ArrowUp size={20} />
          </button>
        </form>
        <div className="bt-actions">
          <button className="az-button" onClick={reset} disabled={!conversation}>
            <RotateCcw size={15} /> Reiniciar conversación
          </button>
          {testCount > 0 && (
            <button
              className="az-button bt-danger"
              disabled={busy}
              onClick={() => run({ op: "clearTests" }).then(reset)}
            >
              Borrar todas las pruebas ({testCount})
            </button>
          )}
        </div>
      </section>
      <aside className="bt-card bt-sim-why" aria-label="Por qué respondió así">
        <h2>Por qué respondió así</h2>
        {result ? (
          <ResultDetails result={result} bot={bot} />
        ) : (
          <p className="az-muted">
            Enviá un mensaje para ver la regla y el conocimiento aprobado que sustentan la
            respuesta.
          </p>
        )}
      </aside>
    </div>
  );
}
