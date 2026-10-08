import { readFile } from "node:fs/promises";
import path from "node:path";
import { enqueueWrite, workspaceDirectory, writeJsonAtomic } from "../store";
import { WorkflowError } from "../workflow";
import { botSchema, emptyBot, spanishIssue, type Bot } from "./model";
export { spanishIssue } from "./model";

/** One bot.json per business, next to its workspace.json (included in its backup). */
export const botFile = (businessId: string) =>
  path.join(workspaceDirectory(businessId), "bot.json");

export async function readBot(businessId: string): Promise<Bot> {
  let raw: string;
  try {
    raw = await readFile(botFile(businessId), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyBot(businessId);
    throw error;
  }
  let data: unknown = null;
  try {
    data = JSON.parse(raw);
  } catch {
    /* Reported below; the file is never overwritten. */
  }
  const parsed = botSchema.safeParse(data);
  if (!parsed.success || parsed.data.businessId !== businessId)
    throw new WorkflowError(
      "No se pudo leer la configuración del bot. Se conservó intacta; restaurá una copia o revisá el archivo.",
      503,
    );
  return parsed.data;
}

/** Optimistic revision: a stale tab gets a 409 instead of overwriting newer changes. */
export function mutateBot<T>(
  businessId: string,
  revision: number,
  change: (draft: Bot) => T,
): Promise<{ bot: Bot; result: T }> {
  return enqueueWrite(async () => {
    const current = await readBot(businessId);
    if (current.revision !== revision)
      throw new WorkflowError(
        "Hay cambios más recientes del bot en otra ventana. Recargá antes de guardar.",
        409,
      );
    const draft = structuredClone(current);
    const result = change(draft);
    draft.revision = current.revision + 1;
    draft.businessId = businessId;
    const parsed = botSchema.safeParse(draft);
    if (!parsed.success)
      throw new WorkflowError(spanishIssue(parsed.error.issues[0]?.message), 400);
    await writeJsonAtomic(botFile(businessId), parsed.data);
    return { bot: parsed.data, result };
  });
}
