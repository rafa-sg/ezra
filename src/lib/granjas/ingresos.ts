/**
 * Cortes oficiales de ingresos al país, cargados a mano por CSV. Cada dato es un «corte»:
 * fuente (DGME | MITUR), métrica (ingresos | visitantes), período (mes, trimestre, semestre o año)
 * con sus fechas, puesto o país, valor y fecha de carga. Nunca se inventa un dato: una fila sin valor
 * no se guarda, y lo que falta queda vacío.
 *
 * DGME mide ingresos registrados por puesto migratorio; MITUR mide visitantes internacionales. Son
 * metodologías distintas: nunca se suman ni comparten un número.
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { enqueueWrite, writeJsonAtomic } from "../store";
import { PUESTOS_CATALOGO } from "./datos-pais";
import { COLUMNAS, PLANTILLA_CSV, etiquetaPeriodo } from "./ingresos-formato";

export const FUENTES = ["DGME", "MITUR"] as const;
export const PERIODOS = ["mes", "trimestre", "semestre", "anio"] as const;
/** Cada fuente tiene su métrica: DGME → ingresos; MITUR → visitantes. */
export const METRICA_DE = { DGME: "ingresos", MITUR: "visitantes" } as const;
export type Fuente = (typeof FUENTES)[number];
export type TipoPeriodo = (typeof PERIODOS)[number];
const MESES_DE: Record<TipoPeriodo, number> = { mes: 1, trimestre: 3, semestre: 6, anio: 12 };

const dia = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const corte = z.object({
  fuente: z.enum(FUENTES),
  metrica: z.enum(["ingresos", "visitantes"]),
  periodo: z.enum(PERIODOS),
  desde: z.string().regex(dia),
  hasta: z.string().regex(dia),
  /** Id del puesto del catálogo, país en minúsculas sin acentos, o «total». */
  clave: z.string().min(1).max(80),
  /** Como venía en el CSV (para mostrar el nombre del país tal cual). */
  etiqueta: z.string().min(1).max(80),
  valor: z.number().int().nonnegative(),
  cargado: z.string(),
});
export type Corte = z.infer<typeof corte>;

export { COLUMNAS, PLANTILLA_CSV, etiquetaPeriodo };

const sinAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
/** Puesto del catálogo (por id, nombre o alias) o null si es un país o «total». */
export function puestoDe(texto: string) {
  const t = sinAcento(texto);
  return PUESTOS_CATALOGO.find((p) => p.id === t || sinAcento(p.nombre) === t || p.alias?.some((a) => sinAcento(a) === t)) ?? null;
}
export const claveDe = (texto: string) => {
  const t = sinAcento(texto);
  return t === "total" ? "total" : (puestoDe(texto)?.id ?? t);
};

function celdas(linea: string) {
  const out: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') comillas = false;
      else actual += c;
    } else if (c === '"') comillas = true;
    else if (c === "," || c === ";") {
      out.push(actual.trim());
      actual = "";
    } else actual += c;
  }
  out.push(actual.trim());
  return out;
}

const meses = (desde: string, hasta: string) =>
  (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7)) + 1;
const ultimoDia = (m: string) => {
  const d = new Date(`${m}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};
export const claveCorte = (c: Pick<Corte, "fuente" | "metrica" | "clave" | "desde" | "hasta">) =>
  [c.fuente, c.metrica, c.clave, c.desde, c.hasta].join("|");

/** Lee y valida el CSV. Devuelve los cortes, los errores por fila y las filas vacías (sin valor). */
export function leerCsv(texto: string, ahora = new Date().toISOString()) {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const errores: string[] = [];
  const cortes: Corte[] = [];
  let vacias = 0;
  if (!lineas.length) return { cortes, errores: ["El archivo está vacío."], vacias };
  const cab = celdas(lineas[0]).map(sinAcento);
  const faltan = COLUMNAS.filter((c) => !cab.includes(c));
  if (faltan.length) return { cortes, errores: [`Faltan columnas: ${faltan.join(", ")}.`], vacias };
  lineas.slice(1).forEach((l, i) => {
    const c = celdas(l);
    const v = (n: string) => c[cab.indexOf(n)] ?? "";
    const fila = `Fila ${i + 2}`;
    const bruto = v("valor").replace(/[\s.,](?=\d{3}\b)/g, "");
    // Un dato ausente queda vacío: no se guarda ni se convierte en cero.
    if (!bruto) return void vacias++;
    const fuente = v("fuente").toUpperCase();
    const metrica = sinAcento(v("metrica"));
    const periodo = sinAcento(v("periodo_tipo")).replace("ano", "anio");
    const [desde, hasta] = [v("desde"), v("hasta")];
    const lugar = v("puesto_o_pais");
    const r = corte.safeParse({ fuente, metrica, periodo, desde, hasta, clave: lugar ? claveDe(lugar) : "", etiqueta: puestoDe(lugar)?.nombre ?? lugar, valor: Number(bruto), cargado: ahora });
    if (!r.success) return void errores.push(`${fila}: ${r.error.issues.map((x) => `${x.path.join(".") || "valor"} inválido`).join("; ")}`);
    const d = r.data;
    if (METRICA_DE[d.fuente] !== d.metrica) return void errores.push(`${fila}: ${d.fuente} mide «${METRICA_DE[d.fuente]}», no «${d.metrica}» (no se mezclan).`);
    if (d.desde > d.hasta) return void errores.push(`${fila}: «desde» es posterior a «hasta».`);
    if (d.desde.slice(8) !== "01" || d.hasta !== ultimoDia(d.hasta.slice(0, 7)) || meses(d.desde, d.hasta) !== MESES_DE[d.periodo])
      return void errores.push(`${fila}: las fechas no forman un ${d.periodo} completo (del día 1 al último día del mes).`);
    if (d.fuente === "MITUR" && puestoDe(lugar)) return void errores.push(`${fila}: MITUR no publica por puesto migratorio.`);
    cortes.push(d);
  });
  return { cortes, errores, vacias };
}

/** Duplicados: dentro del archivo y contra lo ya guardado (mismo puesto o país y mismo período). */
export function duplicados(nuevos: Corte[], guardados: Corte[]) {
  const previos = new Map(guardados.map((c) => [claveCorte(c), c]));
  const vistos = new Set<string>();
  const enArchivo: string[] = [];
  const contraGuardados: { etiqueta: string; desde: string; hasta: string; antes: number; ahora: number }[] = [];
  for (const c of nuevos) {
    const k = claveCorte(c);
    if (vistos.has(k)) enArchivo.push(`${c.etiqueta} ${c.desde}–${c.hasta}`);
    vistos.add(k);
    const p = previos.get(k);
    if (p) contraGuardados.push({ etiqueta: c.etiqueta, desde: c.desde, hasta: c.hasta, antes: p.valor, ahora: c.valor });
  }
  return { enArchivo, contraGuardados };
}

const archivo = () => path.join(process.env.EZRA_DATA_DIR || path.join(process.cwd(), "data"), "granjas", "ingresos-cortes.json");
export async function leerCortes(): Promise<Corte[]> {
  try {
    return z.array(corte).catch([]).parse(JSON.parse(await readFile(archivo(), "utf8")).cortes);
  } catch {
    return [];
  }
}
/** Guarda los cortes; un duplicado del mismo puesto y período reemplaza al anterior solo si se confirma. */
export function guardarCortes(nuevos: Corte[], reemplazar: boolean) {
  return enqueueWrite(async () => {
    const por = new Map((await leerCortes()).map((c) => [claveCorte(c), c]));
    let omitidos = 0;
    for (const c of nuevos) {
      if (por.has(claveCorte(c)) && !reemplazar) omitidos++;
      else por.set(claveCorte(c), c);
    }
    const cortes = [...por.values()].sort((a, b) => a.desde.localeCompare(b.desde) || a.clave.localeCompare(b.clave));
    await mkdir(path.dirname(archivo()), { recursive: true });
    await writeJsonAtomic(archivo(), { cortes });
    return { total: cortes.length, omitidos };
  });
}

/* ── Resumen para la interfaz ── */

const anioAntes = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`.replace(/-02-29$/, "-02-28");
export type Periodo = { clave: string; tipo: TipoPeriodo; desde: string; hasta: string; etiqueta: string };
export type Barra = { clave: string; etiqueta: string; valor: number; porcentaje: number | null; variacion: number | null; cargado: string };

/**
 * Resumen de una fuente en un período: valor por puesto (DGME) y por país, con su % del total y su
 * variación contra el mismo período del año anterior; los períodos cargados; la serie por mes o, si
 * solo hay cortes largos, una barra por período.
 */
export function resumenIngresos(todos: Corte[], hoy: string, fuente: Fuente = "DGME", periodoPedido?: string | null) {
  const cortes = todos.filter((c) => c.fuente === fuente);
  const periodos: Periodo[] = [...new Map(cortes.map((c) => [`${c.desde}_${c.hasta}`, c])).values()]
    .map((c) => ({ clave: `${c.desde}_${c.hasta}`, tipo: c.periodo, desde: c.desde, hasta: c.hasta, etiqueta: etiquetaPeriodo(c.desde, c.hasta) }))
    .sort((a, b) => b.hasta.localeCompare(a.hasta) || MESES_DE[b.tipo] - MESES_DE[a.tipo]);
  const periodo = periodos.find((p) => p.clave === periodoPedido) ?? periodos[0] ?? null;
  const del = (p: { desde: string; hasta: string } | null) => (p ? cortes.filter((c) => c.desde === p.desde && c.hasta === p.hasta) : []);
  const actuales = del(periodo);
  const previos = periodo ? del({ desde: anioAntes(periodo.desde), hasta: anioAntes(periodo.hasta) }) : [];
  const esPuesto = (c: Corte) => PUESTOS_CATALOGO.some((p) => p.id === c.clave);
  const totalPublicado = actuales.find((c) => c.clave === "total")?.valor ?? null;
  const barras = (filtro: (c: Corte) => boolean): Barra[] => {
    const filas = actuales.filter(filtro);
    // El % usa el total publicado; si no hay, la suma de lo cargado en esa misma gráfica.
    const total = totalPublicado ?? filas.reduce((s, c) => s + c.valor, 0);
    return filas
      .map((c) => {
        const antes = previos.find((p) => p.clave === c.clave)?.valor;
        return {
          clave: c.clave,
          etiqueta: c.etiqueta,
          valor: c.valor,
          porcentaje: total ? (c.valor / total) * 100 : null,
          variacion: antes ? ((c.valor - antes) / antes) * 100 : null,
          cargado: c.cargado,
        };
      })
      .sort((a, b) => b.valor - a.valor);
  };
  const totalAntes = previos.find((c) => c.clave === "total")?.valor;
  return {
    fuente,
    metrica: METRICA_DE[fuente],
    periodos,
    periodo,
    total: totalPublicado,
    variacionTotal: totalPublicado !== null && totalAntes ? ((totalPublicado - totalAntes) / totalAntes) * 100 : null,
    puestos: fuente === "DGME" ? Object.fromEntries(barras(esPuesto).map((b) => [b.clave, b])) : {},
    paises: barras((c) => c.clave !== "total" && !esPuesto(c)),
    cargado: actuales.map((c) => c.cargado).sort().at(-1) ?? null,
    // Una barra por período largo (semestre, año…) cuando no hay datos mensuales.
    porPeriodo: periodos
      .filter((p) => p.tipo !== "mes")
      .map((p) => ({ ...p, valor: totalDe(del(p)) }))
      .filter((p): p is Periodo & { valor: number } => p.valor !== null)
      .sort((a, b) => a.desde.localeCompare(b.desde)),
    anual: cortes.some((c) => c.periodo === "mes") ? serieAnual(cortes, hoy) : null,
  };
}
export type ResumenIngresos = ReturnType<typeof resumenIngresos>;

/** Total de un período: el total publicado; si no hay, la suma de puestos (nunca puestos + países). */
function totalDe(filas: Corte[]) {
  const t = filas.find((c) => c.clave === "total");
  if (t) return t.valor;
  const puestos = filas.filter((c) => PUESTOS_CATALOGO.some((p) => p.id === c.clave));
  return puestos.length ? puestos.reduce((s, c) => s + c.valor, 0) : null;
}
const sumarMes = (m: string, n: number) => {
  const d = new Date(`${m}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export type Estimacion = { valor: number; bajo: number; alto: number; metodo: "interanual" | "tendencia" };

/**
 * Los 12 meses del año (el actual, o el último con datos mensuales) y una estimación NO oficial del
 * cierre del mes en curso, del mes siguiente y del año. Solo con al menos 3 meses cerrados:
 * «interanual» (mismo mes del año anterior × variación de los meses comparables) o «tendencia»
 * (mínimos cuadrados). Rango = error medio de la tendencia (mínimo ±5 %).
 */
export function serieAnual(cortes: Corte[], hoy: string, anioPedido?: number) {
  const mensuales = cortes.filter((c) => c.periodo === "mes");
  const delMes = (m: string) => totalDe(mensuales.filter((c) => c.desde.startsWith(m)));
  const conDatos = [...new Set(mensuales.map((c) => c.desde.slice(0, 7)))].sort();
  const anioHoy = Number(hoy.slice(0, 4));
  const anio = anioPedido ?? (conDatos.some((m) => m.startsWith(String(anioHoy))) || !conDatos.length ? anioHoy : Number(conDatos.at(-1)!.slice(0, 4)));
  const mesHoy = hoy.slice(0, 7);
  const serie = Array.from({ length: 12 }, (_, i) => {
    const mes = `${anio}-${String(i + 1).padStart(2, "0")}`;
    return { mes, valor: delMes(mes), parcial: mes === mesHoy };
  });
  const cerrados = serie.filter((m) => m.valor !== null && !m.parcial && m.mes < mesHoy);
  let proximo: (Estimacion & { mes: string }) | null = null;
  let cierreActual: (Estimacion & { mes: string; acumulado: number }) | null = null;
  let anioEstimado: (Estimacion & { reales: number; estimados: number }) | null = null;
  const porMes: Record<string, Estimacion> = {};
  if (cerrados.length >= 3) {
    const xs = cerrados.map((m) => Number(m.mes.slice(5)) - 1);
    const ys = cerrados.map((m) => m.valor!);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const pend = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
    const recta = (x: number) => Math.max(0, my + pend * (x - mx));
    const error = Math.max(0.05, ys.reduce((s, y, i) => s + Math.abs(y - recta(xs[i])) / (y || 1), 0) / n);
    const anterior = cerrados.map((m) => delMes(sumarMes(m.mes, -12)));
    const factor = anterior.every((v) => v !== null) ? ys.reduce((a, b) => a + b, 0) / (anterior.reduce((a, b) => a! + b!, 0)! || 1) : null;
    const estimar = (mes: string): Estimacion => {
      const previo = factor !== null ? delMes(sumarMes(mes, -12)) : null;
      const valor = previo !== null ? previo * factor! : recta(Number(mes.slice(5)) - 1 + (Number(mes.slice(0, 4)) - anio) * 12);
      return { valor: Math.round(valor), bajo: Math.round(valor * (1 - error)), alto: Math.round(valor * (1 + error)), metodo: previo !== null ? "interanual" : "tendencia" };
    };
    const ultimoCerrado = cerrados.at(-1)!.mes;
    const enCurso = sumarMes(ultimoCerrado, 1) === mesHoy;
    const siguiente = enCurso ? sumarMes(mesHoy, 1) : sumarMes(ultimoCerrado, 1);
    proximo = { mes: siguiente, ...estimar(siguiente) };
    if (enCurso) {
      const e = estimar(mesHoy);
      const piso = serie.find((m) => m.mes === mesHoy)?.valor ?? 0;
      cierreActual = { mes: mesHoy, acumulado: piso, ...e, valor: Math.max(e.valor, piso), bajo: Math.max(e.bajo, piso), alto: Math.max(e.alto, piso) };
    }
    const faltan = serie.filter((m) => !(m.valor !== null && !m.parcial && m.mes < mesHoy));
    const estimados = faltan.map((m) => (m.mes === cierreActual?.mes ? (cierreActual as Estimacion) : estimar(m.mes)));
    faltan.forEach((m, i) => (porMes[m.mes] = estimados[i]));
    const reales = cerrados.reduce((s, m) => s + m.valor!, 0);
    anioEstimado = {
      valor: reales + estimados.reduce((s, e) => s + e.valor, 0),
      bajo: reales + estimados.reduce((s, e) => s + e.bajo, 0),
      alto: reales + estimados.reduce((s, e) => s + e.alto, 0),
      metodo: estimados.every((e) => e.metodo === "interanual") ? "interanual" : "tendencia",
      reales: cerrados.length,
      estimados: estimados.length,
    };
  }
  return { anio, serie, cerrados: cerrados.length, proximo, cierreActual, porMes, anioEstimado };
}
