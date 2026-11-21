import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ImageResponse } from "next/og";
import { WorkflowError } from "../workflow";
import { recursos, div } from "./diseno";
import { ejecutar, guardarMedio, herramientasVideo, rutaMedio, sondear, type Medio } from "./medios";
import type { ClipPropuesto, Subtitulo } from "./clips";

/**
 * Render de un clip vertical 1080×1920 a partir del video subido por el propietario (nunca de terceros).
 * El video ocupa el ancho sobre un fondo desenfocado del mismo video; los subtítulos y el gancho son
 * imágenes PNG (next/og) superpuestas con ffmpeg, siempre dentro de las zonas seguras de Shorts, Reels y TikTok.
 * No hace falta libass ni drawtext: funciona con el ffmpeg de Homebrew.
 */
export const ANCHO_CLIP = 1080;
export const ALTO_CLIP = 1920;
/** Márgenes que tapan los botones y textos de cada app (lo más restrictivo de las tres). */
export const ZONA_SEGURA = { arriba: 250, abajo: 480, izquierda: 90, derecha: 150 } as const;
export type Caja = { x: number; y: number; ancho: number; alto: number };
/** Franja de subtítulos: abajo del centro, por encima de la descripción y lejos de la columna de botones. */
export const CAJA_SUBTITULOS: Caja = {
  x: ZONA_SEGURA.izquierda,
  y: ALTO_CLIP - ZONA_SEGURA.abajo - 300,
  ancho: ANCHO_CLIP - ZONA_SEGURA.izquierda - ZONA_SEGURA.derecha,
  alto: 300,
};
/** Gancho de los primeros segundos, arriba, debajo de la barra de la app. */
export const CAJA_GANCHO: Caja = { x: ZONA_SEGURA.izquierda, y: ZONA_SEGURA.arriba, ancho: CAJA_SUBTITULOS.ancho, alto: 280 };
export const SEGUNDOS_GANCHO = 3;
export function dentroDeZonaSegura(c: Caja) {
  return (
    c.x >= ZONA_SEGURA.izquierda &&
    c.y >= ZONA_SEGURA.arriba &&
    c.x + c.ancho <= ANCHO_CLIP - ZONA_SEGURA.derecha &&
    c.y + c.alto <= ALTO_CLIP - ZONA_SEGURA.abajo
  );
}

/** Capas de texto del clip con su caja y su intervalo (segundos dentro del clip). */
export type Capa = { tipo: "gancho" | "subtitulo"; texto: string; inicio: number; fin: number; caja: Caja };
export function capasClip(clip: Pick<ClipPropuesto, "gancho" | "subtitulos" | "inicio" | "fin">): Capa[] {
  const dura = clip.fin - clip.inicio;
  const capas: Capa[] = [];
  if (clip.gancho.trim())
    capas.push({ tipo: "gancho", texto: clip.gancho.trim(), inicio: 0, fin: Math.min(SEGUNDOS_GANCHO, dura), caja: CAJA_GANCHO });
  for (const s of clip.subtitulos as Subtitulo[])
    if (s.inicio < dura && s.texto.trim())
      capas.push({ tipo: "subtitulo", texto: s.texto.trim(), inicio: Math.max(0, s.inicio), fin: Math.min(s.fin, dura), caja: CAJA_SUBTITULOS });
  // Como mucho 120 capas: ffmpeg encadena un overlay por capa.
  return capas.filter((c) => c.fin > c.inicio).slice(0, 120);
}

type Fuentes = Awaited<ReturnType<typeof recursos>>["fuentes"];
/** PNG transparente del tamaño de la caja con el texto centrado sobre un recuadro oscuro legible. */
export async function pngCapa(capa: Capa, fuentes: Fuentes): Promise<Buffer> {
  const gancho = capa.tipo === "gancho";
  const tamano = gancho ? (capa.texto.length <= 40 ? 66 : 54) : capa.texto.length <= 28 ? 62 : 54;
  const nodo = div(
    { width: capa.caja.ancho, height: capa.caja.alto, alignItems: gancho ? "flex-start" : "flex-end", justifyContent: "center" },
    div(
      {
        maxWidth: capa.caja.ancho,
        padding: gancho ? "22px 30px" : "14px 26px",
        borderRadius: 22,
        background: gancho ? "rgba(98, 75, 190, 0.92)" : "rgba(10, 12, 20, 0.78)",
        color: "#ffffff",
        fontFamily: "Spotmi",
        fontWeight: 700,
        fontSize: tamano,
        lineHeight: 1.18,
        textAlign: "center",
        justifyContent: "center",
      },
      capa.texto,
    ),
  );
  const r = new ImageResponse(nodo, { width: capa.caja.ancho, height: capa.caja.alto, ...(fuentes.length ? { fonts: fuentes } : {}) });
  return Buffer.from(await r.arrayBuffer());
}

/** Si el video tiene pista de audio (los clips sin audio llevan silencio para que las apps lo acepten). */
async function tieneAudio(archivo: string, ffprobe: string) {
  const salida = await ejecutar(ffprobe, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", archivo], 20_000);
  return salida.trim().length > 0;
}

/** Argumentos de ffmpeg para un clip (separado para probarlo sin ejecutar nada). */
export function argumentosClip(entrada: string, clip: { inicio: number; fin: number }, capas: { capa: Capa; archivo: string }[], audio: boolean, salida: string) {
  const dura = (clip.fin - clip.inicio).toFixed(2);
  const args = ["-y", "-v", "error", "-ss", clip.inicio.toFixed(2), "-t", dura, "-i", entrada];
  for (const { archivo } of capas) args.push("-i", archivo);
  if (!audio) args.push("-f", "lavfi", "-t", dura, "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  const filtros = [
    "[0:v]split=2[a][b]",
    `[a]scale=${ANCHO_CLIP}:${ALTO_CLIP}:force_original_aspect_ratio=increase,crop=${ANCHO_CLIP}:${ALTO_CLIP},boxblur=24:2,eq=brightness=-0.12[fondo]`,
    `[b]scale=${ANCHO_CLIP}:${ALTO_CLIP}:force_original_aspect_ratio=decrease[frente]`,
    "[fondo][frente]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30[v0]",
  ];
  capas.forEach(({ capa }, i) => {
    filtros.push(
      `[v${i}][${i + 1}:v]overlay=${capa.caja.x}:${capa.caja.y}:enable='between(t,${capa.inicio.toFixed(2)},${capa.fin.toFixed(2)})'[v${i + 1}]`,
    );
  });
  filtros.push(`[v${capas.length}]format=yuv420p[v]`);
  args.push(
    "-filter_complex", filtros.join(";"),
    "-map", "[v]",
    "-map", audio ? "0:a:0" : `${capas.length + 1}:a`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
    "-movflags", "+faststart", "-t", dura,
    salida,
  );
  return args;
}

/** Corta, pone en vertical y quema subtítulos y gancho. Guarda el clip como medio y lo comprueba con ffprobe. */
export async function renderizarClip(video: Medio, clip: ClipPropuesto, numero: number): Promise<Medio> {
  const { ffmpeg, ffprobe } = await herramientasVideo();
  if (!ffmpeg || !ffprobe) throw new WorkflowError("Falta FFmpeg en este equipo. Instálalo o configura EZRA_FFMPEG_BIN para renderizar.", 503);
  if (!video.mime.startsWith("video/")) throw new WorkflowError("El material no es un video.", 422);
  const carpeta = await mkdtemp(path.join(tmpdir(), "ezra-clip-"));
  try {
    const { fuentes } = await recursos();
    const capas = [];
    for (const [i, capa] of capasClip(clip).entries()) {
      const archivo = path.join(carpeta, `capa-${i}.png`);
      await writeFile(archivo, await pngCapa(capa, fuentes));
      capas.push({ capa, archivo });
    }
    const entrada = rutaMedio(video);
    const salida = path.join(carpeta, "clip.mp4");
    await ejecutar(ffmpeg, argumentosClip(entrada, clip, capas, await tieneAudio(entrada, ffprobe), salida), 10 * 60_000);
    const sonda = await sondear(salida);
    const dura = clip.fin - clip.inicio;
    if (!sonda.video || sonda.ancho !== ANCHO_CLIP || sonda.alto !== ALTO_CLIP || !sonda.duracion || Math.abs(sonda.duracion - dura) > 1.5)
      throw new WorkflowError("El render no produjo un clip vertical reproducible.", 502);
    return await guardarMedio(await readFile(salida), {
      nombre: `clip-${numero}.mp4`,
      procedencia: {
        origen: "render",
        nota: `Clip ${numero} (${clip.inicio.toFixed(1)}–${clip.fin.toFixed(1)} s) de «${video.nombre}», con subtítulos y gancho quemados.`,
        fuentes: [video.sha256],
        herramienta: "ffmpeg",
      },
      licencia: video.licencia,
      generado: video.generado,
      permiso: video.permiso ?? null,
    });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
