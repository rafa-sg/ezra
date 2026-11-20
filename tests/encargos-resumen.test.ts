import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/: nunca data/.
process.env.EZRA_DATA_DIR = path.resolve(`work/encargos-resumen-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
let modelo: typeof import("../src/lib/produccion/modelo");
let resumen: typeof import("../src/lib/produccion/resumen-encargo");
let generacion: typeof import("../src/lib/produccion/generacion");
let almacen: typeof import("../src/lib/produccion/almacen");
let relaciones: typeof import("../src/lib/produccion/relaciones");
let eventos: typeof import("../src/lib/granjas/eventos");
let tiempo: typeof import("../src/lib/granjas/tiempo");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  modelo = await import("../src/lib/produccion/modelo");
  resumen = await import("../src/lib/produccion/resumen-encargo");
  generacion = await import("../src/lib/produccion/generacion");
  almacen = await import("../src/lib/produccion/almacen");
  relaciones = await import("../src/lib/produccion/relaciones");
  eventos = await import("../src/lib/granjas/eventos");
  tiempo = await import("../src/lib/granjas/tiempo");
});
const base = (extra: Partial<import("../src/lib/produccion/modelo").ContenidoEncargo> = {}) =>
  modelo.crearEncargo({ titulo: "Post del Festival del Maíz", agente: "redactor_ig", proveedor: "claude", canales: ["instagram"], encargo: "Un post cercano", resultado: "", fuentes: [{ nombre: "MITUR", url: "https://elsalvador.travel/esp/event/maiz", imagen: "", nota: "" }], fechaPrevista: "", ...extra });

test("estados separados: editorial, ejecución y entrega; aprobado nunca es publicado", () => {
  let e = base();
  assert.equal(resumen.tipoResultado(e.agente), "post");
  assert.equal(resumen.estadoEditorial(e), "borrador");
  assert.equal(resumen.estadoEjecucion(e).estado, "sin_ejecutar");
  assert.deepEqual(resumen.etapa(e), { etapa: "sin_resultado", accion: "ejecutar" });
  e = { ...modelo.anotar({ ...e, resultado: "Texto del post", origenResultado: "claude" }, "generado"), estado: "revision" };
  assert.equal(resumen.estadoEditorial(e), "pendiente_revision");
  assert.equal(resumen.estadoEjecucion(e).estado, "completada");
  assert.equal(resumen.etapa(e).accion, "revisar");
  const aprobado = modelo.cambiarEstado(e, "aprobado", { hechos: true, derechos: true, marca: true });
  assert.equal(resumen.estadoEditorial(aprobado), "aprobado");
  assert.deepEqual(resumen.estadoEntrega(aprobado), [{ canal: "instagram", estado: "lista_para_descargar" }], "aprobado = listo para descargar, no publicado");
  assert.deepEqual(resumen.estadoEntrega(e), [{ canal: "instagram", estado: "no_enviada" }]);
  const conCambios = { ...e, estado: "pendiente" as const, notaCambios: "Más corto" };
  assert.equal(resumen.estadoEditorial(conCambios), "cambios_solicitados");
  assert.equal(resumen.etapa(conCambios).accion, "aplicar_cambios");
});

test("fallo de ejecución: queda en el historial con el motivo, conserva el resultado y reintentar no duplica", async () => {
  const p = await almacen.leerProduccion();
  const e = base({ resultado: "Versión anterior" });
  await almacen.guardarProduccion(p.revision, (a) => ({ ...a, encargos: [e, ...a.encargos] }));
  await generacion.registrarFallo(e.id, "La IA superó el tiempo de espera.", "claude");
  const tras = (await almacen.leerProduccion()).encargos;
  const guardado = tras.find((x) => x.id === e.id)!;
  assert.equal(tras.filter((x) => x.titulo === e.titulo).length, 1, "un solo encargo");
  assert.equal(guardado.resultado, "Versión anterior", "el resultado anterior se conserva");
  assert.equal(guardado.version, e.version);
  const ej = resumen.estadoEjecucion(guardado);
  assert.deepEqual([ej.estado, ej.proveedor, ej.motivo], ["fallida", "claude", "La IA superó el tiempo de espera."]);
  // Sin resultado y con fallo: la acción es reintentar (sobre el mismo encargo).
  assert.equal(resumen.etapa({ ...guardado, resultado: "" }).accion, "reintentar");
  // Una entrega posterior deja la ejecución como completada.
  const despues = modelo.anotar({ ...guardado, origenResultado: "claude" }, "generado");
  assert.equal(resumen.estadoEjecucion(despues).estado, "completada");
});

test("relaciones: un evento con varias fuentes se vincula por URL exacta; sin coincidencias, procedencia no registrada", async () => {
  const dia = tiempo.sumarDias(tiempo.diaLocal(), 5);
  const nuevo = (titulo: string, url: string) =>
    eventos.crearEvento({ titulo, fecha: dia, hora: null, lugar: "", municipio: "", departamento: "Cuscatlán", categoria: "otro", precio: null, boletosUrl: null, fuenteUrl: url, confirmadoEn: {}, sugerencias: {}, descripcion: "", imagenUrl: null, notaVerificacion: "", granjaId: null, ejecucionId: null });
  const maiz = nuevo("Festival del Maíz de Suchitoto", "https://www.smartticket.fun/es/event/maiz");
  eventos.agregarFuente(maiz.id, { url: "https://elsalvador.travel/esp/event/maiz", via: "web", campos: ["titulo"], datos: {} });
  // Mismo título parecido pero otra URL: no se relaciona.
  nuevo("Festival del Maíz (otra edición)", "https://elsalvador.travel/esp/event/otro");
  const p = await almacen.leerProduccion();
  const e = base();
  const sinRelacion = base({ titulo: "Encargo sin fuentes de eventos", fuentes: [{ nombre: "Blog", url: "https://ejemplo.com/x", imagen: "", nota: "" }] });
  await almacen.guardarProduccion(p.revision, (a) => ({ ...a, encargos: [e, sinRelacion, ...a.encargos] }));
  const r = await relaciones.relacionesEncargo(e.id);
  assert.deepEqual(r!.eventos.map((x) => x.titulo), ["Festival del Maíz de Suchitoto"], "un evento único aunque coincida por su fuente sumada");
  const vacio = await relaciones.relacionesEncargo(sinRelacion.id);
  assert.equal(vacio!.eventos.length, 0);
  assert.equal(await relaciones.relacionesEncargo(crypto.randomUUID()), null);
});
