"use client";
import { useState } from "react";
import { Palette } from "lucide-react";
import { businessApiUrl, type Workspace } from "@/lib/model";
import { contrast, readableOnWhite, themeStyle } from "@/lib/theme";
import type { Commit } from "./editor";

type Appearance = Workspace["appearance"];

/** Colors and logo of this business only. The logo must already be in its library. */
export function AppearancePanel({
  state,
  commit,
  busy,
}: {
  state: Workspace;
  commit: Commit;
  busy: boolean;
}) {
  const [look, setLook] = useState<Appearance>(state.appearance);
  const dirty = JSON.stringify(look) !== JSON.stringify(state.appearance);
  const images = state.media.filter((m) => m.mime.startsWith("image/"));
  const adjusted = look.primary && readableOnWhite(look.primary) !== look.primary.toLowerCase();
  const save = (next: Appearance) =>
    void commit((draft) => {
      draft.appearance = next;
    });
  return (
    <section className="panel appearance-panel">
      <div className="settings-title">
        <span className="stat-icon lilac">
          <Palette size={22} />
        </span>
        <div>
          <h2>Apariencia del panel</h2>
          <p>Colores y logo de este negocio</p>
        </div>
      </div>
      <div className="form-stack">
        <div className="form-row">
          <label>
            Color principal
            <input
              type="color"
              value={look.primary || "#7760d8"}
              onChange={(e) => setLook({ ...look, primary: e.target.value })}
            />
          </label>
          <label>
            Color de acento
            <input
              type="color"
              value={look.secondary || look.primary || "#7760d8"}
              onChange={(e) => setLook({ ...look, secondary: e.target.value })}
            />
          </label>
        </div>
        {adjusted && (
          <p className="field-hint">
            Para que el texto blanco se lea bien en los botones, se usará un tono un poco más oscuro
            del color principal (contraste{" "}
            {contrast(readableOnWhite(look.primary), "#ffffff").toFixed(1)}:1).
          </p>
        )}
        <label>
          Logo
          <select
            value={look.logoMediaId}
            onChange={(e) => setLook({ ...look, logoMediaId: e.target.value })}
          >
            <option value="">Sin logo</option>
            {images.map((m) => (
              <option key={m.id} value={m.id}>
                {m.originalName}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Sube el logo en Publicaciones → Biblioteca y elígelo aquí.
          </span>
        </label>
        <div className="appearance-preview" style={themeStyle(look)} aria-label="Vista previa">
          {look.logoMediaId && (
            <img
              src={businessApiUrl(`/api/media/${look.logoMediaId}`, state.businessId)}
              alt="Logo elegido"
            />
          )}
          <span className="appearance-chip">Menú activo</span>
          <span className="button primary" aria-hidden="true">
            Botón principal
          </span>
          <span className="appearance-accent" aria-hidden="true" />
        </div>
      </div>
      <div className="dialog-actions">
        <button
          className="button secondary"
          disabled={busy || (!state.appearance.primary && !state.appearance.logoMediaId)}
          onClick={() => save({ primary: "", secondary: "", logoMediaId: "" })}
        >
          Usar el estilo de ezrá
        </button>
        <button className="button primary" disabled={busy || !dirty} onClick={() => save(look)}>
          Guardar apariencia
        </button>
      </div>
    </section>
  );
}
