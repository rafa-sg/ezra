import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

export function findLocalExecutable(
  name: string,
  configuredPath: string | undefined,
  fallbackDirectories: readonly string[],
): string | null {
  const windows = process.platform === "win32";
  const filename = windows ? `${name}.exe` : name;
  const searchPath = process.env.PATH ?? process.env.Path ?? "";
  const directories = searchPath
    .split(path.delimiter)
    .map((directory) => directory.trim().replace(/^"(.*)"$/, "$1"));
  const override = configuredPath?.trim();
  const candidates = override
    ? [override]
    : [...directories, ...fallbackDirectories]
        .filter((directory) => path.isAbsolute(directory))
        .map((directory) => path.join(directory, filename));

  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue;
    // These tools use spawn without a shell. Batch wrappers require a shell on Windows.
    if (windows && path.extname(candidate).toLowerCase() !== ".exe") continue;
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next installation.
    }
  }
  return null;
}

export function findVideoExecutable(name: "ffmpeg" | "ffprobe") {
  const configuredPath =
    process.env[name === "ffmpeg" ? "EZRA_FFMPEG_BIN" : "EZRA_FFPROBE_BIN"]?.trim();
  const fallback =
    process.platform === "win32" ? [] : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
  return findLocalExecutable(
    name,
    configuredPath ? path.resolve(configuredPath) : undefined,
    fallback,
  );
}
