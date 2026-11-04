import { notFound, redirect } from "next/navigation";
import { sessionAccount } from "@/lib/auth";
import { AzraScreen } from "@/features/azra/screens";
export const dynamic = "force-dynamic";
const INICIO = "/azra/produccion";
// Los marcadores y enlaces del panel anterior siempre llegan a la interfaz vigente.
const retiradas = /^(content|ai|bot|settings|agency|prospecting)(\/|$)/;
export default async function Page({ params }: { params: Promise<{ segments?: string[] }> }) {
  const { segments } = await params;
  const ruta = segments?.join("/") || "";
  if (!ruta || retiradas.test(ruta)) redirect(INICIO);
  if (ruta !== "produccion") notFound();
  const cuenta = await sessionAccount().catch(() => null);
  return <AzraScreen soloLectura={cuenta?.role !== "admin"} />;
}
