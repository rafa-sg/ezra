import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  businessDirectorySchema,
  businessSchema,
  defaultBusinessId,
  workspaceSchema,
  type Business,
  type Workspace,
} from "./model";
import {
  dataDirectory,
  enqueueWrite,
  readWorkspace,
  workspaceDirectory,
  writeJsonAtomic,
} from "./store";
import { requireAccount, requireAdmin, type Account } from "./auth";
import { WorkflowError } from "./workflow";

const registryFile = path.join(dataDirectory, "businesses.json");
export const organizations = {
  owner: "Administración",
  sgmotos: "Sgmotos",
  motoxspress: "motoxspress",
} as const;
export const createBusinessSchema = businessSchema
  .omit({ id: true, createdAt: true, organizationName: true })
  .strict();
export async function readBusinessDirectory() {
  try {
    const registry = businessDirectorySchema.parse(
      JSON.parse(await readFile(registryFile, "utf8")),
    );
    if (
      !registry.businesses.some((b) => b.id === defaultBusinessId) ||
      new Set(registry.businesses.map((b) => b.id)).size !== registry.businesses.length
    )
      throw new Error("Registro inválido.");
    return registry;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new WorkflowError("No se pudo leer la lista de negocios. Se conservó intacta.", 500);
    const legacy = await readWorkspace();
    return businessDirectorySchema.parse({
      schemaVersion: 1,
      businesses: [
        {
          id: defaultBusinessId,
          name: legacy.brand.name,
          organizationName: "Archivo anterior",
          organizationId: "owner",
          type: "editorial",
          createdAt: legacy.history.at(-1)?.at || new Date().toISOString(),
        },
      ],
    });
  }
}
async function initializeWorkspace(business: Business) {
  const state: Workspace = workspaceSchema.parse({
    schemaVersion: 1,
    businessId: business.id,
    revision: 0,
    brand: {
      name: business.name,
      website: "",
      description: "",
      audience: "",
      voice: "Español salvadoreño claro, cercano y útil.",
      allowedTopics: "",
      excludedTopics: "",
      rules:
        "Usar información y fotografías autorizadas. Verificar precios, disponibilidad y condiciones antes de aprobar una publicación.",
    },
    posts: [],
    sources: [],
    media: [],
    catalog: [],
    history: [
      {
        id: crypto.randomUUID(),
        at: business.createdAt,
        title: "Negocio creado",
        detail: business.name,
      },
    ],
  });
  const folder = workspaceDirectory(business.id);
  await mkdir(path.join(folder, "media"), { recursive: true });
  try {
    await writeFile(path.join(folder, "workspace.json"), JSON.stringify(state, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // Recover an interrupted registry write without overwriting the saved workspace.
    const saved = workspaceSchema.parse(
      JSON.parse(await readFile(path.join(folder, "workspace.json"), "utf8")),
    );
    if (saved.businessId !== business.id)
      throw new WorkflowError("El negocio guardado no coincide. Se conservó intacto.", 500);
  }
}
export function ensurePilotBusinesses() {
  return enqueueWrite(async () => {
    const directory = await readBusinessDirectory();
    for (const organizationId of ["sgmotos", "motoxspress", "owner"] as const) {
      const id = `${organizationId}-main`;
      if (directory.businesses.some((b) => b.id === id)) continue;
      const business = businessSchema.parse({
        id,
        organizationId,
        organizationName: organizations[organizationId],
        name:
          organizationId === "owner"
            ? "Mi negocio"
            : `${organizations[organizationId]} · Comercial`,
        type: organizationId === "owner" ? "other" : "motorcycles",
        createdAt: new Date().toISOString(),
      });
      await initializeWorkspace(business);
      directory.businesses.push(business);
      await writeJsonAtomic(registryFile, directory);
    }
    return directory;
  });
}
export async function authorizedDirectory() {
  const account = await requireAccount();
  const directory = await ensurePilotBusinesses();
  return {
    ...directory,
    businesses: directory.businesses.filter(
      (b) =>
        b.id !== defaultBusinessId &&
        (account.role === "admin" || b.organizationId === account.organizationId),
    ),
  };
}
export async function requestBusinessId(request: Request) {
  const account = await requireAccount();
  const businessId = new URL(request.url).searchParams.get("business") ?? defaultBusinessId;
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(businessId)) throw new WorkflowError("Negocio inválido.", 400);
  const business = (await readBusinessDirectory()).businesses.find((b) => b.id === businessId);
  if (!business || (account.role !== "admin" && business.organizationId !== account.organizationId))
    throw new WorkflowError("Negocio no encontrado o sin acceso.", 404);
  return businessId;
}
export async function requireLegacyAutomation(request: Request) {
  await requireAdmin();
  if ((await requestBusinessId(request)) !== defaultBusinessId)
    throw new WorkflowError(
      "Las automatizaciones de cada cliente se conectarán en una etapa posterior. Este negocio usa preparación y exportación manual.",
      503,
    );
}
export function createBusiness(raw: unknown, account: Account) {
  const parsed = createBusinessSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkflowError("Completa el cliente, el nombre y el tipo de negocio.");
  const organizationId = parsed.data.organizationId as keyof typeof organizations;
  if (
    !(organizationId in organizations) ||
    (account.role !== "admin" && organizationId !== account.organizationId)
  )
    throw new WorkflowError("No puedes crear negocios para otro cliente.", 403);
  return enqueueWrite(async () => {
    const directory = await readBusinessDirectory();
    if (directory.businesses.length >= 100)
      throw new WorkflowError("Se alcanzó el límite de 100 negocios del piloto.");
    const business = businessSchema.parse({
      ...parsed.data,
      organizationName: organizations[organizationId],
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    await initializeWorkspace(business);
    const next = businessDirectorySchema.parse({
      ...directory,
      businesses: [...directory.businesses, business],
    });
    await writeJsonAtomic(registryFile, next);
    return { business };
  });
}
