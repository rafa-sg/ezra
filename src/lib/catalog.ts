import { newPost, today, type CatalogProduct, type Post } from "./model";

export const productKindLabels: Record<CatalogProduct["kind"], string> = {
  motorcycle: "Moto",
  retail: "Artículo",
  food: "Comida",
  rental: "Vehículo de alquiler",
};
export function formatPrice(cents: number) {
  return new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(cents / 100);
}
export function newProduct(kind: CatalogProduct["kind"] = "motorcycle"): CatalogProduct {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    kind,
    name: "",
    category: "",
    brand: "",
    model: "",
    sku: "",
    description: "",
    priceCents: null,
    availability: "unknown",
    mediaIds: [],
    variants: [
      { id: crypto.randomUUID(), name: "Principal", color: "", priceCents: null, mediaIds: [] },
    ],
    promotion: { kind: "none", value: 0, startsOn: "", endsOn: "", conditions: "" },
    sourceUrl: "",
    verified: false,
    verifiedOn: "",
  };
}
export function productPrice(product: CatalogProduct, variantId: string, day = today()) {
  const variant = product.variants.find((v) => v.id === variantId);
  const original = variant?.priceCents ?? product.priceCents;
  const promo = product.promotion;
  const active =
    promo.kind !== "none" &&
    !!promo.startsOn &&
    !!promo.endsOn &&
    day >= promo.startsOn &&
    day <= promo.endsOn;
  const final =
    original === null || !active
      ? original
      : promo.kind === "percentage"
        ? Math.round((original * (100 - promo.value)) / 100)
        : original - promo.value;
  return { original, final, active };
}
export function catalogContent(product: CatalogProduct, variantId: string, day = today()) {
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) throw new Error("Selecciona una variante del producto.");
  const price = productPrice(product, variantId, day);
  const promotion = product.promotion;
  const lines = [
    product.name,
    [product.brand, product.model].filter(Boolean).join(" · "),
    variant.name !== "Principal" ? variant.name : "",
    variant.color ? `Color: ${variant.color}` : "",
    product.description,
    price.final !== null
      ? `Precio${product.kind === "rental" ? " informado" : ""}: ${formatPrice(price.final)}`
      : "",
    price.active && price.original !== null ? `Precio regular: ${formatPrice(price.original)}` : "",
    price.active
      ? `Descuento: ${promotion.kind === "percentage" ? `${promotion.value}%` : formatPrice(promotion.value)}. Vigente del ${promotion.startsOn} al ${promotion.endsOn}.`
      : "",
    price.active ? promotion.conditions : "",
    product.availability === "available"
      ? "Disponibilidad informada por el negocio. Consulta antes de comprar."
      : "Consulta disponibilidad con el negocio.",
  ].filter(Boolean);
  return {
    title: `${product.name}${variant.color ? ` · ${variant.color}` : ""}`.slice(0, 180),
    caption: lines.join("\n\n"),
    mediaIds: variant.mediaIds.length ? [...variant.mediaIds] : [...product.mediaIds],
    productId: product.id,
    variantId,
    catalogRevision: product.revision,
  };
}
/** Photos the owner may pick for a variant: its own, or the product's if it has none. */
export function variantPhotos(product: CatalogProduct, variantId: string) {
  const variant = product.variants.find((v) => v.id === variantId);
  return variant?.mediaIds.length ? variant.mediaIds : product.mediaIds;
}
export function postFormat(mediaCount: number): Post["format"] {
  return mediaCount === 0 ? "text" : mediaCount === 1 ? "photo" : "carousel";
}
export type PromotionStatus = "none" | "incomplete" | "upcoming" | "active" | "expired";
export function promotionStatus(product: CatalogProduct, day = today()): PromotionStatus {
  const promo = product.promotion;
  if (promo.kind === "none") return "none";
  if (!promo.startsOn || !promo.endsOn || promo.value <= 0) return "incomplete";
  if (day < promo.startsOn) return "upcoming";
  if (day > promo.endsOn) return "expired";
  return "active";
}
export const promotionStatusLabels: Record<PromotionStatus, string> = {
  none: "Sin promoción",
  incomplete: "Promoción incompleta",
  upcoming: "Promoción aún no vigente",
  active: "Promoción vigente",
  expired: "Promoción vencida",
};
/**
 * Warnings shown before preparing drafts. They do not block a draft (nothing is
 * published), but the same facts are enforced again when the version is approved.
 */
export function campaignIssues(
  product: CatalogProduct,
  variantId: string,
  mediaIds: string[],
  channels: Post["channel"][],
  day = today(),
) {
  const issues: string[] = [];
  if (!product.verified || !product.verifiedOn)
    issues.push(
      "El producto no está verificado: no se podrá aprobar hasta revisarlo en el catálogo.",
    );
  if (!product.sourceUrl) issues.push("Falta un enlace de referencia para comprobar los datos.");
  if (productPrice(product, variantId, day).original === null)
    issues.push("No hay precio: la publicación dirá que se consulte.");
  if (product.availability === "unavailable")
    issues.push("El producto está marcado como no disponible.");
  const promo = promotionStatus(product, day);
  if (promo === "incomplete" || promo === "upcoming" || promo === "expired")
    issues.push(`${promotionStatusLabels[promo]}: no se incluirá el descuento.`);
  if (!mediaIds.length) issues.push("Sin fotos: solo se puede preparar para Facebook como texto.");
  if (channels.includes("instagram") && !mediaIds.length)
    issues.push("Instagram necesita al menos una foto.");
  return issues;
}
export function createCatalogPosts(
  product: CatalogProduct,
  variantId: string,
  channels: Post["channel"][],
  mediaIds?: string[],
) {
  const campaignId = crypto.randomUUID();
  const content = catalogContent(product, variantId);
  // Only photos that belong to this product may be chosen for its publication.
  const allowed = new Set([...product.mediaIds, ...product.variants.flatMap((v) => v.mediaIds)]);
  const media = (mediaIds ?? content.mediaIds).filter((id) => allowed.has(id));
  const unique = [...new Set(channels)];
  if (unique.includes("instagram") && !media.length)
    throw new Error("Instagram necesita al menos una foto del producto.");
  return unique.map((channel) => ({
    ...newPost(),
    ...content,
    mediaIds: [...media],
    format: postFormat(media.length),
    channel,
    campaignId,
  }));
}
