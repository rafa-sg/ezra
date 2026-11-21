import { z } from "zod";

/**
 * Modelo de la personalización del estudio, sin dependencias del servidor: lo usan la API y la
 * interfaz (el navegador no puede importar la base de datos).
 */
/** Pantalla de trabajo: lo urgente primero (los widgets de la versión anterior se descartan al leer). */
export const widgetsPulso = [
  "atencion",
  "ejecucion",
  "eventos",
  "listo",
  "conexiones",
  "consumo",
  "grafica",
  "agentes",
] as const;
export type WidgetPulso = (typeof widgetsPulso)[number];
export const temas = ["claro", "oscuro"] as const;
/** El tema «líquido» se retiró: quien lo tenía guardado pasa a claro al leer. */
const tema = z.preprocess((v) => (v === "liquido" ? "claro" : v), z.enum(temas));
export const seccionesTema = [
  "inicio",
  "encargos",
  "granjas",
  "eventos",
  "instagram",
  "calendario",
  "conexiones",
  "consumo",
] as const;
export const tamanos = ["s", "m", "l"] as const;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const preferenciasSchema = z.object({
  revision: z.number().int().min(0).default(0),
  widgets: z
    .array(
      z.object({
        id: z.enum(widgetsPulso),
        visible: z.boolean(),
        tamano: z.enum(tamanos),
        titulo: z.string().trim().max(40).default(""),
      }),
    )
    .max(widgetsPulso.length)
    .refine((l) => new Set(l.map((w) => w.id)).size === l.length, "Un widget repetido.")
    .default([]),
  temas: z.partialRecord(z.enum(seccionesTema), tema).default({}),
  agentes: z
    .record(
      z.string().regex(/^[a-z_]{2,40}$/),
      z.object({
        nombre: z.string().trim().max(30).default(""),
        rol: z.string().trim().max(90).default(""),
      }),
    )
    .default({}),
  coloresGranja: z.record(z.string().max(64), color).default({}),
});
export type Preferencias = z.infer<typeof preferenciasSchema>;

/** Tablero por defecto: lo urgente arriba, luego el pulso y el resto. */
export const widgetsPorDefecto: Preferencias["widgets"] = [
  { id: "atencion", visible: true, tamano: "m", titulo: "" },
  { id: "ejecucion", visible: true, tamano: "m", titulo: "" },
  { id: "eventos", visible: true, tamano: "m", titulo: "" },
  { id: "listo", visible: true, tamano: "m", titulo: "" },
  { id: "conexiones", visible: true, tamano: "m", titulo: "" },
  { id: "consumo", visible: true, tamano: "m", titulo: "" },
  { id: "grafica", visible: true, tamano: "l", titulo: "" },
  { id: "agentes", visible: false, tamano: "l", titulo: "" },
];

/**
 * Cambios que manda la interfaz: solo las claves presentes. No usa los valores por defecto del
 * esquema (rellenarían lo que no se mandó y borrarían, por ejemplo, el orden al cambiar el tema).
 * La validación completa se hace después, sobre el resultado combinado.
 */
export const cambiosSchema = z.partialRecord(
  z.enum(["widgets", "temas", "agentes", "coloresGranja"]),
  z.unknown(),
);
