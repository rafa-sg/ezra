import { z } from "zod";
import { WorkflowError } from "../workflow";
import { base } from "./db";
import { guardarAjuste, leerAjuste } from "./ajustes";
import { diaLocal, inicioSemanaLocal, instanteLocal, mesLocal, siguienteMes, sumarDias } from "./tiempo";

/**
 * Registro de cada llamada a Gemini y presupuesto de tokens. El costo es una
 * estimación con las tarifas que escribe el propietario: el código no trae
 * precios. Sin tarifa para un modelo, su costo queda «sin tarifa».
 */
export const origenesConsumo = ["granja", "encargo", "ask", "prueba"] as const;
export type OrigenConsumo = (typeof origenesConsumo)[number];
export type FilaConsumo = {
  id: string;
  fecha: string;
  origen: OrigenConsumo;
  granja_id: string | null;
  ejecucion_id: string | null;
  paso_id: string | null;
  paso: string;
  modelo: string;
  prompt_tokens: number;
  candidatos_tokens: number;
  pensamiento_tokens: number;
  herramientas_tokens: number;
  total_tokens: number;
  busqueda: number;
  consultas_busqueda: number;
  duracion_ms: number;
  error: string;
  /** USD que informa el proveedor para esa llamada (null si no lo informa). */
  costo_reportado?: number | null;
};
export type UsoGemini = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  totalTokenCount?: number;
};
const entero = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export function registrarConsumo(datos: {
  fecha?: string;
  origen: OrigenConsumo;
  granjaId?: string | null;
  ejecucionId?: string | null;
  pasoId?: string | null;
  paso: string;
  modelo: string;
  uso?: UsoGemini | null;
  busqueda: boolean;
  consultasBusqueda: number;
  duracionMs: number;
  error?: string;
  costoReportado?: number | null;
}) {
  const u = datos.uso ?? {};
  const prompt = entero(u.promptTokenCount);
  const candidatos = entero(u.candidatesTokenCount);
  const pensamiento = entero(u.thoughtsTokenCount);
  const herramientas = entero(u.toolUsePromptTokenCount);
  // Si la respuesta no trae el total, se suma lo que sí trae.
  const total = entero(u.totalTokenCount) || prompt + candidatos + pensamiento + herramientas;
  const id = crypto.randomUUID();
  base()
    .prepare(
      `insert into consumo_ia (id, fecha, origen, granja_id, ejecucion_id, paso_id, paso, modelo, prompt_tokens, candidatos_tokens,
       pensamiento_tokens, herramientas_tokens, total_tokens, busqueda, consultas_busqueda, duracion_ms, error, costo_reportado)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      datos.fecha ?? new Date().toISOString(),
      datos.origen,
      datos.granjaId ?? null,
      datos.ejecucionId ?? null,
      datos.pasoId ?? null,
      datos.paso.slice(0, 160),
      datos.modelo.slice(0, 80),
      prompt,
      candidatos,
      pensamiento,
      herramientas,
      total,
      datos.busqueda ? 1 : 0,
      entero(datos.consultasBusqueda),
      entero(datos.duracionMs),
      (datos.error ?? "").slice(0, 300),
      typeof datos.costoReportado === "number" && Number.isFinite(datos.costoReportado) && datos.costoReportado >= 0
        ? datos.costoReportado
        : null,
    );
  return id;
}

/* ── Presupuesto ── */
export const presupuestoSchema = z.object({
  tokensDia: z.number().int().min(1000).max(1_000_000_000).nullable(),
  tokensMes: z.number().int().min(1000).max(30_000_000_000).nullable(),
});
export type Presupuesto = z.infer<typeof presupuestoSchema>;
const sinPresupuesto: Presupuesto = { tokensDia: null, tokensMes: null };
export const leerPresupuesto = () => leerAjuste("presupuesto", presupuestoSchema, sinPresupuesto);
export const guardarPresupuesto = (valor: unknown) => guardarAjuste("presupuesto", presupuestoSchema, valor);

/** El presupuesto es de Gemini: las filas de Astra y Claude (van por su plan) no lo gastan. */
export const SOLO_GEMINI = "modelo not like 'Astra%' and modelo not like 'Claude%'";
function tokensEntre(desde: Date, hasta: Date) {
  const fila = base()
    .prepare(`select coalesce(sum(total_tokens), 0) as n from consumo_ia where fecha >= ? and fecha < ? and ${SOLO_GEMINI}`)
    .get(desde.toISOString(), hasta.toISOString()) as { n: number };
  return Number(fila.n);
}
export type Periodo = { usado: number; limite: number | null; porcentaje: number | null; reanuda: string };
export type EstadoPresupuesto = {
  dia: Periodo;
  mes: Periodo;
  /** Qué límite se alcanzó primero, si alguno. */
  agotado: "dia" | "mes" | null;
  /** Al menos un límite pasó del 80 %. */
  aviso: boolean;
  reanuda: string | null;
};
export function estadoPresupuesto(ahora: Date = new Date()): EstadoPresupuesto {
  const p = leerPresupuesto();
  const hoy = diaLocal(ahora);
  const mes = mesLocal(ahora);
  const manana = instanteLocal(sumarDias(hoy, 1));
  const mesSiguiente = instanteLocal(`${siguienteMes(mes)}-01`);
  const periodo = (usado: number, limite: number | null, reanuda: Date): Periodo => ({
    usado,
    limite,
    porcentaje: limite ? Math.round((usado / limite) * 1000) / 10 : null,
    reanuda: reanuda.toISOString(),
  });
  const dia = periodo(tokensEntre(instanteLocal(hoy), manana), p.tokensDia, manana);
  const mesP = periodo(tokensEntre(instanteLocal(`${mes}-01`), mesSiguiente), p.tokensMes, mesSiguiente);
  const agotadoMes = mesP.limite !== null && mesP.usado >= mesP.limite;
  const agotadoDia = dia.limite !== null && dia.usado >= dia.limite;
  const agotado = agotadoMes ? "mes" : agotadoDia ? "dia" : null;
  return {
    dia,
    mes: mesP,
    agotado,
    aviso: [dia, mesP].some((x) => x.porcentaje !== null && x.porcentaje >= 80),
    reanuda: agotado === "mes" ? mesP.reanuda : agotado === "dia" ? dia.reanuda : null,
  };
}
export const MOTIVO_PRESUPUESTO = "presupuesto agotado";
/** Antes de cada llamada: con el presupuesto agotado no sale ninguna petición a Gemini. */
export function exigirPresupuesto(ahora: Date = new Date()) {
  const estado = estadoPresupuesto(ahora);
  if (!estado.agotado) return estado;
  const cuando = new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeStyle: "short", timeZone: "America/El_Salvador" }).format(
    new Date(estado.reanuda!),
  );
  throw new WorkflowError(
    `Gemini en pausa: ${MOTIVO_PRESUPUESTO} (${estado.agotado === "dia" ? "límite diario" : "límite mensual"}). Se reanuda el ${cuando}. Puedes subir el límite en Consumo.`,
    429,
  );
}

/* ── Imágenes de referencia IA: límite diario aparte del presupuesto de tokens ── */
export const PASO_IMAGEN_IA = "Imagen de referencia IA";
export const LIMITE_IMAGENES_IA = 15;
export const limiteImagenesSchema = z.object({ porDia: z.number().int().min(0).max(200) });
export const leerLimiteImagenes = () => leerAjuste("imagenes_ia", limiteImagenesSchema, { porDia: LIMITE_IMAGENES_IA }).porDia;
export const guardarLimiteImagenes = (porDia: unknown) => guardarAjuste("imagenes_ia", limiteImagenesSchema, { porDia }).porDia;
/** Imágenes IA generadas hoy (hora de El Salvador): llamadas sin error del paso «Imagen de referencia IA». */
export function imagenesIaHoy(ahora: Date = new Date()) {
  const hoy = diaLocal(ahora);
  const fila = base()
    .prepare("select count(*) as n from consumo_ia where paso = ? and error = '' and fecha >= ? and fecha < ?")
    .get(PASO_IMAGEN_IA, instanteLocal(hoy).toISOString(), instanteLocal(sumarDias(hoy, 1)).toISOString()) as { n: number };
  return Number(fila.n);
}

/* ── Tarifas editables (USD) ── */
const precio = z.number().min(0).max(10_000);
export const tarifaSchema = z.object({
  /** USD por millón de tokens de entrada (prompt y uso de herramientas). */
  entrada: precio,
  /** USD por millón de tokens de salida (respuesta y razonamiento). */
  salida: precio,
  /** USD por cada 1 000 consultas de búsqueda de Google. */
  busqueda: precio,
});
export const tarifasSchema = z
  .record(z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/, "Nombre de modelo inválido."), tarifaSchema)
  .refine((t) => Object.keys(t).length <= 20, "Máximo 20 modelos.");
export type Tarifas = z.infer<typeof tarifasSchema>;
export const leerTarifas = () => leerAjuste("tarifas", tarifasSchema, {});
export const guardarTarifas = (valor: unknown) => guardarAjuste("tarifas", tarifasSchema, valor);
export function costoLlamada(f: FilaConsumo, tarifas: Tarifas): number | null {
  const t = tarifas[f.modelo];
  // Astra (Codex con ChatGPT) y Claude (Claude Code con tu cuenta) van por tu plan: sin costo por llamada.
  if (!t && (f.modelo.startsWith("Astra") || f.modelo.startsWith("Claude"))) return 0;
  if (!t) return null;
  const entrada = ((f.prompt_tokens + f.herramientas_tokens) * t.entrada) / 1_000_000;
  const salida = ((f.candidatos_tokens + f.pensamiento_tokens) * t.salida) / 1_000_000;
  const busqueda = (f.consultas_busqueda * t.busqueda) / 1000;
  return entrada + salida + busqueda;
}

/* ── Resumen para la pantalla Consumo ── */
type Acumulado = { tokens: number; llamadas: number; errores: number; costo: number; sinTarifa: number };
const vacio = (): Acumulado => ({ tokens: 0, llamadas: 0, errores: 0, costo: 0, sinTarifa: 0 });
function sumar(a: Acumulado, f: FilaConsumo, tarifas: Tarifas) {
  a.tokens += f.total_tokens;
  a.llamadas += 1;
  if (f.error) a.errores += 1;
  const c = costoLlamada(f, tarifas);
  if (c === null) a.sinTarifa += 1;
  else a.costo += c;
}
export function resumenConsumo(ahora: Date = new Date()) {
  const tarifas = leerTarifas();
  const hoy = diaLocal(ahora);
  const desde = sumarDias(hoy, -29);
  const semana = inicioSemanaLocal(ahora);
  const mes = mesLocal(ahora);
  const inicio = [desde, `${mes}-01`, semana].sort()[0];
  const filas = base()
    .prepare("select * from consumo_ia where fecha >= ? order by fecha desc")
    .all(instanteLocal(inicio).toISOString()) as FilaConsumo[];
  const nombres = new Map(
    (base().prepare("select id, nombre from granjas").all() as { id: string; nombre: string }[]).map((g) => [g.id, g.nombre]),
  );
  const periodos = { hoy: vacio(), semana: vacio(), mes: vacio() };
  const serie = new Map<string, Acumulado>();
  for (let i = 0; i < 30; i++) serie.set(sumarDias(desde, i), vacio());
  const porGranja = new Map<string, Acumulado & { nombre: string }>();
  const porPaso = new Map<string, Acumulado & { origen: string; paso: string }>();
  for (const f of filas) {
    const dia = diaLocal(new Date(f.fecha));
    if (dia === hoy) sumar(periodos.hoy, f, tarifas);
    if (dia >= semana) sumar(periodos.semana, f, tarifas);
    if (dia.startsWith(mes)) sumar(periodos.mes, f, tarifas);
    if (dia < desde) continue;
    sumar(serie.get(dia) ?? vacio(), f, tarifas);
    const claveGranja = f.granja_id ?? `origen:${f.origen}`;
    if (!porGranja.has(claveGranja))
      porGranja.set(claveGranja, { ...vacio(), nombre: f.granja_id ? (nombres.get(f.granja_id) ?? "Granja eliminada") : f.origen });
    sumar(porGranja.get(claveGranja)!, f, tarifas);
    const clavePaso = `${f.origen}:${f.paso}`;
    if (!porPaso.has(clavePaso)) porPaso.set(clavePaso, { ...vacio(), origen: f.origen, paso: f.paso });
    sumar(porPaso.get(clavePaso)!, f, tarifas);
  }
  const ultimos30 = filas.filter((f) => diaLocal(new Date(f.fecha)) >= desde);
  const caras = ultimos30
    .map((f) => ({ ...f, costo: costoLlamada(f, tarifas), granja: f.granja_id ? (nombres.get(f.granja_id) ?? null) : null }))
    .sort((a, b) => (b.costo ?? -1) - (a.costo ?? -1) || b.total_tokens - a.total_tokens)
    .slice(0, 20);
  const orden = <T extends Acumulado>(m: Map<string, T>) => [...m.entries()].map(([clave, v]) => ({ clave, ...v })).sort((a, b) => b.tokens - a.tokens);
  return {
    ahora: ahora.toISOString(),
    periodos,
    serie: [...serie.entries()].map(([dia, v]) => ({ dia, ...v })),
    porGranja: orden(porGranja),
    porPaso: orden(porPaso),
    caras,
    modelos: [...new Set(filas.map((f) => f.modelo))].sort(),
    presupuesto: { ...leerPresupuesto(), estado: estadoPresupuesto(ahora) },
    imagenesIA: { porDia: leerLimiteImagenes(), hoy: imagenesIaHoy(ahora) },
    tarifas,
  };
}
export type ResumenConsumo = ReturnType<typeof resumenConsumo>;
