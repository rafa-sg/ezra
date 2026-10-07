import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessionAccount, type Account } from "@/lib/auth";
import { AzraShell } from "@/features/azra/shell";
import "@/features/azra/azra.css";
export const metadata: Metadata = {
  title: "ezrá · Panel de agencia",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
/** The agency panel reuses the pilot's Clerk session logic: a verified, linked
 * administrator account is required. Clients go to their own business studio. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  let account: Account | null = null;
  let failed = false;
  try {
    account = await sessionAccount();
  } catch {
    // Blocked, unlinked or temporarily unverifiable accounts: the pilot entry
    // explains the problem and offers to sign out.
    failed = true;
  }
  if (failed || !account) redirect(failed ? "/" : "/sign-in");
  if (account.role !== "admin") redirect("/");
  return (
    <AzraShell user={{ email: account.email, displayName: account.displayName }}>
      {children}
    </AzraShell>
  );
}
