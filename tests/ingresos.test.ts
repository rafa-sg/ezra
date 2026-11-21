import test from "node:test";
import assert from "node:assert/strict";
import { duplicados, etiquetaPeriodo, leerCsv, resumenIngresos, serieAnual, type Corte } from "../src/lib/granjas/ingresos";

const cab = "fuente,metrica,periodo_tipo,desde,hasta,puesto_o_pais,valor";
const csv = (...filas: string[]) => [cab, ...filas].join("\n");

test("CSV: columnas, fuente↔métrica, fechas de período completas, vacíos sin cero", () => {
  const r = leerCsv(
    csv(
      "DGME,ingresos,semestre,2024-01-01,2024-06-30,La Hachadura,120000",
      "DGME,ingresos,semestre,2024-01-01,2024-06-30,Pedro de Alvarado,1",
      "DGME,ingresos,semestre,2024-01-01,2024-06-30,El Amatillo,",
      "MITUR,ingresos,mes,2026-01-01,2026-01-31,total,5",
      "DGME,ingresos,semestre,2024-01-01,2024-05-31,total,5",
      "MITUR,visitantes,mes,2026-01-01,2026-01-31,La Hachadura,5",
      "MITUR,visitantes,mes,2026-01-01,2026-01-31,Estados Unidos,\"1,234\"",
    ),
  );
  assert.equal(r.vacias, 1);
  assert.equal(r.cortes.length, 3);
  assert.equal(r.cortes[0].clave, "hachadura");
  assert.equal(r.cortes[1].clave, "hachadura"); // alias
  assert.equal(r.cortes[2].valor, 1234);
  assert.equal(r.errores.length, 3);
  assert.match(leerCsv("fuente,valor\n").errores[0], /Faltan columnas/);
});

test("duplicados: dentro del archivo y contra lo guardado", () => {
  const { cortes } = leerCsv(csv("DGME,ingresos,anio,2024-01-01,2024-12-31,total,10", "DGME,ingresos,anio,2024-01-01,2024-12-31,total,11"));
  const d = duplicados(cortes, [{ ...cortes[0], valor: 9 }]);
  assert.equal(d.enArchivo.length, 1);
  assert.equal(d.contraGuardados[0].antes, 9);
});

test("resumen: % del total, variación interanual, barras por período y DGME/MITUR separados", () => {
  const { cortes } = leerCsv(
    csv(
      "DGME,ingresos,semestre,2024-01-01,2024-06-30,total,1000",
      "DGME,ingresos,semestre,2024-01-01,2024-06-30,La Hachadura,250",
      "DGME,ingresos,semestre,2024-01-01,2024-06-30,Guatemala,400",
      "DGME,ingresos,semestre,2023-01-01,2023-06-30,La Hachadura,200",
      "DGME,ingresos,semestre,2023-01-01,2023-06-30,total,800",
      "MITUR,visitantes,mes,2026-01-01,2026-01-31,total,413000",
    ),
  );
  const r = resumenIngresos(cortes, "2026-11-21", "DGME");
  assert.equal(r.periodo?.etiqueta, "ene–jun 2024");
  assert.equal(r.puestos.hachadura.porcentaje, 25);
  assert.equal(r.puestos.hachadura.variacion, 25);
  assert.equal(r.variacionTotal, 25);
  assert.deepEqual(r.paises.map((p) => p.etiqueta), ["Guatemala"]);
  assert.deepEqual(r.porPeriodo.map((p) => p.valor), [800, 1000]);
  assert.equal(r.anual, null); // sin datos mensuales no hay gráfico mensual
  const m = resumenIngresos(cortes, "2026-11-21", "MITUR");
  assert.equal(m.total, 413000);
  assert.deepEqual(m.puestos, {});
  assert.equal(etiquetaPeriodo("2024-01-01", "2024-12-31"), "2024");
});

test("serie anual: estimación solo con 3 meses cerrados; cierre del mes en curso y siguiente", () => {
  const mes = (m: number, v: number) => `DGME,ingresos,mes,2026-${String(m).padStart(2, "0")}-01,2026-${String(m).padStart(2, "0")}-${new Date(Date.UTC(2026, m, 0)).getUTCDate()},total,${v}`;
  const dos = leerCsv(csv(mes(1, 100), mes(2, 110))).cortes;
  assert.equal(serieAnual(dos, "2026-11-21").proximo, null);
  const tres: Corte[] = leerCsv(csv(mes(1, 100), mes(2, 110), mes(3, 120))).cortes;
  const t = serieAnual(tres, "2026-11-21");
  assert.equal(t.proximo?.mes, "2026-04");
  assert.equal(t.proximo?.valor, 130);
  const diez = leerCsv(csv(...Array.from({ length: 10 }, (_, i) => mes(i + 1, 100 + i * 10)), mes(11, 500))).cortes;
  const a = serieAnual(diez, "2026-11-21");
  assert.equal(a.proximo?.mes, "2026-12");
  assert.ok(a.cierreActual!.valor >= 500);
});
