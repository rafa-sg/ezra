import sharp from "sharp";

const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let cacheBytes = 0;
let active = 0;
const waiters: (() => void)[] = [];

/** Derivados efímeros: no escribe ni modifica los originales del propietario. */
export async function imageThumbnail(
  sourcePath: string,
  version: string,
  width: 160 | 480,
): Promise<Buffer> {
  const key = `${sourcePath}:${version}:${width}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const task = (async () => {
    // Como máximo dos conversiones simultáneas; las solicitudes repetidas comparten una.
    if (active >= 2) await new Promise<void>((resolve) => waiters.push(resolve));
    else active++;
    try {
      const bytes = await sharp(sourcePath, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 72, effort: 2 })
        .toBuffer();
      while (
        cache.size &&
        (cacheBytes + bytes.length > MAX_CACHE_BYTES || cache.size >= MAX_CACHE_ENTRIES)
      ) {
        const oldest = cache.keys().next().value!;
        cacheBytes -= cache.get(oldest)!.length;
        cache.delete(oldest);
      }
      if (bytes.length <= MAX_CACHE_BYTES) {
        cache.set(key, bytes);
        cacheBytes += bytes.length;
      }
      return bytes;
    } finally {
      const next = waiters.shift();
      if (next) next();
      else active--;
    }
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
