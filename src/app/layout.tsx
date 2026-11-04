import { ClerkProvider } from "@clerk/nextjs";
import { esMX } from "@clerk/localizations";
import type { Metadata } from "next";
import textos from "@/features/azra/messages/es.json";
import "./globals.css";
export const metadata: Metadata = {
  title: "ezrá · Spotmi",
  description: textos.p_metaDescripcion,
  robots: { index: false, follow: false },
};
// El acceso comparte el tono y los textos del Estudio Spotmi.
const localization = {
  ...esMX,
  dividerText: textos.p_clerkDivider,
  formFieldInputPlaceholder__emailAddress: textos.p_clerkEmail,
  formFieldInputPlaceholder__password: textos.p_clerkPassword,
  formFieldInputPlaceholder__signUpPassword: textos.p_clerkNewPassword,
  signIn: {
    ...esMX.signIn,
    start: {
      ...esMX.signIn?.start,
      title: textos.p_clerkInTitle,
      subtitle: textos.p_clerkInSubtitle,
      actionText: textos.p_clerkNoAccount,
      actionLink: textos.p_clerkRegister,
    },
  },
  signUp: {
    ...esMX.signUp,
    start: {
      ...esMX.signUp?.start,
      title: textos.p_clerkUpTitle,
      subtitle: textos.p_clerkUpSubtitle,
      actionText: textos.p_clerkHasAccount,
      actionLink: textos.p_clerkInTitle,
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
            variables: {
              colorPrimary: "#d7ee9c",
              colorPrimaryForeground: "#172224",
              colorBackground: "#172638",
              colorForeground: "#f3f3e9",
              colorMutedForeground: "#a9b6c4",
              colorInput: "#101d2d",
              colorInputForeground: "#f3f3e9",
              colorBorder: "#405165",
              colorRing: "#d7ee9c",
              fontFamily: "inherit",
              borderRadius: "0.5rem",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
