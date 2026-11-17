import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json, transaccion } from "./db";
import { configNodo, nodosCambiados, sha256 } from "./huella";
import {
  datosGranjaSchema,
  descendientes,
  grafoDeReceta,
  grafoSchema,
  recetas,
  validarGrafo,
  type DatosGranja,
  type Grafo,
  type Granja,
  type TipoArtefacto,
} from "./modelo";

type FilaGranja = {
  id: string;
  nombre: string;
  objetivo: string;
  formato: Granja["formato"];
  canales: string;
  politica_fuentes: string;
  ajustes: string;
  grafo: string;
  estado: Granja["estado"];
  revision: number;
  receta: string | null;
  creado: string;
  actualizado: string;
};
const aGranja = (f: FilaGranja): Granja => ({
  id: f.id,
  nombre: f.nombre,
  objetivo: f.objetivo,
  formato: f.formato,
  canales: json(f.canales, []),
  politicaFuentes: json(f.politica_fuentes, { dominios: [], maxFuentesPorPaso: 5 }),
  ajustes: json(f.ajustes, { zonaHoraria: "America/El_Salvador" }),
  grafo: grafoSchema.parse(json(f.grafo, { nodos: [], aristas: [] })),
  estado: f.estado,
  revision: f.revision,
  receta: f.receta,
  creado: f.creado,
  actualizado: f.actualizado,
});

export function listarGranjas(): Granja[] {
  return (base().prepare("select * from granjas order by actualizado desc").all() as FilaGranja[]).map(aGranja);
}
export function leerGranja(id: string): Granja {
  const fila = base().prepare("select * from granjas where id = ?").get(id) as FilaGranja | undefined;
  if (!fila) throw new WorkflowError("Granja no encontrada.", 404);
  return aGranja(fila);
}
function exigirRevision(granja: Granja, revision: number) {
  if (granja.revision !== revision)
    throw new WorkflowError("La granja cambió en otra ventana. Recarga antes de guardar.", 409);
}
function exigirGrafoValido(grafo: Grafo) {
  const problemas = validarGrafo(grafo);
  if (problemas.length) throw new WorkflowError(problemas.map((p) => p.mensaje).join(" "), 422);
}

export function crearGranja(datos: DatosGranja, grafo: Grafo = { nodos: [], aristas: [] }, receta: string | null = null) {
  const limpios = datosGranjaSchema.parse(datos);
  const grafoLimpio = grafoSchema.parse(grafo);
  exigirGrafoValido(grafoLimpio);
  return transaccion((db) => {
    if ((db.prepare("select count(*) as n from granjas").get() as { n: number }).n >= 200)
      throw new WorkflowError("Se alcanzó el límite de 200 granjas. Archiva o exporta antes de crear otra.", 422);
    const id = crypto.randomUUID();
    const ahora = ahoraIso();
    db.prepare(
      `insert into granjas (id, nombre, objetivo, formato, canales, politica_fuentes, ajustes, grafo, estado, revision, receta, creado, actualizado)
       values (?, ?, ?, ?, ?, ?, ?, ?, 'activa', 1, ?, ?, ?)`,
    ).run(
      id,
      limpios.nombre,
      limpios.objetivo,
      limpios.formato,
      JSON.stringify(limpios.canales),
      JSON.stringify(limpios.politicaFuentes),
      JSON.stringify(limpios.ajustes),
      JSON.stringify(grafoLimpio),
      receta,
      ahora,
      ahora,
    );
    db.prepare("insert into granja_revisiones values (?, 1, ?, ?, ?)").run(id, JSON.stringify(grafoLimpio), "creación", ahora);
    auditar("granja.crear", id, { receta });
    return leerGranja(id);
  });
}
export function crearDesdeReceta(clave: string) {
  const receta = recetas.find((r) => r.clave === clave);
  if (!receta) throw new WorkflowError("Receta no encontrada.", 404);
  return crearGranja(receta.datos, grafoDeReceta(receta), receta.clave);
}
export function duplicarGranja(id: string) {
  const original = leerGranja(id);
  const nuevos = new Map(original.grafo.nodos.map((n) => [n.id, crypto.randomUUID()]));
  const grafo: Grafo = {
    // La copia no hereda encargos ni resultados: solo la configuración del flujo.
    nodos: original.grafo.nodos.map((n) => ({ ...n, id: nuevos.get(n.id)!, encargoId: null })),
    aristas: original.grafo.aristas.map((a) => ({
      id: crypto.randomUUID(),
      desde: nuevos.get(a.desde)!,
      hacia: nuevos.get(a.hacia)!,
    })),
  };
  return crearGranja({ ...original, nombre: `${original.nombre.slice(0, 110)} (copia)` }, grafo, original.receta);
}

export function actualizarGranja(
  id: string,
  revision: number,
  cambios: { datos?: DatosGranja; grafo?: Grafo; estado?: Granja["estado"] },
) {
  return transaccion((db) => {
    const actual = leerGranja(id);
    exigirRevision(actual, revision);
    if (actual.estado === "archivada" && cambios.estado !== "activa")
      throw new WorkflowError("La granja está archivada. Restáurala para editarla.", 422);
    const datos = cambios.datos ? datosGranjaSchema.parse(cambios.datos) : actual;
    const grafo = cambios.grafo ? grafoSchema.parse(cambios.grafo) : actual.grafo;
    exigirGrafoValido(grafo);
    const ahora = ahoraIso();
    const siguiente = actual.revision + 1;
    db.prepare(
      `update granjas set nombre = ?, objetivo = ?, formato = ?, canales = ?, politica_fuentes = ?, grafo = ?,
       estado = ?, revision = ?, actualizado = ?, ajustes = ? where id = ?`,
    ).run(
      datos.nombre,
      datos.objetivo,
      datos.formato,
      JSON.stringify(datos.canales),
      JSON.stringify(datos.politicaFuentes),
      JSON.stringify(grafo),
      cambios.estado ?? actual.estado,
      siguiente,
      ahora,
      JSON.stringify(datos.ajustes),
      id,
    );
    if (cambios.grafo) {
      db.prepare("insert into granja_revisiones values (?, ?, ?, ?, ?)").run(id, siguiente, JSON.stringify(grafo), "edición", ahora);
      const cambiados = nodosCambiados(actual.grafo, grafo);
      // Una fuente, instrucción, proveedor o destino distinto invalida lo aprobado de ese paso y sus derivados.
      if (cambiados.length) invalidarDesde(id, grafo, cambiados, "El flujo cambió: instrucciones, fuentes, proveedor, medios o destinos.");
    }
    if (datos.politicaFuentes && JSON.stringify(datos.politicaFuentes) !== JSON.stringify(actual.politicaFuentes))
      invalidarDesde(id, grafo, grafo.nodos.filter((n) => n.fuentes.length).map((n) => n.id), "Cambió la política de fuentes.");
    auditar("granja.actualizar", id, { revision: siguiente, estado: cambios.estado ?? actual.estado });
    return leerGranja(id);
  });
}

/** Invalida aprobaciones de los pasos indicados y sus derivados; nunca borra resultados anteriores. */
export function invalidarDesde(granjaId: string, grafo: Grafo, nodos: string[], motivo: string) {
  const afectados = new Set([...nodos, ...descendientes(grafo, nodos)]);
  if (!afectados.size) return 0;
  const db = base();
  const ahora = ahoraIso();
  let total = 0;
  const pasos = db
    .prepare(
      `select p.id, p.nodo_id, p.estado, p.pieza_id from pasos p join ejecuciones e on e.id = p.ejecucion_id where e.granja_id = ?`,
    )
    .all(granjaId) as { id: string; nodo_id: string; estado: string; pieza_id: string | null }[];
  for (const paso of pasos.filter((p) => afectados.has(p.nodo_id))) {
    total += Number(
      db
        .prepare(
          "update aprobaciones set estado = 'invalidada', motivo = ?, invalidada = ? where objeto = 'paso' and objeto_id = ? and estado = 'vigente'",
        )
        .run(motivo, ahora, paso.id).changes,
    );
    if (["aprobado", "completado", "en_revision", "esperando_autorizacion"].includes(paso.estado))
      db.prepare("update pasos set estado = 'desactualizado', detalle = ?, actualizado = ? where id = ?").run(motivo, ahora, paso.id);
    if (paso.pieza_id) total += invalidarPieza(paso.pieza_id, motivo);
  }
  return total;
}
export function invalidarPieza(piezaId: string, motivo: string) {
  const db = base();
  const ahora = ahoraIso();
  const n = Number(
    db
      .prepare(
        "update aprobaciones set estado = 'invalidada', motivo = ?, invalidada = ? where objeto = 'pieza' and objeto_id = ? and estado = 'vigente'",
      )
      .run(motivo, ahora, piezaId).changes,
  );
  db.prepare("update autorizaciones set estado = 'revocada', motivo = ? where pieza_id = ? and estado = 'vigente'").run(motivo, piezaId);
  // Lo que todavía no salió hacia una red se detiene; lo ya enviado conserva su recibo.
  db.prepare(
    `update trabajos set estado = 'cancelado', error = ?, actualizado = ? where tipo = 'publicar' and estado = 'pendiente'
     and json_extract(carga, '$.piezaId') = ?`,
  ).run(motivo, ahora, piezaId);
  db.prepare("update recibos set estado = 'cancelado', error = ?, actualizado = ? where pieza_id = ? and estado = 'pendiente'").run(motivo, ahora, piezaId);
  return n;
}

/* ── Artefactos ── */
export type Procedencia = {
  origen: "astra" | "claude" | "gemini" | "manual" | "fuentes" | "render" | "subida" | "encargo" | "revision";
  nota?: string;
  encargo?: { id: string; version: number };
  herramienta?: string;
  consultado?: string;
};
export type Artefacto = {
  id: string;
  granjaId: string;
  ejecucionId: string | null;
  pasoId: string | null;
  nodoId: string;
  tipo: TipoArtefacto;
  version: number;
  contenido: string;
  medioId: string | null;
  procedencia: Procedencia;
  configNodo: string;
  hash: string;
  reemplaza: string | null;
  estado: "vigente" | "reemplazado";
  creado: string;
};
type FilaArtefacto = {
  id: string;
  granja_id: string;
  ejecucion_id: string | null;
  paso_id: string | null;
  nodo_id: string;
  tipo: TipoArtefacto;
  version: number;
  contenido: string;
  medio_id: string | null;
  procedencia: string;
  config_nodo: string;
  hash: string;
  reemplaza: string | null;
  estado: Artefacto["estado"];
  creado: string;
};
export const aArtefacto = (f: FilaArtefacto): Artefacto => ({
  id: f.id,
  granjaId: f.granja_id,
  ejecucionId: f.ejecucion_id,
  pasoId: f.paso_id,
  nodoId: f.nodo_id,
  tipo: f.tipo,
  version: f.version,
  contenido: f.contenido,
  medioId: f.medio_id,
  procedencia: json(f.procedencia, { origen: "manual" }),
  configNodo: f.config_nodo,
  hash: f.hash,
  reemplaza: f.reemplaza,
  estado: f.estado,
  creado: f.creado,
});
export function guardarArtefacto(datos: {
  granjaId: string;
  ejecucionId: string | null;
  pasoId: string | null;
  nodo: Grafo["nodos"][number];
  tipo: TipoArtefacto;
  contenido: string;
  medioId?: string | null;
  medioSha?: string;
  procedencia: Procedencia;
  reemplaza?: string | null;
}): Artefacto {
  if (datos.contenido.length > 60000) throw new WorkflowError("El resultado supera el tamaño permitido.", 413);
  if ((datos.tipo === "imagen" || datos.tipo === "video") && !datos.medioId)
    throw new WorkflowError("Una imagen o un video debe apuntar a un archivo guardado.", 422);
  const db = base();
  const id = crypto.randomUUID();
  const version =
    ((db
      .prepare("select max(version) as v from artefactos where granja_id = ? and nodo_id = ? and tipo = ?")
      .get(datos.granjaId, datos.nodo.id, datos.tipo) as { v: number | null }).v ?? 0) + 1;
  const hash = sha256(`${datos.tipo}\n${datos.medioSha ?? ""}\n${datos.contenido}`);
  db.prepare(
    `insert into artefactos (id, granja_id, ejecucion_id, paso_id, nodo_id, tipo, version, contenido, medio_id, procedencia, config_nodo, hash, reemplaza, estado, creado)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vigente', ?)`,
  ).run(
    id,
    datos.granjaId,
    datos.ejecucionId,
    datos.pasoId,
    datos.nodo.id,
    datos.tipo,
    version,
    datos.contenido,
    datos.medioId ?? null,
    JSON.stringify(datos.procedencia),
    configNodo(datos.nodo),
    hash,
    datos.reemplaza ?? null,
    ahoraIso(),
  );
  if (datos.reemplaza) db.prepare("update artefactos set estado = 'reemplazado' where id = ?").run(datos.reemplaza);
  return leerArtefacto(id);
}
export function leerArtefacto(id: string): Artefacto {
  const fila = base().prepare("select * from artefactos where id = ?").get(id) as FilaArtefacto | undefined;
  if (!fila) throw new WorkflowError("Resultado no encontrado.", 404);
  return aArtefacto(fila);
}
export function artefactosDe(ids: string[]): Artefacto[] {
  return ids.map((id) => leerArtefacto(id));
}
