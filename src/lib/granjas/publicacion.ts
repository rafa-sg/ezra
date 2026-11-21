import { estadoN8n, transportePublicacion } from "./n8n";
import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json, transaccion } from "./db";
import { encolar } from "./cola";
import { canonico } from "./modelo";
import { sha256 } from "./huella";
import { invalidarPieza, type Artefacto } from "./almacen";
import { leerBytesMedio, leerMedio, type Medio } from "./medios";
import {
  adaptadores,
  ErrorProveedor,
  type CanalConexion,
  type EstadoRecibo,
  type Identidad,
  type ResultadoEnvio,
} from "./adaptadores";
import { capacidadRequerida, leerConexion, secretoDe, solicitar } from "./conexiones";
import {
  CONFIRMACION_PUBLICAR,
  contenidoPiezaSchema,
  instanteLocal,
  type ContenidoPieza,
} from "./pieza";
import type { Ejecucion } from "./ejecucion";
import type { Nodo } from "./modelo";

export type Pieza = {
  id: string;
  granjaId: string;
  ejecucionId: string | null;
  pasoId: string | null;
  version: number;
  contenido: ContenidoPieza;
  hash: string;
  creado: string;
  actualizado: string;
};
type FilaPieza = {
  id: string;
  granja_id: string;
  ejecucion_id: string | null;
  paso_id: string | null;
  version: number;
  contenido: string;
  hash: string;
  creado: string;
  actualizado: string;
};
const aPieza = (f: FilaPieza): Pieza => ({
  id: f.id,
  granjaId: f.granja_id,
  ejecucionId: f.ejecucion_id,
  pasoId: f.paso_id,
  version: f.version,
  contenido: contenidoPiezaSchema.parse(json(f.contenido, {})),
  hash: f.hash,
  creado: f.creado,
  actualizado: f.actualizado,
});
export const hashPieza = (contenido: ContenidoPieza) => sha256(canonico(contenido));
export function leerPieza(id: string): Pieza {
  const f = base().prepare("select * from piezas where id = ?").get(id) as FilaPieza | undefined;
  if (!f) throw new WorkflowError("Vista previa no encontrada.", 404);
  return aPieza(f);
}

/** Arma la vista previa a partir de entradas aprobadas. No envía nada. */
export function crearPiezaDesdePaso(
  ejecucion: Ejecucion,
  nodo: Nodo,
  pasoId: string,
  entradas: Artefacto[],
): Pieza {
  const texto =
    [...entradas]
      .reverse()
      .find((a) => a.tipo === "texto")
      ?.contenido.trim() ?? "";
  const medios = entradas
    .filter((a) => a.medioId)
    .map((a) => leerMedio(a.medioId!))
    .map((m) => ({
      id: m.id,
      sha256: m.sha256,
      mime: m.mime,
      generado: m.generado,
      licencia: m.licencia,
    }));
  const fuentes = ejecucion.instantanea.grafo.nodos
    .flatMap((n) => n.fuentes.map((f) => ({ nombre: f.nombre, url: f.url })))
    .slice(0, 20);
  const canales = (
    nodo.canales.length ? nodo.canales : ejecucion.instantanea.canales
  ) as ContenidoPieza["canales"];
  const contenido = contenidoPiezaSchema.parse({
    titulo: nodo.titulo,
    textos: {
      spotmi: texto.slice(0, 5000),
      instagram: texto.slice(0, 2200),
      facebook: texto,
      tiktok: texto.slice(0, 2200),
    },
    medios,
    enlaces: [],
    canales: canales.length ? canales : ["spotmi"],
    programacion: { tipo: "ahora" },
    divulgaciones: {
      creditos: [...new Set(medios.map((m) => m.licencia).filter(Boolean))]
        .join(" · ")
        .slice(0, 500),
      imagenGenerada: medios.some((m) => m.generado),
    },
    spotmi: { titulo: "", fecha: "", lugar: "", departamento: "", fuente: "" },
    fuentes,
  });
  return guardarPiezaNueva(ejecucion.granjaId, ejecucion.id, pasoId, contenido);
}
export function guardarPiezaNueva(
  granjaId: string,
  ejecucionId: string | null,
  pasoId: string | null,
  contenido: ContenidoPieza,
) {
  const id = crypto.randomUUID();
  const ahora = ahoraIso();
  const hash = hashPieza(contenido);
  base()
    .prepare(
      "insert into piezas (id, granja_id, ejecucion_id, paso_id, version, contenido, hash, creado, actualizado) values (?, ?, ?, ?, 1, ?, ?, ?, ?)",
    )
    .run(id, granjaId, ejecucionId, pasoId, JSON.stringify(contenido), hash, ahora, ahora);
  base()
    .prepare("insert into pieza_versiones values (?, 1, ?, ?, ?)")
    .run(id, JSON.stringify(contenido), hash, ahora);
  return leerPieza(id);
}

/** Cualquier cambio material crea otra versión: su hash ya no coincide con lo aprobado. */
export function editarPieza(piezaId: string, version: number, crudo: unknown) {
  const contenido = contenidoPiezaSchema.parse(crudo);
  return transaccion((db) => {
    const actual = leerPieza(piezaId);
    if (actual.version !== version)
      throw new WorkflowError("La vista previa cambió en otra ventana. Recarga.", 409);
    for (const m of contenido.medios) {
      const medio = leerMedio(m.id);
      if (medio.sha256 !== m.sha256)
        throw new WorkflowError("Un archivo no coincide con el guardado.", 409);
      Object.assign(m, { mime: medio.mime, generado: medio.generado });
    }
    contenido.divulgaciones.imagenGenerada = contenido.medios.some((m) => m.generado);
    const hash = hashPieza(contenido);
    if (hash === actual.hash) return actual;
    const ahora = ahoraIso();
    db.prepare(
      "update piezas set version = ?, contenido = ?, hash = ?, actualizado = ? where id = ?",
    ).run(version + 1, JSON.stringify(contenido), hash, ahora, piezaId);
    db.prepare("insert into pieza_versiones values (?, ?, ?, ?, ?)").run(
      piezaId,
      version + 1,
      JSON.stringify(contenido),
      hash,
      ahora,
    );
    invalidarPieza(piezaId, "Cambió el contenido, los medios, los destinos o la programación.");
    auditar("pieza.editar", piezaId, { version: version + 1, hash });
    return leerPieza(piezaId);
  });
}
export function aprobacionPieza(piezaId: string, hash: string) {
  return base()
    .prepare(
      "select * from aprobaciones where objeto = 'pieza' and objeto_id = ? and hash = ? and estado = 'vigente' order by creado desc limit 1",
    )
    .get(piezaId, hash) as { id: string; creado: string } | undefined;
}
export function aprobarPieza(
  piezaId: string,
  hash: string,
  comprobaciones: { hechos: boolean; derechos: boolean; marca: boolean },
) {
  return transaccion((db) => {
    const pieza = leerPieza(piezaId);
    if (pieza.hash !== hash)
      throw new WorkflowError(
        "Estás aprobando una versión que ya cambió. Revisa la vista previa actual.",
        409,
      );
    if (!Object.values(comprobaciones).every(Boolean))
      throw new WorkflowError("Confirma hechos, derechos y marca.", 422);
    if (!Object.values(pieza.contenido.textos).some((t) => t.trim()))
      throw new WorkflowError("La pieza no tiene texto.", 422);
    db.prepare(
      "insert into aprobaciones (id, objeto, objeto_id, hash, comprobaciones, estado, creado) values (?, 'pieza', ?, ?, ?, 'vigente', ?)",
    ).run(crypto.randomUUID(), piezaId, hash, JSON.stringify(comprobaciones), ahoraIso());
    auditar("pieza.aprobar", piezaId, { hash });
    return leerPieza(piezaId);
  });
}

const mediosDe = (contenido: ContenidoPieza): Medio[] =>
  contenido.medios.map((m) => leerMedio(m.id));
export type RevisionDestino = {
  canal: CanalConexion;
  cuenta: Identidad | null;
  problemas: string[];
  plan: string[];
};
/** Validación por canal y por cuenta conectada. Usado por la simulación y antes de autorizar. */
export function revisarDestinos(pieza: Pieza, destinos: CanalConexion[]): RevisionDestino[] {
  const medios = mediosDe(pieza.contenido);
  return destinos.map((canal) => {
    const problemas: string[] = [];
    const puente = estadoN8n();
    if (["facebook", "instagram"].includes(canal) && puente.publicacionHabilitada) {
      if (!puente.produccion || puente.faltantes.length)
        problemas.push("Completa la configuración de producción de n8n antes de autorizar.");
      if (medios.some((m) => m.bytes > 7.5 * 1024 * 1024))
        problemas.push(
          "Esta conexión de n8n admite archivos de hasta 7,5 MB, dejando espacio para el formulario.",
        );
    }
    if (!pieza.contenido.canales.includes(canal))
      problemas.push("Este canal no está entre los destinos de la pieza.");
    const conexion = leerConexion(canal);
    if (
      !conexion.capacidades.includes(capacidadRequerida(canal)) ||
      !["conectada_publicacion", "restringida"].includes(conexion.estado)
    )
      problemas.push(
        conexion.estado === "sin_configurar"
          ? `Falta configurar la conexión (${conexion.configFaltante.join(", ")}).`
          : `La cuenta no está autorizada para ${canal === "tiktok" || canal === "youtube" ? "subir borradores" : canal === "spotmi" ? "enviar propuestas" : "publicar"} (${conexion.estado}).`,
      );
    for (const m of medios) {
      if (m.generado && !pieza.contenido.divulgaciones.imagenGenerada)
        problemas.push("Un medio es generado y debe declararse.");
      if (!m.licencia.trim())
        problemas.push(`«${m.nombre || m.archivo}» no tiene nota de permiso o licencia.`);
    }
    // TikTok y YouTube pueden ir sin texto propio (YouTube usa el título de la pieza y, si hay, el texto de Instagram).
    if (
      canal !== "spotmi" &&
      canal !== "tiktok" &&
      canal !== "youtube" &&
      !((pieza.contenido.textos as Record<string, string>)[canal] ?? "").trim()
    )
      problemas.push("Falta el texto para este canal.");
    problemas.push(...adaptadores[canal].validar(pieza.contenido, medios));
    if (
      pieza.contenido.programacion.tipo === "local" &&
      Date.parse(instanteLocal(pieza.contenido.programacion.fecha)) < Date.now()
    )
      problemas.push("La hora planificada ya pasó.");
    return {
      canal,
      cuenta: conexion.identidad,
      problemas,
      plan: conexion.identidad
        ? adaptadores[canal].plan(pieza.contenido, medios, conexion.identidad)
        : [],
    };
  });
}
/** Simulación local: muestra exactamente qué se enviaría, sin tocar la red. */
export function simular(piezaId: string, destinos: CanalConexion[]) {
  const pieza = leerPieza(piezaId);
  return {
    pieza: { id: pieza.id, version: pieza.version, hash: pieza.hash },
    aprobada: Boolean(aprobacionPieza(pieza.id, pieza.hash)),
    destinos: revisarDestinos(pieza, destinos),
    aviso: "Simulación local: no se envió nada a ninguna red ni a Spotmi.",
  };
}

/**
 * Autorización explícita del propietario, ligada a un hash y a cuentas concretas.
 * Es distinta del consentimiento OAuth y de la aprobación del contenido.
 */
export function autorizarPublicacion(datos: {
  piezaId: string;
  hash: string;
  destinos: CanalConexion[];
  confirmacion: string;
  usuario: string;
}) {
  return transaccion((db) => {
    const pieza = leerPieza(datos.piezaId);
    if (datos.confirmacion !== CONFIRMACION_PUBLICAR)
      throw new WorkflowError(`Escribe ${CONFIRMACION_PUBLICAR} para confirmar.`, 422);
    if (pieza.hash !== datos.hash)
      throw new WorkflowError("La vista previa cambió. Revisa y aprueba la versión actual.", 409);
    if (!aprobacionPieza(pieza.id, pieza.hash))
      throw new WorkflowError("Aprueba esta versión antes de autorizar su publicación.", 422);
    if (!datos.destinos.length || new Set(datos.destinos).size !== datos.destinos.length)
      throw new WorkflowError("Elige destinos distintos.", 422);
    const revision = revisarDestinos(pieza, datos.destinos);
    const conProblemas = revision.filter((r) => r.problemas.length || !r.cuenta?.id);
    if (conProblemas.length)
      throw new WorkflowError(
        conProblemas
          .map((r) => `${r.canal}: ${r.problemas.join(" ") || "cuenta sin identificar"}`)
          .join(" · "),
        422,
      );
    const ahora = ahoraIso();
    const programada =
      pieza.contenido.programacion.tipo === "local"
        ? instanteLocal(pieza.contenido.programacion.fecha)
        : ahora;
    const autorizacionId = crypto.randomUUID();
    const destinos = revision.map((r) => ({
      canal: r.canal,
      cuentaId: r.cuenta!.id,
      cuentaNombre: r.cuenta!.nombre,
    }));
    db.prepare(
      "insert into autorizaciones (id, pieza_id, hash, destinos, estado, usuario, creado, expira) values (?, ?, ?, ?, 'vigente', ?, ?, ?)",
    ).run(
      autorizacionId,
      pieza.id,
      pieza.hash,
      JSON.stringify(destinos),
      datos.usuario,
      ahora,
      new Date(Date.parse(programada) + 24 * 3600000).toISOString(),
    );
    const recibos: string[] = [];
    for (const destino of destinos) {
      const previos = db
        .prepare(
          "select estado from recibos where pieza_id = ? and hash = ? and canal = ? and cuenta_id = ?",
        )
        .all(pieza.id, pieza.hash, destino.canal, destino.cuentaId) as { estado: EstadoRecibo }[];
      // La misma versión no se envía dos veces a la misma cuenta salvo que el intento anterior fallara de forma comprobada.
      if (previos.some((p) => !["fallido", "cancelado"].includes(p.estado)))
        throw new WorkflowError(
          `Esta versión ya se envió o está en curso hacia ${destino.cuentaNombre} (${destino.canal}).`,
          409,
        );
      const clave = sha256(`${pieza.hash}|${destino.canal}|${destino.cuentaId}|${previos.length}`);
      const reciboId = crypto.randomUUID();
      db.prepare(
        `insert into recibos (id, autorizacion_id, pieza_id, hash, canal, cuenta_id, cuenta_nombre, clave_idempotencia, estado, creado, actualizado)
         values (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
      ).run(
        reciboId,
        autorizacionId,
        pieza.id,
        pieza.hash,
        destino.canal,
        destino.cuentaId,
        destino.cuentaNombre,
        clave,
        ahora,
        ahora,
      );
      encolar(
        "publicar",
        { reciboId, piezaId: pieza.id },
        { desde: programada, clave: `publicar:${clave}`, maxIntentos: 1 },
      );
      recibos.push(reciboId);
    }
    auditar("pieza.autorizar", pieza.id, { hash: pieza.hash, destinos, programada });
    return {
      autorizacionId,
      recibos,
      programada,
      local: pieza.contenido.programacion.tipo === "local",
    };
  });
}

type FilaRecibo = {
  id: string;
  autorizacion_id: string;
  pieza_id: string;
  hash: string;
  canal: CanalConexion;
  cuenta_id: string;
  cuenta_nombre: string;
  clave_idempotencia: string;
  estado: EstadoRecibo;
  remoto_id: string | null;
  contenedor_id: string | null;
  enlace: string | null;
  error: string;
  intentos: number;
  creado: string;
  actualizado: string;
};
const leerRecibo = (id: string) => {
  const f = base().prepare("select * from recibos where id = ?").get(id) as FilaRecibo | undefined;
  if (!f) throw new WorkflowError("Recibo no encontrado.", 404);
  return f;
};
export const recibosDe = (piezaId: string) =>
  base()
    .prepare("select * from recibos where pieza_id = ? order by creado desc")
    .all(piezaId) as FilaRecibo[];
function actualizarRecibo(id: string, r: Partial<ResultadoEnvio> & { estado: EstadoRecibo }) {
  base()
    .prepare(
      `update recibos set estado = ?, remoto_id = coalesce(?, remoto_id), contenedor_id = coalesce(?, contenedor_id), enlace = coalesce(?, enlace),
       error = ?, actualizado = ? where id = ?`,
    )
    .run(
      r.estado,
      r.remotoId ?? null,
      r.contenedorId ?? null,
      r.enlace ?? null,
      (r.error ?? "").slice(0, 500),
      ahoraIso(),
      id,
    );
}
function envioDe(recibo: FilaRecibo) {
  const pieza = leerPieza(recibo.pieza_id);
  return {
    contenido: pieza.contenido,
    medios: mediosDe(pieza.contenido),
    bytes: leerBytesMedio,
    secreto: secretoDe(recibo.canal),
    identidad: { id: recibo.cuenta_id, nombre: recibo.cuenta_nombre },
    clave: recibo.clave_idempotencia,
  };
}
const finales: EstadoRecibo[] = [
  "publicado",
  "borrador_subido",
  "propuesta_enviada",
  "fallido",
  "cancelado",
];
/** Ejecutado por el trabajador; nunca por un modelo. Revisa todo de nuevo antes de tocar la red. */
export async function ejecutarPublicacion(reciboId: string): Promise<void> {
  const recibo = leerRecibo(reciboId);
  if (finales.includes(recibo.estado)) return;
  if (["enviando", "desconocido", "procesando"].includes(recibo.estado))
    return confirmarRecibo(reciboId);
  const motivo = transaccion(() => {
    const autorizacion = base()
      .prepare("select * from autorizaciones where id = ?")
      .get(recibo.autorizacion_id) as { estado: string; hash: string; expira: string } | undefined;
    const pieza = leerPieza(recibo.pieza_id);
    if (!autorizacion || autorizacion.estado !== "vigente")
      return "La autorización fue revocada o ya no es válida.";
    if (Date.parse(autorizacion.expira) < Date.now()) return "La autorización venció.";
    if (pieza.hash !== recibo.hash || autorizacion.hash !== recibo.hash)
      return "El contenido cambió después de autorizarlo.";
    if (!aprobacionPieza(pieza.id, pieza.hash))
      return "La aprobación de esta versión ya no es válida.";
    const conexion = leerConexion(recibo.canal);
    if (conexion.identidad?.id !== recibo.cuenta_id)
      return "La cuenta conectada ya no es la que autorizaste.";
    if (!conexion.capacidades.includes(capacidadRequerida(recibo.canal)))
      return "La cuenta perdió el permiso necesario.";
    // Se marca «enviando» antes de tocar la red: si el proceso cae, se concilia en lugar de repetir.
    actualizarRecibo(reciboId, { estado: "enviando" });
    base().prepare("update recibos set intentos = intentos + 1 where id = ?").run(reciboId);
    return "";
  });
  if (motivo) {
    actualizarRecibo(reciboId, { estado: "cancelado", error: motivo });
    return;
  }
  try {
    const resultado = await adaptadores[recibo.canal].publicar(
      envioDe(recibo),
      transportePublicacion(recibo.canal, solicitar),
    );
    actualizarRecibo(reciboId, resultado);
    auditar("recibo.envio", reciboId, {
      canal: recibo.canal,
      estado: resultado.estado,
      remoto: resultado.remotoId ?? null,
    });
    if (resultado.estado === "procesando")
      encolar(
        "confirmar",
        { reciboId },
        { desde: new Date(Date.now() + 15000).toISOString(), clave: `confirmar:${reciboId}:1` },
      );
  } catch (error) {
    const ambiguo = error instanceof ErrorProveedor && error.tipo === "ambiguo";
    actualizarRecibo(reciboId, {
      estado: ambiguo ? "desconocido" : "fallido",
      error: error instanceof Error ? error.message : "Falló el envío.",
    });
    auditar("recibo.error", reciboId, { canal: recibo.canal, ambiguo });
    if (ambiguo)
      encolar(
        "confirmar",
        { reciboId },
        { desde: new Date(Date.now() + 30000).toISOString(), clave: `confirmar:${reciboId}:a` },
      );
  }
}
/** Consulta el estado real en la plataforma. Un 200 o una subida aceptada no son una publicación. */
export async function confirmarRecibo(reciboId: string, ronda = 1): Promise<void> {
  const recibo = leerRecibo(reciboId);
  if (finales.includes(recibo.estado)) return;
  try {
    const resultado = await adaptadores[recibo.canal].confirmar(
      { remotoId: recibo.remoto_id, contenedorId: recibo.contenedor_id },
      envioDe(recibo),
      transportePublicacion(recibo.canal, solicitar),
    );
    actualizarRecibo(reciboId, resultado);
    if (resultado.estado === "procesando" && ronda < 40)
      encolar(
        "confirmar",
        { reciboId, ronda: String(ronda + 1) },
        {
          desde: new Date(Date.now() + 15000).toISOString(),
          clave: `confirmar:${reciboId}:${ronda + 1}`,
        },
      );
    if (resultado.estado === "procesando" && ronda >= 40)
      actualizarRecibo(reciboId, {
        estado: "desconocido",
        error: "La plataforma sigue procesando. Revisa la cuenta antes de reintentar.",
      });
  } catch (error) {
    actualizarRecibo(reciboId, {
      estado: "desconocido",
      error: error instanceof Error ? error.message : "No se pudo confirmar.",
    });
  }
}
/** Tras comprobar manualmente la cuenta, el propietario indica qué pasó con un envío desconocido. */
export function resolverDesconocido(
  reciboId: string,
  resultado: "no_publicado" | "publicado",
  enlace: string,
) {
  const recibo = leerRecibo(reciboId);
  if (recibo.estado !== "desconocido")
    throw new WorkflowError("Solo se resuelven envíos con resultado desconocido.", 422);
  actualizarRecibo(
    reciboId,
    resultado === "publicado"
      ? {
          estado: "publicado",
          enlace: enlace || null,
          error: "Confirmado manualmente por el propietario.",
        }
      : { estado: "fallido", error: "El propietario comprobó que no se publicó." },
  );
  auditar("recibo.resolver", reciboId, { resultado });
}
export function vistaPieza(piezaId: string) {
  const pieza = leerPieza(piezaId);
  return {
    pieza,
    aprobada: Boolean(aprobacionPieza(pieza.id, pieza.hash)),
    medios: mediosDe(pieza.contenido).map(
      ({
        id,
        mime,
        ancho,
        alto,
        duracion,
        generado,
        licencia,
        nombre,
        sha256,
        bytes,
        procedencia,
      }) => ({
        id,
        mime,
        ancho,
        alto,
        duracion,
        generado,
        licencia,
        nombre,
        sha256,
        bytes,
        procedencia,
      }),
    ),
    recibos: recibosDe(piezaId).map((r) => ({
      id: r.id,
      canal: r.canal,
      cuenta: r.cuenta_nombre,
      estado: r.estado,
      remotoId: r.remoto_id,
      enlace: r.enlace,
      error: r.error,
      creado: r.creado,
      actualizado: r.actualizado,
    })),
    versiones: base()
      .prepare(
        "select version, hash, creado from pieza_versiones where pieza_id = ? order by version desc",
      )
      .all(piezaId) as { version: number; hash: string; creado: string }[],
  };
}
