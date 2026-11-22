import { z } from "zod";
import { base } from "../granjas/db";
import { WorkflowError } from "../workflow";

/**
 * Solicitudes de acceso que llegan desde el login. Ezra es solo por invitación: una solicitud no da
 * acceso a nada; el propietario la ve en Equipo y decide si invita. Se guarda lo mínimo (nombre,
 * correo y para qué), nunca la IP ni el navegador.
 */
export const solicitudSchema = z
  .object({
    nombre: z.string().trim().min(2, "Escribe tu nombre.").max(80),
    email: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(254),
    motivo: z.string().trim().max(500).default(""),
    /** Campo trampa: las personas no lo ven; si llega lleno, es un robot. */
    sitio: z.string().max(200).optional(),
  })
  .strict();
export type EstadoSolicitud = "nueva" | "invitada" | "descartada";
export type Solicitud = {
  id: string;
  nombre: string;
  email: string;
  motivo: string;
  estado: EstadoSolicitud;
  creado: string;
  actualizado: string;
};

// Freno simple en memoria: pocas solicitudes por minuto en todo el servidor.
const recientes: number[] = [];
const POR_MINUTO = 5;

export function crearSolicitud(datos: unknown, ahora = new Date()) {
  const d = solicitudSchema.parse(datos);
  // El robot recibe la misma respuesta que una persona, pero no se guarda nada.
  if (d.sitio) return { ok: true as const };
  const t = ahora.getTime();
  while (recientes.length && t - recientes[0]! > 60_000) recientes.shift();
  if (recientes.length >= POR_MINUTO)
    throw new WorkflowError("Hay muchas solicitudes en este momento. Intenta en un minuto.", 429);
  recientes.push(t);
  const iso = ahora.toISOString();
  const db = base();
  // Una solicitud abierta por correo: si vuelve a escribir, se actualiza la misma.
  const abierta = db
    .prepare("select id from solicitudes_acceso where email = ? and estado = 'nueva'")
    .get(d.email) as { id: string } | undefined;
  if (abierta)
    db.prepare(
      "update solicitudes_acceso set nombre = ?, motivo = ?, actualizado = ? where id = ?",
    ).run(d.nombre, d.motivo, iso, abierta.id);
  else
    db.prepare(
      "insert into solicitudes_acceso (id, nombre, email, motivo, estado, creado, actualizado) values (?, ?, ?, ?, 'nueva', ?, ?)",
    ).run(crypto.randomUUID(), d.nombre, d.email, d.motivo, iso, iso);
  return { ok: true as const };
}
export function listarSolicitudes(): Solicitud[] {
  return base()
    .prepare(
      "select * from solicitudes_acceso where estado = 'nueva' order by creado desc limit 200",
    )
    .all() as Solicitud[];
}
export const cambioSolicitudSchema = z
  .object({ id: z.string().uuid(), estado: z.enum(["invitada", "descartada"]) })
  .strict();
export function cambiarSolicitud(datos: unknown) {
  const { id, estado } = cambioSolicitudSchema.parse(datos);
  const r = base()
    .prepare("update solicitudes_acceso set estado = ?, actualizado = ? where id = ?")
    .run(estado, new Date().toISOString(), id);
  if (!r.changes) throw new WorkflowError("Solicitud no encontrada.", 404);
  return listarSolicitudes();
}
/** Solo para pruebas: vacía el freno por minuto. */
export const reiniciarFreno = () => void recientes.splice(0);
