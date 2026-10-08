import { ClerkProvider } from "@clerk/nextjs";
import { esMX } from "@clerk/localizations";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ezrá · Marketing para tu comercial",
  description: "Catálogo y publicaciones para Sgmotos y motoxspress.",
  robots: { index: false, follow: false },
};
// Clerk's Spanish texts for the EZRA sign-in design (Salvadoran «vos»).
const localization = {
  ...esMX,
  dividerText: "o con tu correo",
  formFieldInputPlaceholder__emailAddress: "tu@correo.com",
  formFieldInputPlaceholder__password: "Tu contraseña",
  formFieldInputPlaceholder__signUpPassword: "Creá una contraseña",
  signIn: {
    ...esMX.signIn,
    start: {
      ...esMX.signIn?.start,
      title: "Iniciá sesión",
      subtitle: "Bienvenido a EZRA.",
      actionText: "¿No tenés cuenta?",
      actionLink: "Registrate",
    },
  },
  signUp: {
    ...esMX.signUp,
    start: {
      ...esMX.signUp?.start,
      title: "Creá tu cuenta",
      subtitle: "Usá el correo que te asignó la administración.",
      actionText: "¿Ya tenés cuenta?",
      actionLink: "Iniciá sesión",
    },
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-SV">
      <body>
        <ClerkProvider
          localization={localization}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInForceRedirectUrl="/"
          signUpForceRedirectUrl="/"
          appearance={{
            // Official Clerk option; development keys stay in use, only the banner is hidden.
            options: { unsafe_disableDevelopmentModeWarnings: true },
            variables: { colorPrimary: "#7860db", fontFamily: "inherit", borderRadius: "0.75rem" },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
