"use client";
import { SignIn, SignUp } from "@clerk/nextjs";
import { BadgeCheck, LayoutGrid, ShieldCheck } from "lucide-react";
import { Mark } from "./ui";
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
    headerTitle: "ez-clerk-title",
    headerSubtitle: "ez-clerk-subtitle",
    socialButtonsBlockButton: "ez-clerk-social",
    dividerText: "ez-clerk-divider",
    formFieldLabel: "ez-sr-only",
    formFieldInput: "ez-clerk-input",
    formButtonPrimary: "ez-clerk-primary",
    footer: "ez-clerk-footer",
  },
};
const highlights = [
  {
    icon: BadgeCheck,
    title: "Catálogo verificado",
    text: "Precios, variantes y promociones con su fuente y fecha.",
  },
  {
    icon: ShieldCheck,
    title: "Nada sale sin tu revisión",
    text: "Cada publicación se aprueba antes de compartirla.",
  },
  {
    icon: LayoutGrid,
    title: "Un espacio por negocio",
    text: "Cada empresa con sus datos, medios y accesos separados.",
  },
];

export function AccessScreen({
  mode,
  inline = false,
}: {
  mode: "sign-in" | "sign-up";
  inline?: boolean;
}) {
  return (
    <main className="access-page">
      <section className="access-intro">
        <a className="access-brand" href="/" aria-label="ezrá · Inicio">
          <span className="access-brand-tile">
            <Mark small />
          </span>
          <span>
            ezrá<span className="access-brand-dot">.</span>
          </span>
        </a>
        <div className="access-copy">
          <h1>Del catálogo a la publicación.</h1>
          <p>
            Prepara el contenido de tu comercial, revisa precios y promociones y organiza cada
            negocio en su propio espacio.
          </p>
          <ul className="access-highlights">
            {highlights.map((item) => (
              <li key={item.title}>
                <span aria-hidden="true">
                  <item.icon size={20} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
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
