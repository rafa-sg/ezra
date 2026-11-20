import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/: nunca data/.
process.env.EZRA_DATA_DIR = path.resolve(`work/trazabilidad-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
let traza: typeof import("../src/lib/granjas/trazabilidad");
let eventos: typeof import("../src/lib/granjas/eventos");
let ig: typeof import("../src/lib/granjas/instagram");
let modelo: typeof import("../src/lib/produccion/modelo");
let tiempo: typeof import("../src/lib/granjas/tiempo");
let db: typeof import("../src/lib/granjas/db");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  traza = await import("../src/lib/granjas/trazabilidad");
  eventos = await import("../src/lib/granjas/eventos");
  ig = await import("../src/lib/granjas/instagram");
  modelo = await import("../src/lib/produccion/modelo");
  tiempo = await import("../src/lib/granjas/tiempo");
  db = await import("../src/lib/granjas/db");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
const nuevo = (titulo: string, departamento: string, dias: number, url: string) =>
  eventos.crearEvento({ titulo, fecha: tiempo.sumarDias(tiempo.diaLocal(), dias), hora: null, lugar: "", municipio: "", departamento, categoria: "otro", precio: null, boletosUrl: null, fuenteUrl: url, confirmadoEn: {}, sugerencias: {}, descripcion: "", imagenUrl: null, notaVerificacion: "", granjaId: null, ejecucionId: null });

test("procedencia y producción con vínculos reales; conteos únicos y explicados; filtros por tipo de fecha", () => {
  const maiz = nuevo("Festival del Maíz de Suchitoto", "Cuscatlán", 3, "https://www.smartticket.fun/es/event/maiz");
  eventos.agregarFuente(maiz.id, { url: "https://elsalvador.travel/esp/event/maiz", via: "web", campos: ["titulo"], datos: {} });
  eventos.agregarFuente(maiz.id, { url: "https://www.elsalvador.com/nota/maiz", via: "web", campos: ["titulo"], datos: {} });
  const teatro = nuevo("Concierto en el Teatro Nacional", "san salvador", 5, "https://elsalvador.travel/esp/event/teatro");
  const sin = nuevo("Evento sin departamento", "", 7, "https://elsalvador.travel/esp/event/sin");
  // Post de Instagram del maíz, subido a mano (confirmado por el usuario, no por Instagram).
  const aprobado = eventos.aprobarEvento(maiz.id, eventos.leerEvento(maiz.id).revision);
  const post = ig.crearPost({ eventoId: aprobado.id, granjaId: null, ejecucionId: null, cuenta: "@spotmi.sv", texto: ig.textoPlantilla(aprobado), textoOrigen: "plantilla", nota: "" });
  db.base().prepare("update posts_ig set estado = 'subido', ig_url = 'https://www.instagram.com/p/ABC/', subido = ? where id = ?").run(new Date().toISOString(), post.id);
  // Spotmi: el teatro tiene clave de envío guardada pero sin respuesta (envío sin confirmar).
  db.base().prepare("update eventos set spotmi_clave = 'k1' where id = ?").run(teatro.id);
  // Un encargo que reúne dos eventos (por URL exacta) y otro sin relación.
  const encargo = modelo.crearEncargo({ titulo: "Carrusel del fin de semana", agente: "redactor_ig", proveedor: "claude", canales: ["instagram"], encargo: "x", resultado: "", fuentes: [{ nombre: "MITUR", url: "https://elsalvador.travel/esp/event/maiz", imagen: "", nota: "" }, { nombre: "MITUR", url: "https://elsalvador.travel/esp/event/teatro", imagen: "", nota: "" }], fechaPrevista: "" });
  const suelto = modelo.crearEncargo({ titulo: "Encargo suelto", agente: "descripcion", proveedor: "claude", canales: ["spotmi"], encargo: "x", resultado: "", fuentes: [{ nombre: "Blog", url: "https://ejemplo.com/a", imagen: "", nota: "" }], fechaPrevista: "" });
  const t = traza.trazabilidad({}, { encargos: [encargo, suelto] });
  assert.equal(t.totales.eventos, 3);
  assert.equal(t.totales.relacionesProcedencia, 5, "maíz con 3 fuentes + teatro 1 + sin 1");
  assert.equal(t.totales.sinUbicacion, 1);
  const m = t.eventos.find((e) => e.id === maiz.id)!;
  assert.equal(m.registros.length, 3);
  assert.deepEqual(m.registros.map((r) => r.etiqueta).sort(), ["El Diario de Hoy", "MITUR", "Smart Ticket"]);
  // Una fuente con varios eventos: MITUR aparece en los tres (eventos únicos 3).
  assert.equal(t.fuentes.find((f) => f.etiqueta === "MITUR")!.eventos, 3);
  // El encargo reúne dos eventos; el suelto no se relaciona con nada (no aparece).
  const c = t.contenidos.find((x) => x.id === `encargo:${encargo.id}`)!;
  assert.deepEqual(c.eventos.sort(), [maiz.id, teatro.id].sort());
  assert.ok(!t.contenidos.some((x) => x.id === `encargo:${suelto.id}`));
  // Post subido a mano: confirmado por el usuario (no por el proveedor).
  const p = t.contenidos.find((x) => x.tipo === "post_ig")!;
  assert.deepEqual([p.destinos[0].estado, p.destinos[0].realizado], ["confirmada_por_usuario", true]);
  assert.equal(t.eventos.find((e) => e.id === teatro.id)!.spotmi.estado, "envio_sin_confirmar");
  // Departamentos: canónicos; un contenido con eventos de dos departamentos cuenta en ambos.
  const dep = Object.fromEntries(t.departamentos.map((d) => [d.nombre, d]));
  assert.equal(dep["San Salvador"].eventos, 1);
  assert.equal(dep["Cuscatlán"].contenidos, 2, "post + encargo");
  assert.equal(dep["San Salvador"].contenidos, 1, "el encargo también cuenta aquí");
  assert.equal(dep["sin_ubicacion"].eventos, 1);
  // Filtros compartidos.
  assert.deepEqual(traza.trazabilidad({ fuente: "smartticket.fun" }, { encargos: [encargo] }).eventos.map((e) => e.id), [maiz.id]);
  assert.deepEqual(traza.trazabilidad({ departamento: "sin_ubicacion" }).eventos.map((e) => e.id), [sin.id]);
  assert.deepEqual(traza.trazabilidad({ destino: "instagram" }, { encargos: [encargo] }).eventos.map((e) => e.id), [maiz.id], "solo el que tiene una entrega real a Instagram");
  const hoy = tiempo.diaLocal();
  assert.equal(traza.trazabilidad({ desde: hoy, hasta: hoy, tipoFecha: "descubrimiento" }).eventos.length, 3, "los tres se descubrieron hoy");
  assert.equal(traza.trazabilidad({ desde: hoy, hasta: hoy, tipoFecha: "evento" }).eventos.length, 0, "ninguno ocurre hoy");
  assert.deepEqual(traza.trazabilidad({ desde: hoy, hasta: hoy, tipoFecha: "publicacion" }, { encargos: [encargo] }).eventos.map((e) => e.id), [maiz.id], "solo el publicado hoy");
  void sin;
});
