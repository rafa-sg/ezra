"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SignIn, SignUp } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { Pixel } from "@/features/azra/granjas/pixel";
import textos from "@/features/azra/messages/es.json";
import "@/styles/acceso.css";

// Clerk conserva toda la lógica de acceso; aquí solo se adapta su apariencia a la portada clara.
const appearance = {
  options: { socialButtonsPlacement: "top" as const },
  variables: {
    colorPrimary: "#4b3aff",
    colorPrimaryForeground: "#ffffff",
    colorBackground: "#ffffff",
    colorForeground: "#11111a",
    colorMutedForeground: "#6b6b80",
    colorInput: "#ffffff",
    colorInputForeground: "#11111a",
    colorBorder: "#e3e1f0",
    colorRing: "#4b3aff",
    fontFamily: "inherit",
    fontSize: "15px",
    borderRadius: "12px",
  },
  elements: {
    rootBox: "ac-clerk-raiz",
    cardBox: "ac-clerk-caja",
    card: "ac-clerk-tarjeta",
    // Ezra es solo por invitación: sin enlace para crear cuenta desde el inicio de sesión.
    footerAction: "ac-oculto",
  },
};
const t = textos;
type Dialogo = "entrar" | "solicitar" | null;

/** Portada de acceso al estilo de Quiclick, adaptada a Ezra: un servicio web solo por invitación. */
export function AccessScreen({
  mode,
  inline = false,
}: {
  mode: "sign-in" | "sign-up";
  inline?: boolean;
}) {
  const ruta = usePathname();
  // El registro solo llega con una invitación (enlace de Clerk) y los pasos de Clerk viven en subrutas:
  // en esos casos el formulario se abre solo.
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  useEffect(() => {
    const abrir =
      mode === "sign-up" ||
      (ruta?.startsWith("/sign-in/") ?? false) ||
      (inline && window.location.hash.length > 1);
    if (abrir) queueMicrotask(() => setDialogo("entrar"));
  }, [mode, ruta, inline]);
  return (
    <main className="ac">
      <header className="ac-cabecera">
        <a href="/" className="ac-marca" aria-label="ezrá · Spotmi">
          <span className="ac-logo" aria-hidden="true">
            <Sparkles size={18} strokeWidth={2.2} />
          </span>
          <strong>ezrá</strong>
          <small>Spotmi</small>
        </a>
        <nav className="ac-acciones" aria-label={t.ac_accesoNav}>
          <button className="ac-enlace" onClick={() => setDialogo("solicitar")}>
            {t.ac_solicitar}
          </button>
          <button
            className="ac-boton ac-primario ac-boton-chico"
            onClick={() => setDialogo("entrar")}
          >
            {t.p_accesoEntrar}
          </button>
        </nav>
      </header>

      <section className="ac-heroe">
        <div className="ac-texto">
          <p className="ac-etiqueta">
            <Zap size={14} aria-hidden="true" /> {t.ac_etiqueta}
          </p>
          <h1>
            {t.ac_titulo1} <em>{t.ac_tituloResalta}</em> {t.ac_titulo2}
          </h1>
          <p className="ac-descripcion">{t.ac_descripcion}</p>
          <div className="ac-botones">
            <button className="ac-boton ac-primario" onClick={() => setDialogo("entrar")}>
              {t.p_accesoEntrar} <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button className="ac-boton ac-secundario" onClick={() => setDialogo("solicitar")}>
              {t.ac_solicitar}
            </button>
          </div>
          <ul className="ac-ventajas">
            <li>
              <span aria-hidden="true">
                <BadgeCheck size={18} />
              </span>
              <p>
                {t.ac_v1a}
                <small>{t.ac_v1b}</small>
              </p>
            </li>
            <li>
              <span aria-hidden="true">
                <ShieldCheck size={18} />
              </span>
              <p>
                {t.ac_v2a}
                <small>{t.ac_v2b}</small>
              </p>
            </li>
            <li>
              <span aria-hidden="true">
                <UserPlus size={18} />
              </span>
              <p>
                {t.ac_v3a}
                <small>{t.ac_v3b}</small>
              </p>
            </li>
          </ul>
        </div>
        <Escena />
      </section>

      {dialogo && (
        <Ventana
          titulo={dialogo === "entrar" ? t.p_accesoEntrar : t.ac_solicitar}
          onCerrar={() => setDialogo(null)}
        >
          {dialogo === "solicitar" ? (
            <SolicitarAcceso onEntrar={() => setDialogo("entrar")} />
          ) : mode === "sign-up" ? (
            <SignUp
              routing="path"
              path="/sign-up"
              signInUrl="/sign-in"
              forceRedirectUrl="/"
              appearance={appearance}
            />
          ) : inline ? (
            <SignIn routing="hash" forceRedirectUrl="/" appearance={appearance} />
          ) : (
            <SignIn routing="path" path="/sign-in" forceRedirectUrl="/" appearance={appearance} />
          )}
          {dialogo === "entrar" && (
            <p className="ac-nota">
              {t.ac_sinCuenta}{" "}
              <button className="ac-enlace" onClick={() => setDialogo("solicitar")}>
                {t.ac_solicitar}
              </button>
            </p>
          )}
        </Ventana>
      )}
    </main>
  );
}

/** Diálogo nativo: Escape y foco los maneja el navegador; un clic fuera también lo cierra. */
function Ventana({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    // Clic en el fondo (fuera de la caja) cierra; con teclado, Escape lo hace el navegador.
    const fuera = (e: MouseEvent) => {
      if (e.target === d) d.close();
    };
    d.addEventListener("click", fuera);
    return () => d.removeEventListener("click", fuera);
  }, []);
  return (
    <dialog
      ref={ref}
      className="ac-dialogo"
      aria-label={titulo}
      onClose={onCerrar}
    >
      <div className="ac-dialogo-caja">
        <button className="ac-cerrar" onClick={() => ref.current?.close()} aria-label={t.ac_cerrar}>
          <X size={18} aria-hidden="true" />
        </button>
        {children}
      </div>
    </dialog>
  );
}

function SolicitarAcceso({ onEntrar }: { onEntrar: () => void }) {
  const [estado, setEstado] = useState<"listo" | "enviando" | "enviado">("listo");
  const [error, setError] = useState("");
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setEstado("enviando");
    setError("");
    try {
      const r = await fetch("/api/acceso/solicitud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: datos.nombre,
          email: datos.email,
          motivo: datos.motivo,
          sitio: datos.sitio,
        }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(cuerpo.error || t.ac_errorEnvio);
      setEstado("enviado");
    } catch (err) {
      setError((err as Error).message);
      setEstado("listo");
    }
  }
  if (estado === "enviado")
    return (
      <div className="ac-enviado" role="status">
        <CheckCircle2 size={40} aria-hidden="true" />
        <h2>{t.ac_enviadoTitulo}</h2>
        <p>{t.ac_enviadoTexto}</p>
        <button className="ac-boton ac-secundario" onClick={onEntrar}>
          {t.ac_yaTengo}
        </button>
      </div>
    );
  return (
    <form className="ac-form" onSubmit={(e) => void enviar(e)}>
      <h2>{t.ac_solicitar}</h2>
      <p className="ac-form-ayuda">{t.ac_solicitarAyuda}</p>
      <label>
        {t.ac_nombre}
        <input name="nombre" required minLength={2} maxLength={80} autoComplete="name" />
      </label>
      <label>
        {t.ac_correo}
        <input name="email" type="email" required maxLength={254} autoComplete="email" />
      </label>
      <label>
        {t.ac_motivo}
        <textarea name="motivo" rows={3} maxLength={500} placeholder={t.ac_motivoEjemplo} />
      </label>
      {/* Trampa para robots: oculta para personas y lectores de pantalla. */}
      <input
        className="ac-trampa"
        name="sitio"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      {error && (
        <p className="ac-error" role="alert">
          {error}
        </p>
      )}
      <button className="ac-boton ac-primario" disabled={estado === "enviando"}>
        {estado === "enviando" ? t.ac_enviando : t.ac_enviar}
      </button>
      <p className="ac-nota">
        {t.ac_yaTengoPregunta}{" "}
        <button type="button" className="ac-enlace" onClick={onEntrar}>
          {t.p_accesoEntrar}
        </button>
      </p>
    </form>
  );
}

/** Ilustración: una laptop con Ezra abierto y los agentes trabajando en una granja (decorativa). */
function Escena() {
  const pasos = [
    { indice: 0, nombre: t.ac_paso1, estado: "recolectando" as const, nota: t.ac_paso1Nota },
    { indice: 2, nombre: t.ac_paso2, estado: "generando" as const, nota: t.ac_paso2Nota },
    { indice: 3, nombre: t.ac_paso3, estado: "generando" as const, nota: t.ac_paso3Nota },
    { indice: 4, nombre: t.ac_paso4, estado: "completado" as const, nota: t.ac_paso4Nota },
  ];
  return (
    <div className="ac-escena" aria-hidden="true">
      <span className="ac-onda" />
      <span className="ac-aro" />
      <div className="ac-flotante ac-flotante-arriba">
        <span className="ac-flotante-icono">
          <BadgeCheck size={18} />
        </span>
        <span>
          {t.ac_flot1}
          <i />
        </span>
      </div>
      <div className="ac-laptop">
        <div className="ac-tapa">
          <div className="ac-pantalla">
            <aside className="ac-mini-lateral">
              <b>
                <span className="ac-logo ac-logo-mini">
                  <Sparkles size={9} />
                </span>
                ezrá
              </b>
              <span>{t.ac_mInicio}</span>
              <span className="ac-mini-activo">{t.ac_mGranjas}</span>
              <span>{t.ac_mEventos}</span>
              <span>{t.ac_mApps}</span>
            </aside>
            <div className="ac-mini-granja">
              <p className="ac-mini-titulo">{t.ac_granja}</p>
              <p className="ac-mini-sub">{t.ac_granjaSub}</p>
              <div className="ac-estaciones">
                {pasos.map((p, i) => (
                  <div
                    key={p.nombre}
                    className="ac-estacion"
                    style={{ animationDelay: `${0.9 + i * 0.25}s` }}
                  >
                    <Pixel indice={p.indice} estado={p.estado} />
                    <strong>{p.nombre}</strong>
                    <small className={`ac-chip ac-chip-${p.estado}`}>{p.nota}</small>
                  </div>
                ))}
              </div>
              <div className="ac-actividad">
                <b>{t.ac_actividad}</b>
                <span>
                  <em>{t.ac_act1}</em>
                  <small className="ac-chip ac-chip-completado">{t.ac_act1Estado}</small>
                </span>
                <span>
                  <em>{t.ac_act2}</em>
                  <small className="ac-chip">{t.ac_act2Estado}</small>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="ac-base">
          <span className="ac-teclado" />
          <span className="ac-touchpad" />
        </div>
      </div>
      <div className="ac-ficha">
        <Sparkles size={56} strokeWidth={2.2} />
      </div>
      <div className="ac-flotante ac-flotante-abajo">
        <span className="ac-check">
          <CheckCircle2 size={22} />
        </span>
        <span>
          {t.ac_flot2}
          <i />
        </span>
      </div>
    </div>
  );
}
