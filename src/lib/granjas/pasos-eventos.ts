import type { Artefacto } from "./almacen";
import type { Ejecucion } from "./ejecucion";
import type { Nodo } from "./modelo";
import { esRedireccionBusqueda, fuentesDeBusqueda, leerCandidatos, promptCazadorEventos, type Candidato } from "./cazador";
import { candidatosDeRedes, type CandidatoRed, type ResumenRedes } from "./redes";
import { costoLlamada, leerTarifas, type FilaConsumo } from "./consumo";
import type { MaterialFuente } from "./fuentes";
import { eventosCreadosHoy, referenciasLocales } from "./eventos";
import { base, json } from "./db";
import { diaLocal } from "./tiempo";
import { verificarCandidatos, type DepsVerificador } from "./verificador";

/**
 * Especialistas de la granja «Eventos de El Salvador» dentro del motor de granjas:
 * el cazador usa un prompt propio (JSON) y el verificador trabaja sin IA.
 */
export type DepsEspecialistas = DepsVerificador & {
  ahora?: () => Date;
  /** Lectura de cuentas en redes (por defecto, las API oficiales de Meta con las «Cuentas a seguir»). */
  redes?: typeof candidatosDeRedes;
};
/** Ventana por defecto de la búsqueda diaria de eventos (de hoy a 60 días). */
export const DIAS_ADELANTE = 60;
export const esGranjaEventos = (e: Ejecucion) => e.instantanea.ajustes?.purpose === "eventos_el_salvador";
export function limiteEventos(e: Ejecucion) {
  const porDia = e.instantanea.ajustes?.eventos?.maxPorDia ?? 10;
  return Math.min(porDia, e.instantanea.limites?.eventos ?? porDia);
}

export const esCazadorEventos = (nodo: Nodo, ejecucion: Ejecucion) => nodo.agente === "cazador" && esGranjaEventos(ejecucion);
/** Prompt del cazador cuando la granja es la de eventos; null en cualquier otra granja. */
export function promptEspecial(
  nodo: Nodo,
  ejecucion: Ejecucion,
  modo: { busqueda: boolean; material: MaterialFuente[] },
  ahora = new Date(),
): { prompt: string; maxTokens: number } | null {
  if (!esCazadorEventos(nodo, ejecucion)) return null;
  const hoy = diaLocal(ahora);
  return {
    prompt: promptCazadorEventos({
      hoy,
      diasAdelante: ejecucion.instantanea.ajustes?.eventos?.diasAdelante ?? DIAS_ADELANTE,
      maximo: limiteEventos(ejecucion),
      dominios: ejecucion.instantanea.politica.dominios,
      // Lo que ya está en la bandeja (y sigue vigente) no se vuelve a pedir; el verificador deduplica igual.
      conocidos: referenciasLocales()
        .filter((r) => !r.fecha || (r.hasta ?? r.fecha) >= hoy)
        .map((r) => (r.fecha ? `${r.titulo} (${r.fecha})` : r.titulo)),
      instrucciones: nodo.instrucciones,
      busqueda: modo.busqueda,
      material: modo.material,
    }),
    // JSON de hasta 20 eventos más el razonamiento del modelo.
    maxTokens: 8192,
  };
}

/** Resultado de un especialista sin IA: sus artefactos y el estado en que queda el paso. */
export type ResultadoLocal = {
  artefactos: { tipo: Artefacto["tipo"]; contenido: string; medioId?: string; medioSha?: string }[];
  detalle: string;
  bloqueado?: boolean;
};

export async function verificarPaso(ejecucion: Ejecucion, entradas: Artefacto[], deps: DepsEspecialistas): Promise<ResultadoLocal> {
  const delCazador: Candidato[] = [];
  const deBusqueda = new Set<string>();
  let invalidos = 0;
  // El resumen de fuentes que guarda el cazador no es una lista de eventos.
  for (const a of entradas.filter((x) => (x.tipo === "investigacion" || x.tipo === "texto") && x.procedencia.origen !== "fuentes")) {
    const leido = leerCandidatos(a.contenido);
    delCazador.push(...leido.candidatos);
    invalidos += leido.invalidos;
    for (const u of fuentesDeBusqueda(a.contenido)) deBusqueda.add(u);
  }
  const ahora = deps.ahora?.() ?? new Date();
  const hoy = diaLocal(ahora);
  const diasAdelante = ejecucion.instantanea.ajustes?.eventos?.diasAdelante ?? DIAS_ADELANTE;
  // Cuentas oficiales en redes (solo API de Meta; sin cuentas o sin conexión no se llama a nada).
  let redes: { candidatos: CandidatoRed[]; resumen: ResumenRedes } = { candidatos: [], resumen: { cuentas: 0, posts: 0, candidatos: 0, errores: [], omitido: "" } };
  try {
    redes = await (deps.redes ?? candidatosDeRedes)({
      hoy,
      diasAdelante,
      conocidos: referenciasLocales()
        .filter((r) => !r.fecha || (r.hasta ?? r.fecha) >= hoy)
        .map((r) => (r.fecha ? `${r.titulo} (${r.fecha})` : r.titulo)),
      gemini: { granjaId: ejecucion.granjaId, ejecucionId: ejecucion.id },
    });
  } catch (error) {
    redes.resumen.errores.push(error instanceof Error ? error.message.slice(0, 200) : "No se pudieron leer las redes.");
  }
  // Orden: Fuentes web, cuentas de Instagram, páginas de Facebook y, al final, lo que trajo la búsqueda de Google.
  const esBusqueda = (c: Candidato) => esRedireccionBusqueda(c.fuente_url) || deBusqueda.has(c.fuente_url);
  const candidatos: (Candidato | CandidatoRed)[] = [
    ...delCazador.filter((c) => !esBusqueda(c)),
    ...redes.candidatos.filter((c) => c.red.via === "instagram"),
    ...redes.candidatos.filter((c) => c.red.via === "facebook"),
    ...delCazador.filter(esBusqueda),
  ];
  const notaRedes = [redes.resumen.posts ? `${redes.resumen.posts} post(s) de ${redes.resumen.cuentas} cuenta(s)` : "", ...redes.resumen.errores].filter(Boolean).join(" · ");
  if (!candidatos.length)
    return {
      artefactos: [{ tipo: "investigacion", contenido: JSON.stringify({ revisados: 0, nuevos: [], duplicados: [], actualizados: [], descartados: [], invalidos, redes: redes.resumen }, null, 2) }],
      detalle: `El cazador no entregó eventos en el formato esperado (JSON) y las cuentas en redes no trajeron eventos. Reintenta el cazador o pega un resultado manual.${notaRedes ? ` Redes: ${notaRedes}.` : ""}`,
      bloqueado: true,
    };
  const restantes = Math.max(0, limiteEventos(ejecucion) - eventosCreadosHoy(ejecucion.granjaId, ahora));
  const r = await verificarCandidatos(
    candidatos,
    {
      hoy,
      diasAdelante,
      dominios: ejecucion.instantanea.politica.dominios,
      // Los eventos nuevos tienen un máximo diario; los que ya existen igual suman su fuente y se actualizan.
      restantes,
      referencias: referenciasLocales(),
      granjaId: ejecucion.granjaId,
      ejecucionId: ejecucion.id,
    },
    deps,
  );
  const sumadas = r.duplicados.filter((d) => d.fuenteNueva).length;
  const partes = [
    `${r.nuevos.length} evento(s) nuevo(s) en la bandeja`,
    r.actualizados.length ? `${r.actualizados.length} actualizado(s)` : "",
    r.duplicados.length ? `${r.duplicados.length} duplicado(s)${sumadas ? ` (${sumadas} con fuente nueva)` : ""}` : "",
    r.conImagen ? `${r.conImagen} imagen(es)` : "",
    r.descartados.length ? `${r.descartados.length} descartado(s)` : "",
    !restantes || r.omitidosPorLimite ? `máximo de eventos nuevos de hoy alcanzado${r.omitidosPorLimite ? ` (${r.omitidosPorLimite} quedan para mañana)` : ""}` : "",
    r.spotmi === "no_disponible" ? "Spotmi no respondió: duplicados revisados solo contra Ezra" : "",
    notaRedes ? `redes: ${notaRedes}` : "",
  ].filter(Boolean);
  return { artefactos: [{ tipo: "investigacion", contenido: JSON.stringify({ ...r, invalidos, redes: redes.resumen }, null, 2) }], detalle: `${partes.join(" · ")}.` };
}

/** Resumen de una ejecución de la granja de eventos: lo que dejó el verificador, los tokens y el costo estimado. */
export function resumenEjecucionEventos(ejecucionId: string) {
  const filas = base()
    .prepare("select contenido from artefactos where ejecucion_id = ? and tipo = 'investigacion' and procedencia like '%\"origen\":\"local\"%' order by creado desc limit 1")
    .all(ejecucionId) as { contenido: string }[];
  const v = json<{ nuevos?: unknown[]; duplicados?: { fuenteNueva?: boolean }[]; actualizados?: unknown[]; descartados?: unknown[]; conImagen?: number }>(filas[0]?.contenido, {});
  const consumo = base().prepare("select * from consumo_ia where ejecucion_id = ?").all(ejecucionId) as FilaConsumo[];
  const tarifas = leerTarifas();
  const costos = consumo.map((f) => costoLlamada(f, tarifas));
  return {
    verificado: filas.length > 0,
    nuevos: v.nuevos?.length ?? 0,
    actualizados: v.actualizados?.length ?? 0,
    duplicados: v.duplicados?.length ?? 0,
    fuentesSumadas: v.duplicados?.filter((d) => d.fuenteNueva).length ?? 0,
    descartados: v.descartados?.length ?? 0,
    conImagen: v.conImagen ?? 0,
    tokens: consumo.reduce((s, f) => s + Number(f.total_tokens), 0),
    llamadas: consumo.length,
    errores: consumo.filter((f) => f.error).length,
    /** USD según las tarifas de Consumo; null si algún modelo no tiene tarifa. */
    costo: costos.some((c) => c === null) ? null : costos.reduce<number>((s, c) => s + (c ?? 0), 0),
  };
}
