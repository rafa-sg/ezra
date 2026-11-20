import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Base de prueba en work/: nunca data/.
process.env.EZRA_DATA_DIR = path.resolve(`work/panorama-test-${process.pid}-${Date.now()}`);
process.env.EZRA_GRANJAS_TRABAJADOR = "0";
let panorama: typeof import("../src/lib/granjas/panorama");
let eventos: typeof import("../src/lib/granjas/eventos");
let almacen: typeof import("../src/lib/granjas/almacen");
let tiempo: typeof import("../src/lib/granjas/tiempo");
let db: typeof import("../src/lib/granjas/db");
before(async () => {
  await mkdir(process.env.EZRA_DATA_DIR!, { recursive: true });
  panorama = await import("../src/lib/granjas/panorama");
  eventos = await import("../src/lib/granjas/eventos");
  almacen = await import("../src/lib/granjas/almacen");
  tiempo = await import("../src/lib/granjas/tiempo");
  db = await import("../src/lib/granjas/db");
  assert.ok(db.archivoBase.startsWith(process.env.EZRA_DATA_DIR!), "la base de prueba vive en work/");
});
const nuevo = (titulo: string, departamento: string, dias: number, fuenteUrl: string, granjaId: string | null = null) =>
  eventos.crearEvento({ titulo, fecha: tiempo.sumarDias(tiempo.diaLocal(), dias), hora: null, lugar: "", municipio: "", departamento, categoria: "otro", precio: null, boletosUrl: null, fuenteUrl, confirmadoEn: {}, sugerencias: {}, descripcion: "", imagenUrl: null, notaVerificacion: "", granjaId, ejecucionId: null });

test("departamento canónico: acentos y mayúsculas no importan; lo desconocido es null", () => {
  assert.equal(panorama.departamentoCanonico("san salvador"), "San Salvador");
  assert.equal(panorama.departamentoCanonico("CABANAS"), "Cabañas");
  assert.equal(panorama.departamentoCanonico("Usulutan "), "Usulután");
  assert.equal(panorama.departamentoCanonico("Guatemala"), null);
  assert.equal(panorama.departamentoCanonico(""), null);
});

test("panorama: eventos vigentes por departamento, fuentes por dominio, tarjetas con lo producido y un flujo por tipo", () => {
  const g1 = almacen.crearDesdeReceta("eventos_el_salvador");
  const copia = almacen.crearDesdeReceta("eventos_el_salvador");
  almacen.crearDesdeReceta("post_instagram_eventos");
  db.base().prepare("insert into horarios (granja_id, activa, hora, dias, consentimiento, actualizado) values (?, 1, '04:30', '[0,1,2,3,4,5,6]', 1, ?)").run(g1.id, new Date().toISOString());
  const a = nuevo("Festival del Maíz de Suchitoto", "Cuscatlán", 3, "https://elsalvador.travel/esp/event/maiz", g1.id);
  nuevo("Concierto sinfónico de Navidad", "san salvador", 5, "https://www.smartticket.fun/es/event/sinfonica", g1.id);
  nuevo("Feria gastronómica de Juayúa", "Sonsonate", 7, "https://elsalvador.travel/esp/event/juayua");
  nuevo("Evento ya pasado en Santa Ana", "Santa Ana", -5, "https://elsalvador.travel/esp/event/pasado");
  nuevo("Evento sin departamento", "", 9, "https://elsalvador.travel/esp/event/sin");
  const d = nuevo("Evento descartado en La Paz", "La Paz", 4, "https://elsalvador.travel/esp/event/descartado");
  eventos.descartarEvento(d.id, d.revision, "no es turístico");
  eventos.agregarFuente(a.id, { url: "https://www.smartticket.fun/es/event/maiz", via: "web", campos: ["titulo"], datos: {} });
  const p = panorama.panoramaGranjas();
  const por = Object.fromEntries(p.mapa.departamentos.map((x) => [x.nombre, x.eventos]));
  assert.deepEqual([por["Cuscatlán"], por["San Salvador"], por["Sonsonate"], por["Santa Ana"], por["La Paz"]], [1, 1, 1, 0, 0], "pasados y descartados no cuentan");
  assert.equal(p.mapa.sinDepartamento, 1);
  const mitur = p.mapa.fuentes.find((f) => f.etiqueta === "MITUR");
  const smart = p.mapa.fuentes.find((f) => f.etiqueta === "Smart Ticket");
  assert.ok(mitur && smart, "las fuentes se nombran (MITUR, Smart Ticket)");
  assert.equal(smart!.eventos, 2, "la fuente sumada a un evento también cuenta");
  assert.equal(p.mapa.fuentes[0].etiqueta, "MITUR", "ordenadas por eventos");
  const tarjeta = p.granjas.find((x) => x.id === g1.id)!;
  assert.deepEqual([tarjeta.eventos30, tarjeta.horario?.activa, tarjeta.horario?.hora], [2, true, "04:30"]);
  assert.equal(p.granjas.find((x) => x.id === copia.id)!.eventos30, 0);
  // Flujo: la granja con horario activo (no su copia) y después la de Instagram; sin ejecuciones, sin estado.
  assert.ok(p.flujo.every((f) => f.granjaId !== copia.id));
  assert.deepEqual(p.flujo.map((f) => f.agente).slice(0, 2), ["cazador", "verificador"]);
  assert.ok(p.flujo.some((f) => f.agente === "redactor_ig"));
  assert.ok(p.flujo.every((f) => f.estado === null));
  assert.equal(p.mapa.destinos.instagram.cuenta, null, "sin conexión, sin cuenta (nunca inventada)");
});
