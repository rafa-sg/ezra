import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSeed } from "./seed";
import { workspaceSchema, type Workspace } from "./model";

export const dataDirectory = process.env.EZRA_DATA_DIR || path.join(process.cwd(), "data");
export const mediaDirectory = path.join(dataDirectory, "media");
const file = path.join(dataDirectory, "workspace.json");
const globals = globalThis as typeof globalThis & { ezraWriteQueue?: Promise<unknown> };
export async function readWorkspace(): Promise<Workspace> {
  await mkdir(mediaDirectory, { recursive: true });
  try {
    return workspaceSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(
        "No se pudo leer el archivo de datos. Se conservó intacto; restaura una copia o revisa el archivo.",
      );
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
export async function mutateWorkspace(
  change: (current: Workspace) => Workspace | Promise<Workspace>,
): Promise<Workspace> {
  const operation = (globals.ezraWriteQueue || Promise.resolve()).then(async () => {
    const current = await readWorkspace();
    const next = workspaceSchema.parse(await change(current));
    const temporary = path.join(dataDirectory, `.workspace-${crypto.randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(temporary, file);
    return next;
  });
  globals.ezraWriteQueue = operation.catch(() => {});
  return operation;
}
