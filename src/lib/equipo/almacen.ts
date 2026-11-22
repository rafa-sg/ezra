import { randomUUID } from "node:crypto";
import { WorkflowError } from "../workflow";
import { ahoraIso, auditar, base, json, transaccion } from "../granjas/db";
import {
  ESPACIO_SPOTMI,
  cambiarSchema,
  invitarSchema,
  seccionesDe,
  type Equipo,
  type EstadoMiembro,
  type Miembro,
  type Rol,
  type SeccionEquipo,
} from "./modelo";

type Fila = {
  id: string;
  espacio_id: string;
  email: string;
  nombre: string;
  rol: Rol;
  secciones: string;
  solo_lectura: number;
  clerk_user_id: string | null;
  estado: EstadoMiembro;
  invitacion_id: string | null;
  creado: string;
  actualizado: string;
  ultimo_acceso: string | null;
};
const aMiembro = (f: Fila): Miembro => ({
  id: f.id,
  espacioId: f.espacio_id,
  email: f.email,
  nombre: f.nombre,
  rol: f.rol,
  secciones: json<SeccionEquipo[]>(f.secciones, []),
  soloLectura: f.rol === "invitado" && Boolean(f.solo_lectura),
  estado: f.estado,
  creado: f.creado,
  actualizado: f.actualizado,
  ultimoAcceso: f.ultimo_acceso,
});
export const equipoDe = (m: Miembro): Equipo => ({
  miembroId: m.id,
  espacioId: m.espacioId,
  rol: m.rol,
  secciones: seccionesDe(m.rol, m.secciones),
  soloLectura: m.soloLectura,
});

const porId = (id: string) =>
  base()
    .prepare("select * from miembros where id = ? and espacio_id = ?")
    .get(id, ESPACIO_SPOTMI) as Fila | undefined;

/**
 * Cada cuenta de administración sale de `access.json` y ya está verificada por Clerk. Su fila propia
 * conserva las conexiones personales asociadas a ese miembro.
 */
export function asegurarPropietario(datos: {
  clerkUserId: string;
  email: string;
  nombre: string;
}): Miembro {
  return transaccion((db) => {
    const ahora = ahoraIso();
    const actual = db
      .prepare("select * from miembros where espacio_id = ? and email = ?")
      .get(ESPACIO_SPOTMI, datos.email) as Fila | undefined;
    const vinculada = db
      .prepare("select id from miembros where clerk_user_id = ?")
      .get(datos.clerkUserId) as { id: string } | undefined;
    if (
      (actual?.clerk_user_id && actual.clerk_user_id !== datos.clerkUserId) ||
      (vinculada && vinculada.id !== actual?.id)
    )
      throw new WorkflowError("Este acceso ya está vinculado a otra identidad del equipo.", 403);
    if (actual) {
      db.prepare(
        "update miembros set clerk_user_id = ?, nombre = case when nombre = '' then ? else nombre end, rol = 'propietario', secciones = '[]', solo_lectura = 0, estado = 'activo', ultimo_acceso = ?, actualizado = ? where id = ?",
      ).run(datos.clerkUserId, datos.nombre, ahora, ahora, actual.id);
      return aMiembro(porId(actual.id)!);
    }
    const id = randomUUID();
    db.prepare(
      `insert into miembros (id, espacio_id, email, nombre, rol, secciones, solo_lectura, clerk_user_id, estado, creado, actualizado, ultimo_acceso)
       values (?, ?, ?, ?, 'propietario', '[]', 0, ?, 'activo', ?, ?, ?)`,
    ).run(id, ESPACIO_SPOTMI, datos.email, datos.nombre, datos.clerkUserId, ahora, ahora, ahora);
    return aMiembro(porId(id)!);
  });
}

/**
 * Socios e invitados: primero por su id de Clerk ya vinculado; si no, por un correo verificado que esté
 * invitado y aún sin vincular. Un miembro retirado no entra aunque su correo siga verificado.
 */
export function vincularMiembro(identidad: {
  clerkUserId: string;
  correos: string[];
}): Miembro | null {
  const correos = identidad.correos.map((c) => c.trim().toLowerCase());
  return transaccion((db) => {
    const ahora = ahoraIso();
    const vinculada = db
      .prepare("select * from miembros where clerk_user_id = ? and espacio_id = ?")
      .get(identidad.clerkUserId, ESPACIO_SPOTMI) as Fila | undefined;
    if (vinculada) {
      if (vinculada.estado === "retirado" || vinculada.rol === "propietario") return null;
      // Si el correo invitado ya no está verificado en Clerk, no se confía en el vínculo.
      if (!correos.includes(vinculada.email)) return null;
      db.prepare(
        "update miembros set estado = 'activo', ultimo_acceso = ?, actualizado = case when estado = 'activo' then actualizado else ? end where id = ?",
      ).run(ahora, ahora, vinculada.id);
      return aMiembro(porId(vinculada.id)!);
    }
    if (!correos.length) return null;
    const candidata = db
      .prepare(
        `select * from miembros where espacio_id = ? and clerk_user_id is null and estado <> 'retirado' and rol <> 'propietario'
         and email in (${correos.map(() => "?").join(",")}) order by creado limit 1`,
      )
      .get(ESPACIO_SPOTMI, ...correos) as Fila | undefined;
    if (!candidata) return null;
    db.prepare(
      "update miembros set clerk_user_id = ?, estado = 'activo', ultimo_acceso = ?, actualizado = ? where id = ?",
    ).run(identidad.clerkUserId, ahora, ahora, candidata.id);
    auditar("equipo.vincular", candidata.id, { rol: candidata.rol });
    return aMiembro(porId(candidata.id)!);
  });
}

export function listarMiembros(): Miembro[] {
  return (
    base()
      .prepare(
        "select * from miembros where espacio_id = ? order by case rol when 'propietario' then 0 when 'socio' then 1 else 2 end, creado",
      )
      .all(ESPACIO_SPOTMI) as Fila[]
  ).map(aMiembro);
}
export const leerMiembro = (id: string) => {
  const f = porId(id);
  return f ? aMiembro(f) : null;
};
export const invitacionDe = (id: string) => porId(id)?.invitacion_id ?? null;

/** Crea la invitación (o reactiva a alguien retirado). No envía nada: el correo lo manda Clerk aparte. */
export function invitar(crudo: unknown, por: string): Miembro {
  const datos = invitarSchema.parse(crudo);
  return transaccion((db) => {
    const ahora = ahoraIso();
    const existente = db
      .prepare("select * from miembros where espacio_id = ? and email = ?")
      .get(ESPACIO_SPOTMI, datos.email) as Fila | undefined;
    if (existente?.rol === "propietario")
      throw new WorkflowError("Ese correo es el del propietario.", 409);
    if (existente && existente.estado !== "retirado")
      throw new WorkflowError(
        "Esa persona ya está en el equipo o tiene una invitación pendiente.",
        409,
      );
    const secciones = datos.rol === "invitado" ? datos.secciones : [];
    if (datos.rol === "invitado" && !secciones.length)
      throw new WorkflowError("Elige al menos una sección para el invitado.", 422);
    const soloLectura = datos.rol === "invitado" && datos.soloLectura ? 1 : 0;
    if (existente) {
      // Reinvitar: vuelve como invitación pendiente y se vincula de nuevo al entrar.
      db.prepare(
        "update miembros set nombre = ?, rol = ?, secciones = ?, solo_lectura = ?, estado = 'invitado', clerk_user_id = null, invitacion_id = null, invitado_por = ?, actualizado = ? where id = ?",
      ).run(
        datos.nombre,
        datos.rol,
        JSON.stringify(secciones),
        soloLectura,
        por,
        ahora,
        existente.id,
      );
      auditar("equipo.invitar", existente.id, { rol: datos.rol, reinvitado: true });
      return aMiembro(porId(existente.id)!);
    }
    const id = randomUUID();
    db.prepare(
      `insert into miembros (id, espacio_id, email, nombre, rol, secciones, solo_lectura, clerk_user_id, estado, invitado_por, creado, actualizado)
       values (?, ?, ?, ?, ?, ?, ?, null, 'invitado', ?, ?, ?)`,
    ).run(
      id,
      ESPACIO_SPOTMI,
      datos.email,
      datos.nombre,
      datos.rol,
      JSON.stringify(secciones),
      soloLectura,
      por,
      ahora,
      ahora,
    );
    auditar("equipo.invitar", id, { rol: datos.rol });
    return aMiembro(porId(id)!);
  });
}
export function guardarInvitacionClerk(id: string, invitacionId: string | null) {
  base()
    .prepare("update miembros set invitacion_id = ? where id = ? and espacio_id = ?")
    .run(invitacionId, id, ESPACIO_SPOTMI);
}

export function cambiarRol(crudo: unknown): Miembro {
  const datos = cambiarSchema.parse(crudo);
  return transaccion((db) => {
    const f = porId(datos.id);
    if (!f || f.estado === "retirado")
      throw new WorkflowError("Esa persona no está en el equipo.", 404);
    if (f.rol === "propietario")
      throw new WorkflowError("El rol del propietario no se cambia desde aquí.", 409);
    const secciones = datos.rol === "invitado" ? datos.secciones : [];
    if (datos.rol === "invitado" && !secciones.length)
      throw new WorkflowError("Elige al menos una sección para el invitado.", 422);
    db.prepare(
      "update miembros set rol = ?, secciones = ?, solo_lectura = ?, actualizado = ? where id = ?",
    ).run(
      datos.rol,
      JSON.stringify(secciones),
      datos.rol === "invitado" && datos.soloLectura ? 1 : 0,
      ahoraIso(),
      f.id,
    );
    auditar("equipo.rol", f.id, { de: f.rol, a: datos.rol });
    return aMiembro(porId(f.id)!);
  });
}

/** Quitar acceso: la fila queda como «retirado» (historial), sin poder entrar. */
export function retirar(id: string): Miembro {
  return transaccion((db) => {
    const f = porId(id);
    if (!f) throw new WorkflowError("Esa persona no está en el equipo.", 404);
    if (f.rol === "propietario")
      throw new WorkflowError("No puedes quitarle el acceso al propietario.", 409);
    db.prepare(
      "update miembros set estado = 'retirado', invitacion_id = null, actualizado = ? where id = ?",
    ).run(ahoraIso(), f.id);
    auditar("equipo.retirar", f.id, { rol: f.rol });
    return aMiembro(porId(f.id)!);
  });
}
