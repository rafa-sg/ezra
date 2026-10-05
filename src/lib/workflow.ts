import {
  approvalIssues,
  type Workspace,
  type Post,
  type Status,
  today,
  workspaceSchema,
} from "./model";

export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
const moves: Record<Status, Status[]> = {
  draft: ["draft", "review"],
  review: ["review", "draft", "approved", "rejected"],
  approved: ["approved", "review", "draft", "planned"],
  planned: ["planned", "approved", "review", "draft", "published"],
  rejected: ["rejected", "draft", "review"],
  published: ["published"],
};
export function editorial(post: Post) {
  return JSON.stringify([
    post.title,
    post.caption,
    post.channel,
    post.format,
    post.sourceIds,
    post.mediaIds,
    post.artwork,
    post.demo,
    post.productId,
    post.variantId,
    post.catalogRevision,
    post.campaignId,
  ]);
}
function socialUrl(value: string, channel: Post["channel"]) {
  try {
    const u = new URL(value);
    const root = channel === "instagram" ? "instagram.com" : "facebook.com";
    return (
      u.protocol === "https:" &&
      (u.hostname === root || u.hostname.endsWith(`.${root}`)) &&
      u.pathname !== "/"
    );
  } catch {
    return false;
  }
}
export function reconcile(previous: Workspace, raw: unknown, now = new Date()): Workspace {
  const parsed = workspaceSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkflowError("Datos inválidos. Revisa los campos y vuelve a intentarlo.");
  const next = parsed.data;
  if (next.businessId !== previous.businessId)
    throw new WorkflowError("No puedes mover publicaciones entre negocios.", 409);
  if (next.revision !== previous.revision)
    throw new WorkflowError(
      "Hay cambios más recientes en otra ventana. Recarga antes de guardar.",
      409,
    );
  if (JSON.stringify(next.media) !== JSON.stringify(previous.media))
    throw new WorkflowError("Los archivos solo se agregan desde la biblioteca.");
  const keys = [
    ...next.posts.map((p) => p.id),
    ...next.sources.map((s) => s.id),
    ...next.media.map((m) => m.id),
    ...next.catalog.map((p) => p.id),
  ];
  if (new Set(keys).size !== keys.length)
    throw new WorkflowError("Hay identificadores duplicados.");
  const at = now.toISOString();
  next.history = [...previous.history];
  const event = (title: string, detail: string, postId?: string) =>
    next.history.unshift({
      id: crypto.randomUUID(),
      at,
      title,
      detail,
      ...(postId ? { postId } : {}),
    });
  const brandChanged = JSON.stringify(next.brand) !== JSON.stringify(previous.brand);
  for (const product of next.catalog) {
    const old = previous.catalog.find((p) => p.id === product.id);
    const changed =
      !old ||
      JSON.stringify({ ...product, revision: 0 }) !== JSON.stringify({ ...old, revision: 0 });
    product.revision = old ? old.revision + (changed ? 1 : 0) : 0;
    if (changed) event(old ? "Producto actualizado" : "Producto creado", product.name);
    if (new Set(product.variants.map((v) => v.id)).size !== product.variants.length)
      throw new WorkflowError("Las variantes del producto tienen identificadores duplicados.");
    const mediaIds = [...product.mediaIds, ...product.variants.flatMap((v) => v.mediaIds)];
    if (mediaIds.some((id) => !next.media.some((m) => m.id === id && m.mime.startsWith("image/"))))
      throw new WorkflowError("Usa fotografías de la biblioteca de este negocio para el producto.");
    if (product.verified && (!product.verifiedOn || product.verifiedOn > today(now)))
      throw new WorkflowError("El producto verificado necesita una fecha de revisión válida.");
    const promo = product.promotion;
    if (promo.kind !== "none") {
      if (!promo.startsOn || !promo.endsOn || promo.endsOn < promo.startsOn || promo.value <= 0)
        throw new WorkflowError("Indica el descuento y un período de promoción válido.");
      if (promo.kind === "percentage" && promo.value > 100)
        throw new WorkflowError("El descuento porcentual no puede superar 100%.");
      for (const variant of product.variants) {
        const price = variant.priceCents ?? product.priceCents;
        if (price === null || (promo.kind === "fixed" && promo.value > price))
          throw new WorkflowError(
            "Cada variante en promoción necesita un precio; el descuento no puede superarlo.",
          );
      }
    }
  }
  if (brandChanged)
    event(
      "Criterios de marca actualizados",
      "Las publicaciones pendientes aprobadas vuelven a revisión.",
    );
  for (const source of next.sources) {
    if (source.status === "approved" && (!source.reviewedOn || source.reviewedOn > today(now)))
      throw new WorkflowError(
        "Una fuente autorizada necesita una fecha de revisión válida, no futura.",
      );
    if (source.expiresOn && source.reviewedOn && source.expiresOn < source.reviewedOn)
      throw new WorkflowError("La vigencia no puede terminar antes de la revisión.");
  }
  for (const post of next.posts) {
    const old = previous.posts.find((p) => p.id === post.id);
    const product = next.catalog.find((p) => p.id === post.productId);
    if (post.productId && !product)
      throw new WorkflowError("El producto vinculado debe conservarse en el catálogo.");
    if (
      post.productId &&
      (!product?.variants.some((v) => v.id === post.variantId) ||
        post.catalogRevision === undefined)
    )
      throw new WorkflowError("La publicación necesita una variante y una versión del catálogo.");
    if (!post.productId && (post.variantId || post.catalogRevision !== undefined))
      throw new WorkflowError("Vincula el producto de esta publicación.");
    if (post.sourceIds.some((id) => !next.sources.some((s) => s.id === id)))
      throw new WorkflowError(
        "Una publicación apunta a una fuente eliminada. Desvincúlala primero.",
      );
    if (post.mediaIds.some((id) => !next.media.some((m) => m.id === id)))
      throw new WorkflowError("No se encontró uno de los archivos adjuntos.");
    if (!old) {
      if (post.status !== "draft" || post.demo)
        throw new WorkflowError("Las publicaciones nuevas comienzan como borrador real.");
      post.createdAt = at;
      post.updatedAt = at;
      event("Borrador creado", post.title, post.id);
      continue;
    }
    post.createdAt = old.createdAt;
    // The AI label is sticky: editing an AI draft keeps it labelled.
    post.aiGenerated = old.aiGenerated || post.aiGenerated;
    const sourceChanged = post.sourceIds.some(
      (id) =>
        JSON.stringify(next.sources.find((s) => s.id === id)) !==
        JSON.stringify(previous.sources.find((s) => s.id === id)),
    );
    const productChanged =
      !!post.productId &&
      product?.revision !== previous.catalog.find((p) => p.id === post.productId)?.revision;
    if (
      JSON.stringify(post) === JSON.stringify(old) &&
      !brandChanged &&
      !sourceChanged &&
      !productChanged
    ) {
      if (["approved", "planned"].includes(post.status)) {
        const issues = approvalIssues(post, next, today(now));
        // Promotions may expire between saves; send affected posts back to review.
        if (issues.length) {
          post.status = "review";
          post.checks = { facts: false, rights: false, brand: false };
          event("Aprobación invalidada", issues.join(" "), post.id);
        }
      }
      continue;
    }
    if (old.demo !== post.demo)
      throw new WorkflowError("Duplica un ejemplo para crear contenido real.");
    const contentChanged = editorial(old) !== editorial(post);
    const invalidated = contentChanged || brandChanged || sourceChanged || productChanged;
    if (
      old.status === "published" &&
      (contentChanged || post.status !== "published" || post.publishedUrl !== old.publishedUrl)
    )
      throw new WorkflowError(
        "Duplica la publicación ya registrada para preparar una nueva versión.",
      );
    if (invalidated && old.status !== "published") {
      post.checks = { facts: false, rights: false, brand: false };
      if (["approved", "planned"].includes(old.status)) {
        post.status = "review";
        event(
          "Aprobación invalidada",
          `«${post.title}» cambió de contenido, producto, fuente o criterios. Revisa la nueva versión.`,
          post.id,
        );
      } else if (post.status === "approved")
        throw new WorkflowError("Guarda los cambios antes de aprobar esta nueva versión.");
    }
    if (!moves[old.status].includes(post.status))
      throw new WorkflowError(
        "Ese cambio de estado no está permitido. Sigue el flujo de revisión.",
      );
    if (["approved", "planned"].includes(post.status)) {
      const issues = approvalIssues(post, next, today(now));
      if (issues.length) throw new WorkflowError(issues.join(" "));
    }
    if (post.status === "planned" && !post.plannedAt)
      throw new WorkflowError("Selecciona una fecha y hora previstas.");
    if (post.status === "rejected" && old.status !== "rejected" && !post.rejectionReason.trim())
      throw new WorkflowError(
        "Explica el motivo del rechazo para conservarlo en la memoria editorial.",
      );
    if (post.status === "published" && old.status !== "published") {
      const issues = approvalIssues(post, next, today(now));
      if (issues.length) throw new WorkflowError(issues.join(" "));
      if (!socialUrl(post.publishedUrl, post.channel))
        throw new WorkflowError("Pega el enlace https de la publicación en la red seleccionada.");
    }
    post.updatedAt = at;
    if (
      old.status !== post.status &&
      !(["approved", "planned"].includes(old.status) && invalidated)
    ) {
      const title = {
        review: "Enviado a revisión",
        approved: "Versión aprobada",
        planned: "Fecha prevista guardada",
        published: "Publicación manual registrada",
        rejected: "Borrador rechazado",
        draft: "Regresó a borrador",
      }[post.status];
      event(
        title,
        post.status === "rejected" ? `${post.title}: ${post.rejectionReason}` : post.title,
        post.id,
      );
    } else if (contentChanged) event("Borrador editado", post.title, post.id);
    else if (sourceChanged && old.status !== "published")
      event(
        "Fuente actualizada",
        `Revisa de nuevo las comprobaciones de «${post.title}».`,
        post.id,
      );
  }
  for (const old of previous.posts)
    if (!next.posts.some((p) => p.id === old.id)) event("Borrador eliminado", old.title, old.id);
  next.history = next.history.slice(0, 10000);
  next.revision = previous.revision + 1;
  return workspaceSchema.parse(next);
}
