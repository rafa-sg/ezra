"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, ImageIcon } from "lucide-react";
import { businessApiUrl, formatLabels, type CatalogProduct, type Post } from "@/lib/model";
import {
  campaignIssues,
  catalogContent,
  formatPrice,
  postFormat,
  productPrice,
  promotionStatus,
  promotionStatusLabels,
  variantPhotos,
} from "@/lib/catalog";
import { Checkline, Dialog } from "./ui";

const steps = ["Variante y fotos", "Promoción", "Redes", "Revisión"] as const;
const channelNames: Record<Post["channel"], string> = {
  instagram: "Instagram",
  facebook: "Facebook",
};

/**
 * Catalog → product → variant → promotion → channels → review. It only prepares
 * drafts; approval, export and any publishing happen later, per version.
 */
export function CampaignWizard({
  product,
  businessId,
  busy,
  onClose,
  onCreate,
}: {
  product: CatalogProduct;
  businessId: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (variantId: string, channels: Post["channel"][], mediaIds: string[]) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [variantId, setVariantId] = useState(product.variants[0].id);
  const [mediaIds, setMediaIds] = useState(() => variantPhotos(product, product.variants[0].id));
  const [channels, setChannels] = useState<Post["channel"][]>(() =>
    variantPhotos(product, product.variants[0].id).length
      ? ["instagram", "facebook"]
      : ["facebook"],
  );
  const photos = variantPhotos(product, variantId);
  const price = productPrice(product, variantId);
  const promo = promotionStatus(product);
  const content = catalogContent(product, variantId);
  const issues = campaignIssues(product, variantId, mediaIds, channels);
  const thumb = (id: string) => businessApiUrl(`/api/media/${id}`, businessId);
  const chooseVariant = (id: string) => {
    setVariantId(id);
    const next = variantPhotos(product, id);
    setMediaIds(next);
    if (!next.length) setChannels((c) => c.filter((x) => x !== "instagram"));
  };
  const toggleMedia = (id: string, on: boolean) => {
    const next = on ? [...mediaIds, id] : mediaIds.filter((m) => m !== id);
    setMediaIds(next);
    if (!next.length) setChannels((c) => c.filter((x) => x !== "instagram"));
  };
  const canContinue = step !== 2 || channels.length > 0;
  return (
    <Dialog
      title="Crear publicación del producto"
      subtitle={product.name}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="wizard">
        <ol className="wizard-steps" aria-label="Pasos para crear la publicación">
          {steps.map((label, index) => (
            <li
              key={label}
              className={index === step ? "current" : index < step ? "done" : ""}
              aria-current={index === step ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="wizard-panel" aria-label="Variante y fotos">
            <fieldset>
              <legend>¿Qué variante quieres publicar?</legend>
              <div className="variant-options">
                {product.variants.map((v) => {
                  const own = variantPhotos(product, v.id);
                  const vPrice = productPrice(product, v.id);
                  return (
                    <label
                      key={v.id}
                      className={`variant-option ${variantId === v.id ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="variant"
                        checked={variantId === v.id}
                        onChange={() => chooseVariant(v.id)}
                      />
                      {own[0] ? (
                        <img src={thumb(own[0])} alt="" />
                      ) : (
                        <span className="variant-nophoto">
                          <ImageIcon size={20} />
                        </span>
                      )}
                      <span>
                        <strong>{[v.name, v.color].filter(Boolean).join(" · ")}</strong>
                        <small>
                          {vPrice.final === null
                            ? "Precio por confirmar"
                            : formatPrice(vPrice.final)}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <fieldset>
              <legend>Fotos que irán en la publicación</legend>
              {photos.length ? (
                <div className="media-select">
                  {photos.map((id) => (
                    <label
                      key={id}
                      className={`media-option ${mediaIds.includes(id) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={mediaIds.includes(id)}
                        onChange={(e) => toggleMedia(id, e.target.checked)}
                      />
                      <img src={thumb(id)} alt="Foto del producto" />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="field-hint">
                  Esta variante no tiene fotos. Agrégalas desde «Editar» en el catálogo; sin fotos
                  solo se puede preparar Facebook como texto.
                </p>
              )}
            </fieldset>
          </section>
        )}

        {step === 1 && (
          <section className="wizard-panel" aria-label="Promoción">
            <div className={`promo-summary ${promo}`}>
              <strong>{promotionStatusLabels[promo]}</strong>
              {price.final !== null ? (
                <p className="catalog-price">
                  {formatPrice(price.final)}
                  {price.active && price.original !== null && (
                    <s className="muted"> {formatPrice(price.original)}</s>
                  )}
                </p>
              ) : (
                <p className="muted">Precio por confirmar</p>
              )}
              {product.promotion.kind !== "none" && (
                <p className="field-hint">
                  {product.promotion.kind === "percentage"
                    ? `${product.promotion.value}% de descuento`
                    : `${formatPrice(product.promotion.value)} de descuento`}
                  {product.promotion.startsOn &&
                    ` · del ${product.promotion.startsOn} al ${product.promotion.endsOn}`}
                  {product.promotion.conditions && ` · ${product.promotion.conditions}`}
                </p>
              )}
            </div>
            <p className="info-note">
              La promoción sale del catálogo verificado. Para cambiarla, cierra este asistente y usa
              «Editar» en el producto; así la aprobación queda ligada a esos datos.
            </p>
          </section>
        )}

        {step === 2 && (
          <section className="wizard-panel" aria-label="Redes">
            <fieldset>
              <legend>¿Para qué redes preparamos borradores?</legend>
              {(["instagram", "facebook"] as const).map((channel) => {
                const blocked = channel === "instagram" && !mediaIds.length;
                return (
                  <Checkline
                    key={channel}
                    checked={channels.includes(channel)}
                    onChange={(checked) => {
                      if (busy || blocked) return;
                      setChannels(
                        checked ? [...channels, channel] : channels.filter((c) => c !== channel),
                      );
                    }}
                  >
                    {channelNames[channel]}
                    {blocked && " · necesita al menos una foto"}
                  </Checkline>
                );
              })}
            </fieldset>
            <p className="info-note">
              Cada red tendrá su propio borrador, revisión y exportación. Aún no se publica en las
              cuentas: eso llegará al conectar las redes oficiales.
            </p>
          </section>
        )}

        {step === 3 && (
          <section className="wizard-panel" aria-label="Revisión">
            {!!issues.length && (
              <ul className="wizard-issues" aria-label="Avisos antes de preparar">
                {issues.map((issue) => (
                  <li key={issue}>
                    <CircleAlert size={15} aria-hidden="true" />
                    {issue}
                  </li>
                ))}
              </ul>
            )}
            <div className="wizard-previews">
              {channels.map((channel) => (
                <article key={channel} className="wizard-preview">
                  <header>
                    <strong>{channelNames[channel]}</strong>
                    <span className="badge neutral-badge">
                      {formatLabels[postFormat(mediaIds.length)]}
                    </span>
                  </header>
                  {!!mediaIds.length && (
                    <div className="wizard-thumbs">
                      {mediaIds.map((id) => (
                        <img key={id} src={thumb(id)} alt="" />
                      ))}
                    </div>
                  )}
                  <p className="wizard-caption">{content.caption}</p>
                </article>
              ))}
            </div>
            <p className="field-hint">
              Se crearán borradores. Revisa y aprueba cada uno antes de exportarlo.
            </p>
          </section>
        )}

        <div className="wizard-footer">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => (step ? setStep(step - 1) : onClose())}
          >
            {step ? <ArrowLeft size={16} /> : null}
            {step ? "Atrás" : "Cancelar"}
          </button>
          {step < steps.length - 1 ? (
            <button
              className="button primary"
              disabled={busy || !canContinue}
              onClick={() => setStep(step + 1)}
            >
              Siguiente
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="button primary"
              disabled={busy || !channels.length}
              onClick={() => void onCreate(variantId, channels, mediaIds)}
            >
              {busy
                ? "Preparando…"
                : `Preparar ${channels.length} borrador${channels.length === 1 ? "" : "es"}`}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
