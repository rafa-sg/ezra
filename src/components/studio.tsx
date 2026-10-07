"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  FileText,
  FolderHeart,
  Globe2,
  HardDrive,
  LayoutDashboard,
  Leaf,
  Lightbulb,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import {
  type Brand,
  type Media,
  type Post,
  type Source,
  type Status,
  type Workspace,
  displayDate,
  newPost,
  sourceKindLabels,
  sourceReadable,
  sourceUsable,
  statusLabels,
  today,
  zone,
} from "@/lib/model";
import { Artwork } from "./artwork";
import {
  Checkline,
  Dialog,
  Empty,
  FeedbackContext,
  Mark,
  Network,
  PostCard,
  StatusBadge,
} from "./ui";
import { type Commit, MediaUpload, PostEditor, SourceEditor, type UploadFile } from "./editor";

const navigation = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "content", label: "Contenido", icon: FolderHeart },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "sources", label: "Fuentes", icon: Globe2 },
  { id: "brand", label: "Marca y criterios", icon: SlidersHorizontal },
  { id: "settings", label: "Ajustes", icon: Settings2 },
] as const;
type View = (typeof navigation)[number]["id"];
type Notice = { message: string; error: boolean };

export function Studio({ initialView }: { initialView?: string }) {
  const [state, setState] = useState<Workspace | null>(null);
  const [view, setView] = useState<View>(
    navigation.some((n) => n.id === initialView) ? (initialView as View) : "overview",
  );
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [sourceEditing, setSourceEditing] = useState<Source | "new" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [help, setHelp] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [contentTab, setContentTab] = useState<"posts" | "library">("posts");
  const [ideaData, setIdeaData] = useState<IdeasOverview | null>(null);
  const [searching, setSearching] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<IdeasOverview["ideas"][number] | null>(null);
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const notify = (message: string, error = false) => setNotice({ message, error });
  const load = async () => {
    try {
      const res = await fetch("/api/workspace");
      if (res.status === 401) return window.location.assign("/login");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLoadError("");
      setState(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo abrir el estudio.");
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspace", { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.assign("/login");
          return null;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data as Workspace;
      })
      .then((data) => data && setState(data))
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(e.message);
      });
    fetch("/api/auth/session", { signal: controller.signal })
      .then(async (res) => (res.ok ? await res.json() : null))
      .then((data) => data?.user && setUser(data.user))
      .catch(() => {});
    const sync = () => {
      const v = new URLSearchParams(window.location.search).get("view");
      if (navigation.some((n) => n.id === v)) setView(v as View);
      else setView("overview");
    };
    window.addEventListener("popstate", sync);
    return () => {
      controller.abort();
      window.removeEventListener("popstate", sync);
    };
  }, []);
  useEffect(() => {
    if (!notice || notice.error) return;
    const id = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  };
  const navigate = (next: View) => {
    setView(next);
    setMobile(false);
    window.history.pushState(null, "", `?view=${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    if (view !== "sources") return;
    const controller = new AbortController();
    fetch("/api/automation/ideas", { signal: controller.signal })
      .then(async (res) => (res.ok ? ((await res.json()) as IdeasOverview) : null))
      .then((data) => data && setIdeaData(data))
      .catch(() => {});
    return () => controller.abort();
  }, [view]);
  const commit: Commit = async (change) => {
    if (!state || locked.current) return null;
    locked.current = true;
    setBusy(true);
    try {
      const draft = structuredClone(state);
      change(draft);
      const res = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState(data);
      notify("Cambios guardados en tu carpeta.");
      return data as Workspace;
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo guardar.", true);
      return null;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const upload: UploadFile = async (file, origin, attribution) => {
    if (locked.current) return null;
    if (file.size > 50 * 1024 * 1024) {
      notify("El archivo supera 50 MB.", true);
      return null;
    }
    locked.current = true;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("origin", origin);
      body.set("attribution", attribution);
      const res = await fetch("/api/media", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState(data.workspace);
      notify("Archivo guardado en la biblioteca.");
      return data.media as Media;
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo subir el archivo.", true);
      return null;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const loadIdeas = async () => {
    const res = await fetch("/api/automation/ideas");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setIdeaData(data);
    return data as IdeasOverview;
  };
  // One search per click: n8n reads only authorized sites and RSS, then answers.
  const searchIdeas = async () => {
    setSearching(true);
    try {
      const res = await fetch("/api/automation/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "find_ideas", mode: "live" }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          res.status === 502
            ? "n8n no respondió. Abre «Abrir n8n.command» y vuelve a intentarlo."
            : data.error,
        );
      let latest = (await loadIdeas()).latestSearch;
      for (
        let i = 0;
        i < 45 && latest?.jobId === data.job.jobId && latest?.status === "sent";
        i++
      ) {
        await new Promise((r) => setTimeout(r, 2000));
        latest = (await loadIdeas()).latestSearch;
      }
      if (latest?.status === "completed") {
        notify(
          `${latest.accepted} ideas nuevas.${latest.rejected ? ` ${latest.rejected} descartadas por enlaces de otros sitios o datos inválidos.` : ""}`,
        );
        await load();
      } else if (latest?.status === "sent")
        notify("La búsqueda sigue en curso. Vuelve a abrir Fuentes en un momento.");
      else notify("La búsqueda no se completó. Revisa n8n y vuelve a intentarlo.", true);
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo buscar ideas.", true);
    } finally {
      setSearching(false);
    }
  };
  const markIdea = async (id: string, change: { status?: "discarded" | "used"; note?: string }) => {
    const res = await fetch("/api/automation/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...change }),
    });
    if (res.ok && change.note !== undefined) notify("Nota guardada.");
    if (!res.ok) notify((await res.json()).error || "No se pudo actualizar la idea.", true);
    await loadIdeas().catch(() => {});
  };
  // The owner writes the text; the idea only seeds the title and its source.
  const draftFromIdea = async (idea: IdeasOverview["ideas"][number]) => {
    const post = {
      ...newPost(),
      title: idea.title.slice(0, 180),
      sourceIds: state?.sources.some((s) => s.id === idea.sourceId && !s.demo)
        ? [idea.sourceId]
        : [],
    };
    const next = await commit((d) => {
      d.posts.unshift(post);
    });
    if (!next) return;
    await markIdea(idea.id, { status: "used" });
    setEditing(next.posts.find((p) => p.id === post.id)!);
  };
  const openGenerate = async (idea: IdeasOverview["ideas"][number]) => {
    try {
      const res = await fetch("/api/automation/spend");
      if (!res.ok) throw new Error((await res.json()).error);
      setSpend(await res.json());
      setConfirming(idea);
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo consultar el gasto.", true);
    }
  };
  // One Gemini call per confirmed click; the draft arrives labelled «Generado con IA».
  const generate = async (idea: IdeasOverview["ideas"][number]) => {
    setConfirming(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/automation/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_draft", mode: "live", ideaId: idea.id }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          res.status === 502
            ? "n8n no respondió. Abre «Abrir n8n.command» y vuelve a intentarlo."
            : data.error,
        );
      let latest = (await loadIdeas()).latestGeneration;
      for (
        let i = 0;
        i < 45 && latest?.jobId === data.job.jobId && latest?.status === "sent";
        i++
      ) {
        await new Promise((r) => setTimeout(r, 2000));
        latest = (await loadIdeas()).latestGeneration;
      }
      if (latest?.status === "completed" && latest.postId) {
        const res2 = await fetch("/api/workspace");
        const next: Workspace = await res2.json();
        if (res2.ok) {
          setState(next);
          const post = next.posts.find((p) => p.id === latest?.postId);
          notify("Borrador creado con IA. Revísalo y comprueba cada dato antes de aprobar.");
          if (post) setEditing(post);
        }
      } else if (latest?.status === "sent")
        notify("La propuesta sigue en curso. Revisa Contenido en un momento.");
      else
        notify(
          `No se creó el borrador${latest?.errorCode ? ` (${latest.errorCode})` : ""}. Revisa n8n y la clave de Gemini.`,
          true,
        );
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo generar la propuesta.", true);
    } finally {
      setGenerating(false);
    }
  };
  const create = async () => {
    const post = newPost();
    const next = await commit((d) => {
      d.posts.unshift(post);
    });
    if (next) setEditing(next.posts.find((p) => p.id === post.id)!);
  };
  const duplicate = async (post: Post) => {
    const copy = {
      ...newPost(),
      title: `${post.title} · copia`.slice(0, 180),
      caption: post.caption,
      channel: post.channel,
      format: post.format,
      artwork: post.artwork,
      mediaIds: post.mediaIds,
      aiGenerated: post.aiGenerated,
      sourceIds: post.sourceIds.filter((id) => state?.sources.some((s) => s.id === id && !s.demo)),
    };
    const next = await commit((d) => {
      d.posts.unshift(copy);
    });
    if (next) setEditing(next.posts.find((p) => p.id === copy.id)!);
  };
  const reviews = state?.posts.filter((p) => p.status === "review").length || 0;
  const goReviews = () => {
    setFilter("review");
    setContentTab("posts");
    navigate("content");
  };
  const title = navigation.find((n) => n.id === view)!.label;

  return (
    <FeedbackContext.Provider value={notice}>
      <div className="app-shell">
        <a href="#main" className="skip-link">
          Saltar al contenido
        </a>
        {mobile && (
          <button
            className="sidebar-overlay"
            aria-label="Cerrar menú"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
          <a
            className="wordmark"
            href="?view=overview"
            onClick={(e) => {
              e.preventDefault();
              navigate("overview");
            }}
          >
            <Mark />
            <span>
              ezrá<span className="wordmark-dot">.</span>
            </span>
            <span className="studio-label">ESTUDIO</span>
          </a>
          <div className="workspace-switch">
            <span className="spotmi-avatar">s</span>
            <div>
              <strong>Spotmi</strong>
              <span>Tu espacio de trabajo</span>
            </div>
            <span className="single-workspace" title="Un espacio en este piloto">
              <Check size={14} />
            </span>
          </div>
          <p className="nav-label">TU ESTUDIO</p>
          <nav aria-label="Navegación principal">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.id}
                  href={`?view=${item.id}`}
                  className={`nav-item ${view === item.id ? "active" : ""}`}
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(item.id);
                  }}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                  {item.id === "content" && reviews > 0 && (
                    <span className="nav-count">{reviews}</span>
                  )}
                </a>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <span className="note-spark">
                <Sparkles size={19} />
              </span>
              <h3>A tu ritmo, con intención.</h3>
              <p>Un buen contenido empieza con una idea bien cuidada.</p>
              <button onClick={() => setHelp(true)}>
                Conoce tu estudio <ArrowUpRight size={15} />
              </button>
            </div>
            <button className="local-status" onClick={() => navigate("settings")}>
              <span className="online-dot" />
              <span>Estudio local</span>
              <HardDrive size={14} />
            </button>
            <div className="user-profile">
              <span className="user-avatar">
                {(user?.name || "R").trim().charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{user?.name || "Mi espacio personal"}</strong>
                <small>{user?.email || "Spotmi · El Salvador"}</small>
              </div>
              <button
                className="icon-button"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                onClick={signOut}
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-toggle"
                aria-label="Abrir menú"
                onClick={() => setMobile(true)}
              >
                <Menu size={21} />
              </button>
              <span>Mi espacio</span>
              <ChevronRight size={14} />
              <strong>{title}</strong>
            </div>
            <div className="topbar-actions">
              <span className="save-indicator">
                {busy ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <span className="online-dot" />
                )}
                {busy ? "Guardando…" : "Guardado local"}
              </span>
              <button
                className="icon-button"
                aria-label="Guía del estudio"
                onClick={() => setHelp(true)}
              >
                <CircleHelp size={19} />
              </button>
              <button
                className="icon-button notification-button"
                aria-label={`${reviews} publicaciones por revisar`}
                onClick={goReviews}
              >
                <Bell size={19} />
                {reviews > 0 && <i />}
              </button>
              <span className="user-avatar small">R</span>
            </div>
          </header>
          <main id="main" className="main-content">
            {!state ? (
              <div className="loading-state">
                {loadError ? (
                  <>
                    <h2>No pudimos abrir tu estudio</h2>
                    <p>{loadError}</p>
                    <button className="button primary" onClick={() => void load()}>
                      Volver a intentar
                    </button>
                  </>
                ) : (
                  <>
                    <Mark />
                    <LoaderCircle className="spin" size={23} />
                    <p>Preparando tu espacio…</p>
                  </>
                )}
              </div>
            ) : (
              <>
                {view === "overview" && (
                  <Overview
                    state={state}
                    create={() => void create()}
                    open={setEditing}
                    navigate={navigate}
                    goReviews={goReviews}
                    busy={busy}
                  />
                )}
                {view === "content" && (
                  <>
                    <PageHeading
                      eyebrow="DE LA IDEA A LA HISTORIA"
                      title="Tu contenido, en un lugar."
                      description="Dale forma, revísalo y decide cuándo compartirlo."
                      action={
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => void create()}
                        >
                          <Plus size={17} />
                          Crear publicación
                        </button>
                      }
                    />
                    <div className="content-tabs">
                      <button
                        className={contentTab === "posts" ? "active" : ""}
                        onClick={() => setContentTab("posts")}
                      >
                        Publicaciones <span>{state.posts.length}</span>
                      </button>
                      <button
                        className={contentTab === "library" ? "active" : ""}
                        onClick={() => setContentTab("library")}
                      >
                        Biblioteca de medios <span>{state.media.length}</span>
                      </button>
                    </div>
                    {contentTab === "posts" ? (
                      <>
                        <div className="filter-bar">
                          <div className="filter-pills">
                            {(["all", "draft", "review", "approved", "planned"] as const).map(
                              (s) => (
                                <button
                                  key={s}
                                  className={filter === s ? "active" : ""}
                                  onClick={() => setFilter(s)}
                                >
                                  {s === "all" ? "Todas" : statusLabels[s]}
                                </button>
                              ),
                            )}
                            <select
                              aria-label="Más estados"
                              value={["published", "rejected"].includes(filter) ? filter : ""}
                              onChange={(e) => setFilter((e.target.value as Status) || "all")}
                            >
                              <option value="">Más estados</option>
                              <option value="published">Publicadas manualmente</option>
                              <option value="rejected">Rechazadas</option>
                            </select>
                          </div>
                          <label className="search-box">
                            <Search size={16} />
                            <input
                              aria-label="Buscar publicaciones"
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              placeholder="Buscar una historia…"
                            />
                          </label>
                        </div>
                        <DemoNote state={state} />
                        <div className="content-grid">
                          {state.posts
                            .filter(
                              (p) =>
                                (filter === "all" || p.status === filter) &&
                                `${p.title} ${p.caption}`
                                  .toLowerCase()
                                  .includes(query.toLowerCase()),
                            )
                            .map((p) => (
                              <PostCard key={p.id} post={p} state={state} onOpen={setEditing} />
                            ))}
                        </div>
                        {!state.posts.some(
                          (p) =>
                            (filter === "all" || p.status === filter) &&
                            `${p.title} ${p.caption}`.toLowerCase().includes(query.toLowerCase()),
                        ) && (
                          <Empty
                            title="Aquí empieza una nueva historia"
                            description="No hay publicaciones con estos filtros. Prueba otra búsqueda o crea tu primer borrador."
                            action={
                              <button
                                className="button secondary"
                                onClick={() => {
                                  setFilter("all");
                                  setQuery("");
                                }}
                              >
                                Ver todas
                              </button>
                            }
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <div className="section-row">
                          <p className="muted">
                            Material propio, generado con IA o con permiso. Todo queda en tu
                            carpeta.
                          </p>
                          <button className="button secondary" onClick={() => setUploading(true)}>
                            <Upload size={16} />
                            Subir archivos
                          </button>
                        </div>
                        {state.media.length ? (
                          <div className="media-grid">
                            {state.media.map((m) => (
                              <article className="media-card" key={m.id}>
                                <div className="media-preview">
                                  {m.mime.startsWith("video/") ? (
                                    <video
                                      controls
                                      muted
                                      src={`/api/media/${m.id}`}
                                      preload="metadata"
                                    />
                                  ) : (
                                    <img src={`/api/media/${m.id}`} alt={m.originalName} />
                                  )}
                                </div>
                                <div>
                                  <strong>{m.originalName}</strong>
                                  <p>
                                    {m.origin === "ai"
                                      ? "Generado con IA"
                                      : m.origin === "licensed"
                                        ? "Con licencia"
                                        : "Material propio"}{" "}
                                    · {(m.size / 1024 / 1024).toFixed(1)} MB
                                  </p>
                                  {m.attribution && <small>{m.attribution}</small>}
                                  <a
                                    className="text-button"
                                    href={`/api/media/${m.id}`}
                                    download={m.originalName}
                                  >
                                    <ArrowDownToLine size={14} />
                                    Descargar
                                  </a>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <Empty
                            title="Tu biblioteca está por florecer"
                            description="Trae las fotos y videos que creaste en Gemini, tu material propio o archivos con licencia."
                            action={
                              <button className="button primary" onClick={() => setUploading(true)}>
                                <Upload size={16} />
                                Subir mi primer archivo
                              </button>
                            }
                          />
                        )}
                      </>
                    )}
                  </>
                )}
                {view === "calendar" && (
                  <Calendar state={state} open={setEditing} create={() => void create()} />
                )}
                {view === "sources" && (
                  <>
                    <PageHeading
                      eyebrow="HISTORIAS CON RESPALDO"
                      title="Buenas fuentes, mejores historias."
                      description="Tú eliges qué información entra en tu estudio."
                      action={
                        <div className="heading-actions">
                          <button
                            className="button secondary"
                            onClick={() => void searchIdeas()}
                            disabled={searching || !state.sources.some((s) => sourceReadable(s))}
                            title="n8n lee solo tus sitios propios y RSS autorizados"
                          >
                            {searching ? (
                              <LoaderCircle className="spin" size={17} />
                            ) : (
                              <Lightbulb size={17} />
                            )}
                            {searching ? "Buscando ideas…" : "Buscar ideas"}
                          </button>
                          <button
                            className="button primary"
                            onClick={() => setSourceEditing("new")}
                          >
                            <Plus size={17} />
                            Añadir fuente
                          </button>
                        </div>
                      }
                    />
                    <div className="source-intro">
                      <ShieldCheck size={22} />
                      <div>
                        <strong>La confianza empieza con una revisión.</strong>
                        <p>
                          Autoriza cada fuente después de consultarla. Las cuentas de inspiración no
                          autorizan copiar contenido ni usar sus medios.
                        </p>
                      </div>
                    </div>
                    <div className="source-list">
                      {state.sources.map((s) => (
                        <article className="source-card" key={s.id}>
                          <span className={`source-icon ${s.kind}`}>
                            <Globe2 size={23} />
                          </span>
                          <div className="source-info">
                            <div>
                              <h3>{s.name}</h3>
                              {s.demo && <span className="demo-tag">Ejemplo</span>}
                            </div>
                            {s.url ? (
                              <a href={s.url} target="_blank" rel="noreferrer">
                                {new URL(s.url).hostname}
                                <ExternalLink size={12} />
                              </a>
                            ) : (
                              <span className="source-nolink">Sin enlace</span>
                            )}
                            <p>{s.topics}</p>
                            <span
                              className={`badge ${sourceUsable(s) ? "status-approved" : s.status === "paused" ? "status-rejected" : "status-draft"}`}
                            >
                              <span className="status-dot" />
                              {sourceUsable(s)
                                ? "Autorizada"
                                : s.status === "paused"
                                  ? "Pausada"
                                  : s.status === "approved"
                                    ? "Necesita revisión"
                                    : "Por verificar"}
                            </span>
                            <span className="source-kind">{sourceKindLabels[s.kind]}</span>
                          </div>
                          <div className="source-last">
                            <small>Última revisión</small>
                            <span>{s.reviewedOn ? displayDate(s.reviewedOn) : "Pendiente"}</span>
                            {sourceReadable(s) && (
                              <small className="source-reading">
                                {ideaData?.sources[s.id]
                                  ? `Última lectura: ${displayDate(ideaData.sources[s.id].lastReadAt)} · ${ideaData.sources[s.id].ideas} ideas`
                                  : "Aún sin leer"}
                                {ideaData?.sources[s.id]?.skipped &&
                                  ` · omitida: ${ideaData.sources[s.id].skipped}`}
                              </small>
                            )}
                            <button className="text-button" onClick={() => setSourceEditing(s)}>
                              Revisar fuente <ArrowUpRight size={14} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {!!ideaData?.ideas.length && (
                      <section className="panel ideas-panel">
                        <div className="section-heading">
                          <h2>Ideas encontradas</h2>
                          <span className="muted">{ideaData.ideas.length} por revisar</span>
                        </div>
                        {ideaData.ideas.map((idea) => (
                          <div className="idea-row" key={idea.id}>
                            <Lightbulb size={17} />
                            <div>
                              <a href={idea.url} target="_blank" rel="noreferrer">
                                {idea.title}
                                <ExternalLink size={12} />
                              </a>
                              <p>
                                {state.sources.find((s) => s.id === idea.sourceId)?.name ||
                                  "Fuente eliminada"}
                                {idea.publishedAt && ` · ${displayDate(idea.publishedAt)}`}
                              </p>
                              <div className="idea-note">
                                <input
                                  aria-label={`Tu nota sobre «${idea.title}»`}
                                  maxLength={500}
                                  placeholder="Tu nota: lo que comprobaste en la fuente (obligatoria para generar)"
                                  value={notes[idea.id] ?? idea.note}
                                  onChange={(e) =>
                                    setNotes((n) => ({ ...n, [idea.id]: e.target.value }))
                                  }
                                />
                                {(notes[idea.id] ?? idea.note) !== idea.note && (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      void markIdea(idea.id, { note: notes[idea.id] ?? "" })
                                    }
                                  >
                                    Guardar nota
                                  </button>
                                )}
                              </div>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => void draftFromIdea(idea)}
                              disabled={busy}
                            >
                              Crear borrador
                            </button>
                            <button
                              className="text-button"
                              onClick={() => void openGenerate(idea)}
                              disabled={generating || !idea.note.trim()}
                              title={
                                idea.note.trim()
                                  ? "Gemini redacta un borrador con tu nota y tus criterios de marca"
                                  : "Escribe y guarda «Tu nota» primero"
                              }
                            >
                              {generating ? "Generando…" : "Generar propuesta"}
                            </button>
                            <button
                              className="text-button"
                              onClick={() => void markIdea(idea.id, { status: "discarded" })}
                            >
                              Descartar
                            </button>
                          </div>
                        ))}
                        {confirming && spend && (
                          <Dialog
                            title="¿Generar una propuesta con Gemini?"
                            subtitle="Un clic, una propuesta. Llega como borrador para que la revises."
                            onClose={() => setConfirming(null)}
                          >
                            <div className="form-stack">
                              <p>
                                <strong>Se enviará a {spend.model}:</strong>
                              </p>
                              <ul className="confirm-list">
                                <li>Idea: «{confirming.title}»</li>
                                <li>Tu nota: «{confirming.note}»</li>
                                <li>
                                  Fuente:{" "}
                                  {state.sources.find((s) => s.id === confirming.sourceId)?.name}
                                </li>
                                <li>Tus criterios de «Marca y criterios»</li>
                              </ul>
                              <p className="field-hint">
                                Costo máximo: {money(spend.reservationUsd)} (precio de pago del{" "}
                                {spend.prices.checkedOn}); en el nivel gratuito, USD 0. Gastado:{" "}
                                {money(spend.spentUsd)} de {money(spend.capUsd)}.
                              </p>
                              <p className="field-hint">
                                El texto llega como borrador «Generado con IA». No se aprueba ni se
                                publica solo.
                              </p>
                              <div className="dialog-actions">
                                <button
                                  className="button secondary"
                                  onClick={() => setConfirming(null)}
                                >
                                  Cancelar
                                </button>
                                <button
                                  className="button primary"
                                  onClick={() => void generate(confirming)}
                                  disabled={spend.spentUsd + spend.reservationUsd > spend.capUsd}
                                >
                                  <Sparkles size={16} />
                                  Generar propuesta
                                </button>
                              </div>
                            </div>
                          </Dialog>
                        )}
                        <p className="field-hint">
                          Solo título y enlace de la fuente; ezrá no copia textos ni imágenes.
                          Comprueba cada dato en la fuente antes de usarlo.
                        </p>
                      </section>
                    )}
                    {!state.sources.length && (
                      <Empty
                        title="Dale una base a tus ideas"
                        description="Registra una primera fuente y comprueba su información antes de autorizarla."
                      />
                    )}
                    <p className="footnote">
                      Los sitios de ejemplo no se han consultado. ezrá solo lee tus sitios propios y
                      RSS autorizados cuando pulsas «Buscar ideas», respetando su robots.txt. Nunca
                      redes sociales.
                    </p>
                  </>
                )}
                {view === "brand" && <BrandPage state={state} commit={commit} busy={busy} />}
                {view === "settings" && (
                  <SettingsPage state={state} notify={notify} reload={load} />
                )}
              </>
            )}
            <footer className="page-footer">
              <span>Hecho para contar lo nuestro.</span>
              <span>
                ezrá · piloto local <span className="footer-dot">·</span> El Salvador
              </span>
            </footer>
          </main>
        </div>
        {notice && !editing && !sourceEditing && !uploading && !help && !confirming && (
          <div
            className={`toast ${notice.error ? "error" : ""}`}
            role={notice.error ? "alert" : "status"}
          >
            {notice.error ? <CircleHelp size={18} /> : <Check size={18} />}
            <div>
              {notice.message}
              {notice.error && notice.message.includes("otra ventana") && (
                <button onClick={() => window.location.reload()}>Recargar el estudio</button>
              )}
            </div>
            <button aria-label="Cerrar aviso" onClick={() => setNotice(null)}>
              <X size={16} />
            </button>
          </div>
        )}
        {editing && state && (
          <PostEditor
            key={editing.id}
            initial={editing}
            state={state}
            busy={busy}
            commit={commit}
            upload={upload}
            onClose={() => setEditing(null)}
            onDuplicate={(p) => void duplicate(p)}
          />
        )}
        {sourceEditing && (
          <SourceEditor
            initial={sourceEditing === "new" ? undefined : sourceEditing}
            commit={commit}
            busy={busy}
            onClose={() => setSourceEditing(null)}
          />
        )}
        {uploading && (
          <MediaUpload upload={upload} busy={busy} onClose={() => setUploading(false)} />
        )}
        {help && (
          <Dialog
            title="Bienvenido a tu estudio"
            subtitle="Un pequeño recorrido para empezar con intención."
            onClose={() => setHelp(false)}
          >
            <div className="guide-steps">
              {[
                [
                  "01",
                  "Trae una buena fuente",
                  "En Fuentes, registra la información que consultaste y autorízala después de revisarla.",
                ],
                [
                  "02",
                  "Dale forma a tu historia",
                  "Crea un borrador en Contenido. Escribe el texto y adjunta medios propios, generados o con licencia.",
                ],
                [
                  "03",
                  "Revisa y decide",
                  "Completa las tres comprobaciones y aprueba esa versión. Las ediciones vuelven a necesitar revisión.",
                ],
                [
                  "04",
                  "Comparte a tu ritmo",
                  "Elige una fecha prevista y exporta el paquete. Publica tú en la red social y registra el enlace.",
                ],
              ].map(([num, title, body]) => (
                <div key={num}>
                  <span>{num}</span>
                  <section>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </section>
                </div>
              ))}
            </div>
            <p className="info-note">
              Empieza con los ejemplos. Tu información se guarda en esta computadora; descarga un
              respaldo desde Ajustes antes de moverla.
            </p>
            <button className="button primary full-width" onClick={() => setHelp(false)}>
              Vamos a crear <ArrowRight size={16} />
            </button>
          </Dialog>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}

type SpendSummary = {
  capUsd: number;
  spentUsd: number;
  reservationUsd: number;
  model: string;
  prices: { input: number; output: number; checkedOn: string };
  entries: {
    jobId: string;
    requestedAt: string;
    status: string;
    ideaTitle: string;
    inputTokens: number;
    outputTokens: number;
    usd: number;
  }[];
};
const money = (value: number) =>
  `USD ${value.toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
type IdeasOverview = {
  sources: Record<string, { lastReadAt: string; ideas: number; skipped: string }>;
  ideas: {
    id: string;
    sourceId: string;
    title: string;
    url: string;
    publishedAt: string | null;
    note: string;
  }[];
  latestGeneration: {
    jobId: string;
    ideaId: string;
    status: "queued" | "sent" | "delivery_failed" | "completed" | "failed";
    deliveryError: string;
    postId: string | null;
    errorCode: string | null;
  } | null;
  latestSearch: {
    jobId: string;
    status: "queued" | "sent" | "delivery_failed" | "completed" | "failed";
    deliveryError: string;
    accepted: number;
    rejected: number;
  } | null;
};

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function DemoNote({ state }: { state: Workspace }) {
  const count = state.posts.filter((p) => p.demo).length;
  return count > 0 ? (
    <div className="demo-note">
      <span className="demo-dot" />
      <span>Incluye {count} historias de ejemplo para explorar tu estudio.</span>
      <span>Publicación manual</span>
    </div>
  ) : (
    <div className="demo-note">
      <ShieldCheck size={14} />
      <span>Tú revisas y publicas cada historia.</span>
      <span>Publicación manual</span>
    </div>
  );
}

function Overview({
  state,
  create,
  open,
  navigate,
  goReviews,
  busy,
}: {
  state: Workspace;
  create: () => void;
  open: (p: Post) => void;
  navigate: (v: View) => void;
  goReviews: () => void;
  busy: boolean;
}) {
  const reviews = state.posts.filter((p) => p.status === "review");
  const upcoming = state.posts
    .filter((p) => p.plannedAt && p.status !== "published")
    .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt));
  const counts = [
    {
      label: "Historias en borrador",
      value: state.posts.filter((p) => p.status === "draft").length,
      icon: FileText,
      color: "lilac",
      note: "Ideas que están tomando forma",
      action: () => navigate("content"),
    },
    {
      label: "Por revisar",
      value: reviews.length,
      icon: CheckCheck,
      color: "peach",
      note: "Tu mirada hace la diferencia",
      action: goReviews,
    },
    {
      label: "Con fecha prevista",
      value: state.posts.filter((p) => p.status === "planned").length,
      icon: CalendarDays,
      color: "mint",
      note: "En tu calendario editorial",
      action: () => navigate("calendar"),
    },
    {
      label: "Fuentes autorizadas",
      value: state.sources.filter((s) => sourceUsable(s)).length,
      icon: Globe2,
      color: "blue",
      note: "Una base para tus historias",
      action: () => navigate("sources"),
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="TU ESTUDIO, TU RITMO"
        title="Hagamos espacio para buenas historias."
        description="Todo lo que necesitas para cuidar el contenido de Spotmi."
        action={
          <button className="button primary" onClick={create} disabled={busy}>
            <Plus size={18} />
            Crear publicación
          </button>
        }
      />
      <div className="hero-row">
        <section className="hero-card">
          <div className="hero-copy">
            <span className="hero-pill">
              <Leaf size={13} /> HECHO PARA LO NUESTRO
            </span>
            <h2>
              Un país pequeño.
              <br />
              Historias <em>enormes.</em>
            </h2>
            <p>
              De una buena idea a una publicación con intención.
              <br className="desktop-break" /> Tu próxima historia de El Salvador empieza aquí.
            </p>
            <button className="button hero-button" onClick={create} disabled={busy}>
              Darle forma a una idea <ArrowUpRight size={17} />
            </button>
            <span className="hero-decoration">✳</span>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit" />
            <div className="floating-photo photo-back">
              <Artwork scene="volcano" />
              <span>UN POCO MÁS CERCA</span>
            </div>
            <div className="floating-photo photo-front">
              <Artwork scene="coast" />
              <span>
                de lo nuestro. <span>↗</span>
              </span>
            </div>
            <div className="hero-sticker">
              <Mark small />
              <span>
                conoce.
                <br />
                conecta.
                <br />
                <strong>comparte.</strong>
              </span>
            </div>
            <span className="art-caption">ILUSTRACIONES DE REFERENCIA</span>
          </div>
        </section>
        <section className="focus-card">
          <div className="section-overline">
            <span className="focus-dot" /> TU SIGUIENTE PASO
          </div>
          <span className="focus-icon">
            <CheckCheck size={26} />
          </span>
          <h3>
            Una mirada antes
            <br />
            de compartir.
          </h3>
          <p>
            {reviews.length
              ? `Tienes ${reviews.length} historia${reviews.length !== 1 ? "s" : ""} esperando tu revisión. Los buenos detalles importan.`
              : "Tu bandeja está al día. Es un buen momento para darle forma a una nueva idea."}
          </p>
          <button className="text-button" onClick={reviews.length ? goReviews : create}>
            {reviews.length ? "Revisar contenido" : "Crear una historia"}
            <ArrowRight size={16} />
          </button>
          <div className="focus-bottom">
            <ShieldCheck size={14} />
            Tú tienes la última palabra.
          </div>
        </section>
      </div>
      <div className="stats-grid">
        {counts.map(({ label, value, icon: Icon, color, note, action }) => (
          <button className="stat-card" key={label} onClick={action}>
            <div>
              <span className={`stat-icon ${color}`}>
                <Icon size={18} />
              </span>
              <ArrowUpRight size={15} />
            </div>
            <strong>{String(value).padStart(2, "0")}</strong>
            <h3>{label}</h3>
            <p>{note}</p>
          </button>
        ))}
      </div>
      <div className="overview-lower">
        <section className="stories-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DEL ESTUDIO</p>
              <h2>
                Historias en movimiento <span>{state.posts.length}</span>
              </h2>
            </div>
            <button className="text-button" onClick={() => navigate("content")}>
              Ver todas <ArrowRight size={15} />
            </button>
          </div>
          <div className="dashboard-posts">
            {state.posts.slice(0, 3).map((p) => (
              <PostCard key={p.id} post={p} state={state} onOpen={open} />
            ))}
          </div>
          {!state.posts.length && (
            <Empty
              title="El comienzo de algo bueno"
              description="Crea tu primera historia para empezar."
              action={
                <button className="button primary" onClick={create}>
                  Crear publicación
                </button>
              }
            />
          )}
          <DemoNote state={state} />
        </section>
        <aside className="agenda-card">
          <div className="section-heading">
            <h2>En el horizonte</h2>
            <button
              className="icon-button"
              aria-label="Abrir calendario"
              onClick={() => navigate("calendar")}
            >
              <ArrowUpRight size={17} />
            </button>
          </div>
          <p className="agenda-subtitle">Tus próximas fechas previstas</p>
          {upcoming.slice(0, 3).map((p) => (
            <button className="agenda-item" key={p.id} onClick={() => open(p)}>
              <span className="date-tile">
                <small>{displayDate(p.plannedAt, { month: "short" }).replace(".", "")}</small>
                <strong>{p.plannedAt.slice(8, 10)}</strong>
              </span>
              <div>
                <h4>{p.title}</h4>
                <span>
                  <Network channel={p.channel} />
                  {p.plannedAt.slice(11)} · {p.demo ? "Ejemplo" : "Manual"}
                </span>
              </div>
            </button>
          ))}
          {!upcoming.length && (
            <p className="muted agenda-empty">Dale una fecha a una historia para verla aquí.</p>
          )}
          <div className="agenda-note">
            <CalendarDays size={17} />
            <p>
              Planea aquí.
              <br />
              <strong>Publica a tu manera.</strong>
            </p>
          </div>
          <button className="button secondary full-width" onClick={() => navigate("calendar")}>
            Abrir calendario <ArrowRight size={14} />
          </button>
        </aside>
      </div>
      <div className="recent-activity">
        <span className="activity-dot" />
        <strong>Último movimiento</strong>
        <span>{state.history[0]?.title || "Tu estudio está listo"}</span>
        <span>
          {state.history[0]
            ? displayDate(state.history[0].at, { hour: "2-digit", minute: "2-digit" })
            : ""}
        </span>
      </div>
    </>
  );
}

function Calendar({
  state,
  open,
  create,
}: {
  state: Workspace;
  open: (p: Post) => void;
  create: () => void;
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const move = (diff: number) => {
    const d = new Date(Date.UTC(y, m - 1 + diff, 1, 12));
    setMonth(d.toISOString().slice(0, 7));
  };
  const title = new Intl.DateTimeFormat("es-SV", {
    month: "long",
    year: "numeric",
    timeZone: zone,
  }).format(first);
  const planned = state.posts.filter((p) => p.plannedAt.startsWith(month));
  return (
    <>
      <PageHeading
        eyebrow="UN POCO DE PERSPECTIVA"
        title="Dale tiempo a cada historia."
        description="Tu calendario editorial, en hora de El Salvador."
        action={
          <button className="button primary" onClick={create}>
            <Plus size={17} />
            Crear publicación
          </button>
        }
      />
      <div className="calendar-card">
        <div className="calendar-toolbar">
          <h2>{title}</h2>
          <div>
            <span className="calendar-legend">
              <span />
              Fecha prevista · publicación manual
            </span>
            <button
              className="button secondary compact"
              onClick={() => setMonth(today().slice(0, 7))}
            >
              Hoy
            </button>
            <button className="icon-button" aria-label="Mes anterior" onClick={() => move(-1)}>
              <ChevronLeft size={19} />
            </button>
            <button className="icon-button" aria-label="Mes siguiente" onClick={() => move(1)}>
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
        <div className="calendar-scroll">
          <div className="calendar-weekdays">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {Array.from({ length: Math.ceil((days + offset) / 7) * 7 }, (_, i) => {
              const day = i - offset + 1;
              const key = `${month}-${String(day).padStart(2, "0")}`;
              return (
                <div
                  className={`calendar-day ${day < 1 || day > days ? "outside" : ""} ${key === today() ? "today" : ""}`}
                  key={i}
                >
                  {day >= 1 && day <= days && (
                    <>
                      <span className="day-number">{day}</span>
                      {planned
                        .filter((p) => p.plannedAt.startsWith(key))
                        .map((p) => (
                          <button
                            className={`calendar-event event-${p.status}`}
                            key={p.id}
                            onClick={() => open(p)}
                          >
                            <span>
                              {p.plannedAt.slice(11)} <Network channel={p.channel} />
                            </span>
                            <strong>{p.title}</strong>
                            <small>
                              {statusLabels[p.status]}
                              {p.demo ? " · Ejemplo" : ""}
                            </small>
                          </button>
                        ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="footnote">
        Las fechas organizan tu trabajo. ezrá no envía publicaciones a las redes sociales.
      </p>
      <div className="section-heading below">
        <h2>Este mes, en detalle</h2>
        <span className="muted">{planned.length} historias con fecha</span>
      </div>
      {planned.length ? (
        <div className="schedule-list">
          {planned
            .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt))
            .map((p) => (
              <button key={p.id} onClick={() => open(p)}>
                <CalendarDays size={18} />
                <span>
                  {displayDate(p.plannedAt, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <strong>{p.title}</strong>
                <StatusBadge status={p.status} />
                <ArrowUpRight size={16} />
              </button>
            ))}
        </div>
      ) : (
        <Empty
          title="Un mes lleno de posibilidades"
          description="Asigna una fecha prevista a un borrador para organizar tus próximas historias."
        />
      )}
    </>
  );
}

function BrandPage({ state, commit, busy }: { state: Workspace; commit: Commit; busy: boolean }) {
  const [brand, setBrand] = useState<Brand>(state.brand);
  const dirty = JSON.stringify(brand) !== JSON.stringify(state.brand);
  return (
    <>
      <PageHeading
        eyebrow="LA ESENCIA DE SPOTMI"
        title="Una voz que se siente nuestra."
        description="Tu criterio editorial es el punto de partida de cada historia."
      />
      <div className="brand-layout">
        <form
          className="panel form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await commit((d) => {
              d.brand = brand;
            });
          }}
        >
          <div className="section-heading">
            <h2>Perfil de marca</h2>
            <span className="badge status-approved">
              <Leaf size={12} />
              Spotmi
            </span>
          </div>
          <div className="form-row">
            <label>
              Nombre
              <input
                required
                value={brand.name}
                onChange={(e) => setBrand({ ...brand, name: e.target.value })}
              />
            </label>
            <label>
              Sitio web
              <input
                type="url"
                value={brand.website}
                onChange={(e) => setBrand({ ...brand, website: e.target.value })}
              />
            </label>
          </div>
          {(
            [
              {
                key: "description",
                label: "Qué queremos contar",
                hint: "La razón de ser de tu marca.",
              },
              {
                key: "audience",
                label: "A quién le hablamos",
                hint: "Personas, intereses y necesidades.",
              },
              {
                key: "voice",
                label: "Cómo suena nuestra voz",
                hint: "El tono que quieres reconocer en cada publicación.",
              },
              {
                key: "allowedTopics",
                label: "Temas que sí queremos",
                hint: "Incluye las regiones y categorías de interés.",
              },
              {
                key: "excludedTopics",
                label: "Temas que dejamos fuera",
                hint: "Límites concretos para tus contenidos.",
              },
              {
                key: "rules",
                label: "Reglas que siempre cuidamos",
                hint: "Verificación, derechos de uso y trato a la comunidad.",
              },
            ] as const
          ).map((f) => (
            <label key={f.key}>
              {f.label}
              <textarea
                rows={f.key === "rules" ? 4 : 2}
                value={brand[f.key]}
                onChange={(e) => setBrand({ ...brand, [f.key]: e.target.value })}
              />
              <span className="field-hint">{f.hint}</span>
            </label>
          ))}
          <div className="form-bottom">
            <span className="muted">
              {dirty ? "Tienes cambios sin guardar" : "Criterios guardados"}
            </span>
            <button className="button primary" disabled={busy || !dirty}>
              <Check size={16} />
              Guardar criterios
            </button>
          </div>
          <p className="field-hint">
            Cambiar los criterios devuelve a revisión las publicaciones aprobadas pendientes.
          </p>
        </form>
        <aside>
          <div className="memory-card">
            <span className="memory-icon">
              <BookOpen size={25} />
            </span>
            <h2>Tu criterio deja huella.</h2>
            <p>
              Cada aprobación, corrección y motivo de rechazo queda en el historial de tu estudio.
            </p>
            <p className="field-hint">
              Es memoria editorial guardada. Todavía no se usa para generar contenido ni entrenar
              una IA.
            </p>
          </div>
          <div className="history-panel">
            <h3>Memoria editorial</h3>
            {state.history.slice(0, 8).map((h) => (
              <div className="history-item" key={h.id}>
                <span />
                <div>
                  <strong>{h.title}</strong>
                  <p>{h.detail}</p>
                  <small>
                    {displayDate(h.at, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

type AutomationStatus = {
  configured: boolean;
  latest: {
    jobId: string;
    status: "queued" | "sent" | "delivery_failed" | "completed" | "failed";
    deliveryError: string;
    requestedAt: string;
    completedAt: string | null;
  } | null;
};
const jobLabels: Record<NonNullable<AutomationStatus["latest"]>["status"], [string, string]> = {
  queued: ["En cola", "status-review"],
  sent: ["Esperando a n8n", "status-review"],
  delivery_failed: ["No entregado", "status-rejected"],
  completed: ["Conectado", "status-approved"],
  failed: ["Falló la prueba", "status-rejected"],
};
const shortDateTime: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

/** Gemini spend recorded by ezrá; the cap is enforced on the server. */
function SpendPanel() {
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/automation/spend", { signal: controller.signal })
      .then(async (res) => (res.ok ? ((await res.json()) as SpendSummary) : null))
      .then((data) => data && setSpend(data))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!spend) return null;
  const share = Math.min(100, (spend.spentUsd / spend.capUsd) * 100);
  return (
    <section className="panel">
      <div className="settings-title">
        <span className="stat-icon lilac">
          <Sparkles size={22} />
        </span>
        <div>
          <h2>Gasto de IA</h2>
          <p>
            {spend.model} · precios del {spend.prices.checkedOn}
          </p>
        </div>
      </div>
      <div className="storage-meter">
        <strong>
          {money(spend.spentUsd)} <small>de {money(spend.capUsd)}</small>
        </strong>
        <span>{spend.entries.length} generaciones</span>
      </div>
      <div className="storage-track">
        <span style={{ width: `${Math.max(2, share)}%` }} />
      </div>
      <p className="field-hint">
        Se cuenta el precio de pago aunque uses el nivel gratuito, para que el tope nunca se supere.
        Al llegar a {money(spend.capUsd)}, ezrá rechaza nuevas propuestas.
      </p>
      {!!spend.entries.length && (
        <dl className="settings-details">
          {spend.entries.slice(0, 5).map((e) => (
            <div key={e.jobId}>
              <dt>
                {displayDate(e.requestedAt)} · {e.ideaTitle.slice(0, 40)}
              </dt>
              <dd>{money(e.usd)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Simulated round trip with the local n8n. Never publishes or changes a post. */
function N8nConnection({
  state,
  notify,
  reload,
}: {
  state: Workspace;
  notify: (message: string, error?: boolean) => void;
  reload: () => Promise<void>;
}) {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const read = async () => {
    const res = await fetch("/api/automation/jobs");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setStatus(data);
    return data as AutomationStatus;
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/automation/jobs", { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data as AutomationStatus;
      })
      .then((data) => setStatus(data))
      .catch((e) => {
        if (e.name !== "AbortError") setStatus({ configured: false, latest: null });
      });
    return () => controller.abort();
  }, []);
  const test = async () => {
    const post = state.posts[0];
    if (!post) return;
    setTesting(true);
    try {
      const res = await fetch("/api/automation/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, action: "connection_test", mode: "simulation" }),
      });
      const data = await res.json();
      if (!res.ok) {
        await read().catch(() => {});
        throw new Error(
          res.status === 502
            ? "n8n no respondió. Abre «Abrir n8n.command» y vuelve a intentarlo."
            : data.error,
        );
      }
      // n8n answers in the background; wait a few seconds for its result.
      let latest = await read();
      for (let i = 0; i < 20 && latest.latest?.status === "sent"; i++) {
        await new Promise((r) => setTimeout(r, 500));
        latest = await read();
      }
      if (latest.latest?.status === "completed") {
        notify("n8n respondió. La conexión funciona (prueba simulada; no se publicó nada).");
        await reload();
      } else if (latest.latest?.status === "sent")
        notify("n8n recibió el encargo pero aún no responde. Revisa su ventana.", true);
      else notify("La prueba no se completó. Revisa n8n y vuelve a intentarlo.", true);
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo probar la conexión.", true);
    } finally {
      setTesting(false);
    }
  };
  const latest = status?.latest;
  const [label, tone] = latest ? jobLabels[latest.status] : ["Sin probar", "neutral-badge"];
  return (
    <>
      <div className="connection-row">
        <span className="gemini-symbol">
          <Workflow size={18} />
        </span>
        <div>
          <strong>n8n local</strong>
          <p>
            {!status
              ? "Consultando…"
              : !status.configured
                ? "Falta configurar los secretos en .env.local."
                : latest
                  ? `Última prueba: ${displayDate(latest.completedAt || latest.requestedAt, shortDateTime)}${latest.deliveryError ? ` · ${latest.deliveryError}` : ""}`
                  : "Aún no has probado la conexión."}
          </p>
        </div>
        <span className={`badge ${status?.configured ? tone : "neutral-badge"}`}>
          {status?.configured ? label : "Sin configurar"}
        </span>
      </div>
      <button
        className="button secondary full-width"
        onClick={() => void test()}
        disabled={testing || !status?.configured || !state.posts.length}
      >
        {testing ? <LoaderCircle className="spin" size={16} /> : <Workflow size={16} />}
        {testing ? "Probando conexión…" : "Probar conexión con n8n"}
      </button>
      <p className="field-hint">
        Envía un encargo de prueba simulado a n8n en tu computadora. No publica, no gasta y no
        cambia tus publicaciones; solo deja una nota en el historial.
      </p>
    </>
  );
}

function SettingsPage({
  state,
  notify,
  reload,
}: {
  state: Workspace;
  notify: (message: string, error?: boolean) => void;
  reload: () => Promise<void>;
}) {
  const total = state.media.reduce((sum, m) => sum + m.size, 0);
  const [ack, setAck] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="TODO EN SU LUGAR"
        title="Un estudio sencillo, bajo tu control."
        description="Tus archivos, tus conexiones y el presupuesto del piloto."
      />
      <div className="settings-grid">
        <section className="panel">
          <div className="settings-title">
            <span className="stat-icon lilac">
              <HardDrive size={22} />
            </span>
            <div>
              <h2>Tu información</h2>
              <p>Guardada en esta computadora</p>
            </div>
            <span className="badge status-approved">Local</span>
          </div>
          <div className="storage-meter">
            <strong>
              {(total / 1024 / 1024).toFixed(1)} <small>MB en medios</small>
            </strong>
            <span>{state.media.length} archivos</span>
          </div>
          <div className="storage-track">
            <span
              style={{
                width: `${Math.max(2, Math.min(100, (total / (1024 * 1024 * 1024)) * 100))}%`,
              }}
            />
          </div>
          <p className="field-hint">
            El almacenamiento depende del espacio libre de tu computadora. Máximo 50 MB por archivo
            en este piloto.
          </p>
          <dl className="settings-details">
            <div>
              <dt>Publicaciones</dt>
              <dd>{state.posts.length}</dd>
            </div>
            <div>
              <dt>Fuentes</dt>
              <dd>{state.sources.length}</dd>
            </div>
            <div>
              <dt>Zona horaria</dt>
              <dd>El Salvador · UTC−6</dd>
            </div>
          </dl>
          <a className="button secondary full-width" href="/api/export">
            <ArrowDownToLine size={16} />
            Descargar respaldo completo
          </a>
          <p className="field-hint">
            El ZIP incluye borradores, fuentes, marca, historial y archivos. Incluye instrucciones
            para restaurarlo.
          </p>
        </section>
        <section className="panel budget-card">
          <div className="settings-title">
            <span className="stat-icon mint">
              <Wallet size={22} />
            </span>
            <div>
              <h2>Presupuesto del piloto</h2>
              <p>Adicional a tus suscripciones actuales</p>
            </div>
          </div>
          <div className="budget-total">
            <span>$</span>0<small>de $20 disponibles este mes</small>
          </div>
          <p>
            Solo el texto con Gemini puede tener costo, con un tope de USD 5 para la prueba. El
            presupuesto de $20 se conserva como referencia de planificación.
          </p>
          <dl className="settings-details">
            <div>
              <dt>Aplicación local</dt>
              <dd>$0</dd>
            </div>
            <div>
              <dt>Texto con Gemini</dt>
              <dd>Tope USD 5</dd>
            </div>
            <div>
              <dt>Imagen y video con IA</dt>
              <dd>Desactivadas</dd>
            </div>
            <div>
              <dt>Servicios contratados desde ezrá</dt>
              <dd>Ninguno</dd>
            </div>
          </dl>
          <div className="info-note">
            <ShieldCheck size={17} />
            <span>Los gastos que hagas fuera de ezrá no se consultan ni se contabilizan aquí.</span>
          </div>
        </section>
        <SpendPanel />
        <section className="panel connections-panel">
          <div className="section-heading">
            <h2>Cuentas e integraciones</h2>
            <span className="muted">Próxima etapa</span>
          </div>
          {(
            [
              {
                name: "Instagram",
                caption: "Preparación y exportación manual de contenido",
                channel: "instagram",
              },
              {
                name: "Facebook",
                caption: "Preparación y exportación manual de contenido",
                channel: "facebook",
              },
            ] as const
          ).map((c) => (
            <div className="connection-row" key={c.name}>
              <Network channel={c.channel} />
              <div>
                <strong>{c.name}</strong>
                <p>{c.caption}</p>
              </div>
              <span className="badge neutral-badge">Sin conectar</span>
            </div>
          ))}
          <div className="connection-row">
            <span className="gemini-symbol">✦</span>
            <div>
              <strong>Gemini</strong>
              <p>Crea contenido en tu cuenta y súbelo a la biblioteca.</p>
            </div>
            <span className="badge neutral-badge">Uso manual</span>
          </div>
          <N8nConnection state={state} notify={notify} reload={reload} />
          <p className="field-hint">
            Las conexiones requieren configuración y verificación de permisos. Tus suscripciones no
            se conectan automáticamente.
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Para trabajar con otra IA</h2>
            <FolderHeart size={21} />
          </div>
          <p className="muted">
            Abre la misma carpeta Spotbot en VS Code, Codex o Claude Code. Las instrucciones
            compartidas están en el archivo AGENTS.md y el estado del trabajo en docs/TASKS.md.
          </p>
          <div className="handoff-note">
            <strong>Antes de mover tu estudio</strong>
            <p>
              Descarga un respaldo. El código y tus datos tienen copias distintas: Git conserva el
              código; el respaldo conserva tu contenido.
            </p>
          </div>
          <Checkline checked={ack} onChange={setAck}>
            Entiendo que una copia adjunta en un chat no se sincroniza con esta carpeta.
          </Checkline>
          <span className="version-label">
            ezrá v0.1.0 · piloto local · sin publicación automática
          </span>
        </section>
      </div>
    </>
  );
}
