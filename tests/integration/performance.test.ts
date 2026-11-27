import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { clerkTestEnvironment, sessionToken } from "../helpers/clerk-fixture";

test(
  "arranque independiente de IA, ficha bajo demanda y miniaturas privadas revalidadas",
  { timeout: 90_000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directory = await mkdtemp(path.resolve("work/performance-integration-"));
    const marker = path.join(directory, "local-tool-called");
    const binary = path.join(directory, "fake-local-tool");
    await writeFile(
      binary,
      `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(marker)}, "called");\nsetTimeout(() => process.exit(1), 3000);\n`,
      { mode: 0o700 },
    );
    const base = "http://127.0.0.1:3118";
    const owner = sessionToken("owner", base, 300);
    const request = (route: string, token = owner, init: RequestInit = {}) =>
      fetch(`${base}${route}`, {
        ...init,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
      });
    const server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3118"],
      {
        env: {
          ...process.env,
          ...(await clerkTestEnvironment(directory)),
          EZRA_DATA_DIR: directory,
          EZRA_GRANJAS_TRABAJADOR: "0",
          GEMINI_API_KEY: "",
          EZRA_PRODUCCION_IA: "0",
          EZRA_CODEX_BIN: binary,
          EZRA_CLAUDE_BIN: binary,
        },
        stdio: "pipe",
      },
    );
    let logs = "";
    server.stderr.on("data", (chunk) => {
      logs += chunk;
    });
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await request("/api/auth/session", "")).ok) {
            ready = true;
            break;
          }
        } catch {
          /* servidor de prueba arrancando */
        }
        if (server.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      assert.ok(ready, logs);
      assert.equal((await request("/api/produccion", "")).status, 401);
      const bootstrap = await request("/api/produccion");
      assert.equal(bootstrap.status, 200);
      assert.equal((await bootstrap.json()).conexiones.astraEstado, null);
      assert.ok(!existsSync(marker), "abrir el estudio no ejecuta Codex ni Claude");
      const sectionPage = await request("/azra/produccion?seccion=eventos");
      assert.equal(sectionPage.status, 200);
      assert.doesNotMatch(
        await sectionPage.text(),
        /class="ez-mp-puntos"/,
        "un enlace directo a Eventos no monta primero el mapa",
      );

      // Insertar un evento únicamente mediante la API manual; no lee la URL indicada.
      const pasted = await request("/api/granjas/eventos", owner, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "pegar_enlace",
          datos: {
            url: "https://www.instagram.com/p/fixture-perf/",
            titulo: "Evento de prueba de rendimiento",
            fecha: "2027-01-10",
            fechaFin: null,
            precio: null,
            boletosUrl: null,
            hora: "18:00",
            lugar: "Teatro de prueba",
            municipio: "San Salvador",
            departamento: "San Salvador",
            categoria: "cultura",
            descripcion: "Información de prueba escrita a mano.",
          },
        }),
      });
      assert.equal(pasted.status, 200, await pasted.clone().text());
      const list = await (await request("/api/granjas/eventos?vista=resumen")).json();
      assert.equal(list.eventos.length, 1);
      const item = list.eventos[0];
      assert.ok(!("imagenes" in item) && !("fuentes" in item) && !("ficha" in item));
      const detailUrl = `/api/granjas/eventos?id=${item.id}`;
      assert.equal((await request(detailUrl, "")).status, 401);
      const detail = await (await request(detailUrl)).json();
      assert.equal(detail.evento.revision, item.revision);
      assert.ok(Array.isArray(detail.evento.fuentes) && typeof detail.evento.ficha === "string");

      const png = await sharp({
        create: { width: 1024, height: 640, channels: 3, background: "#aabbcc" },
      })
        .png()
        .toBuffer();
      const form = new FormData();
      form.set("archivo", new File([new Uint8Array(png)], "fixture.png", { type: "image/png" }));
      form.set("licencia", "Imagen propia de prueba");
      const uploaded = await request("/api/granjas/medios", owner, { method: "POST", body: form });
      assert.equal(uploaded.status, 200, await uploaded.clone().text());
      const { medio } = await uploaded.json();
      const mediaUrl = `/api/granjas/medios/${medio.id}`;
      const thumbUrl = `${mediaUrl}?thumbnail=160`;
      const thumb = await request(thumbUrl);
      assert.equal(thumb.status, 200);
      assert.equal(thumb.headers.get("content-type"), "image/webp");
      assert.equal(thumb.headers.get("cache-control"), "private, no-cache");
      assert.match(thumb.headers.get("vary") ?? "", /Cookie/i);
      assert.match(thumb.headers.get("vary") ?? "", /Authorization/i);
      const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
      assert.equal(meta.width, 160);
      const conditional = { headers: { "if-none-match": thumb.headers.get("etag")! } };
      assert.equal((await request(thumbUrl, owner, conditional)).status, 304);
      const anonymous = await request(thumbUrl, "", conditional);
      assert.equal(anonymous.status, 401, "un ETag no evita verificar permisos");
      assert.match(anonymous.headers.get("cache-control") ?? "", /no-store/);
      const outsider = await request(thumbUrl, sessionToken("outsider", base, 300), conditional);
      assert.equal(outsider.status, 403);
      assert.match(outsider.headers.get("cache-control") ?? "", /no-store/);
      const invalidSize = await request(`${mediaUrl}?thumbnail=999`);
      assert.equal(invalidSize.status, 422);
      assert.match(invalidSize.headers.get("cache-control") ?? "", /no-store/);
      const largeThumb = await request(`${mediaUrl}?thumbnail=480`);
      assert.equal(largeThumb.headers.get("cache-control"), "private, no-cache");
      assert.equal(
        (await sharp(Buffer.from(await largeThumb.arrayBuffer())).metadata()).width,
        480,
      );
      const originalResponse = await request(mediaUrl);
      assert.match(originalResponse.headers.get("cache-control") ?? "", /no-store/);
      const original = Buffer.from(await originalResponse.arrayBuffer());
      assert.deepEqual(original, png);
      const download = await request(`${mediaUrl}?thumbnail=160&descargar=fixture`);
      assert.match(download.headers.get("cache-control") ?? "", /no-store/);
      assert.match(download.headers.get("content-disposition") ?? "", /attachment/);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
      const range = await request(mediaUrl, owner, { headers: { range: "bytes=0-7" } });
      assert.equal(range.status, 206);
      assert.deepEqual(Buffer.from(await range.arrayBuffer()), png.subarray(0, 8));
      assert.equal(
        (await request(mediaUrl, owner, { headers: { range: "bytes=99999999-" } })).status,
        416,
      );
    } finally {
      server.kill("SIGTERM");
      if (server.exitCode === null)
        await new Promise<void>((resolve) => server.once("exit", () => resolve()));
    }
  },
);
