import { redirect } from "next/navigation";
import { AccessScreen } from "@/components/access-screen";
import { AccessIssue } from "@/components/access-issue";
import { sessionAccount, type Account } from "@/lib/auth";
export const dynamic = "force-dynamic";
/** Todas las cuentas entran a la interfaz vigente; los permisos se conservan por rol. */
export default async function Page() {
  let account: Account | null = null;
  let issue = "";
  try {
    account = await sessionAccount();
  } catch (error) {
    issue = error instanceof Error ? error.message : "No se pudo verificar tu cuenta.";
  }
  if (account) redirect("/azra/produccion");
  if (issue) return <AccessIssue message={issue} />;
  return <AccessScreen mode="sign-in" inline />;
}
