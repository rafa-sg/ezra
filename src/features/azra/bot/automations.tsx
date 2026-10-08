"use client";
import { useState, type FormEvent } from "react";
import { FlaskConical, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import {
  actionLabels,
  actionTypes,
  channelLabels,
  channels,
  conditionLabels,
  conditionTypes,
  type Channel,
  type Rule,
} from "@/lib/bot/model";
import type { EngineResult } from "@/lib/bot/engine";
import { Modal } from "../ui";
import { useBot } from "./data";
import { ResultDetails, TimeSelect, type TimeMode } from "./result";

type RuleDraft = {
  id?: string;
  name: string;
  conditions: { type: Rule["conditions"][number]["type"]; keywords: string }[];
  action: Rule["action"];
  markPriority: boolean;
  tag: string;
  channels: Channel[];
  priority: number;
};
const blank = (): RuleDraft => ({
  name: "",
  conditions: [{ type: "faq_match", keywords: "" }],
  action: "reply_knowledge",
  markPriority: false,
  tag: "",
  channels: [...channels],
  priority: 50,
});

export function AutomationsScreen() {
  const { bot, run, busy } = useBot();
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  if (!bot) return null;
  const ordered = [...bot.rules].sort(
    (a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const ok = await run({
      op: "saveRule",
      rule: {
        ...draft,
        conditions: draft.conditions.map((c) => ({
          type: c.type,
          keywords: c.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        })),
      },
    });
    if (ok) setDraft(null);
  }
  return (
    <div className="bt-stack">
      <div className="bt-toolbar">
        <p className="az-muted bt-small">
          Cada regla es <strong>evento → condiciones → acción</strong>. Se ejecutan solo en el
          simulador. Una regla nueva o editada queda desactivada hasta probarla. Las reglas
          obligatorias (persona, reclamos, pagos, temas restringidos) siempre van primero.
        </p>
        <span />
        <button
          className="az-button"
          disabled={busy}
          onClick={() => run({ op: "addSuggestedRules" })}
        >
          Agregar reglas sugeridas
        </button>
        <button className="az-button ec-primary" onClick={() => setDraft(blank())}>
          <Plus size={16} /> Nueva regla
        </button>
      </div>
      {ordered.length === 0 ? (
        <div className="bt-empty">
          <h2>Sin reglas todavía</h2>
          <p>
            Sin reglas, el bot no responde con conocimiento: pide aclaraciones o deriva a una
            persona. Agregá las reglas sugeridas (consulta frecuente, información insuficiente,
            solicitud de una persona, fuera de horario y reclamo) o creá una propia.
          </p>
        </div>
      ) : (
        <ol className="bt-entries">
          {ordered.map((rule, index) => (
            <li key={rule.id} className="bt-card">
              <div className="bt-entry-head">
                <div>
                  <p className="bt-label">
                    Orden {index + 1} · prioridad {rule.priority}
                  </p>
                  <h3>{rule.name}</h3>
                </div>
                <span
                  className={`bt-badge is-${rule.enabled ? "approved" : rule.testedAt ? "draft" : "warning"}`}
                >
                  {rule.enabled
                    ? "Habilitada"
                    : rule.testedAt
                      ? "Probada, desactivada"
                      : "Sin probar"}
                </span>
              </div>
              <p className="bt-rule-line">
                <span>Llega un mensaje</span> →{" "}
                <span>
                  {rule.conditions
                    .map((c) =>
                      c.type === "keywords"
                        ? `Contiene: ${c.keywords.join(", ")}`
                        : conditionLabels[c.type],
                    )
                    .join(" y ")}
                </span>{" "}
                → <span>{actionLabels[rule.action]}</span>
              </p>
              <p className="az-muted bt-small">
                Alcance: {rule.channels.map((c) => channelLabels[c]).join(", ")}
                {rule.markPriority && " · marca prioridad"}
                {rule.tag && ` · etiqueta «${rule.tag}»`}
              </p>
              <div className="bt-actions">
                <button
                  className="az-button"
                  onClick={() => setTesting(testing === rule.id ? null : rule.id)}
                  aria-expanded={testing === rule.id}
                >
                  <FlaskConical size={15} /> Probar
                </button>
                <button
                  className="az-button"
                  disabled={busy}
                  onClick={() =>
                    setDraft({
                      ...rule,
                      conditions: rule.conditions.map((c) => ({
                        type: c.type,
                        keywords: c.keywords.join(", "),
                      })),
                    })
                  }
                >
                  <Pencil size={15} /> Editar
                </button>
                <button
                  className="az-button"
                  disabled={busy || (!rule.enabled && !rule.testedAt)}
                  title={
                    !rule.enabled && !rule.testedAt ? "Probala antes de habilitarla" : undefined
                  }
                  onClick={() => run({ op: "setRuleEnabled", id: rule.id, enabled: !rule.enabled })}
                >
                  <Power size={15} /> {rule.enabled ? "Desactivar" : "Habilitar"}
                </button>
                <button
                  className="az-button bt-danger"
                  disabled={busy}
                  onClick={() => run({ op: "deleteRule", id: rule.id })}
                >
                  <Trash2 size={15} /> Eliminar
                </button>
              </div>
              {testing === rule.id && <RuleTest rule={rule} />}
            </li>
          ))}
        </ol>
      )}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        label={draft?.id ? "Editar regla" : "Nueva regla"}
        className="ec-dialog bt-dialog"
      >
        {draft && (
          <form onSubmit={submit}>
            <h2>{draft.id ? "Editar regla" : "Nueva regla"}</h2>
            {draft.id && (
              <p className="az-muted bt-small">
                Al guardar, la regla se desactiva hasta probarla de nuevo.
              </p>
            )}
            <label>
              Nombre
              <input
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <p className="bt-label">Evento: llega un mensaje del cliente</p>
            <fieldset>
              <legend>Condiciones (todas deben cumplirse)</legend>
              {draft.conditions.map((condition, index) => (
                <div className="bt-condition" key={index}>
                  <select
                    aria-label={`Condición ${index + 1}`}
                    value={condition.type}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        conditions: draft.conditions.map((c, i) =>
                          i === index ? { ...c, type: e.target.value as typeof c.type } : c,
                        ),
                      })
                    }
                  >
                    {conditionTypes.map((type) => (
                      <option key={type} value={type}>
                        {conditionLabels[type]}
                      </option>
                    ))}
                  </select>
                  {condition.type === "keywords" && (
                    <input
                      aria-label={`Palabras clave de la condición ${index + 1}`}
                      placeholder="separadas por coma"
                      value={condition.keywords}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          conditions: draft.conditions.map((c, i) =>
                            i === index ? { ...c, keywords: e.target.value } : c,
                          ),
                        })
                      }
                    />
                  )}
                  {draft.conditions.length > 1 && (
                    <button
                      type="button"
                      className="az-icon"
                      aria-label={`Quitar condición ${index + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          conditions: draft.conditions.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              {draft.conditions.length < 5 && (
                <button
                  type="button"
                  className="bt-link-button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      conditions: [...draft.conditions, { type: "keywords", keywords: "" }],
                    })
                  }
                >
                  + Agregar condición
                </button>
              )}
            </fieldset>
            <label>
              Acción
              <select
                value={draft.action}
                onChange={(e) => setDraft({ ...draft, action: e.target.value as Rule["action"] })}
              >
                {actionTypes.map((type) => (
                  <option key={type} value={type}>
                    {actionLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="bt-inline">
              <input
                type="checkbox"
                checked={draft.markPriority}
                onChange={(e) => setDraft({ ...draft, markPriority: e.target.checked })}
              />
              Marcar la conversación como prioritaria
            </label>
            <label>
              Etiqueta (opcional)
              <input
                maxLength={40}
                value={draft.tag}
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
              />
            </label>
            <fieldset>
              <legend>Canales</legend>
              {channels.map((channel) => (
                <label key={channel} className="bt-inline">
                  <input
                    type="checkbox"
                    checked={draft.channels.includes(channel)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        channels: e.target.checked
                          ? [...draft.channels, channel]
                          : draft.channels.filter((c) => c !== channel),
                      })
                    }
                  />
                  {channelLabels[channel]}
                </label>
              ))}
            </fieldset>
            <label>
              Prioridad (1 se evalúa primero)
              <input
                type="number"
                min={1}
                max={100}
                required
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
              />
            </label>
            <div className="bt-actions bt-actions-end">
              <button type="button" className="az-button" onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button
                className="az-button ec-primary"
                disabled={busy || draft.channels.length === 0}
              >
                Guardar regla
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function RuleTest({ rule }: { rule: Rule }) {
  const { bot, run, busy } = useBot();
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<Channel>(rule.channels[0]);
  const [time, setTime] = useState<TimeMode>("now");
  const [result, setResult] = useState<EngineResult | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const outcome = await run({ op: "testRule", id: rule.id, message, channel, time });
    if (outcome?.engine) setResult(outcome.engine);
  }
  return (
    <form className="bt-rule-test" onSubmit={submit}>
      <p className="bt-sim-label">Prueba local: no envía mensajes</p>
      <div className="bt-form-grid">
        <label>
          Mensaje de prueba
          <input
            required
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <label>
          Canal
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {rule.channels.map((c) => (
              <option key={c} value={c}>
                {channelLabels[c]}
              </option>
            ))}
          </select>
        </label>
        <TimeSelect value={time} onChange={setTime} />
      </div>
      <button className="az-button ec-primary" disabled={busy || !message.trim()}>
        Probar esta regla
      </button>
      {result && bot && (
        <>
          <p
            className={`bt-badge is-${result.rule?.id === rule.id ? "approved" : "warning"}`}
            role="status"
          >
            {result.rule?.id === rule.id
              ? "La regla se aplicó: ya se puede habilitar."
              : "La regla no se aplicó con este mensaje."}
          </p>
          <ResultDetails result={result} bot={bot} />
        </>
      )}
    </form>
  );
}
