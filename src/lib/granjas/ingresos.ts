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
  };
}
export type ResumenIngresos = ReturnType<typeof resumenIngresos>;
