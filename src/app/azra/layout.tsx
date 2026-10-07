import type { Metadata } from "next";
import { AzraShell } from "@/features/azra/shell";
import "@/features/azra/azra.css";
export const metadata: Metadata = {
  title: "Azra · Demostración local",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AzraShell>{children}</AzraShell>;
}
