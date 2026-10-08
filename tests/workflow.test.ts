import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/lib/seed";
import { reconcile, WorkflowError } from "../src/lib/workflow";
import { approvalIssues, type Workspace } from "../src/lib/model";
import { byteRange, detectMedia } from "../src/lib/media";

const now = new Date("2026-10-04T22:00:00.000Z");
const change = (state: Workspace, fn: (next: Workspace) => void) => {
  const next = structuredClone(state);
  fn(next);
  return reconcile(state, next, now);
};

test("un borrador requiere revisión antes de aprobar", () => {
  const state = createSeed(now);
  assert.throws(
    () =>
      change(state, (d) => {
        d.posts[1].status = "approved";
        d.posts[1].checks = { facts: true, rights: true, brand: true };
      }),
    /estado no está permitido/,
  );
});
test("se aprueba una versión revisada y una edición invalida esa aprobación", () => {
  let state = createSeed(now);
  state = change(state, (d) => {
    d.posts[0].checks = { facts: true, rights: true, brand: true };
    d.posts[0].status = "approved";
  });
  assert.equal(state.posts[0].status, "approved");
  state = change(state, (d) => {
    d.posts[0].caption += " Cambio editorial.";
  });
  assert.equal(state.posts[0].status, "review");
  assert.deepEqual(state.posts[0].checks, { facts: false, rights: false, brand: false });
  assert.ok(state.history.some((h) => h.title === "Aprobación invalidada"));
});
test("editar y aprobar en la misma petición no evita la revisión", () => {
  const state = createSeed(now);
  assert.throws(
    () =>
      change(state, (d) => {
        d.posts[0].caption = "Nuevo texto";
        d.posts[0].checks = { facts: true, rights: true, brand: true };
        d.posts[0].status = "approved";
      }),
    /Guarda los cambios/,
  );
});
test("cambiar una fuente reinicia comprobaciones en todos los estados pendientes", () => {
  const state = createSeed(now);
  for (const post of state.posts) post.checks = { facts: true, rights: true, brand: true };
  const next = change(state, (d) => {
    d.sources[0].url = "https://spotmi.com.sv/nueva-fuente";
  });
  for (const post of next.posts)
    assert.deepEqual(post.checks, { facts: false, rights: false, brand: false });
  assert.equal(next.posts[2].status, "review");
  assert.equal(next.posts[3].status, "review");
});
test("cambiar criterios de marca invalida contenido pendiente aprobado", () => {
  const state = createSeed(now);
  const next = change(state, (d) => {
    d.brand.rules += " Nueva regla.";
  });
  assert.equal(next.posts[2].status, "review");
  assert.equal(next.posts[3].status, "review");
});
test("una fuente vencida o de inspiración no verifica hechos", () => {
  const state = createSeed(now);
  state.sources[0].expiresOn = "2026-10-03";
  assert.ok(
    approvalIssues(state.posts[0], state, "2026-10-04").some((s) => s.includes("vigentes")),
  );
  state.sources[0].expiresOn = "";
  state.sources[0].kind = "inspiration";
  assert.ok(
    approvalIssues(state.posts[0], state, "2026-10-04").some((s) => s.includes("inspiración")),
  );
});
test("contenido real no se aprueba con medios o fuentes de demostración", () => {
  const state = createSeed(now);
  state.posts[0].demo = false;
  const issues = approvalIssues(state.posts[0], state, "2026-10-04");
  assert.ok(issues.some((s) => s.includes("ejemplo")));
  assert.ok(issues.some((s) => s.includes("Adjunta")));
});
test("rechazar requiere motivo y lo conserva como memoria", () => {
  let state = createSeed(now);
  assert.throws(
    () =>
      change(state, (d) => {
        d.posts[0].status = "rejected";
      }),
    /motivo del rechazo/,
  );
  state = change(state, (d) => {
    d.posts[0].status = "rejected";
    d.posts[0].rejectionReason = "Confirmar información con la fuente";
  });
  assert.ok(state.history[0].detail.includes("Confirmar información"));
});
test("una fecha prevista no publica y registrar publicación exige un enlace de la red correcta", () => {
  let state = createSeed(now);
  assert.throws(
    () =>
      change(state, (d) => {
        d.posts[2].status = "published";
        d.posts[2].publishedUrl = "https://instagram.com/p/test";
      }),
    /red seleccionada/,
  );
  state = change(state, (d) => {
    d.posts[2].status = "published";
    d.posts[2].publishedUrl = "https://www.facebook.com/spotmi/posts/123";
  });
  assert.equal(state.posts[2].status, "published");
  assert.throws(
    () =>
      change(state, (d) => {
        d.posts[2].caption = "Cambiar lo ya publicado";
      }),
    /Duplica/,
  );
});
test("ventanas con una revisión antigua no sobrescriben cambios", () => {
  const state = createSeed(now);
  const stale = structuredClone(state);
  const next = change(state, (d) => {
    d.posts[0].title = "Título nuevo";
  });
  assert.throws(
    () => reconcile(next, stale, now),
    (e: unknown) => e instanceof WorkflowError && e.status === 409,
  );
});
test("el cliente no puede modificar metadata de archivos ni forjar historial", () => {
  const state = createSeed(now);
  const next = change(state, (d) => {
    d.history = [];
  });
  assert.ok(next.history.some((h) => h.id === "welcome"));
  const asset = {
    id: "fake",
    filename: "fake.png",
    originalName: "f.png",
    mime: "image/png" as const,
    size: 10,
    createdAt: now.toISOString(),
    origin: "owned" as const,
    attribution: "",
  };
  assert.throws(
    () =>
      change(state, (d) => {
        d.media.push(asset);
      }),
    /biblioteca/,
  );
});
test("eliminar una fuente vinculada no deja publicaciones huérfanas", () => {
  const state = createSeed(now);
  assert.throws(
    () =>
      change(state, (d) => {
        d.sources = d.sources.filter((s) => s.id !== "demo-spotmi");
      }),
    /fuente eliminada/,
  );
});
test("HEIC, AVIF y MOV no se aceptan como MP4", () => {
  for (const brand of ["heic", "mif1", "avif", "qt  "])
    assert.throws(
      () => detectMedia(Buffer.from(`0000ftyp${brand}more-data`)),
      /Formato no compatible/,
    );
  assert.deepEqual(detectMedia(Buffer.from("0000ftypmp42more-data")), {
    mime: "video/mp4",
    ext: "mp4",
  });
});
test("los rangos de video admiten intervalos, sufijos y rangos abiertos y rechazan extremos inválidos", () => {
  assert.deepEqual(byteRange("bytes=0-1", 100), { start: 0, end: 1 });
  assert.deepEqual(byteRange("bytes=50-", 100), { start: 50, end: 99 });
  assert.deepEqual(byteRange("bytes=-20", 100), { start: 80, end: 99 });
  assert.equal(byteRange("bytes=100-200", 100), null);
  assert.equal(byteRange("bytes=20-10", 100), null);
  assert.equal(byteRange("bytes=0-1,4-5", 100), null);
});

test("los paneles locales empiezan vacíos y eliminarlos conserva contenido y medios", () => {
  const state = createSeed(now);
  assert.deepEqual(state.socialPanels ?? [], []);
  const added = change(state, (next) => {
    next.socialPanels = ["facebook", "instagram"];
  });
  assert.deepEqual(added.socialPanels, ["facebook", "instagram"]);
  const removed = change(added, (next) => {
    next.socialPanels = [];
  });
  assert.deepEqual(removed.posts, added.posts);
  assert.deepEqual(removed.media, added.media);
  assert.throws(
    () =>
      change(removed, (next) => {
        next.socialPanels = ["facebook", "facebook"];
      }),
    /Datos inválidos/,
  );
  assert.throws(
    () => reconcile(added, { ...state, socialPanels: [] }, now),
    /cambios más recientes/,
  );
});
