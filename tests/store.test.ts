import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

test("persistencia atómica, cola de cambios y protección de datos corruptos", async () => {
  await mkdir("work", { recursive: true });
  const directory = await mkdtemp(path.resolve("work/store-test-"));
  process.env.EZRA_DATA_DIR = directory;
  const { readWorkspace, mutateWorkspace } = await import("../src/lib/store");
  const first = await readWorkspace();
  assert.equal(first.posts.length, 4);
  const original = await readFile(path.join(directory, "workspace.json"), "utf8");
  await Promise.all(
    Array.from({ length: 8 }, () =>
      mutateWorkspace((current) => ({ ...current, revision: current.revision + 1 })),
    ),
  );
  assert.equal((await readWorkspace()).revision, 8);
  await writeFile(path.join(directory, "workspace.json"), "{corrupto");
  await assert.rejects(() => readWorkspace(), /conservó intacto/);
  assert.equal(await readFile(path.join(directory, "workspace.json"), "utf8"), "{corrupto");
  await writeFile(path.join(directory, "workspace.json"), original);
});
