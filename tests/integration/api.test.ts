import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { Workspace } from "../../src/lib/model";

test(
  "API local: persistencia, conflicto, origen, archivos, rangos y respaldo completo",
  { timeout: 90000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directory = await mkdtemp(path.resolve("work/api-test-"));
    const server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3101"],
      { env: { ...process.env, EZRA_DATA_DIR: directory, EZRA_AUTH: "off" }, stdio: "pipe" },
    );
    let logs = "";
    server.stderr.on("data", (chunk) => (logs += chunk.toString()));
    const base = "http://127.0.0.1:3101";
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          const r = await fetch(`${base}/api/workspace`);
          if (r.ok) {
            ready = true;
            break;
          }
        } catch {
          /* The isolated server may still be starting. */
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(ready, logs);
      const initial: Workspace = await (await fetch(`${base}/api/workspace`)).json();
      assert.equal(initial.posts.length, 4);
      const draft = structuredClone(initial);
      draft.posts[0].title = "Prueba persistida de API";
      const put = await fetch(`${base}/api/workspace`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      assert.equal(put.status, 200);
      assert.equal(
        JSON.parse(await readFile(path.join(directory, "workspace.json"), "utf8")).posts[0].title,
        "Prueba persistida de API",
      );
      assert.equal(
        (
          await fetch(`${base}/api/workspace`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(initial),
          })
        ).status,
        409,
      );
      assert.equal(
        (await fetch(`${base}/api/workspace`, { headers: { Origin: "https://untrusted.example" } }))
          .status,
        403,
      );
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD6kAAAAASUVORK5CYII=",
        "base64",
      );
      const form = new FormData();
      form.set("file", new File([png], "prueba.png", { type: "image/png" }));
      form.set("origin", "owned");
      const upload = await fetch(`${base}/api/media`, { method: "POST", body: form });
      assert.equal(upload.status, 200);
      const { media, workspace } = await upload.json();
      const range = await fetch(`${base}/api/media/${media.id}`, {
        headers: { Range: "bytes=0-7" },
      });
      assert.equal(range.status, 206);
      assert.equal(range.headers.get("content-range"), `bytes 0-7/${png.length}`);
      assert.deepEqual(Buffer.from(await range.arrayBuffer()), png.subarray(0, 8));
      assert.equal(
        (await fetch(`${base}/api/media/${media.id}`, { headers: { Range: "bytes=99999-" } }))
          .status,
        416,
      );
      workspace.posts[0].mediaIds = [media.id];
      assert.equal(
        (
          await fetch(`${base}/api/workspace`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(workspace),
          })
        ).status,
        200,
      );
      const exported = await fetch(`${base}/api/export?post=${workspace.posts[0].id}`);
      assert.equal(exported.status, 200);
      const packageZip = await JSZip.loadAsync(await exported.arrayBuffer());
      assert.ok(packageZip.file(`media/${media.filename}`));
      const summary = await packageZip.file("publicacion.txt")!.async("text");
      assert.match(summary, /Prueba persistida/);
      // The example post is still in review: the package warns it is not approved.
      assert.match(summary, /VERSIÓN NO APROBADA/);
      assert.match(exported.headers.get("content-disposition") || "", /-no-aprobada/);
      assert.equal(
        await packageZip.file("texto.txt")!.async("text"),
        `${workspace.posts[0].caption}\n`,
      );
      if (workspace.posts[0].channel === "instagram") assert.match(summary, /solo en JPEG/);
      const approvedPost = workspace.posts.find((p: { status: string }) => p.status === "approved");
      const approvedExport = await fetch(`${base}/api/export?post=${approvedPost.id}`);
      assert.doesNotMatch(approvedExport.headers.get("content-disposition") || "", /no-aprobada/);
      assert.doesNotMatch(
        await (
          await JSZip.loadAsync(await approvedExport.arrayBuffer())
        )
          .file("publicacion.txt")!
          .async("text"),
        /NO APROBADA/,
      );
      // Example posts never leave ezrá for the site, approved or not.
      for (const p of [workspace.posts[0], approvedPost])
        assert.equal((await fetch(`${base}/api/export?post=${p.id}&for=site`)).status, 422);
      assert.equal((await fetch(`${base}/api/export?for=site`)).status, 400);
      const backup = await fetch(`${base}/api/export`);
      assert.equal(backup.status, 200);
      const zip = await JSZip.loadAsync(await backup.arrayBuffer());
      assert.ok(zip.file("workspace.json"));
      assert.deepEqual(await zip.file(`media/${media.filename}`)!.async("nodebuffer"), png);
      const invalid = new FormData();
      invalid.set("file", new File([Buffer.from("0000ftypheic-invalid")], "foto.heic"));
      invalid.set("origin", "owned");
      assert.equal(
        (await fetch(`${base}/api/media`, { method: "POST", body: invalid })).status,
        422,
      );
      await unlink(path.join(directory, "media", media.filename));
      const partial = await fetch(`${base}/api/export`);
      assert.equal(partial.status, 200);
      assert.match(partial.headers.get("content-disposition") || "", /incompleto/);
      const partialZip = await JSZip.loadAsync(await partial.arrayBuffer());
      assert.ok(partialZip.file("workspace.json"));
      assert.ok(partialZip.file("ADVERTENCIA-ARCHIVOS-FALTANTES.txt"));
    } finally {
      server.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        if (server.exitCode !== null) resolve();
        else server.once("exit", () => resolve());
      });
    }
  },
);
