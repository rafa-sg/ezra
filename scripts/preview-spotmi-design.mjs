import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "work/spotmi-design");
await mkdir(output, { recursive: true });
await build({
  entryPoints: [path.join(root, "docs/design/spotmi/prototype.tsx")],
  bundle: true,
  outfile: path.join(output, "app.js"),
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
await writeFile(
  path.join(output, "index.html"),
  `<!doctype html>
<html lang="es-SV"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Spotmi en ezrá · Propuesta de diseño</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js" defer></script></body></html>`,
);
const files = {
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/app.css": ["app.css", "text/css"],
};
const server = createServer(async (request, response) => {
  const file = files[new URL(request.url || "/", "http://127.0.0.1").pathname];
  if (request.method !== "GET" || !file) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    response.writeHead(200, {
      "Content-Type": `${file[1]}; charset=utf-8`,
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(await readFile(path.join(output, file[0])));
  } catch {
    response.end("Preview unavailable");
  }
});
server.listen(4177, "127.0.0.1", () => {
  process.stdout.write("Spotmi design: http://127.0.0.1:4177\n");
});
server.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
