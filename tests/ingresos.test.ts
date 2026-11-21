import test from "node:test";
import assert from "node:assert/strict";
import { leerCsv, resumenIngresos } from "../src/lib/granjas/ingresos";

const csv = `fecha,nacionalidad,puesto,tipo_movimiento,valor,fuente,fecha_corte,url,alcance
2026-10,total,hachadura,entrada,1200,DGME El Salvador,2026-11-05,,
2026-10,guatemalteca,hachadura,entrada,800,DGME El Salvador,2026-11-05,,
2026-10,guatemalteca,todos,entrada,5000,DGME El Salvador,2026-11-05,,
2026-10,hondureña,el-amatillo,entrada,,DGME El Salvador,2026-11-05,,
2026-11-01,total,el-poy,entrada,30,DGME El Salvador,2026-11-15,,
2026-11-02,total,el-poy,entrada,45,DGME El Salvador,2026-11-15,,
2026-10,total,guatemala,salida_origen,9000,IGM Guatemala,2026-11-02,,Salidas hacia El Salvador por todos los puestos
2026-10,total,aies,pasajeros_llegada,150000,CEPA,2026-11-10,,`;

test("CSV: valida columnas, deja vacío lo ausente y rechaza filas malas", () => {
  const r = leerCsv(csv);
  assert.equal(r.errores.length, 0);
  assert.equal(r.vacias, 1);
  assert.equal(r.filas.length, 7);
  const malo = leerCsv("fecha,nacionalidad,puesto,tipo_movimiento,valor,fuente,fecha_corte\n2026-13,total,x,entrada,5,DGME,2026-11-01");
  assert.ok(malo.errores.length === 1 && malo.filas.length === 0);
  assert.match(leerCsv("fecha,valor\n").errores[0], /Faltan columnas/);
});

test("resumen: sin doble conteo, acumulado del mes en curso y último mes publicado", () => {
  const { filas } = leerCsv(csv);
  const oct = resumenIngresos(filas, "2026-11-21", "2026-10");
  assert.equal(oct.cruces.hachadura?.valor, 1200); // el total gana sobre el desglose
  assert.equal(oct.cruces["el-amatillo"], null); // ausente: vacío, no cero
  assert.equal(oct.nacionalidad.guatemalteca?.valor, 5000); // el total nacional gana sobre la suma de puestos
  assert.equal(oct.nacionalidad.hondureña, null);
  assert.equal(oct.origen.guatemala[0].cifra.valor, 9000);
  assert.equal(oct.cepa?.valor, 150000);
  const nov = resumenIngresos(filas, "2026-11-21", null);
  assert.equal(nov.mes, "2026-11");
  assert.equal(nov.enCurso, true);
  assert.equal(nov.cruces["el-poy"]?.valor, 75);
  assert.equal(nov.cruces["el-poy"]?.diario, true);
  assert.match(nov.cruces["el-poy"]!.periodo, /acumulado al 2026-11-15/);
  assert.equal(resumenIngresos([], "2026-11-21").mes, null);
});

test("serie anual: 12 meses, vacíos sin inventar y estimación solo con 3 meses cerrados", async () => {
  const { serieAnual } = await import("../src/lib/granjas/ingresos");
  const fila = (fecha: string, valor: number) =>
    leerCsv(`fecha,nacionalidad,puesto,tipo_movimiento,valor,fuente,fecha_corte\n${fecha},total,todos,entrada,${valor},DGME,2026-11-05`).filas[0];
  const pocos = serieAnual([fila("2026-01", 100), fila("2026-02", 110)], "2026-11-21");
  assert.equal(pocos.serie.length, 12);
  assert.equal(pocos.serie[2].valor, null);
  assert.equal(pocos.proximo, null);
  // Tendencia: 100, 110, 120 → abril ≈ 130.
  const t = serieAnual([fila("2026-01", 100), fila("2026-02", 110), fila("2026-03", 120)], "2026-11-21");
  assert.equal(t.proximo?.mes, "2026-04"); // el mes en curso (nov) no sigue a marzo: el próximo es abril
  assert.equal(t.proximo?.valor, 130);
  assert.equal(t.proximo?.metodo, "tendencia");
  assert.ok(t.proximo!.bajo < 130 && t.proximo!.alto > 130);
  // Interanual: el año anterior completo y +10 % en los meses comparables.
  const previos = Array.from({ length: 12 }, (_, i) => fila(`2025-${String(i + 1).padStart(2, "0")}`, 1000));
  const ia = serieAnual([...previos, fila("2026-01", 1100), fila("2026-02", 1100), fila("2026-03", 1100)], "2026-11-21");
  assert.equal(ia.proximo?.metodo, "interanual");
  assert.equal(ia.proximo?.valor, 1100);
  assert.equal(ia.anioEstimado?.valor, 13200);
});

test("estimación: con el mes en curso parcial, cierre del mes y el siguiente", async () => {
  const { serieAnual } = await import("../src/lib/granjas/ingresos");
  const fila = (fecha: string, valor: number) =>
    leerCsv(`fecha,nacionalidad,puesto,tipo_movimiento,valor,fuente,fecha_corte\n${fecha},total,todos,entrada,${valor},DGME,2026-11-18`).filas[0];
  const filas = Array.from({ length: 10 }, (_, i) => fila(`2026-${String(i + 1).padStart(2, "0")}`, 100 + i * 10));
  const a = serieAnual([...filas, fila("2026-11-01", 500)], "2026-11-21");
  assert.equal(a.proximo?.mes, "2026-12");
  assert.equal(a.cierreActual?.mes, "2026-11");
  assert.ok(a.cierreActual!.valor >= 500); // nunca por debajo de lo registrado
  assert.ok(a.porMes["2026-12"] && a.porMes["2026-11"]);
});
