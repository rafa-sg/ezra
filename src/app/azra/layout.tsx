import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessionAccount, type Account } from "@/lib/auth";
import { AzraShell } from "@/features/azra/shell";
export const metadata: Metadata = {
  title: "ezrá · Spotmi",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
/** El estudio conserva la verificación de sesión y los permisos por cuenta. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  let account: Account | null = null;
  let failed = false;
  try {
    account = await sessionAccount();
  } catch {
    // El acceso explica las cuentas bloqueadas, no vinculadas o no verificables.
    failed = true;
  }
  if (failed || !account) redirect(failed ? "/" : "/sign-in");
  return (
    <AzraShell
      user={{
        email: account.email,
        displayName: account.displayName,
        role: account.role,
        organizationId: account.organizationId,
        equipo: account.equipo,
      }}
    >
      {children}
    </AzraShell>
  );
}
