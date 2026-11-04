"use client";
import { SignIn, SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Sparkles, Search, Workflow, Globe, ArrowRight } from "lucide-react";
import textos from "@/features/azra/messages/es.json";
import "@/styles/access.css";

// Clerk keeps the authentication logic; only its look is adapted to ezrá.
const appearance = {
  options: {
    socialButtonsPlacement: "top" as const,
  },
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
      <section className="access-intro" aria-label="ezrá · Spotmi">
        <Link href="/" className="access-brand">
          <Sparkles size={24} />
          <strong>
            ezrá <span>/</span> Spotmi
          </strong>
        </Link>
        <div className="access-presentacion">
          <p className="access-eyebrow">{textos.p_accesoEtiqueta}</p>
          <h2>{textos.p_accesoTitulo}</h2>
          <p className="access-description">{textos.p_accesoDescripcion}</p>
          <div className="access-flujo">
            <div>
              <Search size={26} />
              <span>{textos.p_accesoFuente}</span>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
            <div>
              <Workflow size={26} />
              <span>{textos.p_accesoCrear}</span>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
            <div>
              <Globe size={26} />
              <span>{textos.p_accesoCanales}</span>
            </div>
          </div>
          <div className="access-canales" aria-label={textos.p_accesoCanales}>
            <span>Spotmi web</span>
            <span>Instagram</span>
            <span>TikTok</span>
            <span>Facebook</span>
          </div>
        </div>
      </section>
      <section
        className="access-auth"
        aria-label={mode === "sign-in" ? textos.p_accesoEntrar : textos.p_accesoCrearCuenta}
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
        <p className="access-note">{textos.p_accesoNota}</p>
      </section>
    </main>
  );
}
