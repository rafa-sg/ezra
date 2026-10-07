import {
  announcementCatalog,
  AnnouncementError,
  announcementStateSchema,
  type AnnouncementId,
  type AnnouncementState,
  type Frequency,
  type Priority,
} from "./model";
import type { DemoStorage } from "../credentials/demo";

export type Announcement = {
  id: AnnouncementId;
  priority: Priority;
  frequency: Frequency;
  enabled: boolean;
  locked: boolean;
};
/** Announcement preferences. Nothing is ever sent to sub-accounts by the demo. */
export interface AnnouncementService {
  readonly mode: "demo" | "live";
  list(): Promise<Announcement[]>;
  setEnabled(id: AnnouncementId, enabled: boolean): Promise<Announcement[]>;
}
export class DemoAnnouncementService implements AnnouncementService {
  readonly mode = "demo" as const;
  constructor(private storage: DemoStorage) {}
  private read(): AnnouncementState {
    let raw: string | null;
    try {
      raw = this.storage.read();
    } catch {
      throw new AnnouncementError("storage");
    }
    if (!raw) return { version: 1, enabled: {} };
    try {
      const parsed = announcementStateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      /* Reported below without overwriting. */
    }
    throw new AnnouncementError("invalidData");
  }
  async list(): Promise<Announcement[]> {
    const state = this.read();
    return announcementCatalog.map((item) => ({
      ...item,
      enabled: item.locked ? item.enabled : (state.enabled[item.id] ?? item.enabled),
    }));
  }
  async setEnabled(id: AnnouncementId, enabled: boolean) {
    const item = announcementCatalog.find((entry) => entry.id === id);
    if (!item) throw new AnnouncementError("invalidData");
    if (item.locked) throw new AnnouncementError("locked");
    const state = this.read();
    state.enabled[id] = enabled;
    try {
      this.storage.write(JSON.stringify(state));
    } catch {
      throw new AnnouncementError("storage");
    }
    return this.list();
  }
}
let service: AnnouncementService | undefined;
export function getAnnouncementService(): AnnouncementService {
  return (service ??= new DemoAnnouncementService({
    read: () => localStorage.getItem("azra:announcements:demo:v1"),
    write: (value) => localStorage.setItem("azra:announcements:demo:v1", value),
  }));
}
