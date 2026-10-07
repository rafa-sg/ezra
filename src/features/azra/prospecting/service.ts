import type { ProspectingSettings } from "./model";
import { DemoProspectingService } from "./demo";

/** Prospecting screens depend only on this contract. Prospects, agents,
 * widgets and report generation have no supplied flows yet. */
export interface ProspectingService {
  readonly mode: "demo" | "live";
  getSettings(): Promise<ProspectingSettings>;
  saveSettings(value: ProspectingSettings): Promise<ProspectingSettings>;
  /** Counts shown on the analytics screen; the demo never fabricates activity. */
  getAnalytics(): Promise<{ reports: number; conversions: number; leads: number; views: number }>;
}
export const PROSPECTING_STORAGE_KEY = "azra:prospecting:demo:v1";
let service: ProspectingService | undefined;
export function getProspectingService(): ProspectingService {
  return (service ??= new DemoProspectingService({
    read: () => localStorage.getItem(PROSPECTING_STORAGE_KEY),
    write: (value) => localStorage.setItem(PROSPECTING_STORAGE_KEY, value),
  }));
}
