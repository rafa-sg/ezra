import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
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
