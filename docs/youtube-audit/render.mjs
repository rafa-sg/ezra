/* global process, console */
// Renders the editable SVG diagrams to PNG (2250 px wide) with Chromium.
// Usage: node docs/youtube-audit/render.mjs [path to a node_modules with @playwright/test]
// Ezra has no Playwright dependency; by default it uses the one in ~/dev/spotmi-web.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const carpeta = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? path.join(process.env.HOME ?? "", "dev/spotmi-web/package.json");
const { chromium } = createRequire(base)("@playwright/test");
const navegador = await chromium.launch();
for (const nombre of ["architecture-diagram", "user-flow-diagram"]) {
  const svg = await readFile(path.join(carpeta, `${nombre}.svg`), "utf8");
  const [, ancho, alto] = /width="(\d+)" height="(\d+)"/.exec(svg);
  const pagina = await navegador.newPage({ viewport: { width: Number(ancho), height: Number(alto) }, deviceScaleFactor: 1.25 });
  await pagina.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
  await pagina.screenshot({ path: path.join(carpeta, `${nombre}.png`), clip: { x: 0, y: 0, width: Number(ancho), height: Number(alto) } });
  await pagina.close();
  console.log(`${nombre}.png`);
}
await navegador.close();
