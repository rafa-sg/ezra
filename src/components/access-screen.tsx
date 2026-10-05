"use client";
import { SignIn, SignUp } from "@clerk/nextjs";
import { Mark } from "./ui";

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
        <a className="wordmark" href="/" aria-label="ezrá · Inicio">
          <Mark />
          <span>
            ezrá<span className="wordmark-dot">.</span>
          </span>
        </a>
        <p className="eyebrow">TU NEGOCIO, EN UN LUGAR</p>
        <h1>
          Del catálogo
          <br />a la publicación.
        </h1>
        <p>
          Prepara el contenido de tu comercial, revisa precios y promociones y organiza cada negocio
          en su propio espacio.
        </p>
        <small>Sgmotos · motoxspress · Mi panel</small>
      </section>
      <section
        className="access-auth"
        aria-label={mode === "sign-in" ? "Iniciar sesión" : "Crear cuenta"}
      >
        {mode === "sign-up" ? (
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
        ) : inline ? (
          <SignIn routing="hash" signUpUrl="/sign-up" forceRedirectUrl="/" />
        ) : (
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/" />
        )}
        <p className="field-hint">
          Tu correo verificado abre el panel que te asignó la administración.
        </p>
      </section>
    </main>
  );
}
