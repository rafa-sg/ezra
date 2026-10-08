"use client";
import { useState, type FormEvent } from "react";
import { Archive, Check, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  categoryLabels,
  knowledgeCategories,
  knowledgeStatusLabels,
  usable,
  type Knowledge,
  type KnowledgeCategory,
} from "@/lib/bot/model";
import { businessApiUrl, displayDate, today } from "@/lib/model";
import { Modal } from "../ui";
import { useBot } from "./data";

type Draft = {
  id?: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  keywords: string;
  reviewBy: string;
};
const blank: Draft = { title: "", content: "", category: "business", keywords: "", reviewBy: "" };

export function KnowledgeScreen() {
  const { bot, run, busy, businessId } = useBot();
  const [category, setCategory] = useState<"" | KnowledgeCategory>("");
  const [status, setStatus] = useState<"" | Knowledge["status"]>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copyNote, setCopyNote] = useState("");
  if (!bot) return null;
  const day = today();
  const entries = bot.knowledge.filter(
    (k) => (!category || k.category === category) && (!status || k.status === status),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const ok = await run({
      op: "saveKnowledge",
      entry: {
        ...draft,
        keywords: draft.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      },
    });
    if (ok) setDraft(null);
  }
  async function copyBrand() {
    setCopyNote("");
    try {
      const response = await fetch(businessApiUrl("/api/workspace", businessId), {
        cache: "no-store",
      });
      const data = await response.json();
      const description = (data?.brand?.description ?? "").trim();
      if (!response.ok || !description) {
        setCopyNote("Marca y criterios no tiene descripción guardada para este negocio.");
        return;
      }
      setDraft((d) => d && { ...d, content: description });
      setCopyNote("Se copió la descripción guardada. Revisala antes de aprobar.");
    } catch {
      setCopyNote("No se pudo leer la descripción de la marca.");
    }
  }
  return (
    <div className="bt-stack">
      <div className="bt-toolbar">
        <label>
          Categoría
          <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="">Todas</option>
            {knowledgeCategories.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">Todos</option>
            {(["draft", "approved", "archived"] as const).map((s) => (
              <option key={s} value={s}>
                {knowledgeStatusLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <span />
        <button className="az-button ec-primary" onClick={() => setDraft({ ...blank })}>
          <Plus size={16} /> Nueva entrada
        </button>
      </div>
      <p className="az-muted bt-small">
        El bot solo usa entradas <strong>aprobadas y vigentes</strong>. Editar una entrada aprobada
        la devuelve a borrador hasta aprobarla de nuevo. No se copian precios, horarios ni
        promociones automáticamente: escribí solo información verificada.
      </p>
      {bot.knowledge.length === 0 ? (
        <div className="bt-empty">
          <h2>Todavía no hay conocimiento</h2>
          <p>
            Empezá por la descripción del negocio, los horarios y la ubicación. Después agregá
            productos, políticas y preguntas frecuentes.
          </p>
          <button className="az-button ec-primary" onClick={() => setDraft({ ...blank })}>
            <Plus size={16} /> Agregar la primera entrada
          </button>
        </div>
      ) : entries.length === 0 ? (
        <p className="bt-empty">No hay entradas con esos filtros.</p>
      ) : (
        <ul className="bt-entries">
          {entries.map((entry) => {
            const expired = entry.status === "approved" && !usable(entry, day);
            return (
              <li key={entry.id} className="bt-card">
                <div className="bt-entry-head">
                  <div>
                    <p className="bt-label">{categoryLabels[entry.category]}</p>
                    <h3>{entry.title}</h3>
                  </div>
                  <span className={`bt-badge is-${expired ? "warning" : entry.status}`}>
                    {expired ? "Vencida: revisar" : knowledgeStatusLabels[entry.status]}
                  </span>
                </div>
                <p className="bt-entry-content">{entry.content}</p>
                <p className="az-muted bt-small">
                  Actualizada{" "}
                  {displayDate(entry.updatedAt, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {entry.reviewBy &&
                    ` · Revisar antes del ${displayDate(entry.reviewBy, { day: "numeric", month: "short", year: "numeric" })}`}
                  {entry.keywords.length > 0 && ` · Palabras clave: ${entry.keywords.join(", ")}`}
                </p>
                <div className="bt-actions">
                  <button
                    className="az-button"
                    disabled={busy}
                    onClick={() =>
                      setDraft({
                        id: entry.id,
                        title: entry.title,
                        content: entry.content,
                        category: entry.category,
                        keywords: entry.keywords.join(", "),
                        reviewBy: entry.reviewBy,
                      })
                    }
                  >
                    <Pencil size={15} /> Editar
                  </button>
                  {entry.status !== "approved" && (
                    <button
                      className="az-button"
                      disabled={busy}
                      onClick={() =>
                        run({ op: "setKnowledgeStatus", id: entry.id, status: "approved" })
                      }
                    >
                      <Check size={15} /> Aprobar
                    </button>
                  )}
                  {entry.status !== "archived" && (
                    <button
                      className="az-button"
                      disabled={busy}
                      onClick={() =>
                        run({ op: "setKnowledgeStatus", id: entry.id, status: "archived" })
                      }
                    >
                      <Archive size={15} /> Archivar
                    </button>
                  )}
                  {entry.status === "approved" && (
                    <button
                      className="az-button"
                      disabled={busy}
                      onClick={() =>
                        run({ op: "setKnowledgeStatus", id: entry.id, status: "draft" })
                      }
                    >
                      <RotateCcw size={15} /> Volver a borrador
                    </button>
                  )}
                  {entry.status !== "approved" && (
                    <button
                      className="az-button bt-danger"
                      disabled={busy}
                      onClick={() => run({ op: "deleteKnowledge", id: entry.id })}
                    >
                      <Trash2 size={15} /> Eliminar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        open={!!draft}
        onClose={() => {
          setDraft(null);
          setCopyNote("");
        }}
        label={draft?.id ? "Editar entrada" : "Nueva entrada"}
        className="ec-dialog bt-dialog"
      >
        {draft && (
          <form onSubmit={submit}>
            <h2>{draft.id ? "Editar entrada" : "Nueva entrada"}</h2>
            {draft.id && (
              <p className="az-muted bt-small">
                Al guardar, la entrada vuelve a borrador y necesita aprobación.
              </p>
            )}
            <label>
              Categoría
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as KnowledgeCategory })
                }
              >
                {knowledgeCategories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabels[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Título
              <input
                required
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              {draft.category === "links" ? "Enlaces https (uno por línea)" : "Contenido"}
              <textarea
                required
                maxLength={4000}
                rows={6}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </label>
            {draft.category === "business" && (
              <p className="bt-small">
                <button type="button" className="bt-link-button" onClick={copyBrand}>
                  Copiar la descripción de Marca y criterios
                </button>
                {copyNote && <span className="az-muted"> {copyNote}</span>}
              </p>
            )}
            <label>
              Palabras clave (separadas por coma)
              <input
                value={draft.keywords}
                placeholder="ej.: garantía, repuestos"
                onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
              />
            </label>
            <label>
              Revisar o vence el (opcional)
              <input
                type="date"
                value={draft.reviewBy}
                onChange={(e) => setDraft({ ...draft, reviewBy: e.target.value })}
              />
            </label>
            <div className="bt-actions bt-actions-end">
              <button type="button" className="az-button" onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button className="az-button ec-primary" disabled={busy}>
                Guardar como borrador
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
