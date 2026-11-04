"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Plug,
  FileText,
  PanelsTopLeft,
  MoreHorizontal,
  Trash2,
  ImagePlus,
  Check,
  Users,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Activity,
  Radio,
  Download,
  ArrowUpRight,
} from "lucide-react";
import {
  approvalIssues,
  businessApiUrl,
  displayDate,
  newPost,
  statusLabels,
  workspaceSchema,
  type Post,
  type Workspace,
} from "@/lib/model";
import { useActiveBusiness } from "./account/active-business";
import { Modal } from "./ui";
import { ConnectionsPanel } from "./connections";
import "./content.css";

function Facebook({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path
        fill="white"
        d="M13.5 21v-7h2.3l.4-3h-2.7V9.3c0-.9.3-1.5 1.5-1.5h1.5V5.2c-.4-.1-1.3-.2-2.2-.2-2.3 0-3.8 1.4-3.8 4V11H8v3h2.5v7Z"
      />
    </svg>
  );
}
function Instagram({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}
type Channel = Post["channel"];
const networks = {
  facebook: { name: "Facebook", icon: Facebook },
  instagram: { name: "Instagram", icon: Instagram },
};
async function responseData(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la acción.");
  return data;
}
export function ContentStudio() {
  const { active, failed } = useActiveBusiness();
  if (!active)
    return (
      <div className="az-page" role="status">
        {failed ? "No pudimos cargar tus negocios. Recargá la página." : "Cargando tu espacio…"}
      </div>
    );
  return <Studio key={active.id} businessId={active.id} name={active.name} />;
}
function Studio({ businessId, name }: { businessId: string; name: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<Channel>("facebook");
  const [selected, setSelected] = useState("");
  const [dialog, setDialog] = useState<"add" | "remove" | "connections" | null>(null);
  const [editor, setEditor] = useState<Post | null>(null);
  const url = (path: string) => businessApiUrl(path, businessId);
  useEffect(() => {
    const controller = new AbortController();
    fetch(businessApiUrl("/api/workspace", businessId), { signal: controller.signal })
      .then(responseData)
      .then((data) => {
        const state = workspaceSchema.parse(data);
        setWorkspace(state);
        setChannel(state.socialPanels?.[0] ?? "facebook");
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError("No pudimos cargar el contenido. Recargá para volver a intentar.");
      });
    return () => controller.abort();
  }, [businessId]);
  async function save(next: Workspace) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = workspaceSchema.parse(
        await responseData(
          await fetch(url("/api/workspace"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          }),
        ),
      );
      setWorkspace(saved);
      setNotice("Cambios guardados");
      return saved;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const panels = workspace?.socialPanels ?? [];
  const current = panels.includes(channel) ? channel : panels[0];
  const Network = current ? networks[current].icon : PanelsTopLeft;
  const posts =
    workspace?.posts
      .filter((p) => !p.demo && p.channel === current)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [];
  const selectedPost = posts.find((p) => p.id === selected);
  function create(caption = "") {
    const post = newPost();
    post.channel = current ?? channel;
    post.format = post.channel === "facebook" ? "text" : "photo";
    post.caption = caption;
    setEditor(post);
    setDialog(null);
  }
  async function savePost() {
    if (!workspace || !editor) return;
    const exists = workspace.posts.some((p) => p.id === editor.id);
    const saved = await save({
      ...workspace,
      posts: exists
        ? workspace.posts.map((p) => (p.id === editor.id ? editor : p))
        : [editor, ...workspace.posts],
    });
    if (saved) {
      setSelected(editor.id);
      setEditor(null);
    }
  }
  async function upload(file: File) {
    if (!editor) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("origin", "owned");
      const data = await responseData(
        await fetch(url("/api/media"), { method: "POST", body: form }),
      );
      setWorkspace(workspaceSchema.parse(data.workspace));
      setEditor((p) =>
        p
          ? {
              ...p,
              mediaIds: [...p.mediaIds, data.media.id],
              format: data.media.mime.startsWith("video/") ? "reel" : "photo",
            }
          : p,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportPost(post: Post) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url(`/api/export?post=${encodeURIComponent(post.id)}`));
      if (!response.ok) {
        await responseData(response);
        return;
      }
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(await response.blob());
      link.href = objectUrl;
      link.download = `ezra-${post.id}${["approved", "planned", "published"].includes(post.status) ? "" : "-no-aprobada"}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setNotice("Paquete exportado para uso manual.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ec-layout">
      <aside className="az-chat-sidebar ec-tools">
        <h2>Herramientas</h2>
        <button onClick={() => setDialog("connections")} aria-haspopup="dialog">
          <Plug size={18} />
          Conexiones
        </button>
        <div className="az-chat-account">
          <span className="ec-initial">{name.charAt(0)}</span>
          <span>{name}</span>
        </div>
      </aside>
      <section className="ec-main">
        <div className="ec-heading">
          <div>
            <p className="ec-eyebrow">TU ESPACIO CREATIVO</p>
            <h1>Creación de contenido</h1>
          </div>
          <span className="ec-local">Preparación local</span>
        </div>
        <div className="ec-tabs">
          <div role="group" aria-label="Red social">
            {panels.map((key) => {
              const Icon = networks[key].icon;
              return (
                <button
                  key={key}
                  aria-pressed={current === key}
                  className={current === key ? "is-active" : ""}
                  onClick={() => {
                    setChannel(key);
                    setSelected("");
                  }}
                >
                  <Icon size={19} />
                  {networks[key].name}
                </button>
              );
            })}
          </div>
          <button
            className="az-button"
            disabled={!workspace || busy || panels.length === 2}
            onClick={() => setDialog("add")}
          >
            <Plus size={17} />
            Agregar panel
          </button>
        </div>
        {error && (
          <p className="ec-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="ec-notice" role="status">
            {notice}
          </p>
        )}
        {!workspace ? (
          <p role="status">Cargando contenido…</p>
        ) : !current ? (
          <div className="ec-welcome">
            <div className="ec-network-art" aria-hidden="true">
              <span>
                <Facebook size={28} />
              </span>
              <span className="ec-art-center">
                <PanelsTopLeft size={34} />
              </span>
              <span>
                <Instagram size={28} />
              </span>
            </div>
            <p className="ec-eyebrow">TODO EMPIEZA CON UNA IDEA</p>
            <h2>Un espacio para tus próximas publicaciones</h2>
            <p>
              Agregá un panel de Facebook o Instagram y empezá a preparar
              <br className="ec-desktop" /> el contenido de {name}, a tu ritmo.
            </p>
            <button className="az-button ec-primary" onClick={() => setDialog("add")}>
              <Plus size={18} />
              Agregar mi primer panel
            </button>
            <span className="ec-footnote">Sin cuentas conectadas. Sin publicaciones todavía.</span>
            <div className="ec-steps">
              <div>
                <span>01</span>
                <strong>Elegí tu red</strong>
                <p>Organizá cada canal en su panel.</p>
              </div>
              <div>
                <span>02</span>
                <strong>Dale forma a tu idea</strong>
                <p>Escribí y agregá tus propios medios.</p>
              </div>
              <div>
                <span>03</span>
                <strong>Revisá y exportá</strong>
                <p>Prepará cada versión para compartirla.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="ec-panel">
            <header className="ec-panel-heading">
              <span className="ec-network-icon">
                <Network size={26} />
              </span>
              <div>
                <h2>{networks[current].name}</h2>
                <p>{name} · Panel de contenido</p>
              </div>
              <span className="ec-connection">Sin conectar</span>
              <details className="ec-menu">
                <summary aria-label="Opciones del panel">
                  <MoreHorizontal size={20} />
                </summary>
                <button disabled={busy} onClick={() => setDialog("remove")}>
                  <Trash2 size={15} />
                  Eliminar panel
                </button>
              </details>
            </header>
            <div className="ec-section-heading">
              <h3>
                Publicaciones <span>{posts.length} creadas</span>
              </h3>
              <div className="ec-sort">
                <span>Ordenar por</span>
                <button aria-pressed="true">Más recientes</button>
                <button disabled title="Disponible cuando haya métricas reales">
                  Mejor rendimiento
                </button>
              </div>
            </div>
            {posts.length ? (
              <>
                <div className="ec-posts">
                  {posts.map((post) => {
                    const media = workspace.media.find((m) => m.id === post.mediaIds[0]);
                    return (
                      <button
                        key={post.id}
                        className={`ec-post ${post.id === selected ? "is-selected" : ""}`}
                        aria-pressed={post.id === selected}
                        onClick={() => setSelected(post.id)}
                      >
                        <div className="ec-post-media">
                          {media ? (
                            media.mime.startsWith("image/") ? (
                              <img src={url(`/api/media/${media.id}`)} alt={post.title} />
                            ) : (
                              <span>
                                <ImagePlus size={28} />
                                Video adjunto
                              </span>
                            )
                          ) : (
                            <FileText size={32} />
                          )}
                          <span className="ec-check">
                            {selected === post.id && <Check size={16} />}
                          </span>
                        </div>
                        <div className="ec-post-copy">
                          <strong>{post.title}</strong>
                          <p>{post.caption || "Texto pendiente"}</p>
                          <small>Creado el {displayDate(post.createdAt)}</small>
                          <span className="ec-status">{statusLabels[post.status]}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button
                  className="az-button ec-create-more"
                  disabled={busy}
                  onClick={() => create()}
                >
                  <Plus size={16} />
                  Crear contenido
                </button>
              </>
            ) : (
              <div className="ec-empty">
                <span className="ec-empty-icon">
                  <ImagePlus size={30} />
                </span>
                <h3>Tu próxima idea va acá</h3>
                <p>Todavía no creaste contenido para esta red. Empezá con un borrador.</p>
                <button className="az-button ec-primary" disabled={busy} onClick={() => create()}>
                  <Plus size={17} />
                  Crear contenido
                </button>
              </div>
            )}
            {selectedPost && (
              <div className="ec-selection">
                <span>
                  <strong>{selectedPost.title}</strong> · {statusLabels[selectedPost.status]}
                </span>
                <button
                  className="az-button"
                  disabled={busy || selectedPost.status === "published"}
                  onClick={() => setEditor(structuredClone(selectedPost))}
                >
                  Editar y revisar
                  <ArrowUpRight size={16} />
                </button>
                <button
                  className="az-button"
                  disabled={busy}
                  onClick={() => void exportPost(selectedPost)}
                >
                  <Download size={16} />
                  Exportar
                </button>
              </div>
            )}
            <h3 className="ec-metrics-title">Métricas</h3>
            <div className="ec-metrics">
              <MetricCard
                title="Métricas del post"
                subtitle={
                  selectedPost
                    ? selectedPost.title
                    : "Seleccioná una publicación para ver su detalle"
                }
                items={[
                  [Users, "Alcance"],
                  [Eye, "Impresiones"],
                  [Heart, "Me gusta"],
                  [MessageCircle, "Comentarios"],
                  [Share2, "Compartidos"],
                  [Bookmark, "Guardados"],
                ]}
              />
              <MetricCard
                title="Métricas de la cuenta"
                subtitle={`${name} · ${networks[current].name}`}
                account
                items={[
                  [Users, "Seguidores"],
                  [Radio, "Alcance"],
                  [Eye, "Impresiones"],
                  [Activity, "Interacción"],
                ]}
              />
            </div>
            <p className="ec-footnote">
              Las métricas estarán disponibles cuando exista una integración real. Crear un panel no
              conecta tu cuenta.
            </p>
          </div>
        )}
      </section>
      <Modal
        open={dialog !== null}
        onClose={() => !busy && setDialog(null)}
        label={
          dialog === "add" ? "Agregar panel" : dialog === "remove" ? "Eliminar panel" : "Conexiones"
        }
        className="ec-dialog"
      >
        {dialog === "add" && (
          <>
            <p className="ec-eyebrow">UN CANAL, UN ESPACIO</p>
            <h2>Agregá un panel</h2>
            <p>
              Elegí dónde querés preparar tu contenido. La vinculación real de cuentas todavía no
              está disponible.
            </p>
            <div className="ec-network-choices">
              {(Object.keys(networks) as Channel[]).map((key) => {
                const Icon = networks[key].icon;
                return (
                  <button
                    key={key}
                    disabled={panels.includes(key) || busy}
                    onClick={async () => {
                      if (
                        workspace &&
                        (await save({ ...workspace, socialPanels: [...panels, key] }))
                      ) {
                        setChannel(key);
                        setDialog(null);
                      }
                    }}
                  >
                    <Icon size={26} />
                    <strong>{networks[key].name}</strong>
                    <span>{panels.includes(key) ? "Panel agregado" : "Agregar panel local"}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {dialog === "remove" && (
          <>
            <h2>¿Eliminar este panel?</h2>
            <p>
              Se quitará el panel de {current && networks[current].name}. Tus borradores y medios se
              conservan; volverán a aparecer si agregás el panel otra vez.
            </p>
            <button
              className="az-button"
              disabled={busy}
              onClick={async () => {
                if (
                  workspace &&
                  (await save({ ...workspace, socialPanels: panels.filter((p) => p !== current) }))
                )
                  setDialog(null);
              }}
            >
              Eliminar panel
            </button>
          </>
        )}
        {dialog === "connections" && (
          <>
            <span className="ec-network-icon">
              <Plug size={26} />
            </span>
            <h2>Conexiones</h2>
            <p>
              Prepara tus publicaciones con las IA del estudio y conserva el control de cada cuenta.
            </p>
            <ConnectionsPanel />
            <p>
              Todavía no hay servicios conectados. Los paneles de Facebook e Instagram preparan
              contenido local y no vinculan cuentas.
            </p>
          </>
        )}
        {error && (
          <p className="ec-error" role="alert">
            {error}
          </p>
        )}
      </Modal>
      <Modal
        open={!!editor}
        onClose={() => !busy && setEditor(null)}
        label="Editar y revisar contenido"
        className="ec-dialog ec-editor"
      >
        {editor && workspace && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void savePost();
            }}
          >
            <p className="ec-eyebrow">
              {networks[editor.channel].name} ·{" "}
              {statusLabels[workspace.posts.find((p) => p.id === editor.id)?.status ?? "draft"]}
            </p>
            <h2>Dale forma a tu publicación</h2>
            <label>
              Título interno
              <input
                required
                maxLength={180}
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              />
            </label>
            <label>
              Texto de la publicación
              <textarea
                rows={5}
                maxLength={10000}
                value={editor.caption}
                placeholder="¿Qué querés compartir con tu comunidad?"
                onChange={(e) => setEditor({ ...editor, caption: e.target.value })}
              />
            </label>
            <label className="ec-upload">
              <ImagePlus size={20} />
              Agregar imagen o video propio
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                disabled={busy || editor.mediaIds.length >= 20}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="ec-footnote">
              Solo medios propios · hasta 50 MB por archivo · quedan en tu biblioteca al subirlos.
            </p>
            {editor.mediaIds.map((id) => (
              <div className="ec-attachment" key={id}>
                <span>{workspace.media.find((m) => m.id === id)?.originalName}</span>
                <button
                  type="button"
                  aria-label="Quitar adjunto"
                  onClick={() =>
                    setEditor({ ...editor, mediaIds: editor.mediaIds.filter((m) => m !== id) })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <label>
              Fuente de los datos
              <select
                value={editor.sourceIds[0] ?? ""}
                onChange={(e) =>
                  setEditor({ ...editor, sourceIds: e.target.value ? [e.target.value] : [] })
                }
              >
                <option value="">Seleccioná una fuente existente</option>
                {workspace.sources
                  .filter((s) => !s.demo && s.kind !== "inspiration")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <details className="ec-review">
              <summary>Revisión de esta versión</summary>
              <p>
                Guardá los cambios de texto y medios antes de aprobar. Las fuentes deben estar
                verificadas.
              </p>
              {(
                [
                  ["facts", "Verifiqué los datos"],
                  ["rights", "Tengo permiso para usar los medios"],
                  ["brand", "Cumple los criterios de la marca"],
                ] as const
              ).map(([key, label]) => (
                <label className="ec-checkbox" key={key}>
                  <input
                    type="checkbox"
                    checked={editor.checks[key]}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        checks: { ...editor.checks, [key]: e.target.checked },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
              <ul>
                {approvalIssues(editor, workspace).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </details>
            <label>
              Estado
              <select
                value={editor.status}
                onChange={(e) => setEditor({ ...editor, status: e.target.value as Post["status"] })}
              >
                {(workspace.posts.some((p) => p.id === editor.id)
                  ? (["draft", "review", "approved"] as const)
                  : (["draft"] as const)
                ).map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
                {!["draft", "review", "approved"].includes(editor.status) && (
                  <option value={editor.status}>{statusLabels[editor.status]}</option>
                )}
              </select>
            </label>
            <div className="ec-editor-actions">
              <button
                type="button"
                className="az-button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancelar
              </button>
              <button className="az-button ec-primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar versión"}
              </button>
            </div>
            {error && (
              <p className="ec-error" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
function MetricCard({
  title,
  subtitle,
  items,
  account = false,
}: {
  title: string;
  subtitle: string;
  items: [typeof Users, string][];
  account?: boolean;
}) {
  return (
    <section className="ec-metric-card">
      <header>
        <div>
          <h4>{title}</h4>
          <p>{subtitle}</p>
        </div>
        {account && (
          <select aria-label="Período de métricas" disabled>
            <option>Últimos 30 días</option>
          </select>
        )}
      </header>
      <div className={`ec-metric-grid ${account ? "is-account" : ""}`}>
        {items.map(([Icon, label]) => (
          <div key={label}>
            <span>
              <Icon size={15} />
              {label}
            </span>
            <strong aria-label={`${label}: sin datos`}>—</strong>
          </div>
        ))}
      </div>
      <p className="ec-footnote">Sin datos disponibles</p>
    </section>
  );
}
