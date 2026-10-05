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
  productId: id.optional(),
  variantId: id.optional(),
  catalogRevision: z.number().int().nonnegative().optional(),
  campaignId: id.optional(),
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
export const defaultBusinessId = "spotmi";
export const businessTypeSchema = z.enum([
  "motorcycles",
  "retail",
  "food",
  "rental",
  "editorial",
  "other",
]);
export const businessSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  organizationName: z.string().trim().min(1).max(120),
  organizationId: id.default("owner"),
  type: businessTypeSchema,
  createdAt: z.string().datetime(),
});
export const businessDirectorySchema = z.object({
  schemaVersion: z.literal(1),
  businesses: z.array(businessSchema).min(1).max(100),
});
const cents = z.number().int().min(0).max(100_000_000);
export const catalogProductSchema = z.object({
  id,
  revision: z.number().int().nonnegative().default(0),
  kind: z.enum(["motorcycle", "retail", "food", "rental"]),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().max(100),
  brand: z.string().trim().max(100),
  model: z.string().trim().max(100),
  sku: z.string().trim().max(100),
  description: z.string().max(2000),
  priceCents: cents.nullable(),
  availability: z.enum(["unknown", "available", "unavailable"]),
  mediaIds: z.array(id).max(20),
  variants: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(100),
        color: z.string().trim().max(80),
        priceCents: cents.nullable(),
        mediaIds: z.array(id).max(20),
      }),
    )
    .min(1)
    .max(20),
  promotion: z.object({
    kind: z.enum(["none", "percentage", "fixed"]),
    value: z.number().int().min(0).max(100_000_000),
    startsOn: z.union([z.literal(""), dateOnly]),
    endsOn: z.union([z.literal(""), dateOnly]),
    conditions: z.string().max(1000),
  }),
  sourceUrl: optionalUrl,
  verified: z.boolean(),
  verifiedOn: z.union([z.literal(""), dateOnly]),
  // Facts supplied and checked by the business; never filled in automatically.
  details: z
    .object({
      year: z.union([z.literal(""), z.string().regex(/^(19[5-9]\d|20\d\d)$/)]),
      engineCc: z.number().int().min(1).max(5000).nullable(),
      specs: z.string().trim().max(1000),
      financing: z.string().trim().max(500),
      // Financing is only published when the business explicitly approved it.
      financingApproved: z.boolean(),
    })
    .refine((d) => !d.financingApproved || d.financing.length > 0, {
      message: "Escribe el financiamiento antes de aprobar que se publique.",
    })
    .default({ year: "", engineCc: null, specs: "", financing: "", financingApproved: false }),
});
export type Business = z.infer<typeof businessSchema>;
export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export const businessTypeLabels: Record<Business["type"], string> = {
  motorcycles: "Motos y comercio",
  retail: "Comercio",
  food: "Comida",
  rental: "Rent a car",
  editorial: "Contenido editorial",
  other: "Otro negocio",
};
export function businessApiUrl(url: string, businessId = defaultBusinessId) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}business=${encodeURIComponent(businessId)}`;
}
export const workspaceSchema = z.object({
  schemaVersion: z.literal(1),
  businessId: id.default(defaultBusinessId),
  revision: z.number().int().nonnegative(),
  brand: brandSchema,
  posts: z.array(postSchema).max(2000),
  sources: z.array(sourceSchema).max(500),
  media: z.array(mediaSchema).max(1000),
  history: z.array(eventSchema).max(10000),
  catalog: z.array(catalogProductSchema).max(2000).default([]),
  // Per-business colors and logo; empty values keep the ezrá look.
  appearance: z
    .object({
      primary: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
      secondary: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
      logoMediaId: z.union([z.literal(""), id]),
    })
    .default({ primary: "", secondary: "", logoMediaId: "" }),
  // What the owner confirmed about each account before an official connection.
  socialSetup: z
    .object({
      instagramProfessional: z.enum(["unknown", "yes", "no"]),
      instagramLinkedToPage: z.enum(["unknown", "yes", "no"]),
      pageAdmin: z.enum(["unknown", "yes", "no"]),
      whatsapp: z.enum(["unknown", "none", "personal", "business_app", "cloud_api"]),
      notes: z.string().trim().max(1000),
    })
    .default({
      instagramProfessional: "unknown",
      instagramLinkedToPage: "unknown",
      pageAdmin: "unknown",
      whatsapp: "unknown",
      notes: "",
    }),
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
  if (!post.sourceIds.length && !post.productId)
    issues.push("Vincula una fuente verificada o un producto revisado del catálogo.");
  if (post.productId) {
    const product = state.catalog.find((p) => p.id === post.productId);
    if (!product || !product.verified || !product.verifiedOn || product.verifiedOn > day)
      issues.push("Revisa y verifica la información del producto en el catálogo.");
    if (product && post.catalogRevision !== product.revision)
      issues.push(
        "El producto cambió. Actualiza la publicación desde el catálogo antes de aprobar.",
      );
    if (product && !product.variants.some((v) => v.id === post.variantId))
      issues.push("Selecciona una variante vigente del producto.");
    if (product?.availability === "unavailable")
      issues.push("El producto está marcado como no disponible.");
    if (
      product &&
      product.promotion.kind !== "none" &&
      (day < product.promotion.startsOn || day > product.promotion.endsOn)
    )
      issues.push("La promoción no está vigente. Revisa sus fechas en el catálogo.");
    if (
      product &&
      product.promotion.kind !== "none" &&
      post.plannedAt &&
      (post.plannedAt.slice(0, 10) < product.promotion.startsOn ||
        post.plannedAt.slice(0, 10) > product.promotion.endsOn)
    )
      issues.push("La fecha prevista debe estar dentro de la vigencia de la promoción.");
  }
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
    title: "Nueva publicación",
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
