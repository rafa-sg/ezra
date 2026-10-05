"use client";
import { useState } from "react";
import { CircleCheck, CircleDashed } from "lucide-react";
import type { Workspace } from "@/lib/model";
import type { Commit } from "./editor";

type Setup = Workspace["socialSetup"];
const yesNo = [
  ["unknown", "No lo sé"],
  ["yes", "Sí"],
  ["no", "No"],
] as const;

/** Readiness for official connections. Nothing here connects or contacts any network. */
export function socialSetupSteps(setup: Setup) {
  return [
    {
      done: setup.instagramProfessional === "yes",
      text:
        setup.instagramProfessional === "no"
          ? "Cambia Instagram a cuenta profesional (empresa o creador). Es gratis."
          : "Confirma que Instagram es una cuenta profesional.",
    },
    {
      done: setup.instagramLinkedToPage === "yes",
      text: "Vincula Instagram con la página de Facebook del negocio en Meta Business Suite.",
    },
    {
      done: setup.pageAdmin === "yes",
      text: "Quien conectará las redes necesita control total (administrador) de la página.",
    },
    {
      done: setup.whatsapp === "business_app" || setup.whatsapp === "cloud_api",
      text:
        setup.whatsapp === "personal"
          ? "WhatsApp personal no se puede conectar. Habrá que pasar el número a WhatsApp Business antes."
          : "Indica qué WhatsApp usa el negocio.",
    },
  ];
}

export function SocialSetupPanel({
  state,
  commit,
  busy,
}: {
  state: Workspace;
  commit: Commit;
  busy: boolean;
}) {
  const [setup, setSetup] = useState<Setup>(state.socialSetup);
  const dirty = JSON.stringify(setup) !== JSON.stringify(state.socialSetup);
  const steps = socialSetupSteps(setup);
  const field = <K extends keyof Setup>(key: K, value: Setup[K]) =>
    setSetup((s) => ({ ...s, [key]: value }));
  return (
    <section className="panel social-setup">
      <div className="section-heading">
        <h2>Preparación para conectar redes</h2>
        <span className="muted">
          {steps.filter((s) => s.done).length} de {steps.length} listos
        </span>
      </div>
      <p className="field-hint">
        Antes de conectar Instagram, Facebook y WhatsApp de forma oficial, confirma estos datos.
        Guardarlos no conecta ni publica nada.
      </p>
      <div className="form-stack">
        <div className="form-row">
          <label>
            ¿Instagram es cuenta profesional?
            <select
              value={setup.instagramProfessional}
              onChange={(e) => field("instagramProfessional", e.target.value as Setup["pageAdmin"])}
            >
              {yesNo.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            ¿Está vinculado a la página de Facebook?
            <select
              value={setup.instagramLinkedToPage}
              onChange={(e) => field("instagramLinkedToPage", e.target.value as Setup["pageAdmin"])}
            >
              {yesNo.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            ¿Tienes control total de la página?
            <select
              value={setup.pageAdmin}
              onChange={(e) => field("pageAdmin", e.target.value as Setup["pageAdmin"])}
            >
              {yesNo.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            ¿Qué WhatsApp usa el negocio?
            <select
              value={setup.whatsapp}
              onChange={(e) => field("whatsapp", e.target.value as Setup["whatsapp"])}
            >
              <option value="unknown">No lo sé</option>
              <option value="none">No usa WhatsApp</option>
              <option value="personal">WhatsApp normal (personal)</option>
              <option value="business_app">WhatsApp Business (app)</option>
              <option value="cloud_api">WhatsApp Business Platform (API)</option>
            </select>
          </label>
        </div>
        <label>
          Notas (opcional)
          <textarea
            rows={2}
            maxLength={1000}
            value={setup.notes}
            onChange={(e) => field("notes", e.target.value)}
            placeholder="Ej. nombre de la página, quién la administra, número de WhatsApp del negocio."
          />
        </label>
      </div>
      <ul className="setup-steps" aria-label="Qué falta para conectar">
        {steps.map((step) => (
          <li key={step.text} className={step.done ? "done" : ""}>
            {step.done ? (
              <CircleCheck size={16} aria-label="Listo" />
            ) : (
              <CircleDashed size={16} aria-label="Pendiente" />
            )}
            {step.text}
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        <button
          className="button primary"
          disabled={busy || !dirty}
          onClick={() =>
            void commit((draft) => {
              draft.socialSetup = setup;
            })
          }
        >
          Guardar preparación
        </button>
      </div>
    </section>
  );
}
