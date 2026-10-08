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
  screen("content", "contentCreation", [], "done"),
  // «Bot de atención»: local configuration, tests and supervision (no channel connected).
  ...[
    "",
    "/conversations",
    "/knowledge",
    "/behavior",
    "/automations",
    "/test",
    "/activity",
    "/connections",
  ].map((section) => screen(`bot${section}`, "botModule", [], "in-progress")),
  screen("ai/chat", "chat", [1], "done"),
  screen("settings/profile/general", "profile", [6], "done", "general"),
  screen("settings/profile/security", "profile", [7], "in-progress", "security"),
  screen("settings/company", "company", [8], "in-progress"),
  screen("settings/users", "users", [9], "done"),
];
export const href = (path: string) => `/azra/${path}`;
export function resolveScreen(path: string): Screen | undefined {
  return screens.find((entry) => entry.path === path);
}
// Settings keeps only these three sections; every other old settings URL redirects to «Mi perfil».
export const settingsLinks: { label: MessageKey; path?: string; badge?: boolean }[] = [
  { label: "profile", path: "settings/profile/general" },
  { label: "company", path: "settings/company" },
  { label: "users", path: "settings/users" },
];
