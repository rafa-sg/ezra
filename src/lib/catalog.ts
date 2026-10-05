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
export function createCatalogPosts(
  product: CatalogProduct,
  variantId: string,
  channels: Post["channel"][],
) {
  const campaignId = crypto.randomUUID();
  return [...new Set(channels)].map((channel) => ({
    ...newPost(),
    ...catalogContent(product, variantId),
    channel,
    campaignId,
  }));
}
