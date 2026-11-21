/** Partes del encargo «Videos virales» que sirven igual en el navegador y en el servidor (sin red). */
export const periodosVirales = [7, 30, 90, 365, 0] as const;
export type PeriodoViral = (typeof periodosVirales)[number];

/** El texto del encargo: el tema va primero; el período viaja en una línea legible «Período: …». */
export function textoPedidoViral(tema: string, dias: PeriodoViral) {
  return `${tema.trim()}\n\nPeríodo: ${dias ? `últimos ${dias} días` : "sin límite de fecha"}`;
}
export function leerPedidoViral(texto: string): { tema: string; dias: PeriodoViral } {
  const lineas = texto.split("\n");
  const periodo = lineas.find((l) => /^período:/i.test(l.trim())) ?? "";
  const n = Number(/(\d+)\s*d[ií]as/i.exec(periodo)?.[1] ?? NaN);
  const dias = (periodosVirales as readonly number[]).includes(n) ? (n as PeriodoViral) : periodo ? 0 : 30;
  const tema = lineas
    .filter((l) => !/^período:/i.test(l.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return { tema, dias };
}

const compacto = new Intl.NumberFormat("es-SV", { notation: "compact", maximumFractionDigits: 1 });
export const cifra = (n: number) => compacto.format(n);
export const duracionTexto = (s: number | null) =>
  s === null ? "" : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
export const urlVideo = (id: string) => `https://www.youtube.com/watch?v=${id}`;
