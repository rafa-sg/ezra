import {
  defaultProspectingSettings,
  prospectingSettingsSchema,
  ProspectingError,
  type ProspectingSettings,
} from "./model";
import type { ProspectingService } from "./service";
import type { DemoStorage } from "../credentials/demo";

export class DemoProspectingService implements ProspectingService {
  readonly mode = "demo" as const;
  constructor(private storage: DemoStorage) {}
  async getSettings() {
    let raw: string | null;
    try {
      raw = this.storage.read();
    } catch {
      throw new ProspectingError("storage");
    }
    if (!raw) return defaultProspectingSettings();
    try {
      const parsed = prospectingSettingsSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      /* Reported below; corrupt data is never overwritten silently. */
    }
    throw new ProspectingError("invalidData");
  }
  async saveSettings(value: ProspectingSettings) {
    const parsed = prospectingSettingsSchema.safeParse(value);
    if (!parsed.success) throw new ProspectingError("invalidData");
    const unique = {
      ...parsed.data,
      disabled: [...new Set(parsed.data.disabled)],
      hosting: [...new Set(parsed.data.hosting)],
    };
    try {
      this.storage.write(JSON.stringify(unique));
    } catch {
      throw new ProspectingError("storage");
    }
    return unique;
  }
  async getAnalytics() {
    // No reports, prospects or widgets exist in the demo: every metric is zero.
    return { reports: 0, conversions: 0, leads: 0, views: 0 };
  }
}
