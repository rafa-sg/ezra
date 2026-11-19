/**
 * «Desde $X»: el menor precio publicado en el texto de precio del evento.
 * «Gratis» solo si el texto lo dice y no trae montos. Sin precio: null («Precio por confirmar»).
 */
export type PrecioDesde = { tipo: "desde"; valor: number } | { tipo: "gratis" } | null;
const gratis = /\b(gratis|gratuit[oa]|entrada libre|sin costo|free)\b/;
const monto = /(?:us\s?\$|\$|usd)\s?(\d{1,5}(?:[.,]\d{1,2})?)|(\d{1,5}(?:[.,]\d{1,2})?)\s?(?:usd|d[oó]lares|\$)/g;
export function precioDesde(precio: string | null | undefined): PrecioDesde {
  if (!precio) return null;
  const t = precio.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const valores = [...t.matchAll(monto)].map((m) => Number((m[1] ?? m[2]).replace(",", "."))).filter((n) => Number.isFinite(n));
  if (valores.length) return { tipo: "desde", valor: Math.min(...valores) };
  return gratis.test(t) ? { tipo: "gratis" } : null;
}
export const textoPrecioDesde = (p: PrecioDesde) =>
  !p ? "Precio por confirmar" : p.tipo === "gratis" ? "Gratis" : `Desde $${Number.isInteger(p.valor) ? p.valor : p.valor.toFixed(2)}`;
