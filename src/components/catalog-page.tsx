"use client";
import { useState } from "react";
import { ImageIcon, Plus, Search, Upload } from "lucide-react";
import {
  businessApiUrl,
  today,
  type Business,
  type CatalogProduct,
  type Post,
  type Workspace,
} from "@/lib/model";
import {
  createCatalogPosts,
  formatPrice,
  newProduct,
  productKindLabels,
  productPrice,
} from "@/lib/catalog";
import { Checkline, Dialog, Empty } from "./ui";
import type { Commit, UploadFile } from "./editor";
import { CampaignWizard } from "./campaign-wizard";

function cents(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error("Usa precios positivos con hasta dos decimales.");
  const [whole, decimal = ""] = text.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
const dollars = (value: number | null) => (value === null ? "" : (value / 100).toFixed(2));
export function CatalogPage({
  state,
  business,
  busy,
  commit,
  upload,
  open,
  notify,
}: {
  state: Workspace;
  business: Business;
  busy: boolean;
  commit: Commit;
  upload: UploadFile;
  open: (post: Post) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [campaign, setCampaign] = useState<CatalogProduct | null>(null);
  const defaultKind =
    business.type === "food"
      ? "food"
      : business.type === "rental"
        ? "rental"
        : business.type === "retail"
          ? "retail"
          : "motorcycle";
  const filtered = state.catalog.filter((p) =>
    `${p.name} ${p.brand} ${p.model} ${p.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LA BASE DE TU CONTENIDO</p>
          <h1>Catálogo de la comercial</h1>
          <p>Productos, variantes y promociones verificados para preparar tus publicaciones.</p>
        </div>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => setEditing(newProduct(defaultKind))}
        >
          <Plus size={17} />
          Agregar producto
        </button>
      </div>
      <div className="filter-bar">
        <p className="muted">
          {state.catalog.length} productos · {state.catalog.filter((p) => p.verified).length}{" "}
          verificados
        </p>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Buscar productos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Marca, modelo o artículo…"
          />
        </label>
      </div>
      <div className="catalog-grid">
        {filtered.map((product) => {
          const asset = state.media.find(
            (m) => product.mediaIds.includes(m.id) || product.variants[0].mediaIds.includes(m.id),
          );
          const price = productPrice(product, product.variants[0].id);
          return (
            <article className="catalog-card" key={product.id}>
              <div className="catalog-photo">
                {asset ? (
                  <img
                    src={businessApiUrl(`/api/media/${asset.id}`, state.businessId)}
                    alt={product.name}
                  />
                ) : (
                  <div className="product-placeholder">
                    <ImageIcon size={32} />
                    <span>Agrega una foto autorizada</span>
                  </div>
                )}
              </div>
              <div className="catalog-body">
                <div className="section-row">
                  <span className="badge neutral-badge">{productKindLabels[product.kind]}</span>
                  <span
                    className={`badge ${product.verified ? "status-approved" : "status-review"}`}
                  >
                    {product.verified ? "Verificado" : "Por verificar"}
                  </span>
                </div>
                <h2>{product.name}</h2>
                <p className="muted">
                  {[product.brand, product.model].filter(Boolean).join(" · ") ||
                    product.category ||
                    "Sin categoría"}
                </p>
                <strong className="catalog-price">
                  {price.final === null ? "Precio por confirmar" : formatPrice(price.final)}
                </strong>
                <p className="field-hint">
                  {product.variants.length} variante{product.variants.length === 1 ? "" : "s"}
                  {price.active ? " · Promoción vigente" : ""}
                </p>
                <div className="catalog-actions">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setEditing(product)}
                  >
                    Editar
                  </button>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => setCampaign(product)}
                  >
                    Crear publicación
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <Empty
          title={
            state.catalog.length
              ? "No hay productos con esta búsqueda"
              : "Empieza con tu primer producto"
          }
          description="Agrega una moto, casco, celular, electrodoméstico o mueble. Puedes usar fotos propias y un enlace de referencia para verificar los datos."
          action={
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setEditing(newProduct(defaultKind))}
            >
              Agregar producto
            </button>
          }
        />
      )}
      {editing && (
        <ProductEditor
          key={editing.id}
          initial={editing}
          state={state}
          busy={busy}
          commit={commit}
          upload={upload}
          onClose={() => setEditing(null)}
          notify={notify}
        />
      )}
      {campaign && (
        <CampaignWizard
          product={campaign}
          businessId={state.businessId}
          busy={busy}
          onClose={() => setCampaign(null)}
          onCreate={async (variant, channels, mediaIds) => {
            let posts;
            try {
              posts = createCatalogPosts(campaign, variant, channels, mediaIds);
            } catch (e) {
              notify(e instanceof Error ? e.message : "No se pudo preparar.", true);
              return;
            }
            const next = await commit((draft) => {
              draft.posts.unshift(...posts);
            });
            if (next) {
              setCampaign(null);
              notify(
                `${posts.length} borrador${posts.length === 1 ? "" : "es"} preparado${posts.length === 1 ? "" : "s"}. Revisa y aprueba cada versión antes de exportar.`,
              );
              open(next.posts.find((p) => p.id === posts[0].id)!);
            }
          }}
        />
      )}
    </>
  );
}
function ProductEditor({
  initial,
  state,
  busy,
  commit,
  upload,
  onClose,
  notify,
}: {
  initial: CatalogProduct;
  state: Workspace;
  busy: boolean;
  commit: Commit;
  upload: UploadFile;
  onClose: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [product, setProduct] = useState(initial);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState<"owned" | "licensed">("owned");
  const [attribution, setAttribution] = useState("");
  const set = <K extends keyof CatalogProduct>(key: K, value: CatalogProduct[K]) =>
    setProduct((p) => ({ ...p, [key]: value }));
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const text = (name: string) => String(form.get(name) || "").trim();
      const nextProduct = {
        ...product,
        name: text("name"),
        category: text("category"),
        brand: text("brand"),
        model: text("model"),
        sku: text("sku"),
        description: text("description"),
        sourceUrl: text("sourceUrl"),
        priceCents: cents(form.get("price")),
        verifiedOn: product.verified ? today() : "",
        variants: product.variants.map((v) => ({
          ...v,
          name: text(`name-${v.id}`),
          color: text(`color-${v.id}`),
          priceCents: cents(form.get(`price-${v.id}`)),
        })),
        promotion:
          product.promotion.kind === "none"
            ? { kind: "none" as const, value: 0, startsOn: "", endsOn: "", conditions: "" }
            : {
                ...product.promotion,
                value:
                  product.promotion.kind === "fixed"
                    ? cents(form.get("discount")) || 0
                    : Number(text("discount")),
                startsOn: text("startsOn"),
                endsOn: text("endsOn"),
                conditions: text("conditions"),
              },
      };
      const next = await commit((draft) => {
        const index = draft.catalog.findIndex((p) => p.id === product.id);
        if (index < 0) draft.catalog.unshift(nextProduct);
        else draft.catalog[index] = nextProduct;
      });
      if (next) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisa el producto.");
    }
  }
  function photos(ids: string[], change: (ids: string[]) => void) {
    return (
      <div className="media-select">
        {state.media
          .filter((m) => m.mime.startsWith("image/"))
          .map((m) => (
            <label className={`media-option ${ids.includes(m.id) ? "selected" : ""}`} key={m.id}>
              <input
                type="checkbox"
                checked={ids.includes(m.id)}
                disabled={busy}
                onChange={(e) =>
                  change(e.target.checked ? [...ids, m.id] : ids.filter((id) => id !== m.id))
                }
              />
              <img src={businessApiUrl(`/api/media/${m.id}`, state.businessId)} alt="" />
              <span>{m.originalName}</span>
            </label>
          ))}
      </div>
    );
  }
  return (
    <Dialog
      title={initial.name ? "Editar producto" : "Agregar producto"}
      subtitle="Guarda datos reales. Las fotos y los enlaces son referencias que debes verificar."
      wide
      onClose={() => {
        if (!busy && window.confirm("¿Cerrar el producto? Los cambios sin guardar se perderán."))
          onClose();
      }}
    >
      <form className="form-stack" onSubmit={save}>
        <fieldset disabled={busy} className="catalog-fields">
          <div className="form-row">
            <label>
              Tipo
              <select
                value={product.kind}
                onChange={(e) => set("kind", e.target.value as CatalogProduct["kind"])}
              >
                {Object.entries(productKindLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nombre del producto
              <input
                name="name"
                defaultValue={product.name}
                required
                maxLength={160}
                placeholder="Ej. Moto Honda CB125F"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Marca
              <input
                name="brand"
                defaultValue={product.brand}
                maxLength={100}
                placeholder="Honda, Yamaha, Katana…"
              />
            </label>
            <label>
              Modelo
              <input name="model" defaultValue={product.model} maxLength={100} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Categoría
              <input
                name="category"
                defaultValue={product.category}
                maxLength={100}
                placeholder="Motos, cascos, celulares, muebles…"
              />
            </label>
            <label>
              Código interno / SKU
              <input name="sku" defaultValue={product.sku} maxLength={100} />
            </label>
          </div>
          <label>
            Descripción verificada
            <textarea
              name="description"
              defaultValue={product.description}
              maxLength={2000}
              rows={3}
            />
          </label>
          {product.kind === "motorcycle" && (
            <div className="form-row">
              <label>
                Año (si está verificado)
                <input
                  inputMode="numeric"
                  maxLength={4}
                  pattern="(19[5-9][0-9]|20[0-9]{2})"
                  value={product.details.year}
                  onChange={(e) =>
                    set("details", { ...product.details, year: e.target.value.trim() })
                  }
                  placeholder="Ej. 2026"
                />
              </label>
              <label>
                Cilindrada (cc)
                <input
                  type="number"
                  min="1"
                  max="5000"
                  step="1"
                  value={product.details.engineCc ?? ""}
                  onChange={(e) =>
                    set("details", {
                      ...product.details,
                      engineCc: e.target.value ? Math.round(Number(e.target.value)) : null,
                    })
                  }
                  placeholder="Ej. 125"
                />
              </label>
            </div>
          )}
          <label>
            Especificaciones verificadas (opcional)
            <textarea
              value={product.details.specs}
              maxLength={1000}
              rows={2}
              onChange={(e) => set("details", { ...product.details, specs: e.target.value })}
              placeholder="Solo lo que confirmaste en la ficha del fabricante o con el negocio."
            />
          </label>
          {product.kind !== "food" && (
            <div className="variant-box">
              <label>
                Financiamiento (opcional)
                <textarea
                  value={product.details.financing}
                  maxLength={500}
                  rows={2}
                  onChange={(e) =>
                    set("details", {
                      ...product.details,
                      financing: e.target.value,
                      financingApproved: e.target.value.trim()
                        ? product.details.financingApproved
                        : false,
                    })
                  }
                  placeholder="Ej. prima, cuotas y condiciones exactas que te dio el negocio."
                />
              </label>
              <Checkline
                checked={product.details.financingApproved}
                onChange={(checked) =>
                  set("details", {
                    ...product.details,
                    financingApproved: checked && !!product.details.financing.trim(),
                  })
                }
              >
                El negocio aprobó publicar este financiamiento
              </Checkline>
              <span className="field-hint">
                Sin esta aprobación, el financiamiento no aparece en ninguna publicación.
              </span>
            </div>
          )}
          <div className="form-row">
            <label>
              Precio base (USD)
              <input
                name="price"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                defaultValue={dollars(product.priceCents)}
                placeholder="Deja vacío si falta confirmar"
              />
            </label>
            <label>
              Disponibilidad
              <select
                value={product.availability}
                onChange={(e) =>
                  set("availability", e.target.value as CatalogProduct["availability"])
                }
              >
                <option value="unknown">Por confirmar</option>
                <option value="available">Disponible</option>
                <option value="unavailable">No disponible</option>
              </select>
            </label>
          </div>
          <label>
            Enlace de referencia (opcional)
            <input
              name="sourceUrl"
              type="url"
              defaultValue={product.sourceUrl}
              placeholder="https://…"
              maxLength={2000}
            />
            <span className="field-hint">
              Se guarda el enlace. Debes consultarlo y verificar los datos; ezrá no extrae
              información ni imágenes automáticamente.
            </span>
          </label>
          <h3>Fotos del producto</h3>
          {photos(product.mediaIds, (ids) => set("mediaIds", ids))}
          <div className="upload-box">
            <div className="form-row">
              <label>
                Origen de la foto
                <select value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)}>
                  <option value="owned">Foto propia</option>
                  <option value="licensed">Foto autorizada / con licencia</option>
                </select>
              </label>
              <label>
                Nota de autorización
                <input
                  value={attribution}
                  onChange={(e) => setAttribution(e.target.value)}
                  maxLength={2000}
                />
              </label>
            </div>
            <label className="button secondary upload-button">
              <Upload size={16} />
              Subir foto
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (origin === "licensed" && !attribution.trim()) {
                    notify("Describe la autorización antes de subir la foto.", true);
                    return;
                  }
                  const asset = await upload(file, origin, attribution);
                  if (asset) setProduct((p) => ({ ...p, mediaIds: [...p.mediaIds, asset.id] }));
                }}
              />
            </label>
          </div>
          <div className="section-row">
            <h3>Variantes y colores</h3>
            <button
              type="button"
              className="text-button"
              disabled={product.variants.length >= 20}
              onClick={() =>
                set("variants", [
                  ...product.variants,
                  {
                    id: crypto.randomUUID(),
                    name: `Variante ${product.variants.length + 1}`,
                    color: "",
                    priceCents: null,
                    mediaIds: [],
                  },
                ])
              }
            >
              <Plus size={16} />
              Agregar variante
            </button>
          </div>
          {product.variants.map((variant, i) => (
            <section className="variant-box" key={variant.id}>
              <h4>Variante {i + 1}</h4>
              <div className="form-row">
                <label>
                  Nombre
                  <input
                    name={`name-${variant.id}`}
                    defaultValue={variant.name}
                    required
                    maxLength={100}
                  />
                </label>
                <label>
                  Color
                  <input name={`color-${variant.id}`} defaultValue={variant.color} maxLength={80} />
                </label>
                <label>
                  Precio propio (USD)
                  <input
                    name={`price-${variant.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    max="1000000"
                    defaultValue={dollars(variant.priceCents)}
                    placeholder="Usa precio base"
                  />
                </label>
              </div>
              <p className="field-hint">
                Selecciona fotos de este color. Sin selección, se usarán las fotos del producto.
              </p>
              {photos(variant.mediaIds, (ids) =>
                set(
                  "variants",
                  product.variants.map((v) => (v.id === variant.id ? { ...v, mediaIds: ids } : v)),
                ),
              )}
            </section>
          ))}
          <h3>Promoción</h3>
          <label>
            Tipo de descuento
            <select
              value={product.promotion.kind}
              onChange={(e) =>
                set("promotion", {
                  ...product.promotion,
                  kind: e.target.value as CatalogProduct["promotion"]["kind"],
                })
              }
            >
              <option value="none">Sin descuento</option>
              <option value="percentage">Porcentaje</option>
              <option value="fixed">Monto fijo en USD</option>
            </select>
          </label>
          {product.promotion.kind !== "none" && (
            <>
              <div className="form-row">
                <label>
                  {product.promotion.kind === "percentage" ? "Descuento (%)" : "Descuento (USD)"}
                  <input
                    key={product.promotion.kind}
                    name="discount"
                    type="number"
                    required
                    min="1"
                    step={product.promotion.kind === "percentage" ? "1" : "0.01"}
                    max={product.promotion.kind === "percentage" ? 100 : 1000000}
                    defaultValue={
                      product.promotion.kind === "fixed"
                        ? dollars(product.promotion.value)
                        : product.promotion.value || ""
                    }
                  />
                </label>
                <label>
                  Desde
                  <input
                    name="startsOn"
                    type="date"
                    defaultValue={product.promotion.startsOn}
                    required
                  />
                </label>
                <label>
                  Hasta
                  <input
                    name="endsOn"
                    type="date"
                    defaultValue={product.promotion.endsOn}
                    required
                  />
                </label>
              </div>
              <label>
                Condiciones
                <textarea
                  name="conditions"
                  defaultValue={product.promotion.conditions}
                  maxLength={1000}
                  rows={2}
                />
              </label>
            </>
          )}
          <Checkline checked={product.verified} onChange={(v) => set("verified", v)}>
            Verifiqué la identidad del producto, las fotos, los precios y las condiciones de la
            promoción.
          </Checkline>
          <p className="field-hint">
            Al guardar se registra la fecha de verificación de hoy. Cambiar el producto invalida la
            revisión de sus publicaciones pendientes.
          </p>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar producto"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
