import {
  defaultWorkflowSettings,
  WorkflowError,
  workflowSettingsSchema,
  type WorkflowSettings,
} from "./model";
import type { DemoStorage } from "../credentials/demo";

/** Workflow builder preferences. A live adapter would apply them server-side. */
export interface WorkflowService {
  readonly mode: "demo" | "live";
  get(): Promise<WorkflowSettings>;
  save(value: WorkflowSettings): Promise<WorkflowSettings>;
}
export class DemoWorkflowService implements WorkflowService {
  readonly mode = "demo" as const;
  constructor(private storage: DemoStorage) {}
  async get() {
    let raw: string | null;
    try {
      raw = this.storage.read();
    } catch {
      throw new WorkflowError("storage");
    }
    if (!raw) return defaultWorkflowSettings();
    try {
      const parsed = workflowSettingsSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      /* Reported below without overwriting. */
    }
    throw new WorkflowError("invalidData");
  }
  async save(value: WorkflowSettings) {
    const parsed = workflowSettingsSchema.safeParse(value);
    if (!parsed.success) throw new WorkflowError("invalidData");
    try {
      this.storage.write(JSON.stringify(parsed.data));
    } catch {
      throw new WorkflowError("storage");
    }
    return parsed.data;
  }
}
let service: WorkflowService | undefined;
export function getWorkflowService(): WorkflowService {
  return (service ??= new DemoWorkflowService({
    read: () => localStorage.getItem("azra:workflows:demo:v1"),
    write: (value) => localStorage.setItem("azra:workflows:demo:v1", value),
  }));
}
