import { Studio } from "@/components/studio";
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams;
  return <Studio initialView={params.view} />;
}
