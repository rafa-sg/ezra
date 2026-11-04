"use client";
import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Sparkles } from "lucide-react";
import textos from "@/features/azra/messages/es.json";
import "@/styles/access.css";

/** La sesión existe, pero la cuenta necesita resolver su acceso al estudio. */
export function AccessIssue({ message }: { message: string }) {
  const { signOut } = useClerk();
  const [error, setError] = useState(message);
  return (
    <main className="access-issue">
      <Sparkles size={32} aria-hidden="true" />
      <h1>{textos.p_accesoRevisar}</h1>
      <p role="alert">{error}</p>
      <button className="access-reintentar" onClick={() => window.location.reload()}>
        {textos.p_accesoReintentar}
      </button>
      <button
        className="access-otro"
        onClick={() =>
          void signOut({ redirectUrl: "/" }).catch(() => setError(textos.p_accesoErrorSalir))
        }
      >
        {textos.p_accesoOtroCorreo}
      </button>
    </main>
  );
}
