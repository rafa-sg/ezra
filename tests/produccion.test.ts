import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  asignarFecha,
  encargoSchema,
  solicitarCambios,
  rechazarEncargo,
  siguienteAccion,
  cambiarEstado,
  comprobacionesVacias,
  contenidoEncargoSchema,
  crearEncargo,
  derivarEncargo,
  editarEncargo,
  invalidarDependientes,
  type ContenidoEncargo,
} from "../src/lib/produccion/modelo";
import {
  argumentosLocales,
  generarLocal,
  type EjecutorProceso,
} from "../src/lib/produccion/proveedores";

const contenido = (): ContenidoEncargo => ({
  titulo: "Encargo para prueba",
  agente: "guion",
  proveedor: "astra",
  canales: ["spotmi", "instagram", "tiktok", "facebook"],
  encargo: "Solo usa la nota verificada.",
  resultado: "",
  fuentes: [
    {
      nombre: "Fuente de prueba",
      url: "https://example.test/evento",
      imagen: "",
      nota: "Referencia para esta prueba.",
    },
  ],
  fechaPrevista: "",
});
const comprobado = { hechos: true, derechos: true, marca: true };
function aprobado() {
  const encargo = crearEncargo({ ...contenido(), resultado: "Entrega revisada." });
  return cambiarEstado(cambiarEstado(encargo, "revision"), "aprobado", comprobado);
}

test("producción: la revisión y sus comprobaciones autorizan solo la versión revisada", () => {
  const vacio = crearEncargo(contenido());
  assert.throws(() => cambiarEstado(vacio, "revision"));
  assert.throws(() => cambiarEstado(vacio, "aprobado", comprobado));
  const revisado = cambiarEstado(
    crearEncargo({ ...contenido(), resultado: "Entrega" }),
    "revision",
  );
  assert.throws(() => cambiarEstado(revisado, "aprobado", comprobacionesVacias()));
  assert.throws(() => cambiarEstado({ ...revisado, fuentes: [] }, "aprobado", comprobado));
  for (const cambio of [
    { resultado: "Otro resultado" },
    { proveedor: "claude" as const },
    { canales: ["tiktok" as const] },
    { fuentes: [{ ...contenido().fuentes[0], nota: "Cambió el permiso" }] },
  ]) {
    const previo = aprobado();
    const nuevo = editarEncargo(previo, { ...contenidoEncargoSchema.parse(previo), ...cambio });
    assert.equal(nuevo.estado, "pendiente");
    assert.equal(nuevo.version, previo.version + 1);
    assert.deepEqual(nuevo.comprobaciones, comprobacionesVacias());
  }
  const previo = aprobado();
  const fecha = editarEncargo(previo, {
    ...contenidoEncargoSchema.parse(previo),
    fechaPrevista: "2026-11-01T18:15",
  });
  assert.equal(fecha.estado, "aprobado");
  assert.equal(fecha.version, previo.version);
});
test("producción: fechas imposibles, canales duplicados y URLs ejecutables no entran", () => {
  for (const fechaPrevista of ["2026-02-30T12:00", "2026-11-01T25:00", "<script>"])
    assert.equal(
      contenidoEncargoSchema.safeParse({ ...contenido(), fechaPrevista }).success,
      false,
    );
  for (const url of [
    "javascript:alert(1)",
    "https://usuario:clave@example.test",
    "file:///etc/passwd",
  ])
    assert.equal(
      contenidoEncargoSchema.safeParse({
        ...contenido(),
        fuentes: [{ ...contenido().fuentes[0], url }],
      }).success,
      false,
    );
  assert.equal(
    contenidoEncargoSchema.safeParse({ ...contenido(), canales: ["tiktok", "tiktok"] }).success,
    false,
  );
});
test("una cadena conserva la versión de origen y pierde aprobaciones al cambiar un antecesor", () => {
  const padre = aprobado();
  assert.throws(() => derivarEncargo(crearEncargo(contenido()), "edicion"));
  const hijo = derivarEncargo(padre, "edicion");
  const nieto = derivarEncargo(
    cambiarEstado(
      cambiarEstado({ ...hijo, resultado: "Montaje" }, "revision"),
      "aprobado",
      comprobado,
    ),
    "auditoria",
  );
  assert.deepEqual(hijo.dependencia, { id: padre.id, version: padre.version });
  const cambios = invalidarDependientes(
    [
      padre,
      { ...hijo, estado: "aprobado", comprobaciones: comprobado },
      { ...nieto, estado: "revision" },
    ],
    padre.id,
  );
  assert.equal(cambios[0].estado, "aprobado");
  assert.equal(cambios[1].estado, "pendiente");
  assert.equal(cambios[2].estado, "pendiente");
});
test("los adaptadores locales envían el prompt por stdin y mantienen herramientas y plugins desactivados", async () => {
  const codigo = argumentosLocales("astra", "/tmp/salida.txt");
  assert.ok(codigo.includes("--ignore-user-config"));
  assert.ok(codigo.includes("read-only"));
  for (const herramienta of ["shell_tool", "apps", "multi_agent", "plugins"])
    assert.ok(codigo.some((v, i) => v === herramienta && codigo[i - 1] === "--disable"));
  const argumentosClaude = argumentosLocales("claude", "/tmp/salida.txt");
  assert.equal(argumentosClaude[argumentosClaude.indexOf("--tools") + 1], "");
  assert.ok(argumentosClaude.includes("--safe-mode"));
  let prompt = "";
  const ejecutar: EjecutorProceso = async (_binario, argumentos, entrada) => {
    if (argumentos.includes("status"))
      return argumentos[0] === "login"
        ? "Logged in using ChatGPT"
        : JSON.stringify({ loggedIn: true, authMethod: "claude.ai" });
    prompt = entrada;
    if (argumentos[0] === "exec") {
      await writeFile(
        argumentos[argumentos.indexOf("--output-last-message") + 1],
        "Entrega desde Astra",
      );
      return "";
    }
    return JSON.stringify({ result: "Entrega desde Claude", is_error: false });
  };
  const encargo = crearEncargo({ ...contenido(), encargo: "Literal: $(comando) y `otra cosa`" });
  assert.equal(
    (await generarLocal(encargo, { binario: "/no-se-ejecuta", ejecutar })).texto,
    "Entrega desde Astra",
  );
  assert.ok(prompt.includes("$(comando)"));
  assert.equal(
    (
      await generarLocal(
        { ...encargo, proveedor: "claude" },
        { binario: "/no-se-ejecuta", ejecutar },
      )
    ).texto,
    "Entrega desde Claude",
  );
  const sinSesion: EjecutorProceso = async () => JSON.stringify({ loggedIn: false });
  await assert.rejects(
    () =>
      generarLocal(
        { ...encargo, proveedor: "claude" },
        { binario: "/no-se-ejecuta", ejecutar: sinSesion },
      ),
    /Inicia sesión/,
  );
});
test("persistencia, reserva mensual y generación concurrente conservan todas las versiones", async () => {
  await mkdir("work", { recursive: true });
  const carpeta = await mkdtemp(path.resolve("work/produccion-test-"));
  process.env.EZRA_DATA_DIR = carpeta;
  const { leerProduccion, guardarProduccion } = await import("../src/lib/produccion/almacen");
  const { reservarGeneracion, guardarEntrega, mesEnElSalvador } =
    await import("../src/lib/produccion/generacion");
  assert.equal(mesEnElSalvador("2026-11-01T03:00:00Z"), mesEnElSalvador("2026-10-31T20:00:00Z"));
  assert.deepEqual((await leerProduccion()).encargos, []);
  const encargo = crearEncargo(contenido());
  const inicial = await guardarProduccion(0, (p) => ({ ...p, encargos: [encargo] }));
  const resultados = await Promise.allSettled([
    guardarProduccion(inicial.revision, (p) => p),
    guardarProduccion(inicial.revision, (p) => p),
  ]);
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
  const reservado = await reservarGeneracion(encargo.id, (await leerProduccion()).revision);
  const previo = await leerProduccion();
  await guardarProduccion(previo.revision, (p) => ({
    ...p,
    encargos: [editarEncargo(p.encargos[0], { ...contenido(), encargo: "Corrección de la nota" })],
  }));
  const entrega = await guardarEntrega(reservado, {
    texto: "Entrega del modelo",
    busquedaHtml: "",
  });
  assert.notEqual(entrega.encargoId, encargo.id);
  assert.equal(entrega.produccion.encargos.length, 2);
  assert.equal(
    entrega.produccion.encargos.find((e) => e.id === encargo.id)!.encargo,
    "Corrección de la nota",
  );
  assert.equal(
    entrega.produccion.encargos.find((e) => e.id === entrega.encargoId)!.origenResultado,
    "astra",
  );
  const fecha = new Date().toISOString();
  const actual = await leerProduccion();
  await guardarProduccion(actual.revision, (p) => ({
    ...p,
    usos: Array.from({ length: 30 }, () => ({ fecha, encargoId: encargo.id })),
  }));
  await assert.rejects(() => reservarGeneracion(encargo.id, actual.revision + 1), /30 intentos/);
  const archivo = path.join(carpeta, "produccion-spotmi.json");
  await writeFile(archivo, "{corrupto");
  await assert.rejects(() => leerProduccion(), /conservó intacto/);
  assert.equal(await readFile(archivo, "utf8"), "{corrupto");
});

test("historial: versión reemplazada con su texto, aprobada con su texto, cambios con nota y fecha sin versión nueva", () => {
  let e = crearEncargo({ ...contenido(), resultado: "Primera entrega." });
  assert.deepEqual(e.historial.map((h) => h.accion), ["creado"]);
  e = cambiarEstado(e, "revision");
  // Pedir cambios: vuelve a pendiente con la nota; la versión revisada queda con su texto.
  assert.throws(() => solicitarCambios(e, "  "), /qué hay que cambiar/);
  e = solicitarCambios(e, "Falta la hora del evento.");
  assert.equal(e.estado, "pendiente");
  assert.equal(e.notaCambios, "Falta la hora del evento.");
  assert.equal(e.version, 1, "pedir cambios no crea versión: la crea la corrección");
  assert.deepEqual(e.historial.at(-1), { ...e.historial.at(-1)!, accion: "cambios", version: 1, nota: "Falta la hora del evento.", resultado: "Primera entrega." });
  assert.throws(() => solicitarCambios(e, "otra vez"), /en revisión o aprobada/);
  // La corrección crea la versión 2 y guarda la 1 en el historial; la nota de cambios se limpia.
  e = editarEncargo(e, { ...contenido(), resultado: "Segunda entrega con hora." });
  assert.equal(e.version, 2);
  assert.equal(e.notaCambios, "");
  assert.deepEqual([e.historial.at(-1)!.accion, e.historial.at(-1)!.version, e.historial.at(-1)!.resultado], ["editado", 1, "Primera entrega."]);
  // Aprobar guarda el texto exacto aprobado.
  e = cambiarEstado(cambiarEstado(e, "revision"), "aprobado", comprobado);
  assert.deepEqual([e.historial.at(-1)!.accion, e.historial.at(-1)!.version, e.historial.at(-1)!.resultado], ["aprobado", 2, "Segunda entrega con hora."]);
  // Editar lo aprobado: versión 3, pierde la aprobación y lo deja dicho.
  const editado = editarEncargo(e, { ...contenido(), resultado: "Tercera." });
  assert.equal(editado.estado, "pendiente");
  assert.match(editado.historial.at(-1)!.nota, /estaba aprobada: la edición la deja sin efecto/);
  // Pedir cambios sobre lo aprobado también quita la aprobación.
  assert.equal(solicitarCambios(e, "Cambiar la foto.").estado, "pendiente");
  // La fecha prevista no crea versión ni toca la aprobación.
  const conFecha = asignarFecha(e, "2026-12-05T18:30");
  assert.equal(conFecha.version, 2);
  assert.equal(conFecha.estado, "aprobado");
  assert.equal(conFecha.fechaPrevista, "2026-12-05T18:30");
  assert.equal(conFecha.historial.at(-1)!.accion, "fecha");
  assert.throws(() => asignarFecha(e, "2026-02-30T10:00"));
  // Un encargo guardado antes del historial se lee igual (historial vacío, sin nota).
  const viejo: Record<string, unknown> = { ...crearEncargo(contenido()) };
  delete viejo.historial;
  delete viejo.notaCambios;
  const leido = encargoSchema.parse(viejo);
  assert.deepEqual([leido.historial, leido.notaCambios], [[], ""]);
});

test("rechazar con motivo y siguiente paso según estado", () => {
  const enRevision = cambiarEstado(crearEncargo({ ...contenido(), resultado: "Entrega" }), "revision");
  assert.throws(() => rechazarEncargo(enRevision, ""), /motivo/);
  assert.throws(() => cambiarEstado(enRevision, "rechazado"), /motivo/);
  assert.throws(() => rechazarEncargo(crearEncargo(contenido()), "No sirve"), /en revisión o aprobada/);
  const rechazado = rechazarEncargo(enRevision, "No corresponde a Spotmi.");
  assert.equal(rechazado.estado, "rechazado");
  assert.deepEqual([rechazado.historial.at(-1)!.accion, rechazado.historial.at(-1)!.resultado], ["rechazado", "Entrega"]);
  // Editar lo rechazado lo reabre como versión nueva.
  const reabierto = editarEncargo(rechazado, { ...contenido(), resultado: "Otra entrega" });
  assert.equal(reabierto.estado, "pendiente");
  assert.equal(reabierto.version, 2);
  const base = { resultado: "", notaCambios: "", fechaPrevista: "" };
  assert.equal(siguienteAccion({ ...base, estado: "pendiente" }), "ejecutar");
  assert.equal(siguienteAccion({ ...base, estado: "pendiente", resultado: "x" }), "enviar_revision");
  assert.equal(siguienteAccion({ ...base, estado: "pendiente", notaCambios: "Falta hora" }), "aplicar_cambios");
  assert.equal(siguienteAccion({ ...base, estado: "revision" }), "revisar");
  assert.equal(siguienteAccion({ ...base, estado: "aprobado" }), "planificar");
  assert.equal(siguienteAccion({ ...base, estado: "aprobado", fechaPrevista: "2026-12-01T10:00" }), "exportar");
  assert.equal(siguienteAccion({ ...base, estado: "rechazado" }), "reabrir");
});
