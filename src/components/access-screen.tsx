"use client";
import { SignIn, SignUp } from "@clerk/nextjs";
import { ArcadePanel } from "./arcade-panel";
import "@/styles/access.css";

// Clerk keeps the authentication logic; only its look is adapted to ezrá.
const appearance = {
  options: {
    socialButtonsPlacement: "top" as const,
  },
  variables: {
    colorPrimary: "#7760d8",
    colorText: "#272a2d",
    colorTextSecondary: "#4d4a55",
    fontFamily: "inherit",
    fontSize: "15px",
    borderRadius: "10px",
  },
  elements: {
    rootBox: "ez-clerk-root",
    cardBox: "ez-clerk-card",
    card: "ez-clerk-inner",
    header: "ez-clerk-header",
    headerTitle: "ez-clerk-title",
    headerSubtitle: "ez-clerk-subtitle",
    socialButtonsBlockButton: "ez-clerk-social",
    dividerText: "ez-clerk-divider",
    formFieldLabel: "ez-clerk-label",
    formFieldInput: "ez-clerk-input",
    formButtonPrimary: "ez-clerk-primary",
    footer: "ez-clerk-footer",
  },
};

export function AccessScreen({
  mode,
  inline = false,
}: {
  mode: "sign-in" | "sign-up";
  inline?: boolean;
}) {
  return (
    <main className="access-page">
      <section className="access-intro" aria-label="EZRA">
        <ArcadePanel />
      </section>
      <section
        className="access-auth"
        aria-label={mode === "sign-in" ? "Iniciar sesión" : "Crear cuenta"}
      >
        {mode === "sign-up" ? (
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            forceRedirectUrl="/"
            appearance={appearance}
          />
        ) : inline ? (
          <SignIn
            routing="hash"
            signUpUrl="/sign-up"
            forceRedirectUrl="/"
            appearance={appearance}
          />
        ) : (
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            forceRedirectUrl="/"
            appearance={appearance}
          />
        )}
        <p className="access-note">
          Tu correo verificado abre el panel que te asignó la administración.
        </p>
      </section>
    </main>
  );
}
