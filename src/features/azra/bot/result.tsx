"use client";
import type { EngineResult } from "@/lib/bot/engine";
import type { Bot } from "@/lib/bot/model";

export type TimeMode = "now" | "inside" | "outside";
export function TimeSelect({
  value,
  onChange,
}: {
  value: TimeMode;
  onChange: (value: TimeMode) => void;
}) {
  return (
    <label>
      Momento
      <select value={value} onChange={(e) => onChange(e.target.value as TimeMode)}>
        <option value="now">Hora actual (El Salvador)</option>
        <option value="inside">Dentro del horario del equipo</option>
        <option value="outside">Fuera del horario del equipo</option>
      </select>
    </label>
  );
}

export const outcomeLabels: Record<EngineResult["outcome"], string> = {
  answered: "Respondió con conocimiento aprobado",
  clarification: "Pidió una aclaración",
  handoff: "Derivó a una persona",
  hours: "Informó el horario",
  silent: "No respondió",
};

/** Why the simulated answer happened: rule, approved knowledge and the engine's reason. */
export function ResultDetails({ result, bot }: { result: EngineResult; bot: Bot }) {
  const knowledge = result.knowledge.map(
    (k) => bot.knowledge.find((e) => e.id === k.id)?.title ?? k.title,
  );
  return (
    <dl className="bt-result">
      <div>
        <dt>Resultado</dt>
        <dd>{outcomeLabels[result.outcome]}</dd>
      </div>
      <div>
        <dt>Regla</dt>
        <dd>{result.rule?.name ?? "Ninguna"}</dd>
      </div>
      <div>
        <dt>Conocimiento aprobado usado</dt>
        <dd>{knowledge.length ? knowledge.join(", ") : "Ninguno"}</dd>
      </div>
      <div>
        <dt>Motivo</dt>
        <dd>{result.reason}</dd>
      </div>
      {result.insideHumanHours !== null && (
        <div>
          <dt>Horario del equipo</dt>
          <dd>{result.insideHumanHours ? "Dentro del horario" : "Fuera del horario"}</dd>
        </div>
      )}
      {result.reply && (
        <div className="bt-result-reply">
          <dt>Respuesta simulada</dt>
          <dd>{result.reply}</dd>
        </div>
      )}
    </dl>
  );
}
