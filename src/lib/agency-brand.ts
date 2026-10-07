import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { detectMedia } from "./media";
import { dataDirectory, enqueueWrite, writeJsonAtomic } from "./store";
import { WorkflowError } from "./workflow";

/** Agency-level white-label logo (Configuración › Empresa › Marca Blanca). */
const directory = path.join(dataDirectory, "agency");
const metaFile = path.join(directory, "logo.json");
export const LOGO_LIMIT = 2.5 * 1024 * 1024;
const logoSchema = z.object({
  filename: z.string().regex(/^logo-[0-9a-f-]{36}\.(png|jpg|webp)$/),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  size: z.number().int().positive().max(LOGO_LIMIT),
  updatedAt: z.string().datetime(),
});
export type AgencyLogo = z.infer<typeof logoSchema>;

export async function readAgencyLogo(): Promise<AgencyLogo | null> {
  try {
    return logoSchema.parse(JSON.parse(await readFile(metaFile, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new WorkflowError("No se pudo leer el logotipo guardado. Se conservó intacto.", 500);
  }
}
export async function readAgencyLogoFile() {
  const logo = await readAgencyLogo();
  if (!logo) return null;
  return { logo, bytes: await readFile(path.join(directory, logo.filename)) };
}
export async function saveAgencyLogo(bytes: Buffer): Promise<AgencyLogo> {
  if (!bytes.length || bytes.length > LOGO_LIMIT)
    throw new WorkflowError("El logotipo debe pesar como máximo 2,5 MB.", 413);
  // Content sniffing, never the browser-declared type or the file name.
  const { mime, ext } = detectMedia(bytes);
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
    throw new WorkflowError("Usa una imagen PNG, JPG o WebP.");
  return enqueueWrite(async () => {
    await mkdir(directory, { recursive: true });
    const previous = await readAgencyLogo();
    const logo = logoSchema.parse({
      filename: `logo-${crypto.randomUUID()}.${ext}`,
      mime,
      size: bytes.length,
      updatedAt: new Date().toISOString(),
    });
    await writeFile(path.join(directory, logo.filename), bytes, { mode: 0o600 });
    await writeJsonAtomic(metaFile, logo);
    // The old file is removed only after the new metadata points elsewhere.
    if (previous) await unlink(path.join(directory, previous.filename)).catch(() => {});
    return logo;
  });
}
export async function deleteAgencyLogo() {
  return enqueueWrite(async () => {
    const previous = await readAgencyLogo();
    if (!previous) throw new WorkflowError("No hay un logotipo guardado.", 404);
    await unlink(metaFile);
    await unlink(path.join(directory, previous.filename)).catch(() => {});
  });
}
