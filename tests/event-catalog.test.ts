import test from "node:test";
import assert from "node:assert/strict";
import { catalogEvents, eventCover, eventSource } from "../src/lib/event-catalog";
import type { Evento } from "../src/lib/granjas/eventos";
test("catalog excludes unreviewed, expired and undated events; retains ongoing events", () => {
  const item = (id: string, estado: string, fecha: string | null, fechaFin: string | null = null) =>
    ({ id, estado, fecha, fechaFin }) as Evento;
  assert.deepEqual(
    catalogEvents(
      [
        item("new", "nuevo", "2026-11-20"),
        item("old", "aprobado", "2026-11-01"),
        item("unknown", "aprobado", null),
        item("future", "aprobado", "2026-11-20"),
        item("ongoing", "aprobado", "2026-11-01", "2026-11-30"),
      ],
      "2026-11-19",
    ).map((e) => e.id),
    ["ongoing", "future"],
  );
});
test("visitor cover needs authorization and excludes AI references", () => {
  const cover = {
    imagenMedioId: "image",
    imagenConfirmada: true,
    imagenPermiso: "Autorizado por organizador",
    imagenTipo: "afiche" as const,
  };
  assert.equal(eventCover(cover), "/api/granjas/medios/image");
  assert.equal(eventCover({ ...cover, imagenConfirmada: false }), null);
  assert.equal(eventCover({ ...cover, imagenPermiso: " " }), null);
  assert.equal(eventCover({ ...cover, imagenTipo: "ia" }), null);
});
test("external destination rejects executable, invalid and credential-bearing URLs", () => {
  for (const value of [
    "javascript:alert(1)",
    "/relative",
    "https://user:pass@example.com",
    "data:text/html,test",
  ])
    assert.equal(eventSource(value), null);
  assert.equal(eventSource("https://example.com/event"), "https://example.com/event");
});
