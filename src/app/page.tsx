import { CommercialApp } from "@/components/commercial-app";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; business?: string }>;
}) {
  const params = await searchParams;
  return <CommercialApp initialView={params.view} initialBusiness={params.business} />;
}
