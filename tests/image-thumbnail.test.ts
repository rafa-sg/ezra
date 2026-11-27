import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { imageThumbnail } from "../src/lib/image-thumbnail";

test("miniaturas: tamaño acotado, original intacto y una conversión compartida", async () => {
  await mkdir("work", { recursive: true });
  const directory = await mkdtemp(path.resolve("work/thumbnail-test-"));
  const source = path.join(directory, "original.png");
  await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#223344" } })
    .png()
    .toFile(source);
  const original = await readFile(source);
  const [a, b] = await Promise.all([
    imageThumbnail(source, "v1", 160),
    imageThumbnail(source, "v1", 160),
  ]);
  assert.equal(a, b, "dos peticiones simultáneas reutilizan el resultado");
  const metadata = await sharp(a).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 160);
  assert.equal(metadata.height, 100);
  assert.deepEqual(await readFile(source), original);
  const larger = await imageThumbnail(source, "v1", 480);
  assert.equal((await sharp(larger).metadata()).width, 480);
  await sharp({ create: { width: 80, height: 40, channels: 3, background: "#abcdef" } })
    .png()
    .toFile(source);
  const changed = await imageThumbnail(source, "v2", 160);
  assert.equal(
    (await sharp(changed).metadata()).width,
    80,
    "no agranda fuentes pequeñas ni reutiliza otra versión",
  );
});
