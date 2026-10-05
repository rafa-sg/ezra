import test from "node:test";
import assert from "node:assert/strict";
import { contrast, readableOnWhite, themeStyle } from "../src/lib/theme";
import { createSeed } from "../src/lib/seed";
import { reconcile } from "../src/lib/workflow";

test("los colores del negocio mantienen texto legible en los botones", () => {
  assert.ok(contrast("#3070b0", "#ffffff") >= 4.5);
  const light = "#5fb0ff";
  assert.ok(contrast(light, "#ffffff") < 4.5);
  assert.ok(contrast(readableOnWhite(light), "#ffffff") >= 4.5);
  const style = themeStyle({ primary: "#3070b0", secondary: "#c83020", logoMediaId: "" }) as Record<
    string,
    string
  >;
  assert.equal(style["--violet"], "#3070b0");
  assert.equal(style["--brand-secondary"], "#c83020");
  assert.equal(themeStyle({ primary: "", secondary: "", logoMediaId: "" }), undefined);
});

test("el logo debe ser una imagen de la biblioteca de ese mismo negocio", () => {
  const state = createSeed();
  const next = structuredClone(state);
  next.appearance = { primary: "#3070b0", secondary: "", logoMediaId: "logo-de-otro-negocio" };
  assert.throws(() => reconcile(state, next), /biblioteca de este negocio/);
  next.appearance.logoMediaId = "";
  assert.equal(reconcile(state, next).appearance.primary, "#3070b0");
});
