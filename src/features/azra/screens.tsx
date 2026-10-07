"use client";
import Link from "next/link";
import { Plus, Search, SlidersHorizontal, Mic, AudioLines, ArrowUp, FileText } from "lucide-react";
import { useLanguage } from "./i18n";
import { href, screens, type Screen } from "./routes";
import { CredentialDetail, CredentialEntry, CredentialWizard } from "./credentials/screens";
import { ProfileGeneral, ProfileSecurity } from "./account/profile";
import { CompanySettings } from "./account/company";
import { UsersScreen } from "./account/users";
import { WorkflowSettingsScreen, WorkflowSubaccounts } from "./workflows/screens";
import { AnnouncementsScreen } from "./announcements/screens";
function Chat() {
  const { t } = useLanguage();
  return (
    <div className="az-chat">
      <aside className="az-chat-sidebar">
        <h2>{t("chatGreeting")}</h2>
        {(
          [
            { key: "newChat", icon: Plus },
            { key: "search", icon: Search },
            { key: "chatTemplates", icon: FileText },
            { key: "customize", icon: SlidersHorizontal },
          ] as const
        ).map((item) => (
          <button key={item.key} aria-disabled="true" title={t("integrationPending")}>
            <item.icon size={19} />
            {t(item.key)}
          </button>
        ))}
        <div className="az-chat-account">
          DE <span>{t("demoAccount")}</span>
        </div>
      </aside>
      <section className="az-chat-content">
        <div className="az-chat-greeting">
          <h1>{t("chatFirst")}</h1>
          <h2>{t("chatDescription")}</h2>
          <p>{t("chatStart")}</p>
        </div>
        <div className="az-composer">
          <textarea aria-label={t("askAnything")} placeholder={t("askAnything")} />
          <div>
            <button className="az-icon" disabled aria-label={t("attach")}>
              <Plus size={22} />
            </button>
            <span />
            <button className="az-icon" disabled aria-label={t("microphone")}>
              <Mic size={21} />
            </button>
            <button className="az-icon" disabled aria-label={t("voice")}>
              <AudioLines size={21} />
            </button>
            <button className="az-icon" disabled aria-label={t("integrationPending")}>
              <ArrowUp size={22} />
            </button>
          </div>
        </div>
        <p className="az-muted">{t("integrationPending")}</p>
      </section>
    </div>
  );
}
function Pending({ screen }: { screen: Screen }) {
  const { t } = useLanguage();
  const siblings = screens.filter((item) => item.title === screen.title && item.tab);
  return (
    <section className="az-page">
      <h1>{t(screen.title)}</h1>
      {siblings.length > 0 && (
        <nav className="az-tabs" aria-label={t(screen.title)}>
          {siblings.map((item) => (
            <Link
              className={item.path === screen.path ? "is-active" : ""}
              href={href(item.path)}
              key={item.path}
              aria-current={item.path === screen.path ? "page" : undefined}
            >
              {t(item.tab!)}
            </Link>
          ))}
        </nav>
      )}
      <div className="az-pending">
        <h2>{t("pending")}</h2>
        <p>{t("pendingDescription")}</p>
        <small>
          {t("reference")}: {screen.references.map((id) => `#${id}`).join(", ")}
        </small>
      </div>
    </section>
  );
}
export function AzraScreen({ screen, path }: { screen: Screen; path: string }) {
  if (path === "ai/chat") return <Chat />;
  if (path === "settings/announcements") return <AnnouncementsScreen />;
  if (path === "settings/workflows") return <WorkflowSettingsScreen />;
  if (path === "settings/workflows/subaccounts") return <WorkflowSubaccounts />;
  if (path === "settings/profile/general") return <ProfileGeneral />;
  if (path === "settings/profile/security") return <ProfileSecurity />;
  if (path === "settings/company") return <CompanySettings />;
  if (path === "settings/users") return <UsersScreen />;
  if (path === "settings/integrations/new") return <CredentialWizard />;
  if (path === "settings/integrations") return <CredentialEntry />;
  if (path === "settings/api-keys") return <CredentialEntry apiKeys />;
  if (screen.path === "settings/integrations/[id]")
    return <CredentialDetail key={path} id={path.split("/").at(-1)!} />;
  return <Pending screen={screen} />;
}
