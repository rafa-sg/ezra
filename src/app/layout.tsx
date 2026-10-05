import { ClerkProvider } from "@clerk/nextjs";
import { esMX } from "@clerk/localizations";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ezrá · Marketing para tu comercial",
  description: "Catálogo y publicaciones para Sgmotos y motoxspress.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-SV">
      <body>
        <ClerkProvider
          localization={esMX}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInForceRedirectUrl="/"
          signUpForceRedirectUrl="/"
          appearance={{
            variables: { colorPrimary: "#7860db", fontFamily: "inherit", borderRadius: "0.75rem" },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
