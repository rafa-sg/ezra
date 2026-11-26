import test from "node:test";
import assert from "node:assert/strict";
import { expiredInInbox, inboxEvents } from "../src/lib/event-inbox";

const events = [
  { id: "two-days", fecha: "2026-11-23", fechaFin: null },
  { id: "yesterday", fecha: "2026-11-24", fechaFin: null },
  { id: "today", fecha: "2026-11-25", fechaFin: null },
  { id: "ongoing", fecha: "2026-11-18", fechaFin: "2026-11-27" },
  { id: "ended", fecha: "2026-11-18", fechaFin: "2026-11-23" },
  { id: "unknown", fecha: null, fechaFin: null },
];

test("la bandeja oculta a los dos días del cierre y conserva los de ayer, vigentes y sin fecha", () => {
  const snapshot = structuredClone(events);
  assert.deepEqual(inboxEvents(events, { today: "2026-11-25" }).map((e) => e.id), ["yesterday", "today", "ongoing", "unknown"]);
  assert.deepEqual(events, snapshot, "ocultar nunca altera el registro histórico");
  assert.equal(expiredInInbox(events[0], "2026-11-24"), false);
  assert.equal(expiredInInbox(events[0], "2026-11-25"), true);
});

test("la consulta histórica incluye vencidos al buscar, elegir fecha o activar el filtro", () => {
  for (const option of [{ search: "Garmin" }, { from: "2026-11-18" }, { until: "2026-11-23" }, { includeExpired: true }])
    assert.equal(inboxEvents(events, { today: "2026-11-25", ...option }).length, events.length);
  assert.equal(inboxEvents(events, { today: "2026-11-25", search: "   " }).length, 4);
});

test("el corte por día funciona al cambiar de mes o año y respeta el cierre de eventos largos", () => {
  assert.equal(expiredInInbox({ fecha: "2026-12-30" }, "2027-01-01"), true);
  assert.equal(expiredInInbox({ fecha: "2026-12-31" }, "2027-01-01"), false);
  assert.equal(expiredInInbox({ fecha: "2024-02-28" }, "2024-03-01"), true);
  assert.equal(expiredInInbox({ fecha: "2026-12-01", fechaFin: "2026-12-31" }, "2027-01-01"), false);
});
