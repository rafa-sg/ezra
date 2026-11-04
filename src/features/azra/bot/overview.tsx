"use client";
import Link from "next/link";
import { CheckCircle2, Circle, Clock3, Pause, Play } from "lucide-react";
import { setupStatus, setupSteps } from "@/lib/bot/model";
import { href } from "../routes";
import { useBot } from "./data";

export function Overview() {
  const { bot, run, busy, connections } = useBot();
  if (!bot) return null;
  const steps = setupSteps(bot);
  const status = setupStatus(bot);
  const tests = bot.conversations.filter((c) => c.origin === "test");
  const real = bot.conversations.filter((c) => c.origin === "real");
  const anyChannel = connections.channels.some((c) => c.botEnabled);
  const indicators = [
    "Conversaciones abiertas",
    "Esperando atención humana",
    "Conversaciones resueltas",
    "Tiempo de respuesta",
  ];
  return (
    <div className="bt-stack">
      <div className="bt-grid bt-grid-3">
        <div className="bt-card">
          <p className="bt-label">Estado</p>
          <p className="bt-value">{status}</p>
          {bot.paused && <span className="bt-badge is-warning">Pausado en la simulación</span>}
        </div>
        <div className="bt-card">
          <p className="bt-label">Canales</p>
          <p className="bt-value">{anyChannel ? "Conectados" : "Sin conectar"}</p>
          <Link className="bt-link" href={href("bot/connections")}>
            Ver Conexiones
          </Link>
        </div>
        <div className="bt-card">
          <p className="bt-label">Pausar el bot</p>
          <p className="az-muted bt-small">
            Afecta solo la configuración y el simulador local. No controla ningún servicio
            conectado.
          </p>
          <button
            className="az-button"
            disabled={busy}
            aria-pressed={bot.paused}
            onClick={() => run({ op: "setPaused", paused: !bot.paused })}
          >
            {bot.paused ? <Play size={16} /> : <Pause size={16} />}
            {bot.paused ? "Reactivar bot" : "Pausar bot"}
          </button>
        </div>
      </div>

      <div className="bt-card">
        <h2>Guía de configuración</h2>
        <p className="az-muted">Cada paso se marca solo cuando la información está guardada.</p>
        <ol className="bt-steps">
          {steps.map((step, index) => (
            <li key={step.key} className={step.done ? "is-done" : ""}>
              {step.done ? (
                <CheckCircle2 size={20} aria-hidden="true" />
              ) : step.key === "channels" ? (
                <Clock3 size={20} aria-hidden="true" />
              ) : (
                <Circle size={20} aria-hidden="true" />
              )}
              <div>
                <strong>
                  {index + 1}. {step.title}
                </strong>
                <p className="az-muted">{step.detail}</p>
              </div>
              <span className="bt-step-state">
                {step.done ? "Hecho" : step.key === "channels" ? "Etapa posterior" : "Pendiente"}
              </span>
              <Link className="bt-link" href={href(step.href)} aria-label={`Ir a: ${step.title}`}>
                Abrir
              </Link>
            </li>
          ))}
        </ol>
      </div>

      <div className="bt-card">
        <h2>Actividad real</h2>
        <p className="az-muted">
          Indicadores de canales conectados. Las pruebas locales no se cuentan aquí.
        </p>
        <div className="bt-grid bt-grid-4">
          {indicators.map((label) => (
            <div className="bt-metric" key={label}>
              <span>{label}</span>
              <strong>{real.length ? "—" : "Sin datos disponibles"}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="bt-card bt-test-card">
        <h2>Pruebas locales</h2>
        <p className="az-muted">
          {tests.length
            ? `${tests.length} ${tests.length === 1 ? "conversación de prueba" : "conversaciones de prueba"} en el simulador. No son clientes reales.`
            : "Todavía no hay pruebas. Probá el bot en el simulador; nada se envía."}
        </p>
        <Link className="az-button" href={href("bot/test")}>
          Ir a Probar bot
        </Link>
      </div>
    </div>
  );
}
