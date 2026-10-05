import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ezrá · El estudio de Spotmi",
  description: "Tu espacio local para crear, revisar y organizar historias de Spotmi.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-SV">
      <body>{children}</body>
    </html>
  );
}
