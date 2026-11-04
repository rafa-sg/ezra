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
export const screens: Screen[] = [screen("produccion", "productionStudio", [], "done")];
export const href = (path: string) => `/azra/${path}`;
export function resolveScreen(path: string): Screen | undefined {
  return screens.find((entry) => entry.path === path);
}
// Conservado para consumidores del contrato antiguo; no hay enlaces al diseño retirado.
export const settingsLinks: { label: MessageKey; path?: string; badge?: boolean }[] = [];
