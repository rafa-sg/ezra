"use client";
import { useState } from "react";
import {
  ArrowDownToLine,
  CheckCheck,
  Copy,
  ExternalLink,
  Save,
  Send,
  Trash2,
  Upload,
  CalendarDays,
  X,
} from "lucide-react";
import {
  approvalIssues,
  formatLabels,
  type Media,
  type Post,
  type Source,
  type Workspace,
  today,
  sourceKindLabels,
} from "@/lib/model";
import { Dialog, Network, PostVisual, Checkline, StatusBadge } from "./ui";

export type Commit = (change: (draft: Workspace) => void) => Promise<Workspace | null>;
export type UploadFile = (
  file: File,
  origin: Media["origin"],
  attribution: string,
) => Promise<Media | null>;

export function PostEditor({
  initial,
  state,
  busy,
  commit,
  upload,
  onClose,
  onDuplicate,
}: {
  initial: Post;
  state: Workspace;
  busy: boolean;
  commit: Commit;
  upload: UploadFile;
  onClose: () => void;
  onDuplicate: (p: Post) => void;
}) {
  const [post, setPost] = useState(initial);
  const [rejecting, setRejecting] = useState(false);
  const [origin, setOrigin] = useState<Media["origin"]>("owned");
  const [attribution, setAttribution] = useState("");
  const [tab, setTab] = useState<"edit" | "review">("edit");
  const saved = state.posts.find((p) => p.id === post.id) || initial;
  const dirty = JSON.stringify(post) !== JSON.stringify(saved);
  const published = post.status === "published";
  const issues = approvalIssues(post, state);
  const field = <K extends keyof Post>(key: K, value: Post[K]) =>
    setPost((p) => ({ ...p, [key]: value }));
  const close = () => {
    if (!dirty || window.confirm("Tienes cambios sin guardar. ¿Quieres descartarlos?")) onClose();
  };
  const save = async (status = post.status) => {
    const next = await commit((d) => {
      const i = d.posts.findIndex((p) => p.id === post.id);
      d.posts[i] = { ...post, status };
    });
    if (next) {
      setPost(next.posts.find((p) => p.id === post.id)!);
      setRejecting(false);
    }
  };
  const addFile = async (file?: File) => {
    if (!file) return;
    const asset = await upload(file, origin, attribution);
    if (asset) setPost((p) => ({ ...p, mediaIds: [...p.mediaIds, asset.id] }));
  };
  const remove = async () => {
    if (!window.confirm(`¿Eliminar «${post.title}»? Los medios se conservarán en la biblioteca.`))
      return;
    const next = await commit((d) => {
      d.posts = d.posts.filter((p) => p.id !== post.id);
    });
    if (next) onClose();
  };
  return (
    <Dialog
      title="Tu próxima historia"
      subtitle={
        post.demo
          ? "Ejemplo editable · duplica para preparar una publicación real"
          : "Estudio de contenido · Spotmi"
      }
      onClose={close}
      wide
    >
      <div className="editor-layout">
        <div className="editor-main">
          <div className="editor-tabs">
            <button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>
              Contenido
            </button>
            <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>
              Fuentes y revisión <span>{Object.values(post.checks).filter(Boolean).length}/3</span>
            </button>
          </div>
          {tab === "edit" ? (
            <div className="form-stack">
              <label>
                Título interno
                <input
                  value={post.title}
                  maxLength={180}
                  disabled={published}
                  onChange={(e) => field("title", e.target.value)}
                />
              </label>
              <div className="form-row">
                <label>
                  Red social
                  <select
                    value={post.channel}
                    disabled={published}
                    onChange={(e) => field("channel", e.target.value as Post["channel"])}
                  >
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                  </select>
                </label>
                <label>
                  Formato
                  <select
                    value={post.format}
                    disabled={published}
                    onChange={(e) => field("format", e.target.value as Post["format"])}
                  >
                    {Object.entries(formatLabels).map(([v, label]) => (
                      <option value={v} key={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Texto de la publicación
                <textarea
                  rows={7}
                  maxLength={10000}
                  value={post.caption}
                  disabled={published}
                  placeholder="Una idea, una historia, un lugar por descubrir…"
                  onChange={(e) => field("caption", e.target.value)}
                />
                <span className="field-hint">
                  {post.caption.length.toLocaleString("es-SV")} caracteres · el texto se prepara
                  manualmente
                </span>
              </label>
              {!published && (
                <>
                  <div className="field-heading">
                    <span>Fotos y videos</span>
                    <span>{post.mediaIds.length} adjuntos</span>
                  </div>
                  <div className="media-select">
                    {state.media.map((m) => (
                      <label
                        key={m.id}
                        className={`media-option ${post.mediaIds.includes(m.id) ? "selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={post.mediaIds.includes(m.id)}
                          onChange={(e) =>
                            field(
                              "mediaIds",
                              e.target.checked
                                ? [...post.mediaIds, m.id]
                                : post.mediaIds.filter((id) => id !== m.id),
                            )
                          }
                        />
                        {m.mime.startsWith("video/") ? (
                          <video src={`/api/media/${m.id}`} muted preload="metadata" />
                        ) : (
                          <img src={`/api/media/${m.id}`} alt="" />
                        )}
                        <span>{m.originalName}</span>
                      </label>
                    ))}
                  </div>
                  <div className="upload-box">
                    <div className="form-row">
                      <label>
                        Origen del archivo
                        <select
                          value={origin}
                          onChange={(e) => setOrigin(e.target.value as Media["origin"])}
                        >
                          <option value="owned">Material propio</option>
                          <option value="ai">Generado con IA</option>
                          <option value="licensed">Con licencia / autorización</option>
                        </select>
                      </label>
                    </div>
                    <label className={origin === "licensed" ? "" : "subtle-field"}>
                      Licencia o nota{origin === "licensed" ? " (obligatoria)" : " (opcional)"}
                      <input
                        value={attribution}
                        onChange={(e) => setAttribution(e.target.value)}
                        placeholder="Autor, autorización, herramienta utilizada…"
                      />
                    </label>
                    <label className="button secondary file-button">
                      <Upload size={15} />
                      {busy ? "Guardando…" : "Subir un archivo"}
                      <input
                        type="file"
                        disabled={busy}
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                        onChange={(e) => {
                          void addFile(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <small>JPG, PNG, WebP, MP4 o WebM · hasta 50 MB · guardado en tu carpeta</small>
                  </div>
                </>
              )}
              {!post.mediaIds.length && (
                <p className="info-note">
                  La vista previa usa una ilustración conceptual. Adjunta tu propio material antes
                  de aprobar contenido real.
                </p>
              )}
              <label>
                Fecha y hora previstas
                <input
                  type="datetime-local"
                  value={post.plannedAt}
                  disabled={published}
                  onChange={(e) => field("plannedAt", e.target.value)}
                />
                <span className="field-hint">
                  Hora de El Salvador. Esta fecha organiza tu calendario; la publicación es manual.
                </span>
              </label>
            </div>
          ) : (
            <div className="form-stack">
              <div>
                <h3>El respaldo de tu historia</h3>
                <p className="muted">
                  Vincula información que hayas revisado. Registrar un sitio no autoriza el uso de
                  sus fotografías.
                </p>
              </div>
              <div className="source-checklist">
                {state.sources.map((s) => (
                  <Checkline
                    key={s.id}
                    checked={post.sourceIds.includes(s.id)}
                    onChange={(v) => {
                      if (!published)
                        field(
                          "sourceIds",
                          v
                            ? [...post.sourceIds, s.id]
                            : post.sourceIds.filter((id) => id !== s.id),
                        );
                    }}
                  >
                    <strong>{s.name}</strong>
                    <small>
                      {s.demo ? "Ejemplo · " : ""}
                      {s.status === "approved"
                        ? "Autorizada"
                        : s.status === "paused"
                          ? "Pausada"
                          : "Pendiente"}{" "}
                      · {sourceKindLabels[s.kind]}
                    </small>
                  </Checkline>
                ))}
              </div>
              <div className="review-checks">
                <h3>Antes de aprobar</h3>
                <Checkline
                  checked={post.checks.facts}
                  onChange={(v) => {
                    if (!published) field("checks", { ...post.checks, facts: v });
                  }}
                >
                  Verifiqué los hechos, las fechas y la vigencia de las fuentes.
                </Checkline>
                <Checkline
                  checked={post.checks.rights}
                  onChange={(v) => {
                    if (!published) field("checks", { ...post.checks, rights: v });
                  }}
                >
                  Tengo permiso para usar los medios e identifiqué lo generado con IA.
                </Checkline>
                <Checkline
                  checked={post.checks.brand}
                  onChange={(v) => {
                    if (!published) field("checks", { ...post.checks, brand: v });
                  }}
                >
                  El contenido respeta la voz y los criterios de Spotmi.
                </Checkline>
              </div>
              <p className="info-note">
                Si editas el contenido, cambias sus fuentes o actualizas la marca, debes revisar la
                versión de nuevo.
              </p>
              {issues.length > 0 && (
                <div className="check-issues">
                  <strong>Para completar la revisión</strong>
                  <ul>
                    {issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="editor-memory">
                <h3>Historial de esta historia</h3>
                {state.history
                  .filter((h) => h.postId === post.id)
                  .slice(0, 5)
                  .map((h) => (
                    <p key={h.id}>
                      <strong>{h.title}</strong>
                      <span>{h.detail}</span>
                    </p>
                  ))}
              </div>
            </div>
          )}
          {rejecting && (
            <div className="rejection-box">
              <label>
                ¿Qué necesita cambiar?
                <textarea
                  value={post.rejectionReason}
                  onChange={(e) => field("rejectionReason", e.target.value)}
                  placeholder="Este motivo se guardará en tu memoria editorial."
                />
              </label>
              <button
                className="button danger"
                disabled={busy || !post.rejectionReason.trim()}
                onClick={() => void save("rejected")}
              >
                Guardar rechazo
              </button>
            </div>
          )}
          {post.status === "planned" && (
            <label className="published-link">
              Enlace después de publicar manualmente
              <input
                type="url"
                value={post.publishedUrl}
                onChange={(e) => field("publishedUrl", e.target.value)}
                placeholder={
                  post.channel === "instagram"
                    ? "https://www.instagram.com/p/…"
                    : "https://www.facebook.com/…"
                }
              />
            </label>
          )}
        </div>
        <aside className="editor-preview">
          <div className="preview-label">
            VISTA PREVIA <span>{post.demo ? "Ejemplo" : "Borrador"}</span>
          </div>
          <div className="social-preview">
            <div className="preview-account">
              <span className="spotmi-avatar">s</span>
              <span>
                <strong>spotmi.sv</strong>
                <small>El Salvador</small>
              </span>
              <Network channel={post.channel} />
            </div>
            <div className="preview-art">
              <PostVisual post={post} state={state} />
            </div>
            <div className="preview-caption">
              <strong>spotmi.sv</strong> {post.caption || "Tu historia aparecerá aquí."}
            </div>
          </div>
          <div className="preview-meta">
            <StatusBadge status={post.status} />
            {state.media.filter((m) => post.mediaIds.includes(m.id) && m.origin === "ai").length >
              0 && <span className="badge ai-badge">Contiene medios con IA</span>}
          </div>
          {post.demo && (
            <p className="field-hint">
              Ejemplo para practicar. La ilustración no documenta un destino real.
            </p>
          )}
          <a className="text-button" href={`/api/export?post=${post.id}`}>
            <ArrowDownToLine size={15} />
            Exportar versión guardada
          </a>
          {!saved.demo && ["approved", "planned", "published"].includes(saved.status) && (
            <a
              className="text-button"
              href={`/api/export?post=${post.id}&for=site`}
              title="Paquete para copiar en «Agregar evento» de spotmi-web. No envía nada."
            >
              <ArrowDownToLine size={15} />
              Exportar para el sitio (evento)
            </a>
          )}
          <button
            className="text-button"
            disabled={busy || dirty}
            title={dirty ? "Guarda tus cambios antes de duplicar" : undefined}
            onClick={() => onDuplicate(saved)}
          >
            <Copy size={15} />
            Duplicar como borrador real
          </button>
          {post.publishedUrl && (
            <a className="text-button" href={post.publishedUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              Ver publicación
            </a>
          )}
        </aside>
      </div>
      <div className="editor-footer">
        <div>
          {!published && (
            <button
              className="icon-button danger-text"
              onClick={() => void remove()}
              disabled={busy}
              aria-label="Eliminar borrador"
            >
              <Trash2 size={18} />
            </button>
          )}
          <span className="save-note">
            {busy ? "Guardando en tu carpeta…" : dirty ? "Cambios sin guardar" : "Versión guardada"}
          </span>
        </div>
        <div className="footer-actions">
          {!published && (
            <button className="button secondary" disabled={busy} onClick={() => void save()}>
              <Save size={15} />
              Guardar
            </button>
          )}
          {["draft", "rejected"].includes(post.status) && (
            <button className="button primary" disabled={busy} onClick={() => void save("review")}>
              <Send size={15} />
              Enviar a revisión
            </button>
          )}
          {post.status === "review" && (
            <>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setRejecting(!rejecting);
                  setTab("review");
                }}
              >
                Rechazar
              </button>
              <button
                className="button primary"
                disabled={busy || issues.length > 0}
                onClick={() => void save("approved")}
              >
                <CheckCheck size={16} />
                Aprobar versión
              </button>
            </>
          )}
          {post.status === "approved" && (
            <button
              className="button primary"
              disabled={busy || !post.plannedAt}
              onClick={() => void save("planned")}
            >
              <CalendarDays size={16} />
              Guardar fecha prevista
            </button>
          )}
          {post.status === "planned" && (
            <button
              className="button primary"
              disabled={busy || !post.publishedUrl}
              onClick={() => void save("published")}
            >
              <CheckCheck size={16} />
              Registrar publicación manual
            </button>
          )}
          {published && (
            <button className="button secondary" onClick={close}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function SourceEditor({
  initial,
  commit,
  busy,
  onClose,
}: {
  initial?: Source;
  commit: Commit;
  busy: boolean;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Source>(
    initial || {
      id: crypto.randomUUID(),
      name: "",
      url: "",
      kind: "information",
      status: "pending",
      topics: "",
      notes: "",
      reviewedOn: "",
      expiresOn: "",
      demo: false,
    },
  );
  const field = <K extends keyof Source>(key: K, value: Source[K]) =>
    setSource((s) => ({ ...s, [key]: value }));
  return (
    <Dialog
      title={initial ? "Revisar fuente" : "Una fuente para tus historias"}
      subtitle="ezrá solo lee sitios propios y RSS autorizados cuando tú pulsas «Buscar ideas». Nunca redes sociales."
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const next = await commit((d) => {
            const i = d.sources.findIndex((s) => s.id === source.id);
            if (i < 0) d.sources.push(source);
            else d.sources[i] = source;
          });
          if (next) onClose();
        }}
      >
        <label>
          Nombre
          <input
            required
            value={source.name}
            maxLength={160}
            onChange={(e) => field("name", e.target.value)}
            placeholder="Ej. Información propia de Spotmi"
          />
        </label>
        <label>
          {source.kind === "rss"
            ? "Dirección del RSS"
            : source.kind === "inspiration"
              ? "Enlace (opcional)"
              : "Dirección del sitio"}
          <input
            required={source.kind !== "inspiration"}
            type="url"
            value={source.url}
            onChange={(e) => field("url", e.target.value)}
            placeholder="https://…"
          />
          <span className="field-hint">
            {source.kind === "rss"
              ? "Pega la dirección del canal RSS del sitio, no la de la portada."
              : source.kind === "owned"
                ? "Al buscar ideas se lee el RSS que anuncie este sitio, si tiene uno."
                : source.kind === "inspiration"
                  ? "Una nota tuya. ezrá nunca la lee ni la usa para verificar hechos."
                  : "Sitio oficial: se consulta a mano. ezrá no lee páginas web sin RSS."}
          </span>
        </label>
        <div className="form-row">
          <label>
            Tipo
            <select
              value={source.kind}
              onChange={(e) => field("kind", e.target.value as Source["kind"])}
            >
              <option value="owned">{sourceKindLabels.owned}</option>
              <option value="information">{sourceKindLabels.information}</option>
              <option value="rss">{sourceKindLabels.rss}</option>
              <option value="inspiration">{sourceKindLabels.inspiration}</option>
            </select>
          </label>
          <label>
            Estado
            <select
              value={source.status}
              onChange={(e) => field("status", e.target.value as Source["status"])}
            >
              <option value="pending">Pendiente de revisar</option>
              <option value="approved">Autorizada por mí</option>
              <option value="paused">Pausada</option>
            </select>
          </label>
        </div>
        <label>
          Temas y región
          <input
            value={source.topics}
            onChange={(e) => field("topics", e.target.value)}
            placeholder="Naturaleza · El Salvador"
          />
        </label>
        <div className="form-row">
          <label>
            Última revisión
            <input
              type="date"
              required={source.status === "approved"}
              max={today()}
              value={source.reviewedOn}
              onChange={(e) => field("reviewedOn", e.target.value)}
            />
            <button
              type="button"
              className="text-button"
              onClick={() => field("reviewedOn", today())}
            >
              La revisé hoy
            </button>
          </label>
          <label>
            Vigente hasta (opcional)
            <input
              type="date"
              min={source.reviewedOn}
              value={source.expiresOn}
              onChange={(e) => field("expiresOn", e.target.value)}
            />
          </label>
        </div>
        <label>
          Notas y condiciones de uso
          <textarea
            rows={3}
            value={source.notes}
            onChange={(e) => field("notes", e.target.value)}
            placeholder="Qué comprobaste, qué puedes usar y qué debes evitar…"
          />
        </label>
        {source.demo && (
          <p className="info-note">
            Esta es una fuente de ejemplo. Crea una fuente nueva para respaldar publicaciones
            reales.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            <Save size={15} />
            Guardar fuente
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function MediaUpload({
  upload,
  busy,
  onClose,
}: {
  upload: UploadFile;
  busy: boolean;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File>();
  const [origin, setOrigin] = useState<Media["origin"]>("owned");
  const [note, setNote] = useState("");
  return (
    <Dialog
      title="Añadir a la biblioteca"
      subtitle="Tus archivos se guardan en Spotbot, en esta computadora."
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (file && (await upload(file, origin, note))) onClose();
        }}
      >
        <label className="dropzone">
          <Upload size={30} />
          <strong>{file ? file.name : "Elige una foto o un video"}</strong>
          <span>JPG, PNG, WebP, MP4 o WebM · máximo 50 MB</span>
          <input
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>
        <label>
          Origen
          <select value={origin} onChange={(e) => setOrigin(e.target.value as Media["origin"])}>
            <option value="owned">Material propio</option>
            <option value="ai">Generado con IA</option>
            <option value="licensed">Con licencia / autorización</option>
          </select>
        </label>
        <label>
          Licencia o nota {origin === "licensed" ? "(obligatoria)" : "(opcional)"}
          <textarea
            required={origin === "licensed"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Autor, permiso o herramienta de generación…"
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            <X size={14} />
            Cancelar
          </button>
          <button className="button primary" disabled={busy || !file}>
            <Upload size={15} />
            Guardar archivo
          </button>
        </div>
      </form>
    </Dialog>
  );
}
