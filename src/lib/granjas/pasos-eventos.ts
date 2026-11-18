import type { Artefacto } from "./almacen";
import type { Ejecucion } from "./ejecucion";
import type { Nodo } from "./modelo";
import { leerCandidatos, promptCazadorEventos, type Candidato } from "./cazador";
import { eventosCreadosHoy, referenciasLocales } from "./eventos";
import { diaLocal } from "./tiempo";
import { verificarCandidatos, type DepsVerificador } from "./verificador";

/**
 * Especialistas de la granja «Eventos de El Salvador» dentro del motor de granjas:
 * el cazador usa un prompt propio (JSON) y el verificador trabaja sin IA.
 */
export type DepsEspecialistas = DepsVerificador & { ahora?: () => Date };
export const esGranjaEventos = (e: Ejecucion) => e.instantanea.ajustes?.purpose === "eventos_el_salvador";
export function limiteEventos(e: Ejecucion) {
  const porDia = e.instantanea.ajustes?.eventos?.maxPorDia ?? 10;
  return Math.min(porDia, e.instantanea.limites?.eventos ?? porDia);
}

/** Prompt del cazador cuando la granja es la de eventos; null en cualquier otra granja. */
export function promptEspecial(nodo: Nodo, ejecucion: Ejecucion, ahora = new Date()): { prompt: string; maxTokens: number } | null {
  if (nodo.agente !== "cazador" || !esGranjaEventos(ejecucion)) return null;
  const hoy = diaLocal(ahora);
  return {
    prompt: promptCazadorEventos({
      hoy,
      diasAdelante: ejecucion.instantanea.ajustes?.eventos?.diasAdelante ?? 14,
      maximo: limiteEventos(ejecucion),
      dominios: ejecucion.instantanea.politica.dominios,
      conocidos: referenciasLocales()
        .filter((r) => !r.fecha || r.fecha >= hoy)
        .map((r) => r.titulo),
      instrucciones: nodo.instrucciones,
    }),
    // JSON de hasta 20 eventos más el razonamiento del modelo.
    maxTokens: 8192,
  };
}

/** Resultado de un especialista sin IA: un artefacto y el estado en que queda el paso. */
export type ResultadoLocal = { tipo: Artefacto["tipo"]; contenido: string; detalle: string; bloqueado?: boolean; medioId?: string; medioSha?: string };

export async function verificarPaso(ejecucion: Ejecucion, entradas: Artefacto[], deps: DepsEspecialistas): Promise<ResultadoLocal> {
  const candidatos: Candidato[] = [];
  let invalidos = 0;
  for (const a of entradas.filter((x) => x.tipo === "investigacion" || x.tipo === "texto")) {
    const leido = leerCandidatos(a.contenido);
    candidatos.push(...leido.candidatos);
    invalidos += leido.invalidos;
  }
  if (!candidatos.length)
    return {
      tipo: "investigacion",
      contenido: JSON.stringify({ revisados: 0, nuevos: [], duplicados: [], descartados: [], invalidos }, null, 2),
      detalle: "El cazador no entregó eventos en el formato esperado (JSON). Reintenta el cazador o pega un resultado manual.",
      bloqueado: true,
    };
  const ahora = deps.ahora?.() ?? new Date();
  const restantes = Math.max(0, limiteEventos(ejecucion) - eventosCreadosHoy(ejecucion.granjaId, ahora));
  if (!restantes)
    return {
      tipo: "investigacion",
      contenido: JSON.stringify({ revisados: 0, nuevos: [], limiteAlcanzado: true }, null, 2),
      detalle: "Ya se alcanzó el máximo de eventos nuevos de hoy. Sube el máximo en el horario o espera a mañana.",
    };
  const r = await verificarCandidatos(
    candidatos,
    {
      hoy: diaLocal(ahora),
      diasAdelante: ejecucion.instantanea.ajustes?.eventos?.diasAdelante ?? 14,
      dominios: ejecucion.instantanea.politica.dominios,
      restantes,
      referencias: referenciasLocales(),
      granjaId: ejecucion.granjaId,
      ejecucionId: ejecucion.id,
    },
    deps,
  );
  const partes = [
    `${r.nuevos.length} evento(s) nuevo(s) en la bandeja`,
    r.duplicados.length ? `${r.duplicados.length} duplicado(s)` : "",
    r.descartados.length ? `${r.descartados.length} descartado(s)` : "",
    r.spotmi === "no_disponible" ? "Spotmi no respondió: duplicados revisados solo contra Ezra" : "",
  ].filter(Boolean);
  return { tipo: "investigacion", contenido: JSON.stringify({ ...r, invalidos }, null, 2), detalle: `${partes.join(" · ")}.` };
}
