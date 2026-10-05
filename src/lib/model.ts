import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Fecha inválida");
const webUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Usa una URL http o https válida");
const optionalUrl = z.union([z.literal(""), webUrl]);
export const statusSchema = z.enum([
  "draft",
  "review",
  "approved",
  "planned",
  "published",
  "rejected",
]);
export const sourceSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(160),
    // Only a manual inspiration note may omit its address.
    url: optionalUrl,
    kind: z.enum(["information", "inspiration", "owned", "rss"]),
    status: z.enum(["pending", "approved", "paused"]),
    topics: z.string().max(500),
    notes: z.string().max(2000),
    reviewedOn: z.union([z.literal(""), dateOnly]),
    expiresOn: z.union([z.literal(""), dateOnly]),
    demo: z.boolean(),
  })
  .refine((s) => s.kind === "inspiration" || s.url !== "", {
    message: "Esta fuente necesita una dirección https.",
    path: ["url"],
  });
export const postSchema = z.object({
  id,
  title: z.string().trim().min(1).max(180),
  caption: z.string().max(10000),
  channel: z.enum(["instagram", "facebook"]),
  format: z.enum(["photo", "carousel", "reel", "text"]),
  status: statusSchema,
  sourceIds: z.array(id).max(30),
  mediaIds: z.array(id).max(20),
  artwork: z.enum(["coast", "volcano", "town", "coffee"]),
  plannedAt: z
    .string()
    .refine(
      (v) =>
        !v ||
        (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) &&
          dateOnly.safeParse(v.slice(0, 10)).success &&
          Number(v.slice(11, 13)) < 24 &&
          Number(v.slice(14, 16)) < 60),
      "Fecha y hora inválidas",
    ),
  publishedUrl: optionalUrl,
  checks: z.object({ facts: z.boolean(), rights: z.boolean(), brand: z.boolean() }),
  rejectionReason: z.string().max(2000),
  demo: z.boolean(),
  // Set by ezrá when Gemini drafted the text; the browser can never remove it.
  aiGenerated: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const mediaSchema = z.object({
  id,
  filename: z.string().regex(/^[a-zA-Z0-9_-]+\.(png|jpg|webp|mp4|webm)$/),
  originalName: z.string().max(240),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"]),
  size: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  createdAt: z.string().datetime(),
  origin: z.enum(["owned", "ai", "licensed"]),
  attribution: z.string().max(2000),
});
export const brandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  website: optionalUrl,
  description: z.string().max(2000),
  audience: z.string().max(1000),
  voice: z.string().max(2000),
  allowedTopics: z.string().max(2000),
  excludedTopics: z.string().max(2000),
  rules: z.string().max(4000),
});
export const eventSchema = z.object({
  id,
  at: z.string().datetime(),
  title: z.string().max(250),
  detail: z.string().max(2500),
  postId: id.optional(),
});
export const workspaceSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  brand: brandSchema,
  posts: z.array(postSchema).max(2000),
  sources: z.array(sourceSchema).max(500),
  media: z.array(mediaSchema).max(1000),
  history: z.array(eventSchema).max(10000),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Post = z.infer<typeof postSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Brand = z.infer<typeof brandSchema>;
export type Status = Post["status"];
export const statusLabels: Record<Status, string> = {
  draft: "Borrador",
  review: "Por revisar",
  approved: "Aprobado",
  planned: "Fecha prevista",
  published: "Publicado manualmente",
  rejected: "Rechazado",
};
export const sourceKindLabels: Record<Source["kind"], string> = {
  owned: "Sitio propio",
  information: "Sitio oficial",
  rss: "RSS",
  inspiration: "Nota manual de inspiración",
};
/** Kinds n8n may read when the owner clicks «Buscar ideas»; notes are never read. */
export const readableSourceKinds = ["owned", "rss"] as const;
export function sourceReadable(source: Source, day = today()) {
  return (
    !source.demo &&
    !!source.url &&
    (readableSourceKinds as readonly string[]).includes(source.kind) &&
    sourceUsable(source, day)
  );
}
export const formatLabels: Record<Post["format"], string> = {
  photo: "Foto",
  carousel: "Carrusel",
  reel: "Reel",
  text: "Solo texto",
};
export const zone = "America/El_Salvador";
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function displayDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  if (!value) return "Sin fecha";
  const date = new Date(
    value.length === 10
      ? `${value}T12:00:00-06:00`
      : value.length === 16
        ? `${value}:00-06:00`
        : value,
  );
  return Number.isNaN(date.getTime())
    ? "Fecha inválida"
    : new Intl.DateTimeFormat("es-SV", { ...options, timeZone: zone }).format(date);
}
export function sourceUsable(source: Source, day = today()) {
  return (
    source.status === "approved" &&
    !!source.reviewedOn &&
    source.reviewedOn <= day &&
    (!source.expiresOn || source.expiresOn >= day)
  );
}
export function approvalIssues(post: Post, state: Workspace, day = today()) {
  const issues: string[] = [];
  if (!post.caption.trim()) issues.push("Agrega el texto de la publicación.");
  if (!post.sourceIds.length) issues.push("Vincula al menos una fuente verificada.");
  if (
    post.sourceIds.some(
      (id) => !state.sources.some((source) => source.id === id && sourceUsable(source, day)),
    )
  )
    issues.push("Revisa las fuentes: deben estar autorizadas, verificadas y vigentes.");
  if (
    post.sourceIds.some((id) =>
      state.sources.some((source) => source.id === id && source.kind === "inspiration"),
    )
  )
    issues.push(
      "Las cuentas de inspiración no son una fuente de hechos. Sustitúyelas por una fuente informativa o propia.",
    );
  if (
    !post.demo &&
    post.sourceIds.some((id) => state.sources.some((source) => source.id === id && source.demo))
  )
    issues.push(
      "Las fuentes de ejemplo no verifican contenido real. Agrega y revisa tu propia fuente.",
    );
  if (!post.checks.facts || !post.checks.rights || !post.checks.brand)
    issues.push("Completa las tres comprobaciones editoriales.");
  if (!post.demo && post.format !== "text" && !post.mediaIds.length)
    issues.push("Adjunta medios propios, generados o con licencia.");
  if (
    post.format === "reel" &&
    !post.demo &&
    !post.mediaIds.some((id) =>
      state.media.some((media) => media.id === id && media.mime.startsWith("video/")),
    )
  )
    issues.push("Un reel necesita un archivo de video.");
  if (post.channel === "instagram" && post.format === "text")
    issues.push("Para Instagram selecciona un formato con imagen o video.");
  return issues;
}
export function newPost(): Post {
  const at = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "Nueva historia",
    caption: "",
    channel: "instagram",
    format: "photo",
    status: "draft",
    sourceIds: [],
    mediaIds: [],
    artwork: "coast",
    plannedAt: "",
    publishedUrl: "",
    checks: { facts: false, rights: false, brand: false },
    rejectionReason: "",
    demo: false,
    aiGenerated: false,
    createdAt: at,
    updatedAt: at,
  };
}
