import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/lib/seed";
import { newProduct, productPrice, catalogContent, createCatalogPosts } from "../src/lib/catalog";
import { approvalIssues, type Workspace } from "../src/lib/model";
import { reconcile } from "../src/lib/workflow";
const now = new Date("2026-10-05T18:00:00Z");
function workspace() {
  const state = createSeed(now);
  state.businessId = "sgmotos-main";
  state.posts = [];
  state.sources = [];
  const product = newProduct();
  product.name = "Moto de prueba";
  product.priceCents = 200000;
  product.verified = true;
  product.verifiedOn = "2026-10-05";
  state.catalog = [product];
  return state;
}
function change(state: Workspace, edit: (d: Workspace) => void) {
  const next = structuredClone(state);
  edit(next);
  return reconcile(state, next, now);
}
test("precios en centavos, variantes, descuentos y vigencia sin inventar precios", () => {
  const product = workspace().catalog[0];
  product.priceCents = 199999;
  product.promotion = {
    kind: "percentage",
    value: 15,
    startsOn: "2026-10-05",
    endsOn: "2026-10-10",
    conditions: "Pago al contado",
  };
  assert.equal(productPrice(product, product.variants[0].id, "2026-10-05").final, 169999);
  product.variants[0].priceCents = 100000;
  assert.equal(productPrice(product, product.variants[0].id, "2026-10-10").final, 85000);
  assert.equal(productPrice(product, product.variants[0].id, "2026-10-11").final, 100000);
  product.promotion.kind = "fixed";
  product.promotion.value = 20000;
  assert.equal(productPrice(product, product.variants[0].id, "2026-10-05").final, 80000);
  product.priceCents = null;
  product.variants[0].priceCents = null;
  assert.doesNotMatch(
    catalogContent(product, product.variants[0].id, "2026-10-11").caption,
    /Precio/,
  );
});
test("dos redes comparten campaña y usan fotos y color de la variante elegida", () => {
  const product = workspace().catalog[0];
  product.mediaIds = ["base-photo"];
  product.variants[0].color = "Rojo";
  product.variants[0].mediaIds = ["red-photo"];
  const posts = createCatalogPosts(product, product.variants[0].id, [
    "facebook",
    "instagram",
    "facebook",
  ]);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].campaignId, posts[1].campaignId);
  assert.notEqual(posts[0].id, posts[1].id);
  assert.deepEqual(posts[0].mediaIds, ["red-photo"]);
  assert.match(posts[0].caption, /Color: Rojo/);
  assert.ok(posts.every((p) => p.status === "draft" && !p.checks.facts && p.catalogRevision === 0));
});
test("editar el catálogo invalida aprobaciones y exige actualizar y revisar la nueva versión", () => {
  let state = workspace();
  const product = state.catalog[0];
  const post = {
    ...createCatalogPosts(product, product.variants[0].id, ["facebook"])[0],
    format: "text" as const,
  };
  state = change(state, (d) => d.posts.push(post));
  state = change(state, (d) => {
    d.posts[0].status = "review";
  });
  state = change(state, (d) => {
    d.posts[0].checks = { facts: true, rights: true, brand: true };
    d.posts[0].status = "approved";
  });
  assert.equal(state.posts[0].status, "approved");
  state = change(state, (d) => {
    d.catalog[0].priceCents = 210000;
    d.catalog[0].revision = 900;
  });
  assert.equal(state.catalog[0].revision, 1);
  assert.equal(state.posts[0].status, "review");
  assert.equal(state.posts[0].checks.facts, false);
  assert.throws(
    () =>
      change(state, (d) => {
        d.posts[0].checks = { facts: true, rights: true, brand: true };
        d.posts[0].status = "approved";
      }),
    /producto cambió/,
  );
  state = change(state, (d) =>
    Object.assign(
      d.posts[0],
      catalogContent(d.catalog[0], d.catalog[0].variants[0].id, "2026-10-05"),
    ),
  );
  state = change(state, (d) => {
    d.posts[0].checks = { facts: true, rights: true, brand: true };
    d.posts[0].status = "approved";
  });
  assert.equal(state.posts[0].status, "approved");
  assert.match(state.posts[0].caption, /2,100/);
});
test("promociones fuera de fecha, descuentos excesivos y fotos ajenas se rechazan", () => {
  const state = workspace();
  const product = state.catalog[0];
  assert.throws(
    () =>
      change(state, (d) => {
        d.catalog[0].mediaIds = ["another-business-photo"];
      }),
    /biblioteca de este negocio/,
  );
  assert.throws(
    () =>
      change(state, (d) => {
        d.catalog[0].promotion = {
          kind: "fixed",
          value: 300000,
          startsOn: "2026-10-05",
          endsOn: "2026-10-10",
          conditions: "",
        };
      }),
    /descuento no puede superarlo/,
  );
  product.promotion = {
    kind: "percentage",
    value: 10,
    startsOn: "2026-10-05",
    endsOn: "2026-10-10",
    conditions: "",
  };
  const post = createCatalogPosts(product, product.variants[0].id, ["facebook"])[0];
  assert.ok(approvalIssues(post, state, "2026-10-11").some((s) => s.includes("no está vigente")));
  post.plannedAt = "2026-10-11T09:00";
  assert.ok(approvalIssues(post, state, "2026-10-05").some((s) => s.includes("fecha prevista")));
  assert.throws(
    () =>
      change(state, (d) => {
        d.businessId = "motoxspress-main";
      }),
    /entre negocios/,
  );
});
