import { auth, currentUser } from "@clerk/nextjs/server";
import { bindIdentity, readAccess, assignClient, type Account } from "./access-store";
import { WorkflowError } from "./workflow";

export type { Account } from "./access-store";

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
  return bindIdentity({
    userId,
    verifiedEmails: user.emailAddresses
      .filter((address) => address.verification?.status === "verified")
      .map((address) => address.emailAddress),
  });
}

export async function requireAccount() {
  const account = await sessionAccount();
  if (!account) throw new WorkflowError("Inicia sesión para abrir tus negocios.", 401);
  return account;
}

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
