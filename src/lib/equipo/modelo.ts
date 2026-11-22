import { z } from "zod";

/**
 * Equipo del espacio Spotmi. El propietario es la cuenta de administración de `data/access.json`;
 * socios e invitados entran solo por invitación (su correo debe estar en `miembros`).
 */
export const ESPACIO_SPOTMI = "spotmi";
export const roles = ["propietario", "socio", "invitado"] as const;
export type Rol = (typeof roles)[number];
/** Secciones del estudio que el propietario puede abrir a un invitado. */
export const seccionesEquipo = [
  "inicio",
  "encargos",
  "granjas",
  "eventos",
  "apps",
  "calendario",
  "conexiones",
  "consumo",
] as const;
export type SeccionEquipo = (typeof seccionesEquipo)[number];
export type EstadoMiembro = "invitado" | "activo" | "retirado";

export type Miembro = {
  id: string;
  espacioId: string;
  email: string;
  nombre: string;
  rol: Rol;
  /** Solo cuenta para invitados: socios y propietario ven todo. */
  secciones: SeccionEquipo[];
  soloLectura: boolean;
  estado: EstadoMiembro;
  creado: string;
  actualizado: string;
  ultimoAcceso: string | null;
};
/** Lo que una sesión puede hacer. Se calcula en el servidor en cada solicitud. */
export type Equipo = {
  miembroId: string;
  espacioId: string;
  rol: Rol;
  secciones: SeccionEquipo[];
  soloLectura: boolean;
};

const correo = z.string().trim().toLowerCase().email().max(254);
const secciones = z.array(z.enum(seccionesEquipo)).max(seccionesEquipo.length);
export const invitarSchema = z
  .object({
    email: correo,
    nombre: z.string().trim().max(80).default(""),
    rol: z.enum(["socio", "invitado"]),
    secciones: secciones.default([]),
    soloLectura: z.boolean().default(false),
  })
  .strict();
export const cambiarSchema = z
  .object({
    id: z.string().uuid(),
    rol: z.enum(["socio", "invitado"]),
    secciones: secciones.default([]),
    soloLectura: z.boolean().default(false),
  })
  .strict();

/** Secciones efectivas: el propietario y los socios ven todas; el invitado, las que se le dieron. */
export const seccionesDe = (rol: Rol, propias: SeccionEquipo[]): SeccionEquipo[] =>
  rol === "invitado" ? seccionesEquipo.filter((s) => propias.includes(s)) : [...seccionesEquipo];

/** ¿Puede esta sesión usar la sección? `escribir` exige además no ser invitado de solo lectura. */
export function permite(equipo: Equipo, seccion: SeccionEquipo | "*", escribir = false) {
  if (escribir && equipo.soloLectura) return false;
  if (seccion === "*") return equipo.secciones.length > 0;
  return equipo.secciones.includes(seccion);
}
