import { existsSync } from "node:fs";

/** ffmpeg de esta máquina: Homebrew en Mac (Apple o Intel) o /usr/bin en Linux (el contenedor de Docker). */
export const rutaFfmpeg =
  ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"].find((r) =>
    existsSync(r),
  ) ?? "/opt/homebrew/bin/ffmpeg";
export const hayFfmpeg = existsSync(rutaFfmpeg);
