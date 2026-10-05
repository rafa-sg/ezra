import type { CSSProperties } from "react";
import type { Workspace } from "./model";

// Per-business appearance. Only CSS variables change; layout and behavior stay
// the same for every business.
const hex = /^#[0-9a-f]{6}$/i;
const rgb = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
const toHex = (values: number[]) =>
  `#${values
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
function luminance(color: string) {
  const [r, g, b] = rgb(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio between two colors. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const mix = (color: string, other: string, amount: number) => {
  const [a, b] = [rgb(color), rgb(other)];
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
};
/** Darkens a color until white text on it reaches 4.5:1 (readable buttons). */
export function readableOnWhite(color: string) {
  let next = color;
  for (let i = 0; i < 20 && contrast(next, "#ffffff") < 4.5; i++) next = mix(next, "#000000", 0.06);
  return next;
}

export function themeStyle(appearance: Workspace["appearance"]): CSSProperties | undefined {
  if (!hex.test(appearance.primary)) return undefined;
  const primary = readableOnWhite(appearance.primary);
  const secondary = hex.test(appearance.secondary) ? appearance.secondary : primary;
  return {
    "--violet": primary,
    "--violet-dark": mix(primary, "#000000", 0.18),
    "--lilac": mix(appearance.primary, "#ffffff", 0.88),
    "--brand-secondary": secondary,
  } as CSSProperties;
}
