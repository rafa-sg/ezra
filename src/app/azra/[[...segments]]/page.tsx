import { notFound, redirect } from "next/navigation";
import { sessionAccount } from "@/lib/auth";
import { AzraScreen } from "@/features/azra/screens";
export const dynamic = "force-dynamic";
const INICIO = "/azra/produccion";
// Los marcadores y enlaces del panel anterior siempre llegan a la interfaz vigente.
const retiradas = /^(content|ai|bot|settings|agency|prospecting)(\/|$)/;
export default async function Page({ params, searchParams }: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { segments } = await params;
  const ruta = segments?.join("/") || "";
  if (!ruta || retiradas.test(ruta)) redirect(INICIO);
  if (ruta !== "produccion") notFound();
  const cuenta = await sessionAccount().catch(() => null);
  const query = await searchParams;
  // Socios e invitados usan el estudio con las secciones de su acceso; los clientes del piloto, solo vista.
  return <AzraScreen soloLectura={!cuenta?.equipo} equipo={cuenta?.equipo ?? null} initialSection={typeof query.seccion === "string" ? query.seccion : null} />;
}
