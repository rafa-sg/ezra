import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import {
  ArrowDownToLine,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  CirclePause,
  Clock3,
  Compass,
  FileCheck2,
  Globe2,
  Image,
  Inbox,
  Camera,
  LayoutDashboard,
  Link2,
  MapPin,
  Menu,
  MessageCircle,
  Palette,
  Play,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Unplug,
  Workflow,
  X,
} from "lucide-react";
import { readableOnWhite } from "../../../src/lib/theme";
import "./prototype.css";

const STORAGE_KEY = "ezra:spotmi-design:v1";
const sourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  type: z.string(),
  verified: z.boolean(),
});
const channelSchema = z.enum(["Instagram", "Facebook", "WhatsApp"]);
const conversationSchema = z.object({
  id: z.string(),
  channel: channelSchema,
  label: z.string(),
  status: z.enum(["bot", "human", "resolved"]),
  messages: z.array(z.object({ text: z.string(), author: z.enum(["visitor", "bot", "owner"]) })),
});
const schema = z.object({
  version: z.literal(1),
  sources: z.array(sourceSchema),
  draft: z.object({
    title: z.string(),
    caption: z.string(),
    revision: z.number(),
    rendered: z.boolean(),
    approved: z.boolean(),
    sourceId: z.string(),
    format: z.enum(["portrait", "square", "story"]),
  }),
  brand: z.object({
    name: z.string(),
    primary: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    faq: z.string(),
    approved: z.boolean(),
  }),
  modes: z.object({
    Instagram: z.enum(["off", "test"]),
    Facebook: z.enum(["off", "test"]),
    WhatsApp: z.enum(["off", "test"]),
  }),
  conversations: z.array(conversationSchema),
  runs: z.array(z.object({ id: z.string(), name: z.string(), result: z.string() })),
  paused: z.boolean(),
});
type DemoState = z.infer<typeof schema>;
type Channel = z.infer<typeof channelSchema>;
type Page =
  "overview" | "places" | "content" | "automation" | "inbox" | "sources" | "brand" | "settings";
const channels: Channel[] = ["Instagram", "Facebook", "WhatsApp"];
const initial: DemoState = {
  version: 1,
  sources: [
    {
      id: "brand",
      name: "Información de Spotmi",
      url: "https://spotmi.example/acerca",
      type: "Sitio propio",
      verified: true,
    },
    {
      id: "events",
      name: "Agenda del aliado · ejemplo",
      url: "https://agenda.example/feed",
      type: "RSS autorizado",
      verified: false,
    },
  ],
  draft: {
    title: "Tu próximo plan empieza aquí.",
    caption:
      "Descubrí lugares, experiencias y negocios locales de El Salvador con Spotmi. ¿Qué te gustaría explorar?",
    revision: 1,
    rendered: false,
    approved: false,
    sourceId: "brand",
    format: "portrait",
  },
  brand: {
    name: "Spotmi",
    primary: "#06354c",
    accent: "#d4af32",
    faq: "Spotmi te ayuda a descubrir lugares, eventos, experiencias y negocios locales de El Salvador.",
    approved: true,
  },
  modes: { Instagram: "test", Facebook: "off", WhatsApp: "off" },
  conversations: [
    {
      id: "demo-1",
      channel: "Instagram",
      label: "Consulta de ejemplo 01",
      status: "bot",
      messages: [
        { text: "Hola, ¿qué puedo encontrar en Spotmi?", author: "visitor" },
        {
          text: "¡Hola! Soy el asistente de Spotmi. Te ayudamos a descubrir lugares, eventos y negocios locales de El Salvador. ¿Qué te gustaría explorar?",
          author: "bot",
        },
      ],
    },
    {
      id: "demo-2",
      channel: "WhatsApp",
      label: "Consulta de ejemplo 02",
      status: "human",
      messages: [
        {
          text: "Quisiera confirmar el precio y si todavía hay cupos para un evento.",
          author: "visitor",
        },
        {
          text: "Esa información necesita confirmación. La conversación quedó pendiente de una persona.",
          author: "bot",
        },
      ],
    },
  ],
  runs: [],
  paused: false,
};
const navigation: { id: Page; label: string; icon: typeof Compass }[] = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "places", label: "Lugares y eventos", icon: MapPin },
  { id: "content", label: "Contenido", icon: Image },
  { id: "automation", label: "Automatizaciones", icon: Workflow },
  { id: "inbox", label: "Bandeja", icon: Inbox },
  { id: "sources", label: "Conexiones y fuentes", icon: Link2 },
  { id: "brand", label: "Marca y conocimiento", icon: Palette },
  { id: "settings", label: "Ajustes", icon: Settings2 },
];
function load(): DemoState {
  try {
    return schema.parse(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return structuredClone(initial);
  }
}
function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}
function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="dialog-title">
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [state, setState] = useState(load);
  const [page, setPage] = useState<Page>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dialog, setDialog] = useState<"source" | "connection" | "run" | "reset" | "help" | null>(
    null,
  );
  const [channel, setChannel] = useState<Channel>("Instagram");
  const [contentStep, setContentStep] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [conversationId, setConversationId] = useState("demo-1");
  const [message, setMessage] = useState("");
  const [messageRole, setMessageRole] = useState<"visitor" | "owner">("visitor");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [mobilePreview, setMobilePreview] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* The mock remains usable without browser persistence. */
    }
  }, [state]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const openPage = (next: Page) => {
    setPage(next);
    setMobileOpen(false);
    setQuery("");
  };
  const tell = (text: string) => setNotice(text);
  const draft = state.draft;
  const conversation =
    state.conversations.find((item) => item.id === conversationId) || state.conversations[0];
  const pending = state.conversations.filter((item) => item.status === "human").length;
  const source = state.sources.find((item) => item.id === draft.sourceId);
  const updateDraft = (patch: Partial<DemoState["draft"]>) => {
    setReviewed(false);
    setState((s) => ({
      ...s,
      draft: {
        ...s.draft,
        ...patch,
        revision: s.draft.revision + 1,
        rendered: false,
        approved: false,
      },
    }));
  };
  const updateBrand = (patch: Partial<DemoState["brand"]>) => {
    setReviewed(false);
    setState((s) => ({
      ...s,
      brand: { ...s.brand, ...patch },
      draft: { ...s.draft, revision: s.draft.revision + 1, rendered: false, approved: false },
    }));
  };
  const run = (name = "Recopilar información") => {
    if (state.paused) {
      tell("Reanudá las pruebas antes de ejecutar este flujo.");
      return;
    }
    setState((s) => ({
      ...s,
      runs: [
        { id: crypto.randomUUID(), name, result: "Prueba completada · sin solicitudes externas" },
        ...s.runs,
      ],
    }));
    setDialog("run");
  };
  const renderDraft = () => {
    if (!source?.verified || !draft.title.trim() || !draft.caption.trim()) {
      tell("Completá el texto y elegí una fuente verificada.");
      return;
    }
    setState((s) => ({
      ...s,
      draft: { ...s.draft, rendered: true, approved: false },
      runs: [
        {
          id: crypto.randomUUID(),
          name: "Crear pieza visual",
          result: "Vista local generada · Orshot no conectado",
        },
        ...s.runs,
      ],
    }));
    setContentStep(2);
    tell("Vista local lista. Revisá esta versión antes de aprobarla.");
  };
  const exportDraft = () => {
    if (!draft.approved) return;
    const blob = new Blob(
      [
        JSON.stringify(
          { simulation: true, business: state.brand.name, source: source?.url, draft },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spotmi-propuesta-demo.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    tell("Propuesta de ejemplo descargada. No se publicó contenido.");
  };
  const changeConversation = (status: "bot" | "human" | "resolved") => {
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((item) =>
        item.id === conversation.id ? { ...item, status } : item,
      ),
    }));
    tell(
      status === "human"
        ? "Tomaste esta conversación de prueba. El bot queda pausado."
        : status === "resolved"
          ? "Conversación de prueba resuelta."
          : "El bot volvió al modo de prueba en esta conversación.",
    );
  };
  const sendDemo = (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    const text = message.trim();
    setMessage("");
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((item) => {
        if (item.id !== conversation.id) return item;
        const messages = [...item.messages, { text, author: messageRole }];
        if (messageRole === "owner") return { ...item, status: "human", messages };
        if (item.status !== "bot" || s.modes[item.channel] !== "test") return { ...item, messages };
        const risky =
          /precio|cupo|reserv|pago|devol|reembols|queja|persona|humano|horario|disponib/i.test(
            text,
          );
        const known = /spotmi|encontr|qué hacen|que hacen|hola|buenas/i.test(text);
        if (risky || !known || !s.brand.approved)
          return {
            ...item,
            status: "human",
            messages: [
              ...messages,
              {
                author: "bot",
                text: "Necesito que una persona confirme esa información. Tu consulta queda pendiente de atención. Soy el asistente automático de Spotmi.",
              },
            ],
          };
        return {
          ...item,
          messages: [
            ...messages,
            {
              author: "bot",
              text: `¡Hola! Soy el asistente automático de ${s.brand.name}. ${s.brand.faq}`,
            },
          ],
        };
      }),
    }));
  };
  function renderSourceRows() {
    return (
      <div className="source-list">
        {state.sources
          .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
          .map((item) => (
            <div className="source-row" key={item.id}>
              <span className="soft-icon">
                <Globe2 size={20} />
              </span>
              <div className="grow">
                <strong>{item.name}</strong>
                <p className="muted small">
                  {item.url} · {item.type}
                </p>
              </div>
              <Badge tone={item.verified ? "green" : "amber"}>
                {item.verified ? "Verificada · demo" : "Por verificar"}
              </Badge>
              <button
                className="text-button"
                onClick={() => {
                  setReviewed(false);
                  setState((s) => ({
                    ...s,
                    sources: s.sources.map((v) =>
                      v.id === item.id ? { ...v, verified: !v.verified } : v,
                    ),
                    draft: { ...s.draft, approved: false },
                  }));
                  tell(
                    "Verificación actualizada en la demo. La aprobación del contenido debe revisarse de nuevo.",
                  );
                }}
              >
                {item.verified ? "Retirar verificación" : "Verificar en demo"}
              </button>
            </div>
          ))}
      </div>
    );
  }
  function renderCreative(compact = false) {
    return (
      <div
        className={`creative ${draft.format} ${compact ? "compact" : ""}`}
        aria-label="Vista de diseño tipográfica, sin fotografía de un destino"
      >
        <span className="creative-brand">
          <Compass /> {state.brand.name.toLowerCase()}
          <b>·</b>
        </span>
        <div className="creative-copy">
          <span>EL SALVADOR · CERCA, VIVO Y LOCAL</span>
          <h2>{draft.title || "Tu próxima historia"}</h2>
          <p>Descubrí lo que tenemos cerca.</p>
        </div>
        <div className="creative-footer">
          <span>Lugares · Experiencias · Comunidad</span>
          <ArrowRight />
        </div>
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
      </div>
    );
  }
  return (
    <div
      className={`design-root ${mobilePreview ? "device-preview" : ""}`}
      style={
        {
          "--brand": readableOnWhite(state.brand.primary),
          "--gold": state.brand.accent,
        } as CSSProperties
      }
    >
      <div className="prototype-toolbar">
        <span>
          <span className="prototype-dot" /> Propuesta de diseño{" "}
          <span className="toolbar-detail">· datos de ejemplo · sin conexiones reales</span>
        </span>
        <button onClick={() => setMobilePreview((v) => !v)}>
          {mobilePreview ? "Ver escritorio" : "Ver móvil"}
        </button>
      </div>
      <div className="app-shell">
        <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
          <div className="brand-lockup">
            <Compass size={33} strokeWidth={1.5} />
            <span>
              {state.brand.name.toLowerCase()}
              <b>·</b>
            </span>
          </div>
          <p className="powered">
            TU ESPACIO EN <strong>ezrá.</strong>
          </p>
          <div className="workspace-label">
            <span className="avatar">S</span>
            <div>
              <strong>{state.brand.name}</strong>
              <span>Turismo y comunidad</span>
            </div>
            <Badge>Demo</Badge>
          </div>
          <p className="nav-caption">TU CENTRO DE OPERACIONES</p>
          <nav aria-label="Navegación principal">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={page === id ? "nav-item active" : "nav-item"}
                aria-current={page === id ? "page" : undefined}
                onClick={() => openPage(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "inbox" && pending > 0 && <span className="nav-count">{pending}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <ShieldCheck size={20} />
              <div>
                <strong>Vos tenés el control</strong>
                <p>Fuentes verificadas y atención humana cuando hace falta.</p>
              </div>
            </div>
            <button className="owner-button" onClick={() => setDialog("help")}>
              <span className="avatar owner">R</span>
              <span>
                Mi espacio de trabajo<small>Propietario · vista de diseño</small>
              </span>
              <CircleHelp size={17} />
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button menu-toggle"
                aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((v) => !v)}
              >
                <Menu />
              </button>
              <span>Mi negocio</span>
              <ChevronRight size={15} />
              <strong>{navigation.find((v) => v.id === page)?.label}</strong>
            </div>
            <div className="topbar-actions">
              <span className="status-label">
                <span /> Entorno de prueba
              </span>
              <button
                className="icon-button"
                aria-label="Acerca de esta propuesta"
                onClick={() => setDialog("help")}
              >
                <CircleHelp size={20} />
              </button>
              <span className="avatar top-avatar">R</span>
            </div>
          </header>
          <main id="main-content">
            {page === "overview" && (
              <>
                <Heading
                  eyebrow="EL SALVADOR, CERCA DE TU COMUNIDAD"
                  title="Cada historia empieza con una conexión."
                  description="Tu contenido, tus fuentes y tus conversaciones, en un mismo lugar."
                  action={
                    <button
                      className="button primary"
                      onClick={() => {
                        openPage("content");
                        setContentStep(0);
                      }}
                    >
                      <Plus size={18} /> Crear contenido
                    </button>
                  }
                />
                <div className="overview-hero">
                  <div>
                    <Badge tone="gold">EL SIGUIENTE PASO</Badge>
                    <h2>Dale vida a tu primera automatización.</h2>
                    <p>
                      Elegí una fuente, verificá lo que cuenta y transformalo en una historia de
                      Spotmi.
                    </p>
                    <button className="button light" onClick={() => openPage("sources")}>
                      Revisar mis fuentes <ArrowRight size={17} />
                    </button>
                  </div>
                  <div className="hero-flow" aria-label="Recopilar, crear y conversar">
                    <div>
                      <Globe2 />
                      <span>Recopilar</span>
                    </div>
                    <i />
                    <div>
                      <Sparkles />
                      <span>Crear</span>
                    </div>
                    <i />
                    <div>
                      <MessageCircle />
                      <span>Conversar</span>
                    </div>
                  </div>
                </div>
                <div className="stats">
                  <button onClick={() => openPage("sources")}>
                    <Globe2 />
                    <strong>{state.sources.filter((s) => s.verified).length}</strong>
                    <span>Fuentes verificadas</span>
                    <small>En esta demostración</small>
                  </button>
                  <button onClick={() => openPage("content")}>
                    <FileCheck2 />
                    <strong>{draft.approved ? 0 : 1}</strong>
                    <span>Contenido por revisar</span>
                    <small>Tu criterio antes de aprobar</small>
                  </button>
                  <button onClick={() => openPage("inbox")}>
                    <MessageCircle />
                    <strong>{pending}</strong>
                    <span>Necesitan tu atención</span>
                    <small>Conversaciones de ejemplo</small>
                  </button>
                  <button onClick={() => openPage("automation")}>
                    <Workflow />
                    <strong>{state.runs.length}</strong>
                    <span>Pruebas realizadas</span>
                    <small>Sin consumo de servicios</small>
                  </button>
                </div>
                <div className="overview-grid">
                  <Card>
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">ESTUDIO CREATIVO</p>
                        <h2>Una idea lista para tomar forma</h2>
                      </div>
                      <button className="text-button" onClick={() => openPage("content")}>
                        Abrir estudio <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="draft-feature">
                      {renderCreative(true)}
                      <div>
                        <Badge tone={draft.approved ? "green" : "amber"}>
                          {draft.approved ? "Aprobada · demo" : "Borrador · demo"}
                        </Badge>
                        <h3>Presentación de Spotmi</h3>
                        <p className="muted">
                          Una plantilla editorial para invitar a descubrir El Salvador.
                        </p>
                        <div className="inline-icons">
                          <Camera size={17} /> Instagram <span>·</span> Facebook
                        </div>
                        <button
                          className="button secondary"
                          onClick={() => {
                            openPage("content");
                            setContentStep(1);
                          }}
                        >
                          Editar propuesta <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  </Card>
                  <Card>
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">ATENCIÓN A TU COMUNIDAD</p>
                        <h2>La conversación sigue</h2>
                      </div>
                      <span className="soft-icon">
                        <Bot />
                      </span>
                    </div>
                    <p className="muted">
                      Probá respuestas con información de la marca y tomá el control cuando haga
                      falta.
                    </p>
                    <div className="mini-chat">
                      <span className="small muted">Consulta de ejemplo · WhatsApp</span>
                      <p>¿Me pueden confirmar el precio y los cupos?</p>
                      <Badge tone="amber">Necesita una persona</Badge>
                    </div>
                    <button
                      className="button secondary full"
                      onClick={() => {
                        setConversationId("demo-2");
                        openPage("inbox");
                      }}
                    >
                      Abrir bandeja <ArrowRight size={16} />
                    </button>
                  </Card>
                </div>
                <div className="section-head lower">
                  <h2>Cómo trabaja ezrá para vos</h2>
                  <span className="small muted">Configuración independiente por negocio</span>
                </div>
                <div className="workflow-tiles">
                  {[
                    {
                      icon: Globe2,
                      title: "Información con respaldo",
                      body: "Cada dato conserva su fuente y su verificación.",
                      page: "sources",
                    },
                    {
                      icon: Palette,
                      title: "Contenido con tu identidad",
                      body: "Textos y piezas visuales que se sienten como Spotmi.",
                      page: "content",
                    },
                    {
                      icon: Bot,
                      title: "Respuestas con criterio",
                      body: "El bot atiende lo conocido y te pasa lo que necesita revisión.",
                      page: "settings",
                    },
                  ].map(({ icon: Icon, title, body, page: next }) => (
                    <button key={title} onClick={() => openPage(next as Page)}>
                      <Icon />
                      <div>
                        <strong>{title}</strong>
                        <p>{body}</p>
                      </div>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {page === "sources" && (
              <>
                <Heading
                  eyebrow="CONECTÁ EL ORIGEN DE TUS HISTORIAS"
                  title="Conexiones y fuentes"
                  description="Una cuenta te permite conversar. Una fuente aporta información para revisar."
                  action={
                    <button
                      className="button primary"
                      onClick={() => {
                        setSourceError("");
                        setDialog("source");
                      }}
                    >
                      <Plus size={18} /> Añadir fuente
                    </button>
                  }
                />
                <div className="section-head">
                  <h2>Cuentas del negocio</h2>
                  <Badge>Integraciones futuras</Badge>
                </div>
                <div className="channel-grid">
                  {channels.map((name) => (
                    <Card key={name}>
                      <div className="section-head">
                        <span className="soft-icon">
                          {name === "Instagram" ? <Camera /> : <MessageCircle />}
                        </span>
                        <Badge>Sin conectar</Badge>
                      </div>
                      <h3>{name === "Facebook" ? "Facebook Messenger" : name}</h3>
                      <p className="muted">
                        {name === "WhatsApp"
                          ? "Atención desde tu número de negocio."
                          : "Conversaciones de tu cuenta de negocio."}
                      </p>
                      <button
                        className="button secondary full"
                        onClick={() => {
                          setChannel(name);
                          setDialog("connection");
                        }}
                      >
                        Ver requisitos <ArrowRight size={16} />
                      </button>
                    </Card>
                  ))}
                </div>
                <Card>
                  <div className="section-head">
                    <div>
                      <h2>Fuentes de información</h2>
                      <p className="muted">
                        Las direcciones de esta demo usan dominios de ejemplo. No se consultan.
                      </p>
                    </div>
                    <Badge tone="gold">Lectura controlada</Badge>
                  </div>
                  <label className="search-field">
                    <Search size={18} />
                    <input
                      aria-label="Buscar fuentes"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar una fuente"
                    />
                  </label>
                  {renderSourceRows()}
                  <div className="panel-footer">
                    <span className="small muted">
                      Agregar un enlace no autoriza una cuenta social.
                    </span>
                    <button className="text-button" onClick={() => run()}>
                      Probar recorrido <Play size={15} />
                    </button>
                  </div>
                </Card>
              </>
            )}
            {page === "content" && (
              <>
                <Heading
                  eyebrow="ESTUDIO CREATIVO"
                  title="Una historia, con tu identidad."
                  description="De la información verificada a una pieza lista para revisar."
                  action={
                    <Badge tone={draft.approved ? "green" : "amber"}>
                      {draft.approved ? "Aprobada en demo" : "Borrador"} · v{draft.revision}
                    </Badge>
                  }
                />
                <div className="step-tabs" aria-label="Pasos para crear contenido">
                  {["Información", "Texto y diseño", "Revisión"].map((name, i) => (
                    <button
                      key={name}
                      className={contentStep === i ? "selected" : ""}
                      aria-pressed={contentStep === i}
                      onClick={() => setContentStep(i)}
                    >
                      <span>{i + 1}</span>
                      {name}
                    </button>
                  ))}
                </div>
                <div className="editor-grid">
                  <Card>
                    <div className="section-head">
                      <h2>
                        {
                          ["¿Qué vamos a contar?", "Dale la voz de Spotmi", "Revisá esta versión"][
                            contentStep
                          ]
                        }
                      </h2>
                      <span className="soft-icon">
                        <Sparkles size={20} />
                      </span>
                    </div>
                    {contentStep === 0 && (
                      <div className="form-stack">
                        <label>
                          Fuente del contenido
                          <select
                            value={draft.sourceId}
                            onChange={(e) => updateDraft({ sourceId: e.target.value })}
                          >
                            {state.sources.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                                {item.verified ? " · verificada" : " · pendiente"}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="fact-box">
                          <ShieldCheck size={20} />
                          <div>
                            <strong>
                              {source?.verified
                                ? "Información verificada en la demo"
                                : "Esta fuente necesita revisión"}
                            </strong>
                            <p>{state.brand.faq}</p>
                            <small>
                              Ejemplo de información de marca. Sin precios, horarios ni eventos
                              inventados.
                            </small>
                          </div>
                        </div>
                        <label>
                          Objetivo editorial
                          <select
                            defaultValue="discovery"
                            onChange={(e) =>
                              updateDraft({
                                caption:
                                  e.target.value === "community"
                                    ? "¿Cuál es tu lugar favorito de El Salvador? Contanos qué lo hace especial y compartí tu próximo plan con Spotmi."
                                    : initial.draft.caption,
                              })
                            }
                          >
                            <option value="discovery">Invitar a descubrir Spotmi</option>
                            <option value="community">Iniciar una conversación</option>
                          </select>
                        </label>
                        <button
                          className="button primary"
                          onClick={() => setContentStep(1)}
                          disabled={!source?.verified}
                        >
                          Continuar al diseño <ArrowRight size={17} />
                        </button>
                      </div>
                    )}
                    {contentStep === 1 && (
                      <div className="form-stack">
                        <label>
                          Título de la pieza
                          <input
                            maxLength={90}
                            value={draft.title}
                            onChange={(e) => updateDraft({ title: e.target.value })}
                          />
                        </label>
                        <label>
                          Texto de la publicación
                          <textarea
                            rows={5}
                            maxLength={1800}
                            value={draft.caption}
                            onChange={(e) => updateDraft({ caption: e.target.value })}
                          />
                        </label>
                        <label>
                          Formato
                          <select
                            value={draft.format}
                            onChange={(e) =>
                              updateDraft({
                                format: e.target.value as DemoState["draft"]["format"],
                              })
                            }
                          >
                            <option value="portrait">Vertical · 4:5</option>
                            <option value="square">Cuadrado · 1:1</option>
                            <option value="story">Historia · 9:16</option>
                          </select>
                        </label>
                        <div className="note">
                          <Image size={18} />
                          <p>
                            Plantilla tipográfica original. Orshot podrá generar la pieza final en
                            la siguiente fase.
                          </p>
                        </div>
                        <button className="button primary" onClick={renderDraft}>
                          <Sparkles size={17} /> Generar vista local
                        </button>
                      </div>
                    )}
                    {contentStep === 2 && (
                      <div className="form-stack">
                        <div className="review-line">
                          <Check size={18} />
                          <span>Texto y fuente de la versión {draft.revision}</span>
                        </div>
                        <div className="review-line">
                          <Check size={18} />
                          <span>Diseño sin fotografías ajenas</span>
                        </div>
                        <div className="review-line">
                          <Clock3 size={18} />
                          <span>
                            {draft.rendered
                              ? "Vista local generada"
                              : "Generá de nuevo la vista después de editar"}
                          </span>
                        </div>
                        <p className="caption-preview">{draft.caption}</p>
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={reviewed}
                            onChange={(e) => setReviewed(e.target.checked)}
                          />{" "}
                          Revisé los datos, el texto y los medios de esta versión.
                        </label>
                        <button
                          className="button primary"
                          disabled={
                            !reviewed || !draft.rendered || !source?.verified || draft.approved
                          }
                          onClick={() => {
                            setState((s) => ({ ...s, draft: { ...s.draft, approved: true } }));
                            tell(
                              "Versión aprobada en esta demo. Editarla requerirá una nueva revisión.",
                            );
                          }}
                        >
                          <CheckCheck size={18} />{" "}
                          {draft.approved ? "Versión aprobada" : "Aprobar versión en demo"}
                        </button>
                        <button
                          className="button secondary"
                          disabled={!draft.approved}
                          onClick={exportDraft}
                        >
                          <ArrowDownToLine size={17} /> Descargar propuesta de ejemplo
                        </button>
                        <span className="small muted">
                          La descarga contiene texto y metadatos de ejemplo en JSON. No publica ni
                          programa.
                        </span>
                      </div>
                    )}
                  </Card>
                  <div className="preview-column">
                    <div className="section-head">
                      <h2>Vista previa</h2>
                      <span className="small muted">Instagram / Facebook</span>
                    </div>
                    {renderCreative()}
                    <div className="preview-note">
                      <span className="avatar">S</span>
                      <div>
                        <strong>{state.brand.name}</strong>
                        <p>{draft.caption}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            {page === "inbox" && (
              <>
                <Heading
                  eyebrow="ATENCIÓN A TU COMUNIDAD"
                  title="Cada consulta tiene su lugar."
                  description="El bot ayuda con lo conocido. Vos acompañás lo que necesita más atención."
                  action={
                    <button className="button secondary" onClick={() => openPage("settings")}>
                      <Settings2 size={17} /> Configurar bot
                    </button>
                  }
                />
                <div className="inbox-layout">
                  <Card className="conversation-list">
                    <label className="search-field">
                      <Search size={18} />
                      <input
                        aria-label="Buscar conversaciones"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar conversación"
                      />
                    </label>
                    <p className="small muted">Conversaciones simuladas</p>
                    {state.conversations
                      .filter((v) =>
                        (v.label + v.channel).toLowerCase().includes(query.toLowerCase()),
                      )
                      .map((item) => (
                        <button
                          key={item.id}
                          className={
                            item.id === conversation.id
                              ? "conversation-item selected"
                              : "conversation-item"
                          }
                          onClick={() => {
                            setConversationId(item.id);
                            setMessageRole("visitor");
                          }}
                        >
                          <span className="conversation-avatar">
                            <MessageCircle size={20} />
                          </span>
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.channel}</small>
                            <Badge tone={item.status === "human" ? "amber" : "green"}>
                              {item.status === "human"
                                ? "Necesita una persona"
                                : item.status === "resolved"
                                  ? "Resuelta"
                                  : "Bot de prueba"}
                            </Badge>
                          </span>
                        </button>
                      ))}
                  </Card>
                  <Card className="chat-panel">
                    <div className="chat-header">
                      <div>
                        <h2>{conversation.label}</h2>
                        <p className="small muted">{conversation.channel} · prueba local</p>
                      </div>
                      <Badge tone={conversation.status === "human" ? "amber" : "green"}>
                        {conversation.status === "human"
                          ? "Bot pausado"
                          : conversation.status === "resolved"
                            ? "Resuelta"
                            : state.modes[conversation.channel] === "test"
                              ? "Bot de prueba"
                              : "Bot apagado"}
                      </Badge>
                    </div>
                    <div className="chat-actions">
                      <button
                        className="button secondary"
                        disabled={conversation.status === "human"}
                        onClick={() => changeConversation("human")}
                      >
                        Tomar conversación
                      </button>
                      <button className="text-button" onClick={() => changeConversation("human")}>
                        <CirclePause size={16} /> Pausar bot
                      </button>
                      <button
                        className="text-button"
                        disabled={conversation.status === "resolved"}
                        onClick={() => changeConversation("resolved")}
                      >
                        <Check size={16} /> Resolver
                      </button>
                      {conversation.status !== "bot" && (
                        <button
                          className="text-button"
                          disabled={state.modes[conversation.channel] !== "test"}
                          onClick={() => changeConversation("bot")}
                        >
                          Reanudar prueba
                        </button>
                      )}
                    </div>
                    <div className="messages" role="log" aria-label="Mensajes de ejemplo">
                      {conversation.messages.map((item, i) => (
                        <div key={i} className={`message ${item.author}`}>
                          <small>
                            {item.author === "visitor"
                              ? "Visitante · ejemplo"
                              : item.author === "owner"
                                ? "Tu respuesta · prueba"
                                : "Asistente de Spotmi · prueba"}
                          </small>
                          <p>{item.text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="knowledge-strip">
                      <ShieldCheck size={16} />
                      <span>
                        {state.brand.approved
                          ? "Base: descripción de Spotmi · aprobada en demo"
                          : "Conocimiento pendiente: el bot pasará la consulta a una persona"}
                      </span>
                    </div>
                    <form className="chat-compose" onSubmit={sendDemo}>
                      <label className="small">
                        Probar como
                        <select
                          value={messageRole}
                          onChange={(e) => setMessageRole(e.target.value as "visitor" | "owner")}
                        >
                          <option value="visitor">Visitante</option>
                          <option value="owner">Propietario</option>
                        </select>
                      </label>
                      <label className="grow">
                        <span className="sr-only">Mensaje de prueba</span>
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          rows={2}
                          maxLength={1500}
                          placeholder="Probá: ¿qué es Spotmi? o necesito hablar con una persona"
                        />
                      </label>
                      <button
                        className="button primary"
                        disabled={!message.trim() || conversation.status === "resolved"}
                        aria-label="Añadir mensaje de prueba"
                      >
                        <Send size={18} />
                      </button>
                    </form>
                    <p className="small muted chat-footnote">
                      Respuestas de ejemplo con reglas locales. Nada se envía a una red social.
                    </p>
                  </Card>
                </div>
              </>
            )}
            {page === "automation" && (
              <>
                <Heading
                  eyebrow="MENOS TAREAS REPETIDAS, MÁS TIEMPO PARA TU NEGOCIO"
                  title="Automatizaciones"
                  description="Seguí cada recorrido desde su origen hasta su resultado."
                  action={
                    <button
                      className="button secondary"
                      onClick={() => {
                        setState((s) => ({ ...s, paused: !s.paused }));
                        tell(state.paused ? "Pruebas reanudadas." : "Pruebas pausadas.");
                      }}
                    >
                      <CirclePause size={18} />{" "}
                      {state.paused ? "Reanudar pruebas" : "Pausar pruebas"}
                    </button>
                  }
                />
                <div className="automation-flow">
                  {["Recopilar", "Verificar", "Crear", "Revisar"].map((name, i) => (
                    <div key={name}>
                      <span>{i + 1}</span>
                      <strong>{name}</strong>
                      {i < 3 && <ArrowRight size={20} />}
                    </div>
                  ))}
                </div>
                <div className="workflow-grid">
                  {[
                    {
                      name: "Recopilar información",
                      icon: Globe2,
                      description:
                        "Consultar solo las fuentes autorizadas y proponer datos nuevos.",
                    },
                    {
                      name: "Preparar un texto",
                      icon: FileCheck2,
                      description: "Crear una propuesta desde información verificada.",
                    },
                    {
                      name: "Crear pieza visual",
                      icon: Palette,
                      description: "Aplicar la plantilla y los colores de tu negocio.",
                    },
                    {
                      name: "Responder consultas",
                      icon: Bot,
                      description:
                        "Atender preguntas con conocimiento aprobado y pasar las dudas a una persona.",
                    },
                  ].map(({ name, icon: Icon, description }) => (
                    <Card key={name}>
                      <div className="section-head">
                        <span className="soft-icon">
                          <Icon />
                        </span>
                        <Badge tone="amber">{state.paused ? "Pausada" : "Solo prueba"}</Badge>
                      </div>
                      <h2>{name}</h2>
                      <p className="muted">{description}</p>
                      <button
                        className="button secondary"
                        disabled={state.paused}
                        onClick={() =>
                          name === "Responder consultas"
                            ? openPage("inbox")
                            : name === "Crear pieza visual"
                              ? openPage("content")
                              : run(name)
                        }
                      >
                        <Play size={16} /> Probar flujo
                      </button>
                    </Card>
                  ))}
                </div>
                <Card>
                  <div className="section-head">
                    <h2>Últimas ejecuciones</h2>
                    <span className="small muted">Costo externo de esta demo: USD 0</span>
                  </div>
                  {state.runs.length ? (
                    state.runs.map((item) => (
                      <div className="execution-row" key={item.id}>
                        <span className="soft-icon green">
                          <Check size={18} />
                        </span>
                        <div className="grow">
                          <strong>{item.name}</strong>
                          <p className="small muted">{item.result}</p>
                        </div>
                        <button className="text-button" onClick={() => setDialog("run")}>
                          Ver ejecución <ChevronRight size={16} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Workflow />
                      <h3>Tu primera prueba empieza aquí</h3>
                      <p>Probá un recorrido para ver sus pasos y su resultado.</p>
                      <button
                        className="button secondary"
                        disabled={state.paused}
                        onClick={() => run()}
                      >
                        Probar recopilación
                      </button>
                    </div>
                  )}
                </Card>
              </>
            )}
            {page === "places" && (
              <>
                <Heading
                  eyebrow="EL CORAZÓN LOCAL DE SPOTMI"
                  title="Lugares y eventos"
                  description="Información útil, con su origen y su fecha de verificación."
                  action={
                    <button
                      className="button primary"
                      onClick={() => {
                        setSourceError("");
                        setDialog("source");
                      }}
                    >
                      <Plus size={18} /> Empezar con una fuente
                    </button>
                  }
                />
                <Card>
                  <div className="empty-state large">
                    <MapPin size={36} />
                    <h2>El próximo descubrimiento empieza con un dato confiable.</h2>
                    <p>
                      Una ficha reunirá nombre, categoría, ubicación, fechas, fuente y medios
                      autorizados. Los precios y horarios desconocidos quedarán pendientes.
                    </p>
                    <button className="button secondary" onClick={() => openPage("sources")}>
                      Revisar fuentes <ArrowRight size={17} />
                    </button>
                  </div>
                </Card>
                <div className="field-preview">
                  <span>Nombre del lugar o evento</span>
                  <span>Categoría y ubicación</span>
                  <span>Fechas y vigencia</span>
                  <span>Fuente y verificación</span>
                </div>
                <p className="small muted">
                  Estado vacío intencional: esta propuesta no incluye lugares ni eventos inventados.
                </p>
              </>
            )}
            {page === "brand" && (
              <>
                <Heading
                  eyebrow="UNA MARCA CONSISTENTE EN CADA CONVERSACIÓN"
                  title="Marca y conocimiento"
                  description="Así se ve Spotmi. Esto es lo que su asistente puede contar."
                />
                <div className="two-columns">
                  <Card>
                    <div className="section-head">
                      <h2>Identidad visual</h2>
                      <Palette size={21} />
                    </div>
                    <div className="form-stack">
                      <label>
                        Nombre de marca
                        <input
                          value={state.brand.name}
                          maxLength={30}
                          onChange={(e) => updateBrand({ name: e.target.value })}
                        />
                      </label>
                      <div className="color-fields">
                        <label>
                          Color principal
                          <input
                            type="color"
                            value={state.brand.primary}
                            onChange={(e) => updateBrand({ primary: e.target.value })}
                          />
                          <span>{state.brand.primary}</span>
                        </label>
                        <label>
                          Acento
                          <input
                            type="color"
                            value={state.brand.accent}
                            onChange={(e) => updateBrand({ accent: e.target.value })}
                          />
                          <span>{state.brand.accent}</span>
                        </label>
                      </div>
                      <div className="note">
                        <ShieldCheck size={18} />
                        <p>
                          La paleta es una propuesta. Cambiar la marca requiere revisar nuevamente
                          el contenido aprobado.
                        </p>
                      </div>
                      <div className="brand-swatch">
                        <span>
                          {state.brand.name.toLowerCase()}
                          <b>·</b>
                        </span>
                        <small>Cerca, vivo y local.</small>
                      </div>
                    </div>
                  </Card>
                  <Card>
                    <div className="section-head">
                      <h2>Conocimiento del asistente</h2>
                      <Badge tone={state.brand.approved ? "green" : "amber"}>
                        {state.brand.approved ? "Aprobado · demo" : "Por revisar"}
                      </Badge>
                    </div>
                    <div className="form-stack">
                      <label>
                        ¿Qué es Spotmi?
                        <textarea
                          rows={5}
                          value={state.brand.faq}
                          maxLength={800}
                          onChange={(e) => updateBrand({ faq: e.target.value, approved: false })}
                        />
                      </label>
                      <p className="small muted">
                        Fuente: descripción de la marca suministrada para este diseño. Las fuentes
                        nuevas requieren revisión propia.
                      </p>
                      <button
                        className="button primary"
                        disabled={state.brand.approved || !state.brand.faq.trim()}
                        onClick={() => {
                          setState((s) => ({ ...s, brand: { ...s.brand, approved: true } }));
                          tell("Conocimiento aprobado en esta demo.");
                        }}
                      >
                        <Check size={17} /> Aprobar conocimiento en demo
                      </button>
                      <button className="text-button" onClick={() => openPage("inbox")}>
                        Probar una respuesta <ArrowRight size={16} />
                      </button>
                    </div>
                  </Card>
                </div>
              </>
            )}
            {page === "settings" && (
              <>
                <Heading
                  eyebrow="AUTOMATIZACIÓN CON TU CRITERIO"
                  title="Tu asistente, a tu manera."
                  description="Definí cuándo puede responder y cuándo te debe pasar una conversación."
                />
                <div className="settings-grid">
                  <Card>
                    <div className="section-head">
                      <div>
                        <h2>Modo del bot por canal</h2>
                        <p className="muted">Probá las reglas antes de conectar una cuenta.</p>
                      </div>
                      <Bot size={26} />
                    </div>
                    <div className="channel-tabs">
                      {channels.map((name) => (
                        <button
                          key={name}
                          className={channel === name ? "selected" : ""}
                          aria-pressed={channel === name}
                          onClick={() => setChannel(name)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    <div className="mode-options">
                      {[
                        {
                          value: "off",
                          title: "Apagado",
                          description: "Las consultas quedan para una persona.",
                        },
                        {
                          value: "test",
                          title: "Prueba",
                          description: "Respuestas simuladas dentro de esta propuesta.",
                        },
                      ].map((mode) => (
                        <label
                          htmlFor={`bot-mode-${mode.value}`}
                          aria-label={mode.title}
                          className={
                            state.modes[channel] === mode.value
                              ? "mode-option selected"
                              : "mode-option"
                          }
                          key={mode.value}
                        >
                          <input
                            type="radio"
                            id={`bot-mode-${mode.value}`}
                            name="bot-mode"
                            checked={state.modes[channel] === mode.value}
                            onChange={() =>
                              setState((s) => ({
                                ...s,
                                modes: { ...s.modes, [channel]: mode.value as "off" | "test" },
                              }))
                            }
                          />
                          <span>
                            <strong>{mode.title}</strong>
                            <small>{mode.description}</small>
                          </span>
                        </label>
                      ))}
                      <div className="mode-option unavailable">
                        <Unplug size={18} />
                        <span>
                          <strong>Activo · siguiente fase</strong>
                          <small>
                            Respuestas reales con cuenta autorizada y requisitos verificados.
                          </small>
                        </span>
                        <button className="text-button" onClick={() => setDialog("connection")}>
                          Ver requisitos
                        </button>
                      </div>
                    </div>
                    <div className="note">
                      <CircleHelp size={18} />
                      <p>
                        Activar un canal será una decisión explícita. El modo de prueba nunca envía
                        mensajes.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => {
                        const existing = state.conversations.find((v) => v.channel === channel);
                        if (existing) setConversationId(existing.id);
                        else {
                          const id = crypto.randomUUID();
                          setState((s) => ({
                            ...s,
                            conversations: [
                              ...s.conversations,
                              {
                                id,
                                label: "Nueva consulta de ejemplo",
                                channel,
                                status: "bot",
                                messages: [],
                              },
                            ],
                          }));
                          setConversationId(id);
                        }
                        openPage("inbox");
                      }}
                    >
                      Abrir conversación de prueba <ArrowRight size={17} />
                    </button>
                  </Card>
                  <div className="stack">
                    <Card>
                      <h2>Cuándo pasarte la conversación</h2>
                      <ul className="rules-list">
                        {[
                          "La persona pide atención humana",
                          "Faltan datos o perdieron vigencia",
                          "Precios, cupos o reservas sin confirmar",
                          "Pagos, reclamos y devoluciones",
                        ].map((text) => (
                          <li key={text}>
                            <Check size={17} />
                            {text}
                          </li>
                        ))}
                      </ul>
                      <p className="small muted">
                        Al tomar una conversación, el bot deja de responder hasta que lo reanudés.
                      </p>
                    </Card>
                    <Card>
                      <div className="section-head">
                        <h2>Presupuesto del piloto</h2>
                        <Badge tone="green">USD 0 en esta demo</Badge>
                      </div>
                      <div className="budget-number">
                        $20<span> / mes como techo</span>
                      </div>
                      <p className="muted">
                        El límite incluirá recopilación, IA, diseños, mensajería y alojamiento.
                      </p>
                      <button className="text-button" onClick={() => setDialog("help")}>
                        Ver alcance del prototipo <ArrowRight size={16} />
                      </button>
                    </Card>
                  </div>
                </div>
                <div className="panel-footer standalone">
                  <span className="small muted">Esta demo se guarda solo en este navegador.</span>
                  <button className="text-button" onClick={() => setDialog("reset")}>
                    Restablecer datos de ejemplo
                  </button>
                </div>
              </>
            )}
            <footer className="page-footer">
              <span>Spotmi · cerca, vivo y local</span>
              <span>
                Diseñado para ezrá <b>✦</b>
              </span>
            </footer>
          </main>
        </div>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{notice}</span>
          <button className="icon-button" aria-label="Cerrar aviso" onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          title={
            dialog === "source"
              ? "Añadir fuente de ejemplo"
              : dialog === "connection"
                ? `${channel}: preparar conexión`
                : dialog === "run"
                  ? "Detalle de la prueba"
                  : dialog === "reset"
                    ? "Restablecer esta demo"
                    : "Acerca de esta propuesta"
          }
          onClose={() => setDialog(null)}
        >
          {dialog === "source" && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const url = String(data.get("url"));
                try {
                  if (new URL(url).protocol !== "https:") throw new Error();
                } catch {
                  setSourceError("Usá una dirección completa que empiece con https://.");
                  return;
                }
                if (state.sources.some((s) => s.url === url)) {
                  setSourceError("Esa fuente ya está en esta demo.");
                  return;
                }
                setState((s) => ({
                  ...s,
                  sources: [
                    ...s.sources,
                    {
                      id: crypto.randomUUID(),
                      name: String(data.get("name")),
                      url,
                      type: String(data.get("type")),
                      verified: false,
                    },
                  ],
                }));
                setDialog(null);
                openPage("sources");
                tell(
                  "Fuente agregada a la demo, pendiente de verificación. No se consultó su URL.",
                );
              }}
            >
              <p className="muted">
                Probá cómo registrarías una fuente. Este formulario no visita la dirección.
              </p>
              <label>
                Nombre
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Mi sitio o agenda autorizada"
                />
              </label>
              <label>
                Tipo
                <select name="type">
                  <option>Sitio propio</option>
                  <option>RSS autorizado</option>
                  <option>Instagram público · por evaluar</option>
                  <option>Facebook público · por evaluar</option>
                </select>
              </label>
              <label>
                Dirección
                <input name="url" type="url" required placeholder="https://mi-sitio.example" />
              </label>
              <label className="check-label">
                <input type="checkbox" required /> Confirmo que esta es una fuente que puedo
                autorizar.
              </label>
              {sourceError && (
                <p role="alert" className="form-error">
                  {sourceError}
                </p>
              )}
              <div className="dialog-actions">
                <button type="button" className="button secondary" onClick={() => setDialog(null)}>
                  Cancelar
                </button>
                <button className="button primary">Guardar en la demo</button>
              </div>
            </form>
          )}
          {dialog === "connection" && (
            <div className="form-stack">
              <Badge>Sin conexión real</Badge>
              <p>La autorización de tu cuenta se hará mediante la integración oficial de Meta.</p>
              <ul className="rules-list">
                {(channel === "Instagram"
                  ? [
                      "Cuenta profesional y acceso del propietario",
                      "Permisos de mensajería y revisión de la aplicación",
                      "Recepción de mensajes y pruebas verificadas",
                    ]
                  : channel === "Facebook"
                    ? [
                        "Página del negocio y permisos de administración",
                        "Acceso de la aplicación a Messenger",
                        "Recepción de mensajes y pruebas verificadas",
                      ]
                    : [
                        "Cuenta de WhatsApp Business Platform y número elegible",
                        "Verificar compatibilidad con tu uso actual del número",
                        "Reglas de respuesta, tarifas y recepción de mensajes",
                      ]
                ).map((text) => (
                  <li key={text}>
                    <ShieldCheck size={18} />
                    {text}
                  </li>
                ))}
              </ul>
              <p className="note">
                Un enlace público o una clave de Apify no completa esta conexión.
              </p>
              <button
                className="button primary"
                onClick={() => {
                  setDialog(null);
                  openPage("settings");
                }}
              >
                Configurar el modo de prueba
              </button>
            </div>
          )}
          {dialog === "run" && (
            <div className="form-stack">
              <Badge tone="green">Simulación local</Badge>
              <ol className="execution-steps">
                <li>Seleccionar una fuente autorizada</li>
                <li>Comprobar origen y descartar duplicados</li>
                <li>Proponer información para verificar</li>
                <li>Esperar revisión antes de usar datos nuevos</li>
              </ol>
              <p className="note">
                Esta vista explica el recorrido. No ejecuta Apify, n8n ni una lectura real.
              </p>
              <button className="button primary" onClick={() => setDialog(null)}>
                Volver al panel
              </button>
            </div>
          )}
          {dialog === "reset" && (
            <div className="form-stack">
              <p>
                Se reemplazarán únicamente los cambios de este prototipo en tu navegador. Los datos
                de ezrá no forman parte de esta demo.
              </p>
              <div className="dialog-actions">
                <button className="button secondary" onClick={() => setDialog(null)}>
                  Conservar cambios
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    setState(structuredClone(initial));
                    setReviewed(false);
                    setDialog(null);
                    setConversationId("demo-1");
                    tell("Demo restablecida.");
                  }}
                >
                  Restablecer demo
                </button>
              </div>
            </div>
          )}
          {dialog === "help" && (
            <div className="form-stack">
              <p>
                Propuesta visual de Spotmi en ezrá. Podés navegar, cambiar la marca, preparar una
                pieza, revisar fuentes y probar conversaciones.
              </p>
              <div className="note">
                <ShieldCheck size={20} />
                <p>
                  Los datos son de ejemplo y se guardan únicamente en este navegador. Las cuentas
                  aparecen sin conectar y todos los mensajes son simulados.
                </p>
              </div>
              <p>
                El piloto tendrá un techo de USD 20 mensuales. La activación real dependerá de los
                permisos, las tarifas y una infraestructura disponible.
              </p>
              <button className="button primary" onClick={() => setDialog(null)}>
                Seguir explorando
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
