import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarCheck, HardDrive, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { Mark } from "@/components/ui";
import { SESSION_COOKIE, authConfig, loginErrors, readSession } from "@/lib/auth";
import "@/styles/login.css";

export const metadata: Metadata = { title: "Entrar · ezrá" };
export const dynamic = "force-dynamic";

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { off, missing } = authConfig();
  if (off || (await readSession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/");
  const code = (await searchParams).error;
  const error = code && Object.hasOwn(loginErrors, code) ? loginErrors[code] : undefined;

  return (
    <main className="login-shell">
      <section className="login-story" aria-label="Sobre ezrá">
        <div className="login-wordmark">
          <Mark />
          <span>
            ezrá<span className="wordmark-dot">.</span>
          </span>
          <span className="studio-label">ESTUDIO</span>
        </div>
        <h1>
          Cuenta historias de El Salvador <em>con cuidado.</em>
        </h1>
        <p className="login-lede">
          El estudio editorial de Spotmi: prepara, revisa y organiza cada publicación antes de que
          salga al mundo.
        </p>
        <ul className="login-points">
          <li>
            <ShieldCheck size={18} />
            <span>Cada versión se revisa y se aprueba a mano.</span>
          </li>
          <li>
            <CalendarCheck size={18} />
            <span>Nada se publica solo: tú decides cuándo y dónde.</span>
          </li>
          <li>
            <HardDrive size={18} />
            <span>Tus borradores y medios viven en tu computadora.</span>
          </li>
        </ul>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <span className="login-lock">
          <LockKeyhole size={20} />
        </span>
        <h2 id="login-title">Entrar al estudio</h2>
        <p className="muted">Usa la cuenta de Google autorizada para este espacio de trabajo.</p>
        {error && (
          <div className="login-alert" role="alert">
            <TriangleAlert size={17} />
            <span>{error}</span>
          </div>
        )}
        {missing.length ? (
          <div className="login-setup">
            <strong>Falta configurar el acceso</strong>
            <p>
              Agrega estas variables en <code>.env.local</code> y reinicia el estudio:
            </p>
            <ul>
              {missing.map((name) => (
                <li key={name}>
                  <code>{name}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <a className="login-google" href="/api/auth/login">
            <GoogleLogo />
            Continuar con Google
          </a>
        )}
        <p className="login-fine">
          Solo disponible en esta computadora. Google comparte únicamente tu nombre y tu correo;
          ezrá no puede leer tu Gmail ni tu Drive.
        </p>
      </section>
    </main>
  );
}
