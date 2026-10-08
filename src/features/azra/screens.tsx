"use client";
import { ContentStudio } from "./content";
import { Chat } from "./chat";
import { BotModule } from "./bot/module";
import { ProfileGeneral, ProfileSecurity } from "./account/profile";
import { CompanySettings } from "./account/company";
import { UsersScreen } from "./account/users";
export function AzraScreen({ path }: { path: string }) {
  if (path === "content") return <ContentStudio />;
  if (path === "bot" || path.startsWith("bot/")) return <BotModule path={path} />;
  if (path === "settings/profile/general") return <ProfileGeneral />;
  if (path === "settings/profile/security") return <ProfileSecurity />;
  if (path === "settings/company") return <CompanySettings />;
  if (path === "settings/users") return <UsersScreen />;
  return <Chat />;
}
