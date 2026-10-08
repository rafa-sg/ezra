import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignIssues,
  createCatalogPosts,
  newProduct,
  postFormat,
  promotionStatus,
  variantPhotos,
} from "../src/lib/catalog";
import { approvalIssues, type CatalogProduct } from "../src/lib/model";
import { createSeed } from "../src/lib/seed";

function product(): CatalogProduct {
  const p = newProduct();
  p.name = "Moto de prueba";
  p.priceCents = 150000;
  p.mediaIds = ["foto-general"];
  p.variants = [
    {
      id: "roja",
      name: "Roja",
      color: "Rojo",
      priceCents: null,
      mediaIds: ["foto-roja", "foto-roja-2"],
    },
    { id: "negra", name: "Negra", color: "Negro", priceCents: 160000, mediaIds: [] },
  ];
  return p;
}

test("cada variante usa sus fotos, o las del producto si no tiene", () => {
  const p = product();
  assert.deepEqual(variantPhotos(p, "roja"), ["foto-roja", "foto-roja-2"]);
  assert.deepEqual(variantPhotos(p, "negra"), ["foto-general"]);
  assert.equal(postFormat(0), "text");
  assert.equal(postFormat(1), "photo");
  assert.equal(postFormat(2), "carousel");
});

test("el estado de la promoción depende de sus fechas y valor", () => {
  const p = product();
  assert.equal(promotionStatus(p, "2026-10-05"), "none");
  p.promotion = {
    kind: "percentage",
    value: 10,
    startsOn: "2026-10-10",
    endsOn: "2026-10-20",
    conditions: "",
  };
  assert.equal(promotionStatus(p, "2026-10-05"), "upcoming");
  assert.equal(promotionStatus(p, "2026-10-15"), "active");
  assert.equal(promotionStatus(p, "2026-10-21"), "expired");
  p.promotion.endsOn = "";
  assert.equal(promotionStatus(p, "2026-10-15"), "incomplete");
});

test("los avisos señalan lo que impedirá aprobar, sin bloquear el borrador", () => {
  const p = product();
  const issues = campaignIssues(p, "roja", [], ["instagram", "facebook"], "2026-10-05");
  assert.ok(issues.some((i) => /no está verificado/.test(i)));
  assert.ok(issues.some((i) => /enlace de referencia/.test(i)));
  assert.ok(issues.some((i) => /Instagram necesita/.test(i)));
  p.verified = true;
  p.verifiedOn = "2026-10-05";
  p.sourceUrl = "https://sgmotos.example/moto";
  assert.deepEqual(campaignIssues(p, "roja", ["foto-roja"], ["instagram"], "2026-10-05"), []);
});

test("las fotos elegidas definen el formato y no se aceptan fotos de otro producto", () => {
  const p = product();
  const [ig, fb] = createCatalogPosts(p, "roja", ["instagram", "facebook"], ["foto-roja", "ajena"]);
  assert.deepEqual(ig.mediaIds, ["foto-roja"]);
  assert.equal(ig.format, "photo");
  assert.equal(ig.campaignId, fb.campaignId);
  const [textOnly] = createCatalogPosts(p, "negra", ["facebook"], []);
  assert.equal(textOnly.format, "text");
  assert.throws(() => createCatalogPosts(p, "negra", ["instagram"], []), /Instagram necesita/);
});

test("un borrador de Facebook sin fotos no pide medios para aprobarse", () => {
  const state = createSeed();
  const p = product();
  p.verified = true;
  p.verifiedOn = "2026-10-05";
  state.catalog = [p];
  const [post] = createCatalogPosts(p, "negra", ["facebook"], []);
  post.checks = { facts: true, rights: true, brand: true };
  const issues = approvalIssues({ ...post, demo: false }, state, "2026-10-05");
  assert.ok(!issues.some((i) => /medios/.test(i)), issues.join(" "));
});

test("año, cilindrada y especificaciones salen del catálogo; el financiamiento solo si se aprobó", async () => {
  const { catalogContent } = await import("../src/lib/catalog");
  const p = product();
  p.details = {
    year: "2026",
    engineCc: 125,
    specs: "Frenos de disco delanteros.",
    financing: "Prima de $200 y 12 cuotas.",
    financingApproved: false,
  };
  let caption = catalogContent(p, "roja", "2026-10-05").caption;
  assert.match(caption, /Año 2026 · 125 cc/);
  assert.match(caption, /Frenos de disco/);
  assert.doesNotMatch(caption, /Financiamiento/);
  assert.ok(
    campaignIssues(p, "roja", ["foto-roja"], ["facebook"], "2026-10-05").some((i) =>
      /financiamiento no se incluirá/.test(i),
    ),
  );
  p.details.financingApproved = true;
  caption = catalogContent(p, "roja", "2026-10-05").caption;
  assert.match(caption, /Financiamiento: Prima de \$200/);
});

test("no se puede aprobar un financiamiento vacío ni un año inválido", async () => {
  const { catalogProductSchema } = await import("../src/lib/model");
  const p = product();
  p.details = { year: "", engineCc: null, specs: "", financing: "", financingApproved: true };
  assert.ok(!catalogProductSchema.safeParse(p).success);
  p.details = { year: "26", engineCc: null, specs: "", financing: "", financingApproved: false };
  assert.ok(!catalogProductSchema.safeParse(p).success);
});
