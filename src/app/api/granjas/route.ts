import { z } from "zod";
import { leerProduccion } from "@/lib/produccion/almacen";
import { diagnosticoReciente, utilizable } from "@/lib/produccion/ia-local";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import {
  actualizarGranja,
  crearDesdeReceta,
  crearGranja,
  duplicarGranja,
  listarGranjas,
} from "@/lib/granjas/almacen";
import { datosGranjaSchema, grafoSchema, recetas } from "@/lib/granjas/modelo";
import { listarMedios } from "@/lib/granjas/medios";
import { especialistasVisibles } from "@/lib/granjas/especialistas";
import { estadoPresupuesto } from "@/lib/granjas/consumo";
import { geminiProduccionHabilitado } from "@/lib/ia/gemini";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("crear"), datos: datosGranjaSchema, grafo: grafoSchema.optional() }),
  z.object({ accion: z.literal("receta"), clave: z.string().max(40) }),
  z.object({ accion: z.literal("duplicar"), id: z.string().uuid() }),
  z.object({
    accion: z.literal("actualizar"),
    id: z.string().uuid(),
    revision: z.number().int(),
    datos: datosGranjaSchema.optional(),
    grafo: grafoSchema.optional(),
    estado: z.enum(["activa", "pausada", "archivada"]).optional(),
  }),
]);

export async function GET() {
  try {
    await administrador("granjas");
    const [produccion, codex, claude] = await Promise.all([
      leerProduccion(),
      diagnosticoReciente("astra"),
      diagnosticoReciente("claude"),
    ]);
    return Response.json({
      granjas: listarGranjas(),
      recetas: recetas.map((r) => ({
        clave: r.clave,
        nombre: r.datos.nombre,
        objetivo: r.datos.objetivo,
        formato: r.datos.formato,
        pasos: r.pasos.length,
      })),
      encargos: produccion.encargos.map((e) => ({
        id: e.id,
        titulo: e.titulo,
        agente: e.agente,
        version: e.version,
        estado: e.estado,
        origen: e.origenResultado,
      })),
      medios: listarMedios().map(
        ({
          id,
          mime,
          nombre,
          ancho,
          alto,
          duracion,
          licencia,
          generado,
          bytes,
          procedencia,
          creado,
          permiso,
        }) => ({
          permiso,
          id,
          mime,
          nombre,
          ancho,
          alto,
          duracion,
          licencia,
          generado,
          bytes,
          origen: procedencia.origen,
          creado,
        }),
      ),
      ia: {
        astra: utilizable(codex),
        claude: utilizable(claude),
        gemini: geminiProduccionHabilitado(),
      },
      especialistas: especialistasVisibles(),
      presupuesto: estadoPresupuesto(),
    });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    await administrador("granjas", "escribir");
    const a = await cuerpo(request, accion);
    const granja =
      a.accion === "crear"
        ? crearGranja(a.datos, a.grafo)
        : a.accion === "receta"
          ? crearDesdeReceta(a.clave)
          : a.accion === "duplicar"
            ? duplicarGranja(a.id)
            : actualizarGranja(a.id, a.revision, {
                datos: a.datos,
                grafo: a.grafo,
                estado: a.estado,
              });
    return Response.json({ granja });
  } catch (error) {
    return errorApi(error);
  }
}
