import { createElement as h, type CSSProperties, type ReactNode } from "react";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Diseñador de post sin IA: plantilla HTML (JSX de next/og, que trae Next) renderizada
 * en local a PNG 1080×1350. No sale nada a la red; las fuentes y el logo son archivos locales.
 */
export const ANCHO_POST = 1080;
export const ALTO_POST = 1350;
const AZUL = "#002f4b";
const DORADO = "#d6a92f";
const SUAVE = "#c9d8e4";

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

export function plantillaPost(d: DatosPost, logo: string | null) {
  const titulo = d.titulo.length > 110 ? `${d.titulo.slice(0, 107).trim()}…` : d.titulo;
  const fondo = d.fondo && /^image\/(png|jpeg)$/.test(d.fondo.mime) ? `data:${d.fondo.mime};base64,${d.fondo.bytes.toString("base64")}` : null;
  const capaCompleta: CSSProperties = { position: "absolute", top: 0, left: 0, width: ANCHO_POST, height: ALTO_POST };
  return div(
    { width: ANCHO_POST, height: ALTO_POST, position: "relative", background: AZUL, color: "#ffffff", fontFamily: "Spotmi" },
    fondo ? h("img", { src: fondo, width: ANCHO_POST, height: ALTO_POST, style: { ...capaCompleta, objectFit: "cover" } }) : null,
    fondo
      ? div({ ...capaCompleta, backgroundImage: "linear-gradient(180deg, rgba(0,47,75,0.45) 0%, rgba(0,47,75,0.88) 55%, rgba(0,47,75,1) 100%)" })
      : div({ ...capaCompleta, backgroundImage: "radial-gradient(circle at 85% 12%, rgba(214,169,47,0.18) 0%, rgba(0,47,75,0) 45%)" }),
    div(
      { position: "relative", flexDirection: "column", width: ANCHO_POST, height: ALTO_POST, padding: "80px 84px" },
      div(
        { alignItems: "center", gap: 18 },
        logo ? h("img", { src: logo, width: 66, height: 69 }) : null,
        div({ fontSize: 46, fontWeight: 700, letterSpacing: -1 }, "spotmi", h("span", { style: { color: DORADO } }, "·")),
      ),
      div(
        { flexDirection: "column", marginTop: "auto" },
        div({ fontSize: 30, letterSpacing: 8, color: DORADO, fontWeight: 700 }, d.semana.toUpperCase()),
        div(
          { alignItems: "flex-end", gap: 30 },
          div({ fontSize: 300, fontWeight: 700, lineHeight: 0.9, letterSpacing: -12 }, d.dia),
          div({ fontSize: 58, fontWeight: 700, color: DORADO, marginBottom: 34, letterSpacing: 2 }, d.mes.toUpperCase()),
        ),
        div({ fontSize: tamanoTitulo(titulo), fontWeight: 700, lineHeight: 1.06, marginTop: 34, letterSpacing: -1.5 }, titulo),
        div({ fontSize: 36, color: SUAVE, marginTop: 30, lineHeight: 1.3 }, [d.lugar, d.hora].filter(Boolean).join(" · ")),
      ),
      div({ marginTop: 52, paddingTop: 26, borderTop: `2px solid rgba(201,216,228,0.25)`, fontSize: 28, color: SUAVE }, "Más info en spotmi.com.sv"),
    ),
  );
}

export async function renderizarPost(d: DatosPost): Promise<Buffer> {
  const { fuentes, logo } = await recursos();
  const respuesta = new ImageResponse(plantillaPost(d, logo), {
    width: ANCHO_POST,
    height: ALTO_POST,
    ...(fuentes.length ? { fonts: fuentes } : {}),
  });
  return Buffer.from(await respuesta.arrayBuffer());
}
/** Ancho y alto leídos de la cabecera PNG (IHDR). */
export function medidasPng(bytes: Buffer) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
}
