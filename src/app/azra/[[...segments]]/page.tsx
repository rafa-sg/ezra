import { notFound, redirect } from "next/navigation";
import { sessionAccount } from "@/lib/auth";
import { resolveScreen } from "@/features/azra/routes";
import { AzraScreen } from "@/features/azra/screens";
// «Pregúntale a la IA» is the panel's home. Pages removed from the menu send
// their old URLs there instead of a 404.
const HOME = "/azra/ai/chat";
const PROFILE = "/azra/settings/profile/general";
const removed = /^(agency|prospecting)(\/|$)/;
// Settings keeps only Mi perfil, Empresa and Usuarios; any other settings URL
// (removed sections such as billing, email, integrations…) opens Mi perfil.
const keptSettings = /^settings\/(profile\/(general|security)|company|users)$/;
// Clients (Sgmotos, motoxspress) reach Ask AI, content, the support bot and their own profile.
const clientAllowed = /^(content|bot(\/[a-z]+)?|ai\/chat|settings\/profile\/(general|security))$/;
export default async function Page({ params }: { params: Promise<{ segments?: string[] }> }) {
  const { segments } = await params;
  if (!segments?.length) redirect(HOME);
  const path = segments.join("/");
  if (removed.test(path)) redirect(HOME);
  if ((path === "settings" || path.startsWith("settings/")) && !keptSettings.test(path))
    redirect(PROFILE);
  if (!resolveScreen(path)) notFound();
  let isAdmin = false;
  try {
    isAdmin = (await sessionAccount())?.role === "admin";
  } catch {
    // The layout already handled blocked or unverifiable accounts.
  }
  if (!isAdmin && !clientAllowed.test(path)) redirect(HOME);
  return <AzraScreen path={path} />;
}
