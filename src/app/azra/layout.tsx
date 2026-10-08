import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessionAccount, type Account } from "@/lib/auth";
import { AzraShell } from "@/features/azra/shell";
import "@/features/azra/azra.css";
export const metadata: Metadata = {
  title: "ezrá",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
/** One panel for every account. The pilot's Clerk session logic still decides
 * who enters (verified, linked account); the role limits what each one sees. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  let account: Account | null = null;
  let failed = false;
  try {
    account = await sessionAccount();
  } catch {
    // Blocked, unlinked or temporarily unverifiable accounts: the entry page
    // explains the problem and offers to sign out.
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
      }}
    >
      {children}
    </AzraShell>
  );
}
