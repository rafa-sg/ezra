import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { dataDirectory, enqueueWrite, writeJsonAtomic } from "./store";
import { WorkflowError } from "./workflow";

const accessFile = path.join(dataDirectory, "access.json");
const email = z.string().trim().toLowerCase().email().max(254);
const additionalAdminUsername = z.templateLiteral(["admin:", z.uuid()]);
const accountSchema = z
  .object({
    username: z.union([z.enum(["admin", "sgmotos", "motoxspress"]), additionalAdminUsername]),
    organizationId: z.enum(["owner", "sgmotos", "motoxspress"]),
    displayName: z.string(),
    email,
    role: z.enum(["admin", "client"]),
    clerkUserId: z.string().max(200).default(""),
  })
  .refine((account) =>
    account.username === "sgmotos" || account.username === "motoxspress"
      ? account.role === "client" && account.organizationId === account.username
      : account.role === "admin" && account.organizationId === "owner",
  );
const accessSchema = z
  .object({
    schemaVersion: z.literal(1),
    accounts: z.array(accountSchema).min(1),
  })
  .refine(
    ({ accounts }) =>
      accounts.some((account) => account.username === "admin") &&
      new Set(accounts.map((account) => account.email)).size === accounts.length &&
      new Set(accounts.map((account) => account.username)).size === accounts.length &&
      new Set(accounts.map((account) => account.clerkUserId).filter(Boolean)).size ===
        accounts.filter((account) => account.clerkUserId).length,
  );
export type Account = Omit<z.infer<typeof accountSchema>, "clerkUserId">;
function publicAccount(record: z.infer<typeof accountSchema>): Account {
  return {
    username: record.username,
    organizationId: record.organizationId,
    displayName: record.displayName,
    email: record.email,
    role: record.role,
  };
}

export async function readAccess() {
  try {
    return accessSchema.parse(JSON.parse(await readFile(accessFile, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new WorkflowError(
      "No se pudo leer la configuración de acceso. Se conservó intacta.",
      503,
    );
  }
}

/** Local setup command only. Never exposed as an HTTP endpoint. */
export function configureOwner(rawEmail: string) {
  const ownerEmail = email.parse(rawEmail);
  return enqueueWrite(async () => {
    const existing = await readAccess();
    if (existing) {
      if (existing.accounts.find((account) => account.username === "admin")?.email === ownerEmail)
        return;
      throw new WorkflowError(
        "El propietario ya está configurado. Se conservó el acceso existente.",
        409,
      );
    }
    const state = accessSchema.parse({
      schemaVersion: 1,
      accounts: [
        {
          username: "admin",
          organizationId: "owner",
          displayName: "Mi administración",
          email: ownerEmail,
          role: "admin",
          clerkUserId: "",
        },
      ],
    });
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(accessFile, JSON.stringify(state, null, 2), { flag: "wx", mode: 0o600 });
  });
}

/** Local setup command only. Additional administrators never replace the original owner. */
export function grantAdministrator(rawEmail: string) {
  const adminEmail = email.safeParse(rawEmail);
  if (!adminEmail.success) throw new WorkflowError("Ingresa un correo válido para administración.");
  return enqueueWrite(async () => {
    const state = await readAccess();
    if (!state) throw new WorkflowError("Configura primero la administración.", 409);
    const existing = state.accounts.find((account) => account.email === adminEmail.data);
    if (existing?.role === "admin") return;
    if (existing) throw new WorkflowError("Ese correo ya está asignado a un cliente.", 409);
    state.accounts.push({
      username: `admin:${randomUUID()}`,
      organizationId: "owner",
      displayName: "Administración",
      email: adminEmail.data,
      role: "admin",
      clerkUserId: "",
    });
    await writeJsonAtomic(accessFile, accessSchema.parse(state));
  });
}

/** Identity must originate from Clerk's verified server response, never the browser. */
export function bindIdentity(identity: { userId: string; verifiedEmails: string[] }) {
  const verified = identity.verifiedEmails.map((address) => address.trim().toLowerCase());
  return enqueueWrite(async () => {
    const state = await readAccess();
    if (!state)
      throw new WorkflowError("Falta configurar el correo del propietario en este equipo.", 503);
    const bound = state.accounts.find((account) => account.clerkUserId === identity.userId);
    const account =
      bound ||
      state.accounts.find(
        (candidate) => !candidate.clerkUserId && verified.includes(candidate.email),
      );
    if (!account || !verified.includes(account.email))
      throw new WorkflowError(
        "Este correo no tiene un panel asignado o necesita verificarse. Contacta al administrador.",
        403,
      );
    if (!account.clerkUserId) {
      account.clerkUserId = identity.userId;
      await writeJsonAtomic(accessFile, accessSchema.parse(state));
    }
    return publicAccount(account);
  });
}

export function assignClient(raw: unknown) {
  const parsed = z
    .object({ organizationId: z.enum(["sgmotos", "motoxspress"]), email })
    .strict()
    .safeParse(raw);
  if (!parsed.success) throw new WorkflowError("Ingresa un correo válido para el cliente.");
  return enqueueWrite(async () => {
    const state = await readAccess();
    if (!state) throw new WorkflowError("Configura primero la administración.", 409);
    const { organizationId, email: clientEmail } = parsed.data;
    if (
      state.accounts.some(
        (account) => account.email === clientEmail && account.organizationId !== organizationId,
      )
    )
      throw new WorkflowError("Ese correo ya está asignado a otra cuenta.", 409);
    const existing = state.accounts.find((account) => account.organizationId === organizationId);
    const account = accountSchema.parse({
      username: organizationId,
      organizationId,
      email: clientEmail,
      displayName: organizationId === "sgmotos" ? "Sgmotos" : "motoxspress",
      role: "client",
      // Reassignment immediately revokes this app's access for the previous Clerk identity.
      clerkUserId: existing?.email === clientEmail ? existing.clerkUserId : "",
    });
    state.accounts = [
      ...state.accounts.filter((candidate) => candidate.organizationId !== organizationId),
      account,
    ];
    await writeJsonAtomic(accessFile, accessSchema.parse(state));
    return publicAccount(account);
  });
}
