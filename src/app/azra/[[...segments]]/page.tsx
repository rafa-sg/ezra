import { notFound, redirect } from "next/navigation";
import { resolveScreen } from "@/features/azra/routes";
import { AzraScreen } from "@/features/azra/screens";
// «Pregúntale a la IA» is the panel's home. Pages removed from the menu send
// their old URLs there instead of a 404.
const HOME = "/azra/ai/chat";
const removed = /^(agency|prospecting)(\/|$)/;
export default async function Page({ params }: { params: Promise<{ segments?: string[] }> }) {
  const { segments } = await params;
  if (!segments?.length) redirect(HOME);
  const path = segments.join("/");
  if (removed.test(path)) redirect(HOME);
  const screen = resolveScreen(path);
  if (!screen) notFound();
  return <AzraScreen screen={screen} path={path} />;
}
