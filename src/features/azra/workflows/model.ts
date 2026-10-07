import { z } from "zod";

export const builders = ["standard", "advanced"] as const;
export type Builder = (typeof builders)[number];
export const workflowSettingsSchema = z.object({
  version: z.literal(1),
  defaultBuilder: z.enum(builders),
  // Sub-account id → builder. Missing ids use the default builder.
  overrides: z.record(z.string(), z.enum(builders)),
});
export type WorkflowSettings = z.infer<typeof workflowSettingsSchema>;
export const defaultWorkflowSettings = (): WorkflowSettings => ({
  version: 1,
  // #10 pictures the standard builder selected.
  defaultBuilder: "standard",
  overrides: {},
});
export class WorkflowError extends Error {
  constructor(public code: "storage" | "invalidData") {
    super(code);
  }
}
