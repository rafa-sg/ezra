import { redirect } from "next/navigation";
import { CommercialApp } from "@/components/commercial-app";
import { sessionAccount, type Account } from "@/lib/auth";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; business?: string }>;
}) {
  const params = await searchParams;
  let account: Account | null = null;
  try {
    account = await sessionAccount();
  } catch {
    // The client entry explains blocked or unverifiable accounts.
  }
  // Administration starts in «Pregúntale a la IA»; a business studio is
  // still opened here with ?business=… (sub-account = pilot business).
  if (account?.role === "admin" && !params.business) redirect("/azra/ai/chat");
  return <CommercialApp initialView={params.view} initialBusiness={params.business} />;
}
