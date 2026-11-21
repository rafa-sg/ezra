/**
 * Cortes oficiales de ingresos al país cargados a mano (CSV agregado). Nunca se inventa un dato:
 * una fila sin valor no se guarda, y lo que falta queda vacío («Datos aún no disponibles»).
 *
 * Columnas: fecha, nacionalidad, puesto, tipo_movimiento, valor, fuente, fecha_corte[, url, alcance]
 * - fecha: AAAA-MM (mensual) o AAAA-MM-DD (diaria; habilita el filtro por día).
 * - tipo_movimiento:
 *   · entrada: entradas registradas por la DGME de El Salvador (la serie comparable y la mensual).
 *   · salida_origen: «Salidas hacia El Salvador registradas en origen» (IGM Guatemala, INM Honduras).
 *   · pasajeros_llegada: llegadas de pasajeros de CEPA (métrica propia del aeropuerto).
 *   · personas_presentes: solo si la fuente publica ese indicador como tal.
 * Un ingreso registrado no es una persona: quien cruza varias veces cuenta varias veces.
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { enqueueWrite, writeJsonAtomic } from "../store";
import { ACCESOS } from "./datos-pais";

export const TIPOS = [
  "entrada",
  "salida_origen",
  "pasajeros_llegada",
  "personas_presentes",
] as const;
export const NACIONALIDADES = [
  "guatemalteca",
  "hondureña",
  "salvadoreña",
  "otra",
  "total",
] as const;
const PUESTOS = [
  ...ACCESOS.flatMap((a) => a.puestos.map((p) => p.id)),
  ...ACCESOS.map((a) => a.id),
  "todos",
];

const dia = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const mes = /^\d{4}-(0[1-9]|1[0-2])$/;
export const filaIngreso = z.object({
  fecha: z.string().refine((v) => dia.test(v) || mes.test(v), "fecha AAAA-MM o AAAA-MM-DD"),
  nacionalidad: z.enum(NACIONALIDADES),
  puesto: z.string().refine((v) => PUESTOS.includes(v), "puesto desconocido"),
  tipo: z.enum(TIPOS),
  valor: z.number().int().nonnegative(),
  fuente: z.string().trim().min(2).max(160),
  corte: z.string().regex(dia, "fecha_corte AAAA-MM-DD"),
  url: z.string().url().max(500).optional(),
  alcance: z.string().trim().max(200).optional(),
});
export type FilaIngreso = z.infer<typeof filaIngreso>;

/** Separa una línea CSV respetando comillas dobles. */
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
const sinAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const alias: Record<string, string> = { hondurena: "hondureña", salvadorena: "salvadoreña" };

export function leerCsv(texto: string) {
  const lineas = texto
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const errores: string[] = [];
  const filas: FilaIngreso[] = [];
  let vacias = 0;
  if (!lineas.length) return { filas, errores: ["El archivo está vacío."], vacias };
  const cab = celdas(lineas[0]).map((c) => sinAcento(c));
  const col = (n: string) => cab.indexOf(n);
  const faltan = [
    "fecha",
    "nacionalidad",
    "puesto",
    "tipo_movimiento",
    "valor",
    "fuente",
    "fecha_corte",
  ].filter((n) => col(n) < 0);
  if (faltan.length) return { filas, errores: [`Faltan columnas: ${faltan.join(", ")}.`], vacias };
  lineas.slice(1).forEach((l, i) => {
    const c = celdas(l);
    const v = (n: string) => (col(n) >= 0 ? (c[col(n)] ?? "") : "");
    const bruto = v("valor").replace(/[\s.,](?=\d{3}\b)/g, "");
    // Un dato ausente queda vacío: no se guarda ni se convierte en cero.
    if (!bruto) return void vacias++;
    const nac = sinAcento(v("nacionalidad"));
    const r = filaIngreso.safeParse({
      fecha: v("fecha"),
      nacionalidad: alias[nac] ?? nac,
      puesto: sinAcento(v("puesto")),
      tipo: sinAcento(v("tipo_movimiento")),
      valor: Number(bruto),
      fuente: v("fuente"),
      corte: v("fecha_corte"),
      url: v("url") || undefined,
      alcance: v("alcance") || undefined,
    });
    if (r.success) filas.push(r.data);
    else
      errores.push(
        `Fila ${i + 2}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`,
      );
  });
  return { filas, errores, vacias };
}

const archivo = () =>
  path.join(
    process.env.EZRA_DATA_DIR || path.join(process.cwd(), "data"),
    "granjas",
    "ingresos-oficiales.json",
  );
const clave = (f: FilaIngreso) => [f.fecha, f.nacionalidad, f.puesto, f.tipo, f.fuente].join("|");

export async function leerIngresos(): Promise<{ filas: FilaIngreso[]; cargado: string | null }> {
  try {
    const j = JSON.parse(await readFile(archivo(), "utf8"));
    const filas = z.array(filaIngreso).catch([]).parse(j.filas);
    return { filas, cargado: typeof j.cargado === "string" ? j.cargado : null };
  } catch {
    return { filas: [], cargado: null };
  }
}

/** Agrega (o reemplaza) los cortes del CSV; la misma fecha, nacionalidad, puesto, tipo y fuente se sustituye. */
export function guardarIngresos(nuevas: FilaIngreso[], modo: "agregar" | "reemplazar") {
  return enqueueWrite(async () => {
    const previas = modo === "reemplazar" ? [] : (await leerIngresos()).filas;
    const por = new Map(previas.map((f) => [clave(f), f]));
    for (const f of nuevas) por.set(clave(f), f);
    const filas = [...por.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    await mkdir(path.dirname(archivo()), { recursive: true });
    await writeJsonAtomic(archivo(), { filas, cargado: new Date().toISOString() });
    return filas.length;
  });
}

export type Cifra = {
  valor: number;
  periodo: string;
  fuente: string;
  corte: string;
  url?: string;
  alcance?: string;
  diario: boolean;
};

/**
 * Suma sin contar dos veces: el total publicado gana sobre el desglose por nacionalidad y el corte
 * mensual gana sobre la suma de días.
 */
function sumar(filas: FilaIngreso[], hoy: string): Cifra | null {
  if (!filas.length) return null;
  const totales = filas.filter((f) => f.nacionalidad === "total");
  const base = totales.length ? totales : filas;
  const mensual = base.filter((f) => f.fecha.length === 7);
  const usar = mensual.length ? mensual : base;
  const fechas = usar.map((f) => f.fecha).sort();
  const corte = usar
    .map((f) => f.corte)
    .sort()
    .at(-1)!;
  const m = fechas[0].slice(0, 7);
  const diario = !mensual.length;
  const periodo = diario
    ? `${fechas[0]} – ${fechas.at(-1)}`
    : fechas[0] === fechas.at(-1)
      ? m
      : `${fechas[0]} – ${fechas.at(-1)}`;
  return {
    valor: usar.reduce((s, f) => s + f.valor, 0),
    periodo: m === hoy.slice(0, 7) ? `${periodo} (acumulado al ${corte})` : periodo,
    fuente: [...new Set(usar.map((f) => f.fuente))].join(" · "),
    corte,
    url: usar.find((f) => f.url)?.url,
    alcance: usar.find((f) => f.alcance)?.alcance,
    diario,
  };
}

/** Resumen de un mes: cruces por puesto, ingresos por nacionalidad, salidas en origen, CEPA. */
export function resumenIngresos(filas: FilaIngreso[], hoy: string, mesPedido?: string | null) {
  const entradas = filas.filter((f) => f.tipo === "entrada");
  const meses = [...new Set(entradas.map((f) => f.fecha.slice(0, 7)))].sort().reverse();
  // Sin mes pedido: el mes en curso si tiene datos; si no, el último publicado.
  const mesElegido = mesPedido && meses.includes(mesPedido) ? mesPedido : (meses[0] ?? null);
  const delMes = (f: FilaIngreso) => mesElegido !== null && f.fecha.startsWith(mesElegido);
  const puestos = ACCESOS.flatMap((a) => a.puestos.map((p) => p.id));
  const cruces = Object.fromEntries(
    puestos.map((p) => [
      p,
      sumar(
        entradas.filter((f) => delMes(f) && f.puesto === p),
        hoy,
      ),
    ]),
  ) as Record<string, Cifra | null>;
  // Por nacionalidad: el total nacional («todos») si se publicó; si no, la suma de puestos.
  const porNac = (nac: string) => {
    const delaNac = entradas.filter((f) => delMes(f) && f.nacionalidad === nac);
    const nacional = delaNac.filter((f) => f.puesto === "todos");
    return sumar(
      nacional.length ? nacional : delaNac.filter((f) => puestos.includes(f.puesto)),
      hoy,
    );
  };
  const ultimas = (tipo: FilaIngreso["tipo"], filtro: (f: FilaIngreso) => boolean = () => true) => {
    const de = filas.filter((f) => f.tipo === tipo && filtro(f));
    const ultimo = de
      .map((f) => f.fecha.slice(0, 7))
      .sort()
      .at(-1);
    return ultimo
      ? sumar(
          de.filter((f) => f.fecha.startsWith(ultimo)),
          hoy,
        )
      : null;
  };
  const corte =
    entradas
      .filter(delMes)
      .map((f) => f.corte)
      .sort()
      .at(-1) ?? null;
  return {
    meses,
    mes: mesElegido,
    enCurso: mesElegido !== null && mesElegido === hoy.slice(0, 7),
    corte,
    fuentes: [...new Set(entradas.filter(delMes).map((f) => f.fuente))],
    cruces,
    nacionalidad: { guatemalteca: porNac("guatemalteca"), hondureña: porNac("hondureña") },
    // Reportes de los países vecinos: alcance y período propios, solo en el detalle de cruces.
    origen: Object.fromEntries(
      ACCESOS.filter((a) => a.tipo === "terrestre").map((a) => [
        a.id,
        [a.id, ...a.puestos.map((p) => p.id)]
          .map((p) => ({ puesto: p, cifra: ultimas("salida_origen", (f) => f.puesto === p) }))
          .filter((x) => x.cifra),
      ]),
    ) as Record<string, { puesto: string; cifra: Cifra }[]>,
    cepa: ultimas("pasajeros_llegada", (f) => f.puesto === "aies" || f.puesto === "aeropuerto"),
    presentes: ultimas("personas_presentes"),
    anual: serieAnual(filas, hoy),
  };
}
export type ResumenIngresos = ReturnType<typeof resumenIngresos>;

/** Entradas del país en un mes: el total nacional («todos») si se publicó; si no, la suma de puestos. */
function totalPais(filas: FilaIngreso[], mes: string, hoy: string) {
  const del = filas.filter((f) => f.tipo === "entrada" && f.fecha.startsWith(mes));
  const nacional = del.filter((f) => f.puesto === "todos");
  const puestos = new Set(ACCESOS.flatMap((a) => [a.id, ...a.puestos.map((p) => p.id)]));
  return sumar(nacional.length ? nacional : del.filter((f) => puestos.has(f.puesto)), hoy);
}
const sumarMes = (m: string, n: number) => {
  const d = new Date(`${m}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export type Estimacion = {
  valor: number;
  bajo: number;
  alto: number;
  metodo: "interanual" | "tendencia";
};

/**
 * Los 12 meses del año (el actual, o el último con datos) y una estimación NO oficial del mes
 * siguiente y del año completo. Solo con al menos 3 meses cerrados del año:
 * - «interanual»: el mismo mes del año anterior × la variación de los meses ya comparables;
 * - «tendencia»: recta de mínimos cuadrados sobre los meses cerrados del año.
 * El rango usa el error medio de la tendencia (mínimo ±5 %). Nunca se presenta como dato.
 */
export function serieAnual(filas: FilaIngreso[], hoy: string, anioPedido?: number) {
  const meses = [
    ...new Set(filas.filter((f) => f.tipo === "entrada").map((f) => f.fecha.slice(0, 7))),
  ].sort();
  const anioHoy = Number(hoy.slice(0, 4));
  const anio =
    anioPedido ??
    (meses.some((m) => m.startsWith(String(anioHoy))) || !meses.length
      ? anioHoy
      : Number(meses.at(-1)!.slice(0, 4)));
  const mesHoy = hoy.slice(0, 7);
  const serie = Array.from({ length: 12 }, (_, i) => {
    const mes = `${anio}-${String(i + 1).padStart(2, "0")}`;
    const c = totalPais(filas, mes, hoy);
    return {
      mes,
      valor: c?.valor ?? null,
      parcial: mes === mesHoy,
      corte: c?.corte ?? null,
      fuente: c?.fuente ?? null,
    };
  });
  const cerrados = serie.filter((m) => m.valor !== null && !m.parcial && m.mes < mesHoy);
  let proximo: (Estimacion & { mes: string }) | null = null;
  let cierreActual: (Estimacion & { mes: string; acumulado: number }) | null = null;
  const porMes: Record<string, Estimacion> = {};
  let anioEstimado: (Estimacion & { reales: number; estimados: number }) | null = null;
  if (cerrados.length >= 3) {
    // Tendencia lineal sobre el índice del mes.
    const xs = cerrados.map((m) => Number(m.mes.slice(5)) - 1);
    const ys = cerrados.map((m) => m.valor!);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const pend =
      xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
      (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
    const recta = (x: number) => Math.max(0, my + pend * (x - mx));
    const error = Math.max(
      0.05,
      ys.reduce((s, y, i) => s + Math.abs(y - recta(xs[i])) / (y || 1), 0) / n,
    );
    // Variación interanual si hay el año anterior para los meses ya cerrados.
    const anterior = cerrados.map(
      (m) => totalPais(filas, sumarMes(m.mes, -12), hoy)?.valor ?? null,
    );
    const comparables = anterior.every((v) => v !== null);
    const factor = comparables
      ? ys.reduce((a, b) => a + b, 0) / (anterior.reduce((a, b) => a! + b!, 0)! || 1)
      : null;
    const estimar = (mes: string): Estimacion => {
      const previo =
        factor !== null ? (totalPais(filas, sumarMes(mes, -12), hoy)?.valor ?? null) : null;
      const valor =
        previo !== null
          ? previo * factor!
          : recta(Number(mes.slice(5)) - 1 + (Number(mes.slice(0, 4)) - anio) * 12);
      return {
        valor: Math.round(valor),
        bajo: Math.round(valor * (1 - error)),
        alto: Math.round(valor * (1 + error)),
        metodo: previo !== null ? "interanual" : "tendencia",
      };
    };
    const ultimoCerrado = cerrados.at(-1)!.mes;
    // Si el mes en curso sigue al último cerrado, el «próximo» es el que viene después de él.
    const enCurso = sumarMes(ultimoCerrado, 1) === mesHoy;
    const siguiente = enCurso ? sumarMes(mesHoy, 1) : sumarMes(ultimoCerrado, 1);
    proximo = { mes: siguiente, ...estimar(siguiente) };
    const parcial = serie.find((m) => m.mes === mesHoy && m.valor !== null);
    if (enCurso) {
      const e = estimar(mesHoy);
      // El cierre nunca queda por debajo de lo ya registrado.
      const piso = parcial?.valor ?? 0;
      cierreActual = {
        mes: mesHoy,
        acumulado: piso,
        ...e,
        valor: Math.max(e.valor, piso),
        bajo: Math.max(e.bajo, piso),
        alto: Math.max(e.alto, piso),
      };
    }
    const faltan = serie.filter((m) => !(m.valor !== null && !m.parcial && m.mes < mesHoy));
    const estimados = faltan.map((m) =>
      m.mes === cierreActual?.mes ? (cierreActual as Estimacion) : estimar(m.mes),
    );
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
