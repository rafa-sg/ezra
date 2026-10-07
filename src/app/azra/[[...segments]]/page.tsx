import { notFound, redirect } from "next/navigation";
import { resolveScreen } from "@/features/azra/routes";
import { AzraScreen } from "@/features/azra/screens";
export default async function Page({ params }: { params: Promise<{ segments?: string[] }> }) {
  const { segments } = await params;
  if (!segments?.length) redirect("/azra/agency");
  const path = segments.join("/");
  const screen = resolveScreen(path);
  if (!screen) notFound();
  return <AzraScreen screen={screen} path={path} />;
}
