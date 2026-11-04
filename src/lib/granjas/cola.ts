import { ahoraIso, base, json, transaccion } from "./db";

export type TipoTrabajo = "paso" | "publicar" | "confirmar";
export type Trabajo = {
  id: string;
  tipo: TipoTrabajo;
  carga: Record<string, string>;
  ejecucionId: string | null;
  intentos: number;
  maxIntentos: number;
};
type FilaTrabajo = {
  id: string;
  tipo: TipoTrabajo;
  carga: string;
  ejecucion_id: string | null;
  intentos: number;
  max_intentos: number;
};

/** Debe llamarse dentro de una transacción para que el trabajo y su estado se guarden juntos. */
export function encolar(
  tipo: TipoTrabajo,
  carga: Record<string, string>,
  opciones: { ejecucionId?: string | null; desde?: string; clave?: string; maxIntentos?: number } = {},
) {
  const ahora = ahoraIso();
  base()
    .prepare(
      `insert into trabajos (id, tipo, carga, ejecucion_id, estado, disponible_desde, max_intentos, clave, creado, actualizado)
       values (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?) on conflict (clave) do nothing`,
    )
    .run(
      crypto.randomUUID(),
      tipo,
      JSON.stringify(carga),
      opciones.ejecucionId ?? null,
      opciones.desde ?? ahora,
      opciones.maxIntentos ?? 3,
      opciones.clave ?? null,
      ahora,
      ahora,
    );
}

/**
 * Recupera arriendos vencidos (proceso caído o Mac dormida). Un envío a una red que
 * quedó a medias no se repite a ciegas: su recibo pasa a «desconocido» para conciliarlo.
 */
export function recuperarVencidos(ahora = ahoraIso()) {
  return transaccion((db) => {
    const vencidos = db
      .prepare("select * from trabajos where estado = 'tomado' and arriendo_hasta < ?")
      .all(ahora) as FilaTrabajo[];
    for (const t of vencidos) {
      const carga = json<Record<string, string>>(t.carga, {});
      if (t.tipo === "publicar" && carga.reciboId)
        db.prepare(
          "update recibos set estado = 'desconocido', error = ?, actualizado = ? where id = ? and estado = 'enviando'",
        ).run("El envío se interrumpió. Comprueba la cuenta antes de reintentar.", ahora, carga.reciboId);
      if (t.tipo === "paso" && carga.pasoId)
        db.prepare(
          "update pasos set estado = 'en_cola', detalle = ?, actualizado = ? where id = ? and estado in ('recolectando', 'generando')",
        ).run("Se retomó después de una interrupción del trabajador.", ahora, carga.pasoId);
      const agotado = t.intentos >= t.max_intentos;
      db.prepare(
        `update trabajos set estado = ?, arrendatario = null, arriendo_hasta = null, error = ?, actualizado = ? where id = ?`,
      ).run(agotado ? "fallido" : "pendiente", "Arriendo vencido.", ahora, t.id);
      if (agotado && t.tipo === "paso" && carga.pasoId)
        db.prepare("update pasos set estado = 'fallido', error = ?, actualizado = ? where id = ?").run(
          "Se agotaron los intentos tras varias interrupciones.",
          ahora,
          carga.pasoId,
        );
    }
    return vencidos.length;
  });
}

/** Toma el siguiente trabajo disponible respetando la concurrencia máxima. */
export function tomar(trabajador: string, opciones: { concurrencia: number; arriendoMs: number; ahora?: string }): Trabajo | null {
  const ahora = opciones.ahora ?? ahoraIso();
  return transaccion((db) => {
    const ocupados = (db.prepare("select count(*) as n from trabajos where estado = 'tomado'").get() as { n: number }).n;
    if (ocupados >= opciones.concurrencia) return null;
    const fila = db
      .prepare(
        `select t.* from trabajos t left join ejecuciones e on e.id = t.ejecucion_id
         where t.estado = 'pendiente' and t.disponible_desde <= ?
         and (e.id is null or e.estado not in ('pausada', 'cancelada'))
         order by t.disponible_desde, t.creado limit 1`,
      )
      .get(ahora) as FilaTrabajo | undefined;
    if (!fila) return null;
    const hasta = new Date(Date.parse(ahora) + opciones.arriendoMs).toISOString();
    db.prepare(
      "update trabajos set estado = 'tomado', arrendatario = ?, arriendo_hasta = ?, intentos = intentos + 1, actualizado = ? where id = ?",
    ).run(trabajador, hasta, ahora, fila.id);
    return {
      id: fila.id,
      tipo: fila.tipo,
      carga: json(fila.carga, {}),
      ejecucionId: fila.ejecucion_id,
      intentos: fila.intentos + 1,
      maxIntentos: fila.max_intentos,
    };
  });
}
export function renovar(id: string, trabajador: string, arriendoMs: number) {
  base()
    .prepare("update trabajos set arriendo_hasta = ? where id = ? and arrendatario = ? and estado = 'tomado'")
    .run(new Date(Date.now() + arriendoMs).toISOString(), id, trabajador);
}
export function terminar(id: string, trabajador: string, estado: "hecho" | "fallido" | "cancelado", error = "") {
  base()
    .prepare(
      "update trabajos set estado = ?, error = ?, arrendatario = null, arriendo_hasta = null, actualizado = ? where id = ? and arrendatario = ?",
    )
    .run(estado, error.slice(0, 500), ahoraIso(), id, trabajador);
}
/** Devuelve el trabajo a la cola, por ejemplo si su ejecución se pausó mientras esperaba. */
export function devolver(id: string, trabajador: string, desde = ahoraIso()) {
  base()
    .prepare(
      "update trabajos set estado = 'pendiente', arrendatario = null, arriendo_hasta = null, intentos = max(intentos - 1, 0), disponible_desde = ?, actualizado = ? where id = ? and arrendatario = ?",
    )
    .run(desde, ahoraIso(), id, trabajador);
}
export function resumenCola() {
  return base()
    .prepare("select tipo, estado, count(*) as n from trabajos group by tipo, estado")
    .all() as { tipo: string; estado: string; n: number }[];
}
