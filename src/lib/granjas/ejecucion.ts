import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json, transaccion } from "./db";
import { encolar } from "./cola";
import { configNodo, sha256 } from "./huella";
import {
  aArtefacto,
  guardarArtefacto,
  invalidarDesde,
  invalidarPieza,
  leerArtefacto,
  leerGranja,
  type Artefacto,
  type Procedencia,
} from "./almacen";
import {
  antecesores,
  descendientes,
  estadosTerminalesExito,
  validarGrafo,
  type EstadoPaso,
  type Grafo,
  type Granja,
  type Nodo,
  type TipoArtefacto,
} from "./modelo";

export type EstadoEjecucion =
  | "en_curso"
  | "esperando_dueno"
  | "pausada"
  | "cancelada"
  | "fallida"
  | "bloqueada"
  | "completada";
export type Instantanea = {
  grafo: Grafo;
  revision: number;
  politica: { dominios: string[]; maxFuentesPorPaso: number };
  canales: string[];
  entradas: Record<string, { config: string; encargo: { id: string; version: number } | null; medios: { id: string; sha256: string }[] }>;
  /** Ajustes de la granja al iniciar (eventos, Instagram). Ausente en ejecuciones anteriores. */
  ajustes?: Granja["ajustes"];
  /** Límites de esta ejecución (por ejemplo, la prueba real con 3 eventos). */
  limites?: { eventos?: number; posts?: number };
  /** Quién la inició: el propietario o el horario. */
  origen?: "manual" | "horario";
};
export type Ejecucion = {
  id: string;
  granjaId: string;
  revisionGranja: number;
  instantanea: Instantanea;
  estado: EstadoEjecucion;
  alcance: string;
  consentimiento: { ia: boolean; fecha: string; usuario: string };
  creado: string;
  actualizado: string;
  terminado: string | null;
};
export type Paso = {
  id: string;
  ejecucionId: string;
  nodoId: string;
  estado: EstadoPaso;
  proveedor: string;
  intentos: number;
  entradas: string[];
  salidas: string[];
  error: string;
  detalle: string;
  piezaId: string | null;
  inicio: string | null;
  fin: string | null;
  actualizado: string;
};
type FilaEjecucion = {
  id: string;
  granja_id: string;
  revision_granja: number;
  instantanea: string;
  estado: EstadoEjecucion;
  alcance: string;
  consentimiento: string;
  creado: string;
  actualizado: string;
  terminado: string | null;
};
type FilaPaso = {
  id: string;
  ejecucion_id: string;
  nodo_id: string;
  estado: EstadoPaso;
  proveedor: string;
  intentos: number;
  entradas: string;
  salidas: string;
  error: string;
  detalle: string;
  pieza_id: string | null;
  inicio: string | null;
  fin: string | null;
  actualizado: string;
};
const aEjecucion = (f: FilaEjecucion): Ejecucion => ({
  id: f.id,
  granjaId: f.granja_id,
  revisionGranja: f.revision_granja,
  instantanea: json(f.instantanea, {} as Instantanea),
  estado: f.estado,
  alcance: f.alcance,
  consentimiento: json(f.consentimiento, { ia: false, fecha: "", usuario: "" }),
  creado: f.creado,
  actualizado: f.actualizado,
  terminado: f.terminado,
});
const aPaso = (f: FilaPaso): Paso => ({
  id: f.id,
  ejecucionId: f.ejecucion_id,
  nodoId: f.nodo_id,
  estado: f.estado,
  proveedor: f.proveedor,
  intentos: f.intentos,
  entradas: json(f.entradas, []),
  salidas: json(f.salidas, []),
  error: f.error,
  detalle: f.detalle,
  piezaId: f.pieza_id,
  inicio: f.inicio,
  fin: f.fin,
  actualizado: f.actualizado,
});

export function leerEjecucion(id: string): Ejecucion {
  const fila = base().prepare("select * from ejecuciones where id = ?").get(id) as FilaEjecucion | undefined;
  if (!fila) throw new WorkflowError("Ejecución no encontrada.", 404);
  return aEjecucion(fila);
}
export function leerPaso(id: string): Paso {
  const fila = base().prepare("select * from pasos where id = ?").get(id) as FilaPaso | undefined;
  if (!fila) throw new WorkflowError("Paso no encontrado.", 404);
  return aPaso(fila);
}
export const pasosDe = (ejecucionId: string) =>
  (base().prepare("select * from pasos where ejecucion_id = ?").all(ejecucionId) as FilaPaso[]).map(aPaso);
export const nodoDe = (ejecucion: Ejecucion, nodoId: string): Nodo => {
  const nodo = ejecucion.instantanea.grafo.nodos.find((n) => n.id === nodoId);
  if (!nodo) throw new WorkflowError("El paso no existe en la instantánea de esta ejecución.", 409);
  return nodo;
};
export const usaIA = (nodo: Nodo) => nodo.tipo === "agente" && nodo.proveedor !== "manual" && nodo.proveedor !== "local";

function actualizarPaso(id: string, cambios: Partial<Omit<Paso, "id">>) {
  const columnas: Record<string, string> = {
    estado: "estado",
    proveedor: "proveedor",
    intentos: "intentos",
    entradas: "entradas",
    salidas: "salidas",
    error: "error",
    detalle: "detalle",
    piezaId: "pieza_id",
    inicio: "inicio",
    fin: "fin",
  };
  const pares = Object.entries(cambios).filter(([k]) => columnas[k]);
  const valores = pares.map(([, v]) => (Array.isArray(v) ? JSON.stringify(v) : (v as string | number | null)));
  base()
    .prepare(`update pasos set ${pares.map(([k]) => `${columnas[k]} = ?`).join(", ")}${pares.length ? ", " : ""}actualizado = ? where id = ?`)
    .run(...valores, ahoraIso(), id);
}
export { actualizarPaso };

/** Último resultado vigente de un paso, aprobado si es una revisión, y fiel a la configuración actual. */
function salidasVigentes(granjaId: string, grafo: Grafo, nodoId: string): string[] {
  const nodo = grafo.nodos.find((n) => n.id === nodoId)!;
  const filas = base()
    .prepare(
      `select p.* from pasos p join ejecuciones e on e.id = p.ejecucion_id
       where e.granja_id = ? and p.nodo_id = ? and p.estado in ('completado', 'aprobado') order by p.fin desc limit 1`,
    )
    .all(granjaId, nodoId) as FilaPaso[];
  if (!filas.length)
    throw new WorkflowError(`«${nodo.titulo}» todavía no tiene un resultado. Ejecútalo antes de este paso.`, 422);
  const paso = aPaso(filas[0]);
  const config = configNodo(nodo);
  for (const id of paso.salidas) {
    const artefacto = leerArtefacto(id);
    if (artefacto.estado !== "vigente" || (artefacto.nodoId === nodoId && artefacto.configNodo !== config))
      throw new WorkflowError(`El resultado de «${nodo.titulo}» está desactualizado. Vuelve a ejecutarlo primero.`, 409);
  }
  if (nodo.tipo === "revision" && !aprobacionVigente(paso.id))
    throw new WorkflowError(`La aprobación de «${nodo.titulo}» ya no es válida. Revísalo otra vez.`, 409);
  return paso.salidas;
}
export function aprobacionVigente(pasoId: string) {
  return base()
    .prepare("select id, hash from aprobaciones where objeto = 'paso' and objeto_id = ? and estado = 'vigente' order by creado desc limit 1")
    .get(pasoId) as { id: string; hash: string } | undefined;
}

export async function versionesEncargos(): Promise<Map<string, number>> {
  const { leerProduccion } = await import("../produccion/almacen");
  return new Map((await leerProduccion()).encargos.map((e) => [e.id, e.version]));
}

export function iniciarEjecucion(
  granjaId: string,
  opciones: {
    nodoId?: string;
    confirmarIA: boolean;
    usuario: string;
    encargos: Map<string, number>;
    limites?: Instantanea["limites"];
    origen?: Instantanea["origen"];
  },
) {
  return transaccion((db) => {
    const granja = leerGranja(granjaId);
    if (granja.estado !== "activa")
      throw new WorkflowError(granja.estado === "pausada" ? "La granja está en pausa. Reanúdala para ejecutarla." : "La granja está archivada.", 422);
    const problemas = validarGrafo(granja.grafo);
    if (problemas.length) throw new WorkflowError(problemas.map((p) => p.mensaje).join(" "), 422);
    if (!granja.grafo.nodos.length) throw new WorkflowError("Agrega al menos un paso a la granja.", 422);
    const alcance = opciones.nodoId ? [opciones.nodoId] : granja.grafo.nodos.map((n) => n.id);
    if (opciones.nodoId && !granja.grafo.nodos.some((n) => n.id === opciones.nodoId))
      throw new WorkflowError("Ese paso no existe en la granja.", 404);
    const nodos = granja.grafo.nodos.filter((n) => alcance.includes(n.id));
    if (nodos.some(usaIA) && !opciones.confirmarIA)
      throw new WorkflowError("Confirma que aceptas enviar estos pasos a la IA elegida y consumir intentos del límite mensual.", 422);
    for (const nodo of nodos)
      if (nodo.encargoId && !opciones.encargos.has(nodo.encargoId))
        throw new WorkflowError(`El encargo vinculado a «${nodo.titulo}» ya no existe.`, 409);
    // Entradas externas al alcance: solo resultados vigentes, nunca versiones anteriores.
    const entradasExternas = new Map<string, string[]>();
    for (const nodo of nodos)
      for (const anterior of antecesores(granja.grafo, nodo.id))
        if (!alcance.includes(anterior)) entradasExternas.set(nodo.id, [...(entradasExternas.get(nodo.id) ?? []), ...salidasVigentes(granjaId, granja.grafo, anterior)]);
    const instantanea: Instantanea = {
      grafo: granja.grafo,
      revision: granja.revision,
      politica: granja.politicaFuentes,
      canales: granja.canales,
      ajustes: granja.ajustes,
      ...(opciones.limites ? { limites: opciones.limites } : {}),
      origen: opciones.origen ?? "manual",
      entradas: Object.fromEntries(
        nodos.map((n) => [
          n.id,
          {
            config: configNodo(n),
            encargo: n.encargoId ? { id: n.encargoId, version: opciones.encargos.get(n.encargoId)! } : null,
            medios: n.medios.map((id) => {
              const m = db.prepare("select id, sha256 from medios where id = ?").get(id) as { id: string; sha256: string } | undefined;
              if (!m) throw new WorkflowError(`Un archivo de «${n.titulo}» ya no existe.`, 409);
              return m;
            }),
          },
        ]),
      ),
    };
    const id = crypto.randomUUID();
    const ahora = ahoraIso();
    db.prepare(
      `insert into ejecuciones (id, granja_id, revision_granja, instantanea, estado, alcance, consentimiento, creado, actualizado)
       values (?, ?, ?, ?, 'en_curso', ?, ?, ?, ?)`,
    ).run(
      id,
      granjaId,
      granja.revision,
      JSON.stringify(instantanea),
      opciones.nodoId ? `paso:${opciones.nodoId}` : "completa",
      JSON.stringify({ ia: opciones.confirmarIA, fecha: ahora, usuario: opciones.usuario }),
      ahora,
      ahora,
    );
    for (const nodo of nodos) {
      const internos = antecesores(granja.grafo, nodo.id).filter((a) => alcance.includes(a));
      const listo = !internos.length;
      const pasoId = crypto.randomUUID();
      db.prepare(
        `insert into pasos (id, ejecucion_id, nodo_id, estado, proveedor, entradas, detalle, actualizado) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        pasoId,
        id,
        nodo.id,
        listo ? "en_cola" : "esperando",
        nodo.tipo === "agente" ? nodo.proveedor : nodo.tipo,
        JSON.stringify(entradasExternas.get(nodo.id) ?? []),
        listo ? "" : `Esperando a ${internos.map((a) => `«${granja.grafo.nodos.find((n) => n.id === a)!.titulo}»`).join(", ")}.`,
        ahora,
      );
      if (listo) encolar("paso", { pasoId }, { ejecucionId: id });
    }
    auditar("ejecucion.iniciar", id, { granjaId, alcance: opciones.nodoId ?? "completa", ia: opciones.confirmarIA });
    return leerEjecucion(id);
  });
}

/** Pasa a la cola los pasos cuyos antecesores terminaron; debe correr dentro de una transacción. */
export function avanzar(ejecucionId: string) {
  const ejecucion = leerEjecucion(ejecucionId);
  if (["pausada", "cancelada"].includes(ejecucion.estado)) return recalcular(ejecucionId);
  const pasos = pasosDe(ejecucionId);
  const porNodo = new Map(pasos.map((p) => [p.nodoId, p]));
  for (const paso of pasos.filter((p) => p.estado === "esperando")) {
    const anteriores = antecesores(ejecucion.instantanea.grafo, paso.nodoId)
      .map((n) => porNodo.get(n))
      .filter((p): p is Paso => Boolean(p));
    const pendientes = anteriores.filter((p) => !estadosTerminalesExito.includes(p.estado));
    if (pendientes.length) {
      const nombres = pendientes.map((p) => `«${nodoDe(ejecucion, p.nodoId).titulo}»`).join(", ");
      actualizarPaso(paso.id, { detalle: `Esperando a ${nombres}.` });
      continue;
    }
    actualizarPaso(paso.id, {
      estado: "en_cola",
      detalle: "",
      entradas: [...new Set([...paso.entradas, ...anteriores.flatMap((p) => p.salidas)])],
    });
    encolar("paso", { pasoId: paso.id }, { ejecucionId });
  }
  return recalcular(ejecucionId);
}
export function recalcular(ejecucionId: string): EstadoEjecucion {
  const ejecucion = leerEjecucion(ejecucionId);
  if (ejecucion.estado === "cancelada") return ejecucion.estado;
  const estados = pasosDe(ejecucionId).map((p) => p.estado);
  const hay = (...lista: EstadoPaso[]) => estados.some((e) => lista.includes(e));
  const estado: EstadoEjecucion =
    ejecucion.estado === "pausada"
      ? "pausada"
      : hay("en_cola", "recolectando", "generando")
        ? "en_curso"
        : hay("en_revision", "esperando_manual", "esperando_autorizacion")
          ? "esperando_dueno"
          : hay("fallido")
            ? "fallida"
            : hay("bloqueado", "desactualizado", "esperando")
              ? "bloqueada"
              : "completada";
  base()
    .prepare("update ejecuciones set estado = ?, actualizado = ?, terminado = ? where id = ?")
    .run(estado, ahoraIso(), estado === "completada" ? ahoraIso() : null, ejecucionId);
  return estado;
}

export function pausar(ejecucionId: string) {
  return transaccion(() => {
    const e = leerEjecucion(ejecucionId);
    if (["cancelada", "completada"].includes(e.estado)) throw new WorkflowError("Esta ejecución ya terminó.", 422);
    base().prepare("update ejecuciones set estado = 'pausada', actualizado = ? where id = ?").run(ahoraIso(), ejecucionId);
    auditar("ejecucion.pausar", ejecucionId);
    return leerEjecucion(ejecucionId);
  });
}
export function reanudar(ejecucionId: string) {
  return transaccion(() => {
    const e = leerEjecucion(ejecucionId);
    if (e.estado !== "pausada") throw new WorkflowError("La ejecución no está en pausa.", 422);
    base().prepare("update ejecuciones set estado = 'en_curso', actualizado = ? where id = ?").run(ahoraIso(), ejecucionId);
    avanzar(ejecucionId);
    auditar("ejecucion.reanudar", ejecucionId);
    return leerEjecucion(ejecucionId);
  });
}
export function cancelar(ejecucionId: string) {
  return transaccion((db) => {
    const e = leerEjecucion(ejecucionId);
    if (["cancelada", "completada"].includes(e.estado)) throw new WorkflowError("Esta ejecución ya terminó.", 422);
    const ahora = ahoraIso();
    db.prepare("update ejecuciones set estado = 'cancelada', actualizado = ?, terminado = ? where id = ?").run(ahora, ahora, ejecucionId);
    db.prepare(
      `update pasos set estado = 'cancelado', detalle = 'Cancelado por el propietario.', actualizado = ?
       where ejecucion_id = ? and estado not in ('completado', 'aprobado', 'fallido', 'cancelado')`,
    ).run(ahora, ejecucionId);
    db.prepare("update trabajos set estado = 'cancelado', actualizado = ? where ejecucion_id = ? and estado = 'pendiente'").run(ahora, ejecucionId);
    for (const p of pasosDe(ejecucionId)) if (p.piezaId) invalidarPieza(p.piezaId, "Ejecución cancelada.");
    auditar("ejecucion.cancelar", ejecucionId);
    return leerEjecucion(ejecucionId);
  });
}

/** Reintenta un paso fallido, bloqueado, cancelado o desactualizado con las salidas actuales de sus antecesores. */
export function reintentarPaso(pasoId: string, confirmarIA: boolean) {
  return transaccion(() => {
    const paso = leerPaso(pasoId);
    const ejecucion = leerEjecucion(paso.ejecucionId);
    if (ejecucion.estado === "cancelada") throw new WorkflowError("La ejecución está cancelada. Inicia otra.", 422);
    if (!["fallido", "bloqueado", "desactualizado", "esperando_manual"].includes(paso.estado))
      throw new WorkflowError("Solo puedes reintentar un paso fallido, bloqueado, desactualizado o pendiente de resultado.", 422);
    const nodo = nodoDe(ejecucion, paso.nodoId);
    if (usaIA(nodo) && !confirmarIA)
      throw new WorkflowError("Confirma el nuevo envío a la IA: consume otro intento del límite mensual.", 422);
    const porNodo = new Map(pasosDe(ejecucion.id).map((p) => [p.nodoId, p]));
    const internos = antecesores(ejecucion.instantanea.grafo, nodo.id).map((n) => porNodo.get(n)).filter((p): p is Paso => Boolean(p));
    const sinTerminar = internos.filter((p) => !estadosTerminalesExito.includes(p.estado));
    if (sinTerminar.length)
      throw new WorkflowError(`Completa primero ${sinTerminar.map((p) => `«${nodoDe(ejecucion, p.nodoId).titulo}»`).join(", ")}.`, 422);
    const externas = paso.entradas.filter((id) => !internos.some((p) => p.salidas.includes(id)) && leerArtefacto(id).estado === "vigente");
    actualizarPaso(pasoId, {
      estado: "en_cola",
      error: "",
      detalle: "",
      entradas: [...new Set([...externas, ...internos.flatMap((p) => p.salidas)])],
    });
    if (ejecucion.estado === "pausada") base().prepare("update ejecuciones set actualizado = ? where id = ?").run(ahoraIso(), ejecucion.id);
    else base().prepare("update ejecuciones set estado = 'en_curso', terminado = null where id = ?").run(ejecucion.id);
    encolar("paso", { pasoId }, { ejecucionId: ejecucion.id });
    auditar("paso.reintentar", pasoId);
    return leerPaso(pasoId);
  });
}

/** Marca como desactualizados los pasos posteriores que usaron una salida reemplazada. */
function desactualizarPosteriores(ejecucion: Ejecucion, nodoId: string, motivo: string) {
  const afectados = descendientes(ejecucion.instantanea.grafo, [nodoId]);
  for (const p of pasosDe(ejecucion.id).filter((x) => afectados.has(x.nodoId))) {
    base()
      .prepare("update aprobaciones set estado = 'invalidada', motivo = ?, invalidada = ? where objeto = 'paso' and objeto_id = ? and estado = 'vigente'")
      .run(motivo, ahoraIso(), p.id);
    if (p.piezaId) invalidarPieza(p.piezaId, motivo);
    if (!["esperando", "cancelado"].includes(p.estado)) actualizarPaso(p.id, { estado: "desactualizado", detalle: motivo });
  }
}

/** Resultado hecho fuera de Ezra (otro chat, a mano). Se etiqueta como manual, nunca como ejecución del adaptador. */
export function completarManual(
  pasoId: string,
  datos: { contenido: string; nota: string; medioId?: string | null; tipo?: TipoArtefacto },
) {
  return transaccion((db) => {
    const paso = leerPaso(pasoId);
    const ejecucion = leerEjecucion(paso.ejecucionId);
    if (ejecucion.estado === "cancelada") throw new WorkflowError("La ejecución está cancelada.", 422);
    if (!["esperando_manual", "fallido", "bloqueado"].includes(paso.estado))
      throw new WorkflowError("Este paso no espera un resultado manual ahora.", 422);
    const nodo = nodoDe(ejecucion, paso.nodoId);
    if (!["agente", "render"].includes(nodo.tipo)) throw new WorkflowError("Este tipo de paso no admite un resultado manual.", 422);
    const tipo = nodo.tipo === "render" ? "video" : (datos.tipo ?? salidaAgente(nodo));
    let medioSha: string | undefined;
    if (datos.medioId) {
      const m = db.prepare("select sha256, mime from medios where id = ?").get(datos.medioId) as { sha256: string; mime: string } | undefined;
      if (!m) throw new WorkflowError("El archivo indicado no existe.", 404);
      if (tipo === "video" && !m.mime.startsWith("video/")) throw new WorkflowError("Este paso necesita un archivo de video.", 422);
      medioSha = m.sha256;
    }
    if (!datos.contenido.trim() && !datos.medioId) throw new WorkflowError("Pega el resultado o adjunta el archivo.", 422);
    const artefacto = guardarArtefacto({
      granjaId: ejecucion.granjaId,
      ejecucionId: ejecucion.id,
      pasoId,
      nodo,
      tipo,
      contenido: datos.contenido,
      medioId: datos.medioId ?? null,
      medioSha,
      procedencia: { origen: "manual", nota: datos.nota.slice(0, 300) || "Resultado aportado manualmente por el propietario." },
    });
    const evidencia = paso.salidas.filter((id) => {
      const a = leerArtefacto(id);
      return a.estado === "vigente" && a.procedencia.origen === "fuentes";
    });
    actualizarPaso(pasoId, { estado: "completado", salidas: [...evidencia, artefacto.id], error: "", detalle: "Completado manualmente.", fin: ahoraIso() });
    auditar("paso.manual", pasoId, { artefacto: artefacto.id });
    avanzar(ejecucion.id);
    return artefacto;
  });
}
export const salidaAgente = (nodo: Nodo): TipoArtefacto =>
  ({ cazador: "investigacion", guion: "guion", edicion: "guion", retencion: "revision", shorts: "guion", auditoria: "revision" })[nodo.agente as string] as TipoArtefacto ?? "texto";

/** Trae el resultado guardado de un encargo vinculado. Conserva su procedencia original. */
export async function importarEncargo(pasoId: string) {
  const { leerProduccion } = await import("../produccion/almacen");
  const produccion = await leerProduccion();
  return transaccion(() => {
    const paso = leerPaso(pasoId);
    const ejecucion = leerEjecucion(paso.ejecucionId);
    const nodo = nodoDe(ejecucion, paso.nodoId);
    const encargo = produccion.encargos.find((e) => e.id === nodo.encargoId);
    if (!encargo) throw new WorkflowError("Este paso no tiene un encargo vinculado.", 422);
    if (!encargo.resultado.trim()) throw new WorkflowError("El encargo vinculado todavía no tiene resultado.", 422);
    if (!["esperando_manual", "fallido", "bloqueado"].includes(paso.estado))
      throw new WorkflowError("Este paso no espera un resultado ahora.", 422);
    const procedencia: Procedencia = {
      origen: "encargo",
      encargo: { id: encargo.id, version: encargo.version },
      nota: `Resultado del encargo «${encargo.titulo}», versión ${encargo.version}, origen ${encargo.origenResultado === "manual" ? "manual (sin adaptador de IA)" : encargo.origenResultado}.`,
    };
    const artefacto = guardarArtefacto({
      granjaId: ejecucion.granjaId,
      ejecucionId: ejecucion.id,
      pasoId,
      nodo,
      tipo: salidaAgente(nodo),
      contenido: encargo.resultado,
      procedencia,
    });
    const evidencia = paso.salidas.filter((id) => leerArtefacto(id).procedencia.origen === "fuentes");
    actualizarPaso(pasoId, { estado: "completado", salidas: [...evidencia, artefacto.id], detalle: "Importado del encargo vinculado.", fin: ahoraIso() });
    auditar("paso.importar_encargo", pasoId, { encargo: encargo.id, version: encargo.version });
    avanzar(ejecucion.id);
    return artefacto;
  });
}

/** Corrección del propietario: crea una versión nueva y desactualiza lo que dependía de la anterior. */
export function editarArtefacto(artefactoId: string, contenido: string, nota: string) {
  return transaccion(() => {
    const anterior = leerArtefacto(artefactoId);
    if (anterior.estado !== "vigente") throw new WorkflowError("Solo puedes editar la versión vigente.", 409);
    if (anterior.tipo === "imagen" || anterior.tipo === "video") throw new WorkflowError("Sube un archivo nuevo para cambiar un medio.", 422);
    if (!anterior.pasoId) throw new WorkflowError("Este resultado no pertenece a un paso.", 422);
    const paso = leerPaso(anterior.pasoId);
    const ejecucion = leerEjecucion(paso.ejecucionId);
    const nodo = nodoDe(ejecucion, paso.nodoId);
    const nuevo = guardarArtefacto({
      granjaId: anterior.granjaId,
      ejecucionId: ejecucion.id,
      pasoId: paso.id,
      nodo,
      tipo: anterior.tipo,
      contenido,
      procedencia: { ...anterior.procedencia, nota: `${anterior.procedencia.nota ?? ""} · Editado por el propietario${nota ? `: ${nota}` : ""}.`.slice(0, 600) },
      reemplaza: anterior.id,
    });
    actualizarPaso(paso.id, { salidas: paso.salidas.map((id) => (id === anterior.id ? nuevo.id : id)) });
    desactualizarPosteriores(ejecucion, paso.nodoId, `Cambió el resultado de «${nodo.titulo}».`);
    recalcular(ejecucion.id);
    auditar("artefacto.editar", nuevo.id, { reemplaza: anterior.id });
    return nuevo;
  });
}

export function aprobarRevision(pasoId: string, comprobaciones: { hechos: boolean; derechos: boolean; marca: boolean }) {
  return transaccion((db) => {
    const paso = leerPaso(pasoId);
    const ejecucion = leerEjecucion(paso.ejecucionId);
    if (paso.estado !== "en_revision") throw new WorkflowError("Este paso no está esperando tu revisión.", 422);
    if (!Object.values(comprobaciones).every(Boolean))
      throw new WorkflowError("Confirma hechos, derechos y marca antes de aprobar.", 422);
    const artefactos = paso.entradas.map(leerArtefacto);
    if (artefactos.some((a) => a.estado !== "vigente")) throw new WorkflowError("Una entrada cambió. Reintenta este paso.", 409);
    const hash = sha256(artefactos.map((a) => a.hash).sort().join("\n"));
    db.prepare(
      "insert into aprobaciones (id, objeto, objeto_id, hash, comprobaciones, estado, creado) values (?, 'paso', ?, ?, ?, 'vigente', ?)",
    ).run(crypto.randomUUID(), pasoId, hash, JSON.stringify(comprobaciones), ahoraIso());
    actualizarPaso(pasoId, { estado: "aprobado", salidas: paso.entradas, detalle: "Aprobado por el propietario.", fin: ahoraIso() });
    auditar("paso.aprobar", pasoId, { hash });
    avanzar(ejecucion.id);
    return leerPaso(pasoId);
  });
}

/** Si un encargo vinculado cambia de versión, lo aprobado a partir de él deja de valer. */
export function invalidarPorEncargo(encargoId: string, version: number) {
  return transaccion(() => {
    let total = 0;
    for (const fila of base().prepare("select id, grafo from granjas").all() as { id: string; grafo: string }[]) {
      const grafo = json<Grafo>(fila.grafo, { nodos: [], aristas: [] });
      const nodos = grafo.nodos.filter((n) => n.encargoId === encargoId).map((n) => n.id);
      if (!nodos.length) continue;
      const usados = (base()
        .prepare("select procedencia from artefactos where granja_id = ? and estado = 'vigente'")
        .all(fila.id) as { procedencia: string }[]).some((a) => {
        const p = json<Procedencia>(a.procedencia, { origen: "manual" });
        return p.encargo?.id === encargoId && p.encargo.version !== version;
      });
      if (usados) total += invalidarDesde(fila.id, grafo, nodos, "El encargo vinculado cambió de versión.");
    }
    return total;
  });
}

export function estadoGranja(granjaId: string) {
  const granja = leerGranja(granjaId);
  const ejecuciones = (base()
    .prepare("select * from ejecuciones where granja_id = ? order by creado desc limit 15")
    .all(granjaId) as FilaEjecucion[]).map(aEjecucion);
  const ultima = ejecuciones[0];
  const pasos = ultima ? pasosDe(ultima.id) : [];
  const ids = [...new Set(pasos.flatMap((p) => [...p.entradas, ...p.salidas]))];
  const artefactos: Artefacto[] = ids.length
    ? (base().prepare(`select * from artefactos where id in (${ids.map(() => "?").join(",")})`).all(...ids) as Parameters<typeof aArtefacto>[0][]).map(aArtefacto)
    : [];
  const aprobaciones = pasos.map((p) => ({ pasoId: p.id, vigente: Boolean(aprobacionVigente(p.id)) }));
  return {
    granja,
    ejecuciones: ejecuciones.map((e) => ({
      id: e.id,
      granjaId: e.granjaId,
      revisionGranja: e.revisionGranja,
      estado: e.estado,
      alcance: e.alcance,
      consentimiento: e.consentimiento,
      creado: e.creado,
      actualizado: e.actualizado,
      terminado: e.terminado,
    })),
    ultima: ultima ? { ...ultima, pasos } : null,
    artefactos,
    aprobaciones,
  };
}
