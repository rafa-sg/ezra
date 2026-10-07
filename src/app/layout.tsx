import { ClerkProvider } from "@clerk/nextjs";
import { esMX } from "@clerk/localizations";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ezrá · Marketing para tu comercial",
  description: "Catálogo y publicaciones para Sgmotos y motoxspress.",
  robots: { index: false, follow: false },
};
// Clerk's Spanish texts, adjusted to the ezrá sign-in design (same «tú» voice).
const localization = {
  ...esMX,
  dividerText: "o con tu correo",
  formFieldInputPlaceholder__emailAddress: "tu@correo.com",
  formFieldInputPlaceholder__password: "Tu contraseña",
  formFieldInputPlaceholder__signUpPassword: "Crea una contraseña",
  signIn: {
    ...esMX.signIn,
    start: {
      ...esMX.signIn?.start,
      title: "Inicia sesión",
      subtitle: "Bienvenido de vuelta a ezrá.",
      actionText: "¿No tienes cuenta?",
      actionLink: "Regístrate",
    },
  },
  signUp: {
    ...esMX.signUp,
    start: {
      ...esMX.signUp?.start,
      title: "Crea tu cuenta",
      subtitle: "Usa el correo que te asignó la administración.",
      actionText: "¿Ya tienes cuenta?",
      actionLink: "Inicia sesión",
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
