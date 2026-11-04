import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
import { leerProduccion, guardarProduccion } from "@/lib/produccion/almacen";
import {
  agentes,
  cambiarEstado,
  contenidoEncargoSchema,
  crearEncargo,
  editarEncargo,
  estados,
  derivarEncargo,
  invalidarDependientes,
} from "@/lib/produccion/modelo";
import { buscarHerramienta } from "@/lib/produccion/proveedores";
import { direccionSpotmi } from "@/lib/produccion/spotmi";
import { invalidarPorEncargo } from "@/lib/granjas/ejecucion";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const accionSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("derivar"),
    revision: z.number().int(),
    id: z.string().uuid(),
    agente: z.enum(agentes),
  }),
  z.object({
    accion: z.literal("crear"),
    revision: z.number().int(),
    contenido: contenidoEncargoSchema,
  }),
  z.object({
    accion: z.literal("editar"),
    revision: z.number().int(),
    id: z.string().uuid(),
    contenido: contenidoEncargoSchema,
  }),
  z.object({
    accion: z.literal("estado"),
    revision: z.number().int(),
    id: z.string().uuid(),
    estado: z.enum(estados),
    comprobaciones: z.object({ hechos: z.boolean(), derechos: z.boolean(), marca: z.boolean() }),
  }),
]);
export async function GET() {
  try {
    await requireAdmin();
    const [codex, claude] = await Promise.all([
      buscarHerramienta("codex"),
      buscarHerramienta("claude"),
    ]);
    return Response.json({
      produccion: await leerProduccion(),
      conexiones: {
        spotmi: direccionSpotmi(),
        astraLocal: Boolean(codex),
        claudeLocal: Boolean(claude),
        geminiConfigurado: Boolean(process.env.GEMINI_API_KEY?.trim()),
        geminiHabilitado:
          process.env.EZRA_PRODUCCION_IA === "1" &&
          Boolean(process.env.GEMINI_API_KEY?.trim()) &&
          Boolean(process.env.GEMINI_MODEL?.trim()),
        modelo: process.env.GEMINI_MODEL?.trim() || null,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const texto = await request.text();
    if (Buffer.byteLength(texto) > 100000)
      throw new WorkflowError("El encargo supera el tamaño permitido.", 413);
    const leido = accionSchema.safeParse(JSON.parse(texto));
    if (!leido.success)
      throw new WorkflowError("Revisa el título, las fuentes y los campos del encargo.", 422);
    const accion = leido.data;
    let encargoId = "";
    const produccion = await guardarProduccion(accion.revision, (actual) => {
      if (["crear", "derivar"].includes(accion.accion) && actual.encargos.length >= 1000)
        throw new WorkflowError(
          "El estudio alcanzó el límite de 1000 encargos. Descarga un respaldo antes de continuar.",
          422,
        );
      if (accion.accion === "crear") {
        const nuevo = crearEncargo(accion.contenido);
        encargoId = nuevo.id;
        return { ...actual, encargos: [nuevo, ...actual.encargos] };
      }
      const encargo = actual.encargos.find((e) => e.id === accion.id);
      if (!encargo) throw new WorkflowError("Encargo no encontrado.", 404);
      if (accion.accion === "derivar") {
        const nuevo = derivarEncargo(encargo, accion.agente);
        encargoId = nuevo.id;
        return { ...actual, encargos: [nuevo, ...actual.encargos] };
      }
      if (
        accion.accion === "estado" &&
        accion.estado === "aprobado" &&
        encargo.dependencia &&
        !actual.encargos.some(
          (e) =>
            e.id === encargo.dependencia!.id &&
            e.version === encargo.dependencia!.version &&
            e.estado === "aprobado",
        )
      )
        throw new WorkflowError(
          "La entrega anterior cambió. Crea un nuevo encargo desde su versión aprobada.",
          422,
        );
      const nuevo =
        accion.accion === "editar"
          ? editarEncargo(encargo, accion.contenido)
          : cambiarEstado(encargo, accion.estado, accion.comprobaciones);
      encargoId = nuevo.id;
      const encargos = actual.encargos.map((e) => (e.id === nuevo.id ? nuevo : e));
      return {
        ...actual,
        encargos:
          nuevo.version !== encargo.version ||
          (nuevo.estado !== "aprobado" && encargo.estado === "aprobado")
            ? invalidarDependientes(encargos, nuevo.id)
            : encargos,
      };
    });
    // Un encargo vinculado a una granja que cambia de versión deja sin efecto lo aprobado a partir de él.
    const editado = produccion.encargos.find((e) => e.id === encargoId);
    if (editado && accion.accion === "editar") invalidarPorEncargo(editado.id, editado.version);
    return Response.json({ produccion, encargoId });
  } catch (error) {
    return apiError(
      error instanceof SyntaxError ? new WorkflowError("JSON inválido.", 400) : error,
    );
  }
}
