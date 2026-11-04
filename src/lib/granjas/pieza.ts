import { z } from "zod";
import { canales, enlaceSeguro } from "../produccion/modelo";

/** Lo que se aprueba y se publica. Su hash se calcula sobre este contenido completo. */
export const contenidoPiezaSchema = z.object({
  titulo: z.string().trim().max(160),
  textos: z.object({
    spotmi: z.string().max(5000).default(""),
    instagram: z.string().max(2200).default(""),
    facebook: z.string().max(63206).default(""),
    tiktok: z.string().max(2200).default(""),
  }),
  medios: z
    .array(
      z.object({
        id: z.string().uuid(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        mime: z.string(),
        generado: z.boolean(),
        licencia: z.string().max(1000),
      }),
    )
    .max(10),
  enlaces: z.array(enlaceSeguro).max(5),
  canales: z
    .array(z.enum(canales))
    .min(1)
    .max(4)
    .refine((v) => new Set(v).size === v.length),
  programacion: z.discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("ahora") }),
    z.object({ tipo: z.literal("local"), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) }),
  ]),
  divulgaciones: z.object({ creditos: z.string().max(500), imagenGenerada: z.boolean() }),
  spotmi: z.object({
    titulo: z.string().trim().max(160),
    fecha: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    lugar: z.string().trim().max(200),
    departamento: z.string().trim().max(80),
    fuente: z.union([z.literal(""), enlaceSeguro]),
  }),
  fuentes: z.array(z.object({ nombre: z.string().max(180), url: enlaceSeguro })).max(20),
});
export type ContenidoPieza = z.infer<typeof contenidoPiezaSchema>;
export const CONFIRMACION_PUBLICAR = "PUBLICAR";
/** Fecha local de El Salvador (UTC−6, sin horario de verano) a instante absoluto. */
export const instanteLocal = (fecha: string) => new Date(`${fecha}:00-06:00`).toISOString();
