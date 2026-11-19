import { z } from "zod";
import { WorkflowError } from "../workflow";
import { guardarAjuste, leerAjuste } from "../granjas/ajustes";
import { crearDesdeReceta, listarGranjas } from "../granjas/almacen";
import { auditar } from "../granjas/db";
import { guardarProduccion, leerProduccion } from "./almacen";
import { crearEncargo, enlaceSeguro, proveedores, type ContenidoEncargo } from "./modelo";

/**
 * Guía de inicio: lleva al propietario hasta un primer encargo real. El progreso se guarda por
 * usuario en el servidor (ajustes del estudio). Nunca reinicia ni sobrescribe lo que ya existe:
 * reutiliza la granja del objetivo si ya está creada y no toca horarios, fuentes ni permisos.
 * Completar la guía no conecta cuentas ni autoriza publicar.
 */
export const objetivos = ["eventos", "instagram", "contenido"] as const;
export type Objetivo = (typeof objetivos)[number];
const estadoSchema = z.object({
  paso: z.number().int().min(1).max(5),
  espacio: z.string().nullable(),
  objetivo: z.enum(objetivos).nullable(),
  granjaId: z.string().nullable(),
  /** La granja ya existía: se reutilizó sin cambios. */
  granjaReutilizada: z.boolean(),
  proveedor: z.enum(proveedores).nullable(),
  configuracionOmitida: z.boolean(),
  encargoId: z.string().nullable(),
  completado: z.string().nullable(),
  actualizado: z.string(),
});
export type EstadoOnboarding = z.infer<typeof estadoSchema>;
const inicial = (): EstadoOnboarding => ({
  paso: 1,
  espacio: null,
  objetivo: null,
  granjaId: null,
  granjaReutilizada: false,
  proveedor: null,
  configuracionOmitida: false,
  encargoId: null,
  completado: null,
  actualizado: new Date().toISOString(),
});
const clave = (usuario: string) => `onboarding:${usuario.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80)}`;
export const leerOnboarding = (usuario: string) => leerAjuste(clave(usuario), estadoSchema, inicial());
const guardar = (usuario: string, e: EstadoOnboarding) => guardarAjuste(clave(usuario), estadoSchema, { ...e, actualizado: new Date().toISOString() });

/** Qué hace cada objetivo en Ezra: la receta que necesita y el primer encargo que propone. */
export const plantillas: Record<Objetivo, { receta: string | null; encargo: Omit<ContenidoEncargo, "proveedor" | "fechaPrevista" | "resultado"> }> = {
  eventos: {
    receta: "eventos_el_salvador",
    encargo: {
      titulo: "Eventos de los próximos días en El Salvador",
      agente: "cazador",
      canales: ["spotmi"],
      encargo: "Busca eventos públicos de los próximos 14 días en El Salvador en las fuentes oficiales. Para cada uno entrega título, fecha, lugar y el enlace exacto de la publicación original. Marca lo que no aparezca en la fuente como «por confirmar».",
      fuentes: [
        { nombre: "Agenda de turismo de El Salvador (MITUR)", url: "https://elsalvador.travel/esp/eventos/", imagen: "", nota: "" },
        { nombre: "Ministerio de Cultura", url: "https://www.cultura.gob.sv/feed/", imagen: "", nota: "" },
      ],
    },
  },
  instagram: {
    receta: "post_instagram_eventos",
    encargo: {
      titulo: "Post de Instagram para un evento",
      agente: "redactor_ig",
      canales: ["instagram"],
      encargo: "Redacta el texto de un post de Instagram para el evento de la fuente: fecha, lugar, la línea «Más info en spotmi» y entre 5 y 10 hashtags. Usa solo datos que aparezcan en la fuente.",
      fuentes: [],
    },
  },
  contenido: {
    receta: null,
    encargo: {
      titulo: "Guion corto sobre un spot de El Salvador",
      agente: "guion",
      canales: ["spotmi", "instagram"],
      encargo: "Escribe un guion turístico breve (gancho, desarrollo y cierre) sobre el lugar de la fuente. Separa los hechos comprobados de las propuestas creativas.",
      fuentes: [{ nombre: "Spotmi", url: "https://spotmi.com.sv", imagen: "", nota: "" }],
    },
  },
};

const accionSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("espacio"), espacio: z.string().trim().min(1).max(80) }),
  z.object({ accion: z.literal("objetivo"), objetivo: z.enum(objetivos) }),
  z.object({ accion: z.literal("configurar"), crearGranja: z.boolean(), proveedor: z.enum(proveedores) }),
  z.object({ accion: z.literal("omitir_configuracion") }),
  z.object({ accion: z.literal("encargo"), titulo: z.string().trim().min(3).max(180), fuente: z.union([z.literal(""), enlaceSeguro]).default("") }),
  z.object({ accion: z.literal("completar") }),
  /** Volver a un paso sin borrar lo hecho (retomar lo omitido). */
  z.object({ accion: z.literal("ir"), paso: z.number().int().min(1).max(5) }),
]);
export type AccionOnboarding = z.infer<typeof accionSchema>;

export async function avanzarOnboarding(
  usuario: string,
  crudo: unknown,
  contexto: { espacios: string[]; proveedorPorDefecto: (typeof proveedores)[number] },
): Promise<EstadoOnboarding> {
  const a = accionSchema.parse(crudo);
  const e = leerOnboarding(usuario);
  if (a.accion === "ir") {
    if (a.paso > 1 && !e.espacio) throw new WorkflowError("Confirma primero tu espacio de trabajo.", 422);
    if (a.paso > 2 && !e.objetivo) throw new WorkflowError("Elige primero qué quieres conseguir.", 422);
    return guardar(usuario, { ...e, paso: a.paso });
  }
  if (a.accion === "espacio") {
    if (!contexto.espacios.includes(a.espacio)) throw new WorkflowError("Ese espacio de trabajo no está disponible para tu cuenta.", 403);
    return guardar(usuario, { ...e, espacio: a.espacio, paso: Math.max(e.paso, 2) });
  }
  if (!e.espacio) throw new WorkflowError("Confirma primero tu espacio de trabajo.", 422);
  if (a.accion === "objetivo") return guardar(usuario, { ...e, objetivo: a.objetivo, paso: Math.max(e.paso, 3) });
  if (!e.objetivo) throw new WorkflowError("Elige primero qué quieres conseguir.", 422);
  if (a.accion === "omitir_configuracion") return guardar(usuario, { ...e, configuracionOmitida: true, paso: Math.max(e.paso, 4) });
  if (a.accion === "configurar") {
    let granjaId = e.granjaId;
    let reutilizada = e.granjaReutilizada;
    const receta = plantillas[e.objetivo].receta;
    if (a.crearGranja && receta && !granjaId) {
      // Si ya hay una granja activa con ese propósito se reutiliza tal cual: no se duplica ni se cambia.
      const existente = listarGranjas().find((g) => g.estado === "activa" && g.receta === receta) ?? listarGranjas().find((g) => g.estado === "activa" && g.ajustes.purpose === receta);
      if (existente) {
        granjaId = existente.id;
        reutilizada = true;
      } else {
        granjaId = crearDesdeReceta(receta).id;
        reutilizada = false;
        auditar("onboarding.granja", granjaId, { receta });
      }
    }
    return guardar(usuario, { ...e, granjaId, granjaReutilizada: reutilizada, proveedor: a.proveedor, configuracionOmitida: false, paso: Math.max(e.paso, 4) });
  }
  if (a.accion === "encargo") {
    // Idempotente: si el primer encargo ya existe, no se crea otro.
    if (e.encargoId && (await leerProduccion()).encargos.some((x) => x.id === e.encargoId)) return guardar(usuario, { ...e, paso: 5 });
    const plantilla = plantillas[e.objetivo].encargo;
    const fuentes = a.fuente ? [{ nombre: new URL(a.fuente).hostname.replace(/^www\./, ""), url: a.fuente, imagen: "", nota: "" }, ...plantilla.fuentes] : plantilla.fuentes;
    const nuevo = crearEncargo({ ...plantilla, titulo: a.titulo, fuentes: fuentes.slice(0, 20), proveedor: e.proveedor ?? contexto.proveedorPorDefecto, resultado: "", fechaPrevista: "" });
    const actual = await leerProduccion();
    await guardarProduccion(actual.revision, (p) => {
      if (p.encargos.length >= 1000) throw new WorkflowError("El estudio alcanzó el límite de 1000 encargos.", 422);
      return { ...p, encargos: [nuevo, ...p.encargos] };
    });
    auditar("onboarding.encargo", nuevo.id, { objetivo: e.objetivo });
    return guardar(usuario, { ...e, encargoId: nuevo.id, paso: 5 });
  }
  if (!e.encargoId) throw new WorkflowError("Crea primero tu encargo.", 422);
  return guardar(usuario, { ...e, completado: e.completado ?? new Date().toISOString(), paso: 5 });
}
