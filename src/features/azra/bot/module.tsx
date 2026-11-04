"use client";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  Bot as BotIcon,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  Plug,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import { useActiveBusiness } from "../account/active-business";
import { href } from "../routes";
import { BotProvider, useBot } from "./data";
import { Overview } from "./overview";
import { Inbox as InboxScreen } from "./inbox";
import { KnowledgeScreen } from "./knowledge";
import { BehaviorScreen } from "./behavior";
import { AutomationsScreen } from "./automations";
import { Simulator } from "./simulator";
import { ActivityScreen } from "./activity";
import { ConnectionsPanel } from "../connections";
import "./bot.css";

export const botSections = [
  { path: "bot", label: "Resumen", icon: LayoutDashboard },
  { path: "bot/conversations", label: "Conversaciones", icon: Inbox },
  { path: "bot/knowledge", label: "Conocimiento", icon: BookOpen },
  { path: "bot/behavior", label: "Comportamiento", icon: SlidersHorizontal },
  { path: "bot/automations", label: "Automatizaciones", icon: Workflow },
  { path: "bot/test", label: "Probar bot", icon: FlaskConical },
  { path: "bot/activity", label: "Actividad", icon: Activity },
] as const;

/** «Bot de atención». Each business has its own configuration (server-side, isolated). */
export function BotModule({ path }: { path: string }) {
  const { active, failed } = useActiveBusiness();
  if (!active)
    return (
      <div className="az-page" role="status">
        {failed ? "No pudimos cargar tus negocios. Recargá la página." : "Cargando tu espacio…"}
      </div>
    );
  return (
    <BotProvider key={active.id} businessId={active.id}>
      <Layout path={path} name={active.name} />
    </BotProvider>
  );
}

function Layout({ path, name }: { path: string; name: string }) {
  const { bot, loadError, error, notice } = useBot();
  const current = [...botSections, { path: "bot/connections", label: "Conexiones" }].find(
    (s) => s.path === path,
  );
  return (
    <div className="bt-layout">
      <aside className="az-chat-sidebar bt-nav">
        <h2>
          <BotIcon size={20} aria-hidden="true" /> Bot de atención
        </h2>
        <nav aria-label="Bot de atención">
          {botSections.map((section) => (
            <Link
              key={section.path}
              href={href(section.path)}
              className={section.path === path ? "is-active" : ""}
              aria-current={section.path === path ? "page" : undefined}
            >
              <section.icon size={18} aria-hidden="true" />
              {section.label}
            </Link>
          ))}
          <span className="bt-nav-divider" aria-hidden="true" />
          <Link
            href={href("bot/connections")}
            className={path === "bot/connections" ? "is-active" : ""}
            aria-current={path === "bot/connections" ? "page" : undefined}
          >
            <Plug size={18} aria-hidden="true" />
            Conexiones
          </Link>
        </nav>
        <div className="az-chat-account">
          <span className="ec-initial">{name.charAt(0)}</span>
          <span>{name}</span>
        </div>
      </aside>
      <section className="bt-main">
        <div className="bt-heading">
          <div>
            <p className="ec-eyebrow">BOT DE ATENCIÓN · {name.toUpperCase()}</p>
            <h1>{current?.label ?? "Bot de atención"}</h1>
          </div>
          <span className="ec-local">Configuración local · sin canales conectados</span>
        </div>
        {error && (
          <p className="ec-error" role="alert">
            {error}
          </p>
        )}
        {notice && !error && (
          <p className="ec-notice" role="status">
            {notice}
          </p>
        )}
        {loadError ? (
          <p className="ec-error" role="alert">
            {loadError}
          </p>
        ) : !bot ? (
          <p role="status">Cargando el bot…</p>
        ) : (
          // Keyed by section: only the content fades in; the submenu stays put.
          <div key={path} className="az-view">
            <Section path={path} />
          </div>
        )}
      </section>
    </div>
  );
}

function Section({ path }: { path: string }) {
  switch (path) {
    case "bot/conversations":
      return <InboxScreen />;
    case "bot/knowledge":
      return <KnowledgeScreen />;
    case "bot/behavior":
      return <BehaviorScreen />;
    case "bot/automations":
      return <AutomationsScreen />;
    case "bot/test":
      return <Simulator />;
    case "bot/activity":
      return <ActivityScreen />;
    case "bot/connections":
      return <ConnectionsScreen />;
    default:
      return <Overview />;
  }
}

function ConnectionsScreen() {
  const { connections } = useBot();
  return (
    <div className="bt-stack">
      <div className="bt-card">
        <h2>Canales del bot</h2>
        <p className="az-muted">
          Las respuestas se preparan y revisan en Ezra. Hoy no hay canales sociales conectados: el
          bot funciona en el simulador local.
        </p>
        <ConnectionsPanel connections={connections} />
      </div>
      <div className="bt-card">
        <h2>Qué falta para conectarlo</h2>
        <ul className="bt-list">
          <li>
            Verificar los permisos oficiales de cada plataforma y autorizar únicamente las cuentas
            que elijas.
          </li>
          <li>
            Recibir mensajes requiere la API oficial de la plataforma y un proceso que atienda los
            mensajes. Las respuestas con IA necesitan revisión y límites claros.
          </li>
          <li>Autorizar cada cuenta por separado y habilitarla para el bot.</li>
          <li>
            Evitar respuestas duplicadas, reintentar con espera y respetar los límites de cada
            canal.
          </li>
        </ul>
        <p className="az-muted">Detalle técnico: docs/features/bot-de-atencion.md.</p>
      </div>
    </div>
  );
}
