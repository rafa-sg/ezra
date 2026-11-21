import test from "node:test";
import assert from "node:assert/strict";
import { agendaVigente, SIN_UBICACION, type EventoMapa } from "../src/lib/granjas/agenda-mapa";
import { ACCESOS, POBLACION_2024 } from "../src/lib/granjas/datos-pais";

const ev = (o: Partial<EventoMapa> & { id: string }): EventoMapa => ({
  titulo: "Festival",
  fecha: "2026-11-25",
  lugar: "",
  municipio: "",
  departamento: "San Salvador",
  estado: "nuevo",
  ...o,
});

test("agenda: solo confirmados y vigentes, sin duplicados, por fecha", () => {
  const a = agendaVigente(
    [
      ev({ id: "1", titulo: "Concierto B", fecha: "2026-11-28" }),
      ev({ id: "2", titulo: "Concierto A", fecha: "2026-11-22", hora: "19:00" }),
      ev({ id: "3", titulo: "Pasado", fecha: "2026-11-10" }),
      ev({ id: "4", titulo: "Feria larga", fecha: "2026-11-01", fechaFin: "2026-11-30" }),
      ev({ id: "5", titulo: "Sin fecha", fecha: null }),
      ev({ id: "6", titulo: "Descartado", estado: "descartado" }),
      ev({ id: "7", titulo: "CONCIERTO   b!", fecha: "2026-11-28", estado: "aprobado" }),
      ev({ id: "8", titulo: "Sin lugar", departamento: null }),
    ],
    "2026-11-21",
  );
  assert.deepEqual(
    a.get("San Salvador")?.map((e) => e.id),
    ["4", "2", "7"],
  );
  assert.deepEqual(a.get(SIN_UBICACION)?.map((e) => e.id), ["8"]);
});

test("población 2024: los 14 departamentos más «no especificado» suman el total oficial", () => {
  const deptos = Object.values(POBLACION_2024.departamentos);
  assert.equal(deptos.length, 14);
  assert.equal(deptos.reduce((s, v) => s + v, 0) + POBLACION_2024.noEspecificado, POBLACION_2024.total);
});

test("ingresos: tres accesos con puestos reales y sin cifras inventadas", () => {
  assert.deepEqual(
    ACCESOS.map((a) => a.id),
    ["aeropuerto", "guatemala", "honduras"],
  );
  for (const a of ACCESOS) {
    assert.ok(a.puestos.length > 0);
    // Mientras no haya una fuente oficial conectada, todo queda en null («Datos aún no disponibles»).
    if (a.entradas) assert.ok(a.entradas.fuente && a.entradas.url && a.entradas.periodo);
    for (const p of a.puestos) assert.ok(p.lat > 13 && p.lat < 14.5 && p.lng > -90.2 && p.lng < -87.6);
  }
});
