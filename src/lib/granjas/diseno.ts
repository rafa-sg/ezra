import { createElement as h, type CSSProperties, type ReactNode } from "react";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { disenoBase, paletas, type DisenoPost, type Paleta } from "./director";

/**
 * Diseñador de post sin IA: plantilla HTML (JSX de next/og, que trae Next) renderizada
 * en local a PNG 1080×1350. No sale nada a la red; las fuentes y el logo son archivos locales.
 */
export const ANCHO_POST = 1080;
export const ALTO_POST = 1350;

export type DatosPost = {
  dia: string;
  mes: string;
  semana: string;
  titulo: string;
  lugar: string;
  hora: string | null;
  fondo: { bytes: Buffer; mime: string } | null;
};
async function leerSiExiste(ruta: string) {
  try {
    return await readFile(ruta);
  } catch {
    return null;
  }
}
// Rutas locales: el empaquetador no debe rastrearlas.
const raiz = () => process.cwd();
async function recursos() {
  const regular = await leerSiExiste(path.join(/* turbopackIgnore: true */ raiz(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"));
  // Negrita del sistema (macOS); si no existe, todo queda en Geist regular.
  const negrita = await leerSiExiste("/System/Library/Fonts/Supplemental/Arial Bold.ttf");
  const logo = await leerSiExiste(path.join(/* turbopackIgnore: true */ raiz(), "assets/marca/spotmi-icono-blanco.png"));
  const fuentes: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] = [];
  const buffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  if (regular) fuentes.push({ name: "Spotmi", data: buffer(regular), weight: 400, style: "normal" });
  if (negrita) fuentes.push({ name: "Spotmi", data: buffer(negrita), weight: 700, style: "normal" });
  return { fuentes, logo: logo ? `data:image/png;base64,${logo.toString("base64")}` : null };
}
const tamanoTitulo = (t: string) => (t.length <= 26 ? 92 : t.length <= 48 ? 76 : t.length <= 75 ? 62 : 52);
const div = (style: CSSProperties, ...hijos: ReactNode[]) => h("div", { style: { display: "flex", ...style } }, ...hijos);
const capa: CSSProperties = { position: "absolute", top: 0, left: 0, width: ANCHO_POST, height: ALTO_POST };
const posicion = { arriba: "center top", centro: "center center", abajo: "center bottom" } as const;
/** Opacidad en hexadecimal para los degradados sobre la paleta. */
const alfa = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

function marca(logo: string | null, p: Paleta) {
  return div(
    { alignItems: "center", gap: 18 },
    logo && p.texto === "#ffffff" ? h("img", { src: logo, width: 66, height: 69 }) : null,
    div({ fontSize: 46, fontWeight: 700, letterSpacing: -1, color: p.texto }, "spotmi", h("span", { style: { color: p.acento } }, "·")),
  );
}
const pie = (p: Paleta, texto = "Más info en spotmi.com.sv") =>
  div({ marginTop: 52, paddingTop: 26, borderTop: `2px solid ${alfa(p.suave, 0.3)}`, fontSize: 28, color: p.suave }, texto);
/** Fecha grande, titular, lugar y hora: el bloque que comparten todos los estilos. */
function bloqueDatos(d: DatosPost, diseno: DisenoPost, p: Paleta, escala = 1) {
  const titulo = diseno.titular.length > 110 ? `${diseno.titular.slice(0, 107).trim()}…` : diseno.titular;
  return div(
    { flexDirection: "column" },
    div({ fontSize: 30, letterSpacing: 6, color: p.acento, fontWeight: 700 }, (diseno.gancho ? `${diseno.gancho} · ${d.semana}` : d.semana).toUpperCase()),
    div(
      { alignItems: "flex-end", gap: 30, color: p.texto },
      div({ fontSize: Math.round(300 * escala), fontWeight: 700, lineHeight: 0.9, letterSpacing: -12 * escala }, d.dia),
      div({ fontSize: Math.round(58 * escala), fontWeight: 700, color: p.acento, marginBottom: 34 * escala, letterSpacing: 2 }, d.mes.toUpperCase()),
    ),
    div({ fontSize: Math.round(tamanoTitulo(titulo) * escala), fontWeight: 700, lineHeight: 1.06, marginTop: 34 * escala, letterSpacing: -1.5, color: p.texto }, titulo),
    div({ fontSize: 36, color: p.suave, marginTop: 30 * escala, lineHeight: 1.3 }, [d.lugar, d.hora].filter(Boolean).join(" · ")),
  );
}

/** Portada del post según el diseño (por defecto, el aspecto de siempre: azul noche). */
export function plantillaPost(d: DatosPost, logo: string | null, diseno: DisenoPost = disenoBase({ titulo: d.titulo }, Boolean(d.fondo))) {
  const p = paletas[diseno.paleta];
  const fondo = d.fondo && /^image\/(png|jpeg)$/.test(d.fondo.mime) ? `data:${d.fondo.mime};base64,${d.fondo.bytes.toString("base64")}` : null;
  // Sin imagen autorizada no hay afiche ni panel: siempre tipográfico.
  const estilo = fondo ? diseno.estilo : "tipografico";
  const raiz = (...hijos: ReactNode[]) => div({ width: ANCHO_POST, height: ALTO_POST, position: "relative", background: p.fondo, color: p.texto, fontFamily: "Spotmi" }, ...hijos);
  if (estilo === "dividido" && fondo) {
    const alto = 700;
    return raiz(
      h("img", { src: fondo, width: ANCHO_POST, height: alto, style: { position: "absolute", top: 0, left: 0, width: ANCHO_POST, height: alto, objectFit: "cover", objectPosition: posicion[diseno.encuadre] } }),
      div({ position: "absolute", top: alto - 140, left: 0, width: ANCHO_POST, height: 140, backgroundImage: `linear-gradient(180deg, ${alfa(p.fondo, 0)} 0%, ${p.fondo} 100%)` }),
      div({ position: "absolute", top: 60, left: 84, padding: "14px 26px", borderRadius: 999, background: alfa(p.fondo, 0.85) }, marca(logo, p)),
      div(
        { position: "absolute", top: alto - 40, left: 0, width: ANCHO_POST, height: ALTO_POST - alto + 40, flexDirection: "column", padding: "0 84px 70px" },
        bloqueDatos(d, diseno, p, 0.62),
        div({ marginTop: "auto" }, pie(p)),
      ),
    );
  }
  return raiz(
    estilo === "afiche" && fondo ? h("img", { src: fondo, width: ANCHO_POST, height: ALTO_POST, style: { ...capa, objectFit: "cover", objectPosition: posicion[diseno.encuadre] } }) : null,
    estilo === "afiche" && fondo
      ? div({ ...capa, backgroundImage: `linear-gradient(180deg, ${alfa(p.fondo, 0.45)} 0%, ${alfa(p.fondo, 0.88)} 55%, ${p.fondo} 100%)` })
      : div({ ...capa, backgroundImage: `radial-gradient(circle at 85% 12%, ${alfa(p.acento, 0.18)} 0%, ${alfa(p.fondo, 0)} 45%)` }),
    div(
      { position: "relative", flexDirection: "column", width: ANCHO_POST, height: ALTO_POST, padding: "80px 84px" },
      marca(logo, p),
      div({ flexDirection: "column", marginTop: "auto" }, bloqueDatos(d, diseno, p)),
      pie(p),
    ),
  );
}

/** Lámina interior del carrusel: número, título y texto con la misma paleta. */
export function plantillaLamina(lamina: { titulo: string; texto: string }, numero: number, total: number, diseno: DisenoPost, logo: string | null) {
  const p = paletas[diseno.paleta];
  return div(
    { width: ANCHO_POST, height: ALTO_POST, position: "relative", background: p.fondo, color: p.texto, fontFamily: "Spotmi", flexDirection: "column", padding: "80px 84px" },
    div({ ...capa, backgroundImage: `radial-gradient(circle at 12% 88%, ${alfa(p.acento, 0.16)} 0%, ${alfa(p.fondo, 0)} 50%)` }),
    div({ justifyContent: "space-between", alignItems: "center", position: "relative" }, marca(logo, p), div({ fontSize: 30, color: p.suave, fontWeight: 700 }, `${numero}/${total}`)),
    div(
      { flexDirection: "column", marginTop: "auto", marginBottom: "auto", position: "relative" },
      div({ width: 120, height: 10, background: p.acento, borderRadius: 5, marginBottom: 48 }),
      div({ fontSize: lamina.titulo.length <= 28 ? 88 : 70, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5 }, lamina.titulo),
      div({ fontSize: 44, color: p.suave, lineHeight: 1.35, marginTop: 40 }, lamina.texto),
    ),
    div({ position: "relative", fontSize: 28, color: p.suave }, `${diseno.titular.slice(0, 60)} · desliza →`),
  );
}

/** Lámina final del carrusel: fecha, lugar y la invitación a Spotmi (la escribe Ezra, no la IA). */
export function plantillaCierre(d: DatosPost, numero: number, diseno: DisenoPost, logo: string | null) {
  const p = paletas[diseno.paleta];
  return div(
    { width: ANCHO_POST, height: ALTO_POST, position: "relative", background: p.fondo, color: p.texto, fontFamily: "Spotmi", flexDirection: "column", padding: "80px 84px" },
    div({ justifyContent: "space-between", alignItems: "center" }, marca(logo, p), div({ fontSize: 30, color: p.suave, fontWeight: 700 }, `${numero}/${numero}`)),
    div(
      { flexDirection: "column", marginTop: "auto", marginBottom: "auto" },
      div({ fontSize: 34, color: p.acento, fontWeight: 700, letterSpacing: 6 }, "TE ESPERAMOS"),
      div({ fontSize: 120, fontWeight: 700, lineHeight: 1, marginTop: 24, letterSpacing: -4 }, `${d.dia} de ${d.mes}`),
      div({ fontSize: 44, color: p.suave, marginTop: 28, lineHeight: 1.3 }, [d.semana, d.hora, d.lugar].filter(Boolean).join(" · ")),
      div({ fontSize: 54, fontWeight: 700, marginTop: 70 }, "Guarda este post y"),
      div({ fontSize: 54, fontWeight: 700, color: p.acento }, "encuentra más planes en spotmi."),
    ),
    pie(p, "spotmi.com.sv"),
  );
}

async function aPng(nodo: ReturnType<typeof div>, fuentes: Awaited<ReturnType<typeof recursos>>["fuentes"]) {
  const respuesta = new ImageResponse(nodo, { width: ANCHO_POST, height: ALTO_POST, ...(fuentes.length ? { fonts: fuentes } : {}) });
  return Buffer.from(await respuesta.arrayBuffer());
}
export async function renderizarPost(d: DatosPost, diseno?: DisenoPost): Promise<Buffer> {
  const { fuentes, logo } = await recursos();
  return aPng(plantillaPost(d, logo, diseno), fuentes);
}
/** Portada + láminas + cierre. Sin láminas, solo la portada (post de una imagen). */
export async function renderizarCarrusel(d: DatosPost, diseno: DisenoPost): Promise<Buffer[]> {
  const { fuentes, logo } = await recursos();
  const portada = await aPng(plantillaPost(d, logo, diseno), fuentes);
  if (!diseno.laminas.length) return [portada];
  const total = diseno.laminas.length + 2;
  const interiores = [];
  for (const [i, l] of diseno.laminas.entries()) interiores.push(await aPng(plantillaLamina(l, i + 2, total, diseno, logo), fuentes));
  return [portada, ...interiores, await aPng(plantillaCierre(d, total, diseno, logo), fuentes)];
}
/** Ancho y alto leídos de la cabecera PNG (IHDR). */
export function medidasPng(bytes: Buffer) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
}
