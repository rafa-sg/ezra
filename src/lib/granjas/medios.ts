import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { findVideoExecutable } from "../local-executable";
import { detectMedia } from "../media";
import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, carpetaMedios, json } from "./db";
import { sha256 } from "./huella";

export type ProcedenciaMedio = {
  origen: "subida" | "render" | "fuente" | "ia";
  nota: string;
  fuentes?: string[];
  herramienta?: string;
};
export type Medio = {
  id: string;
  sha256: string;
  mime: string;
  bytes: number;
  archivo: string;
  ancho: number | null;
  alto: number | null;
  duracion: number | null;
  procedencia: ProcedenciaMedio;
  licencia: string;
  generado: boolean;
  nombre: string;
  creado: string;
};
type FilaMedio = Omit<Medio, "procedencia" | "generado"> & { procedencia: string; generado: number };
const aMedio = (f: FilaMedio): Medio => ({ ...f, procedencia: json(f.procedencia, { origen: "subida", nota: "" }), generado: Boolean(f.generado) });

export const LIMITE_MEDIO = 200 * 1024 * 1024;

export const herramientasVideo = async () => ({
  ffmpeg: findVideoExecutable("ffmpeg"),
  ffprobe: findVideoExecutable("ffprobe"),
});

function ejecutar(binario: string, argumentos: string[], tiempo: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(binario, argumentos, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let salida = "";
    const reloj = setTimeout(() => proceso.kill("SIGKILL"), tiempo);
    proceso.stdout.on("data", (t: Buffer) => {
      if (salida.length < 200000) salida += t.toString();
    });
    proceso.stderr.on("data", () => {});
    proceso.on("error", () => {
      clearTimeout(reloj);
      reject(new WorkflowError("No se pudo abrir la herramienta de video.", 503));
    });
    proceso.on("close", (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) resolve(salida);
      else reject(new WorkflowError("La herramienta de video no terminó correctamente.", 502));
    });
  });
}

export type Sonda = { ancho: number | null; alto: number | null; duracion: number | null; video: boolean };
export async function sondear(archivo: string): Promise<Sonda> {
  const ffprobe = findVideoExecutable("ffprobe");
  if (!ffprobe) return { ancho: null, alto: null, duracion: null, video: false };
  const salida = await ejecutar(
    ffprobe,
    ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", archivo],
    20000,
  );
  const datos = json<{ streams?: { codec_type: string; width?: number; height?: number }[]; format?: { duration?: string } }>(salida, {});
  const video = datos.streams?.find((s) => s.codec_type === "video");
  const duracion = Number(datos.format?.duration);
  return {
    ancho: video?.width ?? null,
    alto: video?.height ?? null,
    duracion: Number.isFinite(duracion) ? duracion : null,
    video: Boolean(video),
  };
}

/** Archivo con suma de comprobación, procedencia y nota de permiso. Nunca se publica por sí solo. */
export async function guardarMedio(
  bytes: Buffer,
  datos: { nombre: string; procedencia: ProcedenciaMedio; licencia: string; generado: boolean },
): Promise<Medio> {
  if (bytes.length > LIMITE_MEDIO) throw new WorkflowError("El archivo supera 200 MB.", 413);
  const { mime, ext } = detectMedia(bytes);
  const suma = sha256(bytes);
  const existente = base().prepare("select * from medios where sha256 = ?").get(suma) as FilaMedio | undefined;
  if (existente) return aMedio(existente);
  const archivo = `${suma}.${ext}`;
  const destino = path.join(/* turbopackIgnore: true */ carpetaMedios, archivo);
  await writeFile(destino, bytes, { mode: 0o600, flag: "w" });
  const sonda = await sondear(destino).catch(() => ({ ancho: null, alto: null, duracion: null, video: false }));
  if (mime.startsWith("video/") && sonda.duracion !== null && sonda.duracion <= 0)
    throw new WorkflowError("El video no se pudo reproducir.", 422);
  const id = crypto.randomUUID();
  base()
    .prepare(
      `insert into medios (id, sha256, mime, bytes, archivo, ancho, alto, duracion, procedencia, licencia, generado, nombre, creado)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      suma,
      mime,
      bytes.length,
      archivo,
      sonda.ancho,
      sonda.alto,
      sonda.duracion,
      JSON.stringify(datos.procedencia),
      datos.licencia.slice(0, 1000),
      datos.generado ? 1 : 0,
      datos.nombre.slice(0, 200),
      ahoraIso(),
    );
  auditar("medio.guardar", id, { sha256: suma, mime, origen: datos.procedencia.origen });
  return leerMedio(id);
}
export function leerMedio(id: string): Medio {
  const fila = base().prepare("select * from medios where id = ?").get(id) as FilaMedio | undefined;
  if (!fila) throw new WorkflowError("Archivo no encontrado.", 404);
  return aMedio(fila);
}
export const rutaMedio = (medio: Medio) => path.join(/* turbopackIgnore: true */ carpetaMedios, path.basename(medio.archivo));
export async function leerBytesMedio(medio: Medio) {
  const bytes = await readFile(rutaMedio(medio));
  if (sha256(bytes) !== medio.sha256)
    throw new WorkflowError("El archivo guardado no coincide con su suma de comprobación.", 409);
  return bytes;
}
export function listarMedios(): Medio[] {
  return (base().prepare("select * from medios order by creado desc limit 500").all() as FilaMedio[]).map(aMedio);
}

/**
 * Render vertical 1080×1920 con ffmpeg a partir de medios guardados. Devuelve un MP4
 * reproducible y comprobado con ffprobe; sin herramienta, el paso queda bloqueado.
 */
export async function renderizarVertical(medios: Medio[], segundosPorImagen: number): Promise<Medio> {
  const { ffmpeg } = await herramientasVideo();
  if (!ffmpeg) throw new WorkflowError("Falta FFmpeg en este equipo. Instalalo o configurá EZRA_FFMPEG_BIN para renderizar.", 503);
  if (!medios.length) throw new WorkflowError("Conecta imágenes o videos para renderizar.", 422);
  if (medios.length > 20) throw new WorkflowError("El render admite hasta 20 archivos.", 422);
  const carpeta = await mkdtemp(path.join(tmpdir(), "ezra-render-"));
  const salida = path.join(carpeta, "render.mp4");
  try {
    const argumentos: string[] = ["-y", "-v", "error"];
    const filtros: string[] = [];
    medios.forEach((m, i) => {
      const imagen = m.mime.startsWith("image/");
      if (imagen) argumentos.push("-loop", "1", "-t", String(segundosPorImagen), "-i", rutaMedio(m));
      else argumentos.push("-t", "15", "-i", rutaMedio(m));
      filtros.push(
        `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0d1b2a,setsar=1,fps=30,format=yuv420p[v${i}]`,
      );
    });
    filtros.push(`${medios.map((_, i) => `[v${i}]`).join("")}concat=n=${medios.length}:v=1:a=0[v]`);
    argumentos.push(
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-filter_complex",
      filtros.join(";"),
      "-map",
      "[v]",
      "-map",
      `${medios.length}:a`,
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "21",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-t",
      "90",
      salida,
    );
    await ejecutar(ffmpeg, argumentos, 10 * 60 * 1000);
    const informacion = await stat(salida);
    if (!informacion.size) throw new WorkflowError("El render no produjo un archivo.", 502);
    const sonda = await sondear(salida);
    if (!sonda.video || !sonda.duracion || sonda.ancho !== 1080 || sonda.alto !== 1920)
      throw new WorkflowError("El render no produjo un video vertical reproducible.", 502);
    return await guardarMedio(await readFile(salida), {
      nombre: "render-vertical.mp4",
      procedencia: { origen: "render", nota: "Montaje local con ffmpeg a partir de medios guardados.", fuentes: medios.map((m) => m.sha256), herramienta: "ffmpeg" },
      licencia: [...new Set(medios.map((m) => m.licencia).filter(Boolean))].join(" · ").slice(0, 1000),
      generado: medios.some((m) => m.generado),
    });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

/** WebP → PNG para la plantilla del post (su renderizador solo acepta PNG y JPG). Sin ffmpeg, null. */
export async function convertirAPng(bytes: Buffer): Promise<Buffer | null> {
  const { ffmpeg } = await herramientasVideo();
  if (!ffmpeg) return null;
  const carpeta = await mkdtemp(path.join(tmpdir(), "ezra-png-"));
  try {
    await writeFile(path.join(carpeta, "entrada.webp"), bytes);
    await ejecutar(ffmpeg, ["-v", "error", "-y", "-i", path.join(carpeta, "entrada.webp"), "-frames:v", "1", path.join(carpeta, "salida.png")], 60_000);
    return await readFile(path.join(carpeta, "salida.png"));
  } catch {
    return null;
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
