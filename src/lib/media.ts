import type { Media } from "./model";
import { WorkflowError } from "./workflow";

export function detectMedia(bytes: Buffer): { mime: Media["mime"]; ext: string } {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mime: "image/png", ext: "png" };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  if (
    bytes.toString("ascii", 4, 8) === "ftyp" &&
    ["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "dash"].includes(
      bytes.toString("ascii", 8, 12),
    )
  )
    return { mime: "video/mp4", ext: "mp4" };
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    return { mime: "video/webm", ext: "webm" };
  throw new WorkflowError(
    "Formato no compatible. Usa JPG, PNG, WebP, MP4 o WebM. Convierte HEIC, AVIF o MOV antes de subirlos.",
  );
}
export function byteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return null;
  return { start, end };
}
