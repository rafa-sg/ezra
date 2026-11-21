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
