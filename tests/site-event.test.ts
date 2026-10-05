import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/lib/seed";
import { siteEventPackage } from "../src/lib/site-event";
import type { Media, Workspace } from "../src/lib/model";

const now = new Date("2026-10-04T22:00:00.000Z");
const media = (id: string, mime: Media["mime"], size: number): Media => ({
  id,
  filename: `${id}.${mime === "video/mp4" ? "mp4" : mime === "image/png" ? "png" : "jpg"}`,
  originalName: `${id}-original`,
  mime,
  size,
  createdAt: now.toISOString(),
  origin: "owned",
  attribution: "",
});
const realApproved = (): Workspace => {
  const state = createSeed(now);
  state.media = [
    media("video", "video/mp4", 1000),
    media("grande", "image/jpeg", 6 * 1024 * 1024),
    media("portada", "image/png", 1000),
    media("extra", "image/jpeg", 1000),
  ];
  Object.assign(state.posts[0], {
    demo: false,
    status: "approved",
    mediaIds: ["video", "grande", "portada", "extra"],
  });
  return state;
};

test("solo una versión aprobada y no demo se exporta para el sitio", () => {
  const state = createSeed(now);
  assert.throws(() => siteEventPackage(state.posts[0], state), /ejemplos no se envían/);
  const real = realApproved();
  real.posts[0].status = "review";
  assert.throws(() => siteEventPackage(real.posts[0], real), /versión aprobada/);
});

test("el paquete del sitio elige una portada válida y no inventa datos", () => {
  const state = realApproved();
  const { text, photo } = siteEventPackage(state.posts[0], state);
  assert.equal(photo?.id, "portada");
  assert.match(text, /Fecha de inicio: \(completar/);
  assert.match(text, /video-original: el sitio solo acepta fotos/);
  assert.match(text, /grande-original: supera 5 MB/);
  assert.match(text, /extra-original: el sitio guarda una sola foto/);
  assert.ok(text.includes(state.posts[0].caption));
  state.posts[0].mediaIds = ["video"];
  const sinFoto = siteEventPackage(state.posts[0], state);
  assert.equal(sinFoto.photo, undefined);
  assert.match(sinFoto.text, /No hay una foto válida/);
});
