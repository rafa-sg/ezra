import type { MessageKey } from "./i18n";
export type ScreenStatus = "done" | "in-progress" | "not-started";
export type Screen = {
  path: string;
  title: MessageKey;
  references: number[];
  status: ScreenStatus;
  tab?: MessageKey;
};
const screen = (
  path: string,
  title: MessageKey,
  references: number[],
  status: ScreenStatus = "not-started",
  tab?: MessageKey,
): Screen => ({ path, title, references, status, tab });
export const screens: Screen[] = [
  screen("ai/chat", "chat", [1], "in-progress"),
  screen("settings/profile/general", "profile", [6], "done", "general"),
  screen("settings/profile/security", "profile", [7], "in-progress", "security"),
  screen("settings/company", "company", [8], "in-progress"),
  screen("settings/users", "users", [9], "done"),
  screen("settings/workflows", "workflows", [10], "in-progress"),
  screen("settings/workflows/subaccounts", "workflows", [10], "in-progress"),
  screen("settings/phone", "phone", [11]),
  ...(["services", "subaccounts", "risk", "bounces", "postmaster", "advanced"] as const).map(
    (tab, i) => screen(`settings/email/${tab}`, "email", [12 + i], undefined, tab),
  ),
  screen("settings/system-email/templates", "systemEmail", [18], undefined, "templatesTab"),
  screen("settings/system-email/settings", "systemEmail", [19], undefined, "settings"),
  screen("settings/announcements", "announcements", [20], "in-progress"),
  screen("settings/workflows/premium", "premium", [40]),
  screen("settings/workflows/external-ai", "externalAi", [22]),
  screen("settings/domain-purchase", "domains", [23]),
  screen("settings/integrations", "integrations", [24], "in-progress"),
  screen("settings/integrations/new", "integrations", [29, 30, 31, 32], "in-progress"),
  screen("settings/integrations/[id]", "integrations", [28], "in-progress"),
  screen("settings/affiliates", "affiliates", [25, 33]),
  screen("settings/menu-links", "menuLinks", [26, 34]),
  screen("settings/api-keys", "apiKeys", [27], "in-progress"),
  screen("settings/audit/logs", "audit", [35], undefined, "logs"),
  screen("settings/audit/exports", "audit", [36], undefined, "exports"),
  screen("settings/storage", "storage", [37]),
];
export const href = (path: string) => `/azra/${path}`;
export function resolveScreen(path: string): Screen | undefined {
  return (
    screens.find((entry) => entry.path === path) ??
    (/^settings\/integrations\/[^/]+$/.test(path)
      ? screens.find((entry) => entry.path === "settings/integrations/[id]")
      : undefined)
  );
}
export const settingsLinks: { label: MessageKey; path?: string; badge?: boolean }[] = [
  { label: "profile", path: "settings/profile/general" },
  { label: "company", path: "settings/company" },
  { label: "users", path: "settings/users" },
  { label: "billing" },
  { label: "workflows", path: "settings/workflows", badge: true },
  { label: "phone", path: "settings/phone" },
  { label: "email", path: "settings/email/services" },
  { label: "systemEmail", path: "settings/system-email/templates" },
  { label: "announcements", path: "settings/announcements", badge: true },
  { label: "premium", path: "settings/workflows/premium" },
  { label: "externalAi", path: "settings/workflows/external-ai" },
  { label: "domains", path: "settings/domain-purchase" },
  { label: "integrations", path: "settings/integrations" },
  { label: "affiliates", path: "settings/affiliates" },
  { label: "menuLinks", path: "settings/menu-links" },
  { label: "stripe" },
  { label: "apiKeys", path: "settings/api-keys" },
  { label: "compliance" },
  { label: "labs" },
  { label: "audit", path: "settings/audit/logs" },
  { label: "storage", path: "settings/storage" },
];
