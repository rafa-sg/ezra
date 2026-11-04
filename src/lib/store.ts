import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSeed } from "./seed";
import { defaultBusinessId, workspaceSchema, type Workspace } from "./model";

export const dataDirectory = process.env.EZRA_DATA_DIR || path.join(process.cwd(), "data");
export const mediaDirectory = path.join(dataDirectory, "media");
export function workspaceDirectory(businessId = defaultBusinessId) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(businessId))
    throw new Error("Identificador de negocio inválido.");
  return businessId === defaultBusinessId
    ? dataDirectory
    : path.join(dataDirectory, "businesses", businessId);
}
export function mediaDirectoryFor(businessId = defaultBusinessId) {
  return path.join(workspaceDirectory(businessId), "media");
}
const globals = globalThis as typeof globalThis & { ezraWriteQueue?: Promise<unknown> };
export async function readWorkspace(businessId = defaultBusinessId): Promise<Workspace> {
  const file = path.join(workspaceDirectory(businessId), "workspace.json");
  await mkdir(mediaDirectoryFor(businessId), { recursive: true });
  try {
    const state = workspaceSchema.parse(JSON.parse(await readFile(file, "utf8")));
    if (state.businessId !== businessId) throw new Error("Negocio incorrecto.");
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(
        "No se pudo leer el archivo de datos. Se conservó intacto; restaura una copia o revisa el archivo.",
      );
    if (businessId !== defaultBusinessId)
      throw new Error("No se encontró el archivo de este negocio. Se conservaron sus datos.");
    // Exclusive creation protects the first load from concurrent initialization.
    const seed = createSeed();
    try {
      await writeFile(file, JSON.stringify(seed, null, 2), { flag: "wx", mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    return workspaceSchema.parse(JSON.parse(await readFile(file, "utf8")));
  }
}
// Every write to data/ goes through this single queue, so files never interleave.
export function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const operation = (globals.ezraWriteQueue || Promise.resolve()).then(task);
  globals.ezraWriteQueue = operation.catch(() => {});
  return operation;
}
export async function writeJsonAtomic(target: string, value: unknown) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}-${crypto.randomUUID()}.tmp`,
  );
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temporary, target);
}
/** Must run inside enqueueWrite; used by automation to add an AI draft. */
export async function writeWorkspace(
  change: (current: Workspace) => Workspace | Promise<Workspace>,
  businessId = defaultBusinessId,
) {
  const next = workspaceSchema.parse(await change(await readWorkspace(businessId)));
  if (next.businessId !== businessId) throw new Error("No puedes mover datos entre negocios.");
  await writeJsonAtomic(path.join(workspaceDirectory(businessId), "workspace.json"), next);
  return next;
}
export function mutateWorkspace(
  change: (current: Workspace) => Workspace | Promise<Workspace>,
  businessId = defaultBusinessId,
): Promise<Workspace> {
  return enqueueWrite(() => writeWorkspace(change, businessId));
}
/**
 * Adds a history event without bumping `revision`: reconcile() never trusts
 * client history, so open tabs keep saving without a spurious 409.
 * Must run inside enqueueWrite. Idempotent by event id.
 */
export function appendHistoryUnqueued(event: Workspace["history"][number]) {
  return writeWorkspace((current) =>
    current.history.some((e) => e.id === event.id)
      ? current
      : { ...current, history: [event, ...current.history].slice(0, 10000) },
  );
}
