import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Límites reales del plan de ChatGPT (ventana de 5 horas y semanal) tal como los informa el servidor
 * de OpenAI a Codex: cada sesión de Codex guarda eventos `token_count` con `rate_limits` en
 * ~/.codex/sessions/AAAA/MM/DD/*.jsonl. Se lee solo esa parte (porcentaje usado y cuándo se
 * restablece); nunca el contenido de las conversaciones, tokens de acceso ni datos de la cuenta.
 * Los datos son tan recientes como la última vez que se usó Codex (`actualizado`).
 */
export type VentanaCodex = { usado: number; ventanaMin: number | null; reanuda: string | null };
export type LimitesCodex = {
  cincoHoras: VentanaCodex | null;
  semanal: VentanaCodex | null;
  plan: string | null;
  actualizado: string;
};
type Ventana = {
  used_percent?: unknown;
  window_minutes?: unknown;
  resets_at?: unknown;
  resets_in_seconds?: unknown;
};

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
function ventana(v: Ventana | undefined, momento: Date, ahora: Date): VentanaCodex | null {
  if (!v || typeof v !== "object") return null;
  const usado = numero(v.used_percent);
  if (usado === null) return null;
  const en = numero(v.resets_at);
  const faltan = numero(v.resets_in_seconds);
  const reanuda =
    en !== null
      ? new Date(en < 1e12 ? en * 1000 : en)
      : faltan !== null
        ? new Date(momento.getTime() + faltan * 1000)
        : null;
  // Si ya pasó el reinicio y Codex no se ha vuelto a usar, la ventana está en cero de verdad.
  const vencida = reanuda !== null && reanuda.getTime() <= ahora.getTime();
  return {
    usado: vencida ? 0 : Math.max(0, Math.min(100, Math.round(usado * 10) / 10)),
    ventanaMin: numero(v.window_minutes),
    reanuda: vencida ? null : (reanuda?.toISOString() ?? null),
  };
}

/** Busca el evento `token_count` más reciente con `rate_limits` en una línea JSONL. */
export function leerLineaLimites(linea: string, ahora: Date = new Date()): LimitesCodex | null {
  if (!linea.includes("rate_limits")) return null;
  let dato: {
    timestamp?: string;
    type?: string;
    payload?: { type?: string; rate_limits?: Record<string, unknown> };
  };
  try {
    dato = JSON.parse(linea);
  } catch {
    return null;
  }
  const p = dato.payload;
  if (!p || p.type !== "token_count" || !p.rate_limits) return null;
  const momento = dato.timestamp ? new Date(dato.timestamp) : ahora;
  if (Number.isNaN(momento.getTime())) return null;
  const r = p.rate_limits as { primary?: Ventana; secondary?: Ventana; plan_type?: unknown };
  const cincoHoras = ventana(r.primary, momento, ahora);
  const semanal = ventana(r.secondary, momento, ahora);
  if (!cincoHoras && !semanal) return null;
  return {
    cincoHoras,
    semanal,
    plan: typeof r.plan_type === "string" ? r.plan_type : null,
    actualizado: momento.toISOString(),
  };
}

async function colaDeArchivo(archivo: string, bytes = 512 * 1024) {
  const f = await open(archivo, "r");
  try {
    const { size } = await f.stat();
    const desde = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - desde);
    await f.read(buffer, 0, buffer.length, desde);
    const texto = buffer.toString("utf8");
    // Si se cortó a la mitad, la primera línea queda incompleta: se descarta.
    return desde > 0 ? texto.slice(texto.indexOf("\n") + 1) : texto;
  } finally {
    await f.close();
  }
}
const subcarpetas = async (dir: string) =>
  (await readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse();

/** Últimos límites conocidos; null si Codex no está instalado o no ha guardado ninguno. */
export async function limitesCodex(
  opciones: { carpeta?: string; ahora?: Date; dias?: number } = {},
): Promise<LimitesCodex | null> {
  const ahora = opciones.ahora ?? new Date();
  const raiz =
    opciones.carpeta ??
    path.join(process.env.CODEX_HOME || path.join(homedir(), ".codex"), "sessions");
  // Las carpetas van por fecha: se revisan los días más recientes y, en cada uno, los archivos
  // modificados más tarde primero.
  const dias: string[] = [];
  for (const a of await subcarpetas(raiz))
    for (const m of await subcarpetas(path.join(raiz, a)))
      for (const d of await subcarpetas(path.join(raiz, a, m))) {
        dias.push(path.join(raiz, a, m, d));
        if (dias.length >= (opciones.dias ?? 7)) break;
      }
  const archivos: { ruta: string; mtime: number }[] = [];
  for (const dia of dias.slice(0, opciones.dias ?? 7)) {
    for (const nombre of await readdir(dia).catch(() => [] as string[])) {
      if (!nombre.endsWith(".jsonl")) continue;
      const ruta = path.join(dia, nombre);
      const info = await stat(ruta).catch(() => null);
      if (info) archivos.push({ ruta, mtime: info.mtimeMs });
    }
  }
  archivos.sort((a, b) => b.mtime - a.mtime);
  let mejor: LimitesCodex | null = null;
  for (const { ruta } of archivos.slice(0, 8)) {
    const lineas = (await colaDeArchivo(ruta).catch(() => "")).split("\n");
    for (let i = lineas.length - 1; i >= 0; i--) {
      const l = leerLineaLimites(lineas[i], ahora);
      if (l) {
        if (!mejor || l.actualizado > mejor.actualizado) mejor = l;
        break;
      }
    }
  }
  return mejor;
}
