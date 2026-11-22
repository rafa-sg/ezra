import { auth, currentUser } from "@clerk/nextjs/server";
import { bindIdentity, readAccess, assignClient, type Account as AccessAccount } from "./access-store";
import { WorkflowError } from "./workflow";
import type { Equipo } from "./equipo/modelo";

/**
 * Sesión de Ezra. `admin` es el propietario (access.json), `client` un negocio del piloto (solo vista) y
 * `member` un socio o invitado del espacio Spotmi. `equipo` dice qué secciones puede usar; es null para
 * los clientes del piloto.
 */
export type Account = Omit<AccessAccount, "role" | "username" | "organizationId"> & {
  username: string;
  organizationId: string;
  role: "admin" | "client" | "member";
  equipo: Equipo | null;
};

export async function sessionAccount(): Promise<Account | null> {
  // Clerk verifies the session. No local cookie, browser role or email is trusted.
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return null;
  let user;
  try {
    user = await currentUser();
  } catch {
    throw new WorkflowError("No se pudo verificar tu cuenta. Vuelve a intentar.", 503);
  }
  if (!user || user.id !== userId || user.banned || user.locked)
    throw new WorkflowError("Tu cuenta no está disponible.", 403);
  const verifiedEmails = user.emailAddresses
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress);
  let cuenta: AccessAccount;
  try {
    cuenta = await bindIdentity({ userId, verifiedEmails });
  } catch (error) {
    // No está en access.json: puede ser un socio o invitado del espacio (solo por invitación).
    if (!(error instanceof WorkflowError) || error.status !== 403) throw error;
    const { vincularMiembro, equipoDe } = await import("./equipo/almacen");
    const miembro = vincularMiembro({ clerkUserId: userId, correos: verifiedEmails });
    if (!miembro) throw error;
    return {
      username: `miembro:${miembro.id}`,
      organizationId: `espacio:${miembro.espacioId}`,
      displayName: miembro.nombre || miembro.email,
      email: miembro.email,
      role: "member",
      equipo: equipoDe(miembro),
    };
  }
  if (cuenta.role !== "admin") return { ...cuenta, equipo: null };
  const { asegurarPropietario, equipoDe } = await import("./equipo/almacen");
  const propietario = asegurarPropietario({ clerkUserId: userId, email: cuenta.email, nombre: cuenta.displayName });
  return { ...cuenta, equipo: equipoDe(propietario) };
}

export async function requireAccount() {
  const account = await sessionAccount();
  if (!account) throw new WorkflowError("Inicia sesión para abrir tus negocios.", 401);
  return account;
}

/** Solo el propietario (la cuenta de administración). */
export async function requireAdmin() {
  const account = await requireAccount();
  if (account.role !== "admin")
    throw new WorkflowError("Esta acción requiere la cuenta de administración.", 403);
  return account;
}

export async function listAccounts() {
  await requireAdmin();
  return (await readAccess())!.accounts.map(({ clerkUserId, ...account }) => ({
    ...account,
    linked: Boolean(clerkUserId),
  }));
}

export async function saveClientAccount(raw: unknown) {
  await requireAdmin();
  return { account: await assignClient(raw) };
}
