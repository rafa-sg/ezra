import { z } from "zod";
import { WorkflowError } from "../workflow";
import { leerGranja, listarGranjas } from "./almacen";
import { estadoPresupuesto, leerPresupuesto, MOTIVO_PRESUPUESTO } from "./consumo";
import { ahoraIso, auditar, base, json, transaccion } from "./db";
import { iniciarEjecucion, leerEjecucion, usaIA, versionesEncargos, type EstadoEjecucion } from "./ejecucion";
import { diaLocal, diaSemanaLocal, horaLocal, instanteLocal, sumarDias } from "./tiempo";

/**
 * Horario diario de cada granja (hora de El Salvador). El trabajador lo revisa cada
 * minuto. Si la Mac estuvo dormida a la hora fijada, la ejecución perdida corre una
 * sola vez al despertar; nunca dos veces el mismo día (la reserva es atómica en SQLite,
 * también entre dos procesos). Una granja puede encadenarse después de otra.
 */
export const horarioSchema = z.object({
  activa: z.boolean(),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM."),
  dias: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Elige al menos un día.")
    .refine((d) => new Set(d).size === d.length),
  despuesDe: z.string().uuid().nullable(),
});
export type ConfigHorario = z.infer<typeof horarioSchema>;
export type Horario = ConfigHorario & {
  granjaId: string;
  consentimiento: { fecha: string; usuario: string } | null;
  ultimaFecha: string | null;
  ultimaEjecucionId: string | null;
  ultimoInicio: string | null;
  ultimoError: string;
  pausaMotivo: string;
  pausaHasta: string | null;
};
type Fila = Record<string, string | number | null>;
const porDefecto = (granjaId: string): Horario => ({
  granjaId,
  activa: false,
  hora: "04:30",
  dias: [0, 1, 2, 3, 4, 5, 6],
  despuesDe: null,
  consentimiento: null,
  ultimaFecha: null,
  ultimaEjecucionId: null,
  ultimoInicio: null,
  ultimoError: "",
  pausaMotivo: "",
  pausaHasta: null,
});
const aHorario = (f: Fila): Horario => ({
  granjaId: String(f.granja_id),
  activa: Boolean(f.activa),
  hora: String(f.hora),
  dias: json(String(f.dias), [0, 1, 2, 3, 4, 5, 6]),
  despuesDe: f.despues_de === null ? null : String(f.despues_de),
  consentimiento: f.consentimiento ? json(String(f.consentimiento), null) : null,
  ultimaFecha: f.ultima_fecha === null ? null : String(f.ultima_fecha),
  ultimaEjecucionId: f.ultima_ejecucion_id === null ? null : String(f.ultima_ejecucion_id),
  ultimoInicio: f.ultimo_inicio === null ? null : String(f.ultimo_inicio),
  ultimoError: String(f.ultimo_error ?? ""),
  pausaMotivo: String(f.pausa_motivo ?? ""),
  pausaHasta: f.pausa_hasta === null ? null : String(f.pausa_hasta),
});
export function leerHorario(granjaId: string): Horario {
  const f = base().prepare("select * from horarios where granja_id = ?").get(granjaId) as Fila | undefined;
  return f ? aHorario(f) : porDefecto(granjaId);
}
const usaGemini = (granjaId: string) => leerGranja(granjaId).grafo.nodos.some((n) => n.tipo === "agente" && n.proveedor === "gemini");

/** Activar exige el consentimiento del propietario y, si hay Gemini, un presupuesto diario y mensual. */
export function guardarHorario(granjaId: string, config: unknown, usuario: string, aceptoIA: boolean, ahora = new Date()) {
  const c = horarioSchema.parse(config);
  return transaccion((db) => {
    const granja = leerGranja(granjaId);
    const actual = leerHorario(granjaId);
    if (c.despuesDe) {
      if (c.despuesDe === granjaId) throw new WorkflowError("Una granja no puede encadenarse consigo misma.", 422);
      const previa = leerGranja(c.despuesDe);
      if (leerHorario(previa.id).despuesDe === granjaId) throw new WorkflowError("Esas dos granjas quedarían esperándose entre sí.", 422);
    }
    let consentimiento = actual.consentimiento;
    if (c.activa) {
      if (granja.estado !== "activa") throw new WorkflowError("Activa o restaura la granja antes de programarla.", 422);
      if (!granja.grafo.nodos.length) throw new WorkflowError("La granja no tiene pasos.", 422);
      const p = leerPresupuesto();
      if (usaGemini(granjaId) && (!p.tokensDia || !p.tokensMes))
        throw new WorkflowError("Define el presupuesto diario y mensual de tokens en Consumo antes de programar una granja con Gemini.", 422);
      if (granja.grafo.nodos.some(usaIA) && !aceptoIA && !(actual.activa && actual.consentimiento))
        throw new WorkflowError("Confirma que aceptas que esta granja use la IA cada día dentro del presupuesto.", 422);
      if (!actual.activa || !actual.consentimiento) consentimiento = { fecha: ahoraIso(), usuario };
    }
    db.prepare(
      `insert into horarios (granja_id, activa, hora, dias, despues_de, consentimiento, actualizado) values (?, ?, ?, ?, ?, ?, ?)
       on conflict (granja_id) do update set activa = excluded.activa, hora = excluded.hora, dias = excluded.dias,
       despues_de = excluded.despues_de, consentimiento = excluded.consentimiento, actualizado = excluded.actualizado`,
    ).run(granjaId, c.activa ? 1 : 0, c.hora, JSON.stringify([...c.dias].sort()), c.despuesDe, consentimiento ? JSON.stringify(consentimiento) : null, ahoraIso());
    // Activar (o cambiar la hora) cuando la hora de hoy ya pasó no dispara una ejecución inmediata:
    // la primera es mañana. Recuperar una hora perdida solo aplica a un horario que ya estaba activo.
    const hoy = diaLocal(ahora);
    if (c.activa && !c.despuesDe && (!actual.activa || actual.hora !== c.hora) && instanteLocal(hoy, c.hora) < ahora)
      db.prepare("update horarios set ultima_fecha = ? where granja_id = ? and (ultima_fecha is null or ultima_fecha < ?)").run(hoy, granjaId, hoy);
    auditar("horario.guardar", granjaId, { activa: c.activa, hora: c.hora, dias: c.dias, despuesDe: c.despuesDe });
    return leerHorario(granjaId);
  });
}

const terminada = (estado: EstadoEjecucion) => !["en_curso", "pausada"].includes(estado);
/** Próximo inicio previsto. Encadenada: depende de la otra granja (null). */
export function proximaEjecucion(h: Horario, ahora = new Date()): string | null {
  if (!h.activa || h.despuesDe) return null;
  const hoy = diaLocal(ahora);
  for (let i = 0; i < 8; i++) {
    const dia = sumarDias(hoy, i);
    const semana = diaSemanaLocal(instanteLocal(dia, "12:00"));
    if (!h.dias.includes(semana)) continue;
    if (i === 0 && h.ultimaFecha === hoy) continue;
    const instante = instanteLocal(dia, h.hora);
    // Si hoy ya pasó la hora y no corrió, se ejecuta en cuanto el trabajador la vea.
    return (i === 0 && instante < ahora ? ahora : instante).toISOString();
  }
  return null;
}
export type VistaHorario = Horario & {
  proxima: string | null;
  ultima: { id: string; estado: EstadoEjecucion; creado: string } | null;
};
export function vistaHorario(granjaId: string, ahora = new Date()): VistaHorario {
  const h = leerHorario(granjaId);
  let ultima: VistaHorario["ultima"] = null;
  if (h.ultimaEjecucionId)
    try {
      const e = leerEjecucion(h.ultimaEjecucionId);
      ultima = { id: e.id, estado: e.estado, creado: e.creado };
    } catch {
      ultima = null;
    }
  return { ...h, proxima: proximaEjecucion(h, ahora), ultima };
}

/** Reserva atómica del día: solo un proceso y una vez por día pueden iniciar la ejecución programada. */
function reservarDia(granjaId: string, hoy: string, ahora: Date) {
  const r = base()
    .prepare(
      `update horarios set ultima_fecha = ?, ultimo_inicio = ?, ultimo_error = '', pausa_motivo = '', pausa_hasta = null, actualizado = ?
       where granja_id = ? and activa = 1 and (ultima_fecha is null or ultima_fecha <> ?)`,
    )
    .run(hoy, ahora.toISOString(), ahora.toISOString(), granjaId, hoy);
  return Number(r.changes) === 1;
}
function pausar(granjaId: string, motivo: string, hasta: string | null) {
  base().prepare("update horarios set pausa_motivo = ?, pausa_hasta = ?, actualizado = ? where granja_id = ?").run(motivo, hasta, ahoraIso(), granjaId);
}
export type ResultadoTick = { granjaId: string; accion: "iniciada" | "pausada" | "error"; detalle: string }[];
type Iniciar = (granjaId: string) => Promise<string>;
const iniciarProgramada: Iniciar = async (granjaId) =>
  iniciarEjecucion(granjaId, { confirmarIA: true, usuario: "horario", encargos: await versionesEncargos(), origen: "horario" }).id;

/** Una vuelta del reloj (cada minuto). Devuelve lo que hizo, para el registro y las pruebas. */
export async function revisarHorarios(ahora = new Date(), iniciar: Iniciar = iniciarProgramada): Promise<ResultadoTick> {
  const hechos: ResultadoTick = [];
  const hoy = diaLocal(ahora);
  const hora = horaLocal(ahora);
  const semana = diaSemanaLocal(ahora);
  const filas = (base().prepare("select * from horarios where activa = 1").all() as Fila[]).map(aHorario);
  const granjas = new Map(listarGranjas().map((g) => [g.id, g]));
  const presupuesto = estadoPresupuesto(ahora);
  for (const h of filas) {
    const granja = granjas.get(h.granjaId);
    if (!granja || granja.estado !== "activa" || !h.dias.includes(semana) || h.ultimaFecha === hoy) continue;
    // Encadenada: espera a que la otra granja haya corrido hoy y haya terminado.
    if (h.despuesDe) {
      const previa = filas.find((x) => x.granjaId === h.despuesDe);
      if (!previa || previa.ultimaFecha !== hoy || !previa.ultimaEjecucionId) continue;
      let estado: EstadoEjecucion;
      try {
        estado = leerEjecucion(previa.ultimaEjecucionId).estado;
      } catch {
        continue;
      }
      if (!terminada(estado)) continue;
    } else if (hora < h.hora) continue;
    // Presupuesto agotado: no se reserva el día; se reanuda sola cuando cambie el día o el mes.
    if (presupuesto.agotado && usaGemini(h.granjaId)) {
      if (h.pausaMotivo !== MOTIVO_PRESUPUESTO || h.pausaHasta !== presupuesto.reanuda) pausar(h.granjaId, MOTIVO_PRESUPUESTO, presupuesto.reanuda);
      hechos.push({ granjaId: h.granjaId, accion: "pausada", detalle: `${MOTIVO_PRESUPUESTO} hasta ${presupuesto.reanuda}` });
      continue;
    }
    if (!reservarDia(h.granjaId, hoy, ahora)) continue;
    try {
      const id = await iniciar(h.granjaId);
      base().prepare("update horarios set ultima_ejecucion_id = ? where granja_id = ?").run(id, h.granjaId);
      auditar("horario.iniciar", h.granjaId, { ejecucion: id, dia: hoy });
      hechos.push({ granjaId: h.granjaId, accion: "iniciada", detalle: id });
    } catch (error) {
      // El día queda reservado: un error no se reintenta en bucle cada minuto.
      const mensaje = error instanceof Error ? error.message.slice(0, 300) : "No se pudo iniciar.";
      base().prepare("update horarios set ultimo_error = ? where granja_id = ?").run(mensaje, h.granjaId);
      hechos.push({ granjaId: h.granjaId, accion: "error", detalle: mensaje });
    }
  }
  // Pausas vencidas: se limpian para que la interfaz no siga mostrándolas.
  if (!presupuesto.agotado) base().prepare("update horarios set pausa_motivo = '', pausa_hasta = null where pausa_motivo <> ''").run();
  return hechos;
}
