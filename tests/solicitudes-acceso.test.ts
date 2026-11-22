import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

process.env.EZRA_DATA_DIR = path.resolve(`work/solicitudes-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
let s: typeof import("../src/lib/equipo/solicitudes");
let db: typeof import("../src/lib/granjas/db");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  db = await import("../src/lib/granjas/db");
  s = await import("../src/lib/equipo/solicitudes");
  assert.ok(
    db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!),
    "la base de prueba vive en work/",
  );
});

test("solicitudes de acceso: una por correo, sin datos de más, la trampa no guarda y el propietario decide", () => {
  s.reiniciarFreno();
  s.crearSolicitud({ nombre: "Ana", email: "ANA@correo.com ", motivo: "Hotel en El Tunco" });
  s.crearSolicitud({ nombre: "Ana López", email: "ana@correo.com", motivo: "Hotel y restaurante" });
  let lista = s.listarSolicitudes();
  assert.equal(lista.length, 1, "el mismo correo actualiza su solicitud abierta");
  assert.equal(lista[0]!.nombre, "Ana López");
  assert.deepEqual(Object.keys(lista[0]!).sort(), [
    "actualizado",
    "creado",
    "email",
    "estado",
    "id",
    "motivo",
    "nombre",
  ]);
  s.crearSolicitud({ nombre: "Robot", email: "bot@spam.com", sitio: "https://spam" });
  assert.equal(s.listarSolicitudes().length, 1, "la trampa responde igual pero no guarda");
  assert.throws(() => s.crearSolicitud({ nombre: "A", email: "no-es-correo" }));
  assert.throws(
    () => s.crearSolicitud({ nombre: "Ana", email: "a@b.com", rol: "propietario" }),
    "no acepta campos extra",
  );
  lista = s.cambiarSolicitud({ id: lista[0]!.id, estado: "invitada" });
  assert.equal(lista.length, 0, "invitada sale de la lista de nuevas");
  assert.throws(
    () => s.cambiarSolicitud({ id: crypto.randomUUID(), estado: "descartada" }),
    /no encontrada/,
  );
});

test("solicitudes de acceso: freno de 5 por minuto", () => {
  s.reiniciarFreno();
  const ahora = new Date("2026-11-22T05:00:00Z");
  for (let i = 0; i < 5; i++)
    s.crearSolicitud({ nombre: `Persona ${i}`, email: `p${i}@correo.com` }, ahora);
  assert.throws(
    () => s.crearSolicitud({ nombre: "Sexta", email: "p6@correo.com" }, ahora),
    /muchas solicitudes/,
  );
  s.crearSolicitud(
    { nombre: "Más tarde", email: "p7@correo.com" },
    new Date(ahora.getTime() + 61_000),
  );
});
