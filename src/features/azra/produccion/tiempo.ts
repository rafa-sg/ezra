/** «hace 12 min», «hace 3 h», «hace 2 días». */
export function haceCuanto(iso: string, tr: (clave: string) => string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  const h = Math.round(min / 60);
  const [clave, n] =
    min < 60
      ? ["ez_hace_min", min]
      : h < 48
        ? ["ez_hace_h", h]
        : ["ez_hace_dias", Math.round(h / 24)];
  return tr(clave).replace("{n}", String(n));
}
