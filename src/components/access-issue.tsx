"use client";
import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Mark } from "./ui";

/** Shown when Clerk has a session but the account cannot open the panel
 * (unlinked, blocked or temporarily unverifiable). Same texts as the pilot entry. */
export function AccessIssue({ message }: { message: string }) {
  const { signOut } = useClerk();
  const [error, setError] = useState(message);
  return (
    <main className="loading-state">
      <Mark />
      <h1>Revisa tu acceso</h1>
      <p role="alert">{error}</p>
      <button className="button secondary" onClick={() => window.location.reload()}>
        Volver a intentar
      </button>
      <button
        className="text-button"
        onClick={() =>
          void signOut({ redirectUrl: "/" }).catch(() =>
            setError("No se pudo cerrar la sesión. Vuelve a intentar."),
          )
        }
      >
        Usar otro correo
      </button>
    </main>
  );
}
