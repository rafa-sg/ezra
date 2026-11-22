import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Todo en una carpeta de prueba; nunca en data/. La base se importa después de fijar la carpeta.
process.env.EZRA_DATA_DIR = path.resolve(`work/equipo-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
let equipo: typeof import("../src/lib/equipo/almacen");
let modelo: typeof import("../src/lib/equipo/modelo");
let db: typeof import("../src/lib/granjas/db");
let accesos: typeof import("../src/lib/access-store");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  equipo = await import("../src/lib/equipo/almacen");
  modelo = await import("../src/lib/equipo/modelo");
  db = await import("../src/lib/granjas/db");
  accesos = await import("../src/lib/access-store");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!));
});

test("equipo: el espacio Spotmi existe y el propietario sale de la cuenta de administración", () => {
  const espacio = db.base().prepare("select * from espacios").all() as { id: string }[];
  assert.deepEqual(
    espacio.map((e) => e.id),
    ["spotmi"],
  );
  const p = equipo.asegurarPropietario({ clerkUserId: "user_owner", email: "owner@example.test", nombre: "Dueño" });
  assert.equal(p.rol, "propietario");
  assert.equal(p.estado, "activo");
  // Idempotente: otra sesión del propietario no crea una segunda fila.
  equipo.asegurarPropietario({ clerkUserId: "user_owner", email: "owner@example.test", nombre: "Dueño" });
  assert.equal(equipo.listarMiembros().filter((m) => m.rol === "propietario").length, 1);
  const acceso = equipo.equipoDe(p);
  assert.deepEqual(acceso.secciones, [...modelo.seccionesEquipo]);
});

test("equipo: solo entra quien fue invitado, con su correo verificado", () => {
  assert.equal(equipo.vincularMiembro({ clerkUserId: "user_x", correos: ["socio@example.test"] }), null);
  const inv = equipo.invitar({ email: "Socio@Example.test", rol: "socio" }, "owner@example.test");
  assert.equal(inv.email, "socio@example.test");
  assert.equal(inv.estado, "invitado");
  // Sin correo verificado (lista vacía) no se vincula.
  assert.equal(equipo.vincularMiembro({ clerkUserId: "user_socio", correos: [] }), null);
  const m = equipo.vincularMiembro({ clerkUserId: "user_socio", correos: ["socio@example.test"] });
  assert.equal(m?.estado, "activo");
  // Otra cuenta de Clerk con el mismo correo no toma el lugar del socio ya vinculado.
  assert.equal(equipo.vincularMiembro({ clerkUserId: "user_duplicado", correos: ["socio@example.test"] }), null);
  // Si el correo deja de estar verificado en Clerk, el vínculo no basta.
  assert.equal(equipo.vincularMiembro({ clerkUserId: "user_socio", correos: ["otro@example.test"] }), null);
  assert.equal(equipo.vincularMiembro({ clerkUserId: "user_socio", correos: ["socio@example.test"] })?.id, m!.id);
});

test("equipo: nadie obtiene el rol de propietario por invitación ni por correo", () => {
  assert.throws(() => equipo.invitar({ email: "owner@example.test", rol: "socio" }, "x"), /propietario/);
  assert.throws(() => equipo.invitar({ email: "nuevo@example.test", rol: "propietario" }, "x"));
  // Una cuenta de Clerk distinta con el correo del propietario no entra por la tabla del equipo.
  assert.equal(equipo.vincularMiembro({ clerkUserId: "user_duplicado", correos: ["owner@example.test"] }), null);
  const p = equipo.listarMiembros().find((m) => m.rol === "propietario")!;
  assert.throws(() => equipo.retirar(p.id), /propietario/);
  assert.throws(() => equipo.cambiarRol({ id: p.id, rol: "socio" }), /propietario/);
});

test("equipo: invitado con secciones y solo lectura; el permiso se calcula en el servidor", () => {
  assert.throws(() => equipo.invitar({ email: "inv@example.test", rol: "invitado", secciones: [] }, "x"), /sección/);
  equipo.invitar({ email: "inv@example.test", rol: "invitado", secciones: ["eventos", "calendario"], soloLectura: true }, "x");
  const m = equipo.vincularMiembro({ clerkUserId: "user_inv", correos: ["inv@example.test"] })!;
  const acceso = equipo.equipoDe(m);
  assert.deepEqual(acceso.secciones, ["eventos", "calendario"]);
  assert.equal(modelo.permite(acceso, "eventos"), true);
  assert.equal(modelo.permite(acceso, "eventos", true), false, "solo lectura no escribe");
  assert.equal(modelo.permite(acceso, "granjas"), false);
  assert.equal(modelo.permite(acceso, "conexiones"), false);
  // Un socio con secciones guardadas igual ve todo; un invitado sin solo lectura escribe en lo suyo.
  const cambiado = equipo.cambiarRol({ id: m.id, rol: "invitado", secciones: ["eventos"], soloLectura: false });
  assert.equal(modelo.permite(equipo.equipoDe(cambiado), "eventos", true), true);
  const socio = equipo.cambiarRol({ id: m.id, rol: "socio", secciones: ["eventos"] });
  assert.deepEqual(equipo.equipoDe(socio).secciones, [...modelo.seccionesEquipo]);
  assert.equal(equipo.equipoDe(socio).soloLectura, false);
});

test("equipo: quitar acceso impide entrar; reinvitar vuelve a vincular por correo", () => {
  const m = equipo.listarMiembros().find((x) => x.email === "socio@example.test")!;
  equipo.retirar(m.id);
  assert.equal(equipo.vincularMiembro({ clerkUserId: "user_socio", correos: ["socio@example.test"] }), null);
  assert.throws(() => equipo.cambiarRol({ id: m.id, rol: "socio" }), /no está/);
  const r = equipo.invitar({ email: "socio@example.test", rol: "invitado", secciones: ["eventos"] }, "x");
  assert.equal(r.id, m.id, "misma fila, con historial");
  assert.equal(r.estado, "invitado");
  assert.equal(
    equipo.vincularMiembro({ clerkUserId: "user_socio_nuevo", correos: ["socio@example.test"] })?.rol,
    "invitado",
  );
  // Duplicado pendiente o activo: error claro.
  assert.throws(() => equipo.invitar({ email: "socio@example.test", rol: "socio" }, "x"), /ya está/);
});

test("equipo: un segundo administrador conserva su identidad y la del propietario original", async () => {
  const emailOriginal = "owner@example.test";
  const emailAdicional = "admin-adicional@example.test";
  const original = equipo.listarMiembros().find((m) => m.email === emailOriginal)!;
  const invitacion = equipo.invitar({ email: emailAdicional, rol: "socio" }, emailOriginal);
  await accesos.configureOwner(emailOriginal);
  await accesos.bindIdentity({ userId: "user_owner", verifiedEmails: [emailOriginal] });
  await accesos.assignClient({ email: "cliente@example.test", organizationId: "sgmotos" });
  await assert.rejects(accesos.grantAdministrator("cliente@example.test"), /asignado a un cliente/);
  await accesos.grantAdministrator(emailAdicional);
  await accesos.grantAdministrator(emailAdicional.toUpperCase());
  assert.equal((await accesos.readAccess())!.accounts.length, 3);
  await assert.rejects(accesos.bindIdentity({ userId: "user_adicional", verifiedEmails: [] }), /verificarse/);
  const cuentaAdicional = await accesos.bindIdentity({ userId: "user_adicional", verifiedEmails: [emailAdicional] });
  assert.equal(cuentaAdicional.role, "admin");
  const miembroAdicional = equipo.asegurarPropietario({
    clerkUserId: "user_adicional", email: cuentaAdicional.email, nombre: cuentaAdicional.displayName,
  });
  assert.equal(miembroAdicional.id, invitacion.id);
  assert.equal(miembroAdicional.rol, "propietario");
  assert.deepEqual(equipo.equipoDe(miembroAdicional).secciones, [...modelo.seccionesEquipo]);
  await assert.rejects(accesos.bindIdentity({ userId: "user_distinto", verifiedEmails: [emailAdicional] }), /verificarse/);
  const originalAlVolver = equipo.asegurarPropietario({ clerkUserId: "user_owner", email: emailOriginal, nombre: "Dueño" });
  assert.equal(originalAlVolver.id, original.id);
  assert.notEqual(originalAlVolver.id, miembroAdicional.id);
  assert.equal(equipo.leerMiembro(miembroAdicional.id)?.email, emailAdicional);
});
