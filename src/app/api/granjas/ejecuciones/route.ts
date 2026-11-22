import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import {
  aprobarRevision,
  cancelar,
  completarManual,
  editarArtefacto,
  importarEncargo,
  iniciarEjecucion,
  pausar,
  reanudar,
  reintentarPaso,
  versionesEncargos,
} from "@/lib/granjas/ejecucion";
import { tiposArtefacto } from "@/lib/granjas/modelo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().uuid();
const comprobaciones = z.object({ hechos: z.boolean(), derechos: z.boolean(), marca: z.boolean() });
const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("iniciar"), granjaId: id, nodoId: id.optional(), confirmarIA: z.boolean() }),
  z.object({ accion: z.enum(["pausar", "reanudar", "cancelar"]), ejecucionId: id }),
  z.object({ accion: z.literal("reintentar"), pasoId: id, confirmarIA: z.boolean() }),
  z.object({
    accion: z.literal("manual"),
    pasoId: id,
    contenido: z.string().max(60000),
    nota: z.string().max(300),
    medioId: id.nullable().optional(),
    tipo: z.enum(tiposArtefacto).optional(),
  }),
  z.object({ accion: z.literal("importar"), pasoId: id }),
  z.object({ accion: z.literal("aprobar"), pasoId: id, comprobaciones }),
  z.object({ accion: z.literal("editar_artefacto"), artefactoId: id, contenido: z.string().min(1).max(60000), nota: z.string().max(300) }),
]);

export async function POST(request: Request) {
  try {
    const { usuario } = await administrador("granjas", "escribir");
    const a = await cuerpo(request, accion);
    switch (a.accion) {
      case "iniciar":
        return Response.json({ ejecucion: iniciarEjecucion(a.granjaId, { nodoId: a.nodoId, confirmarIA: a.confirmarIA, usuario, encargos: await versionesEncargos() }) });
      case "pausar":
        return Response.json({ ejecucion: pausar(a.ejecucionId) });
      case "reanudar":
        return Response.json({ ejecucion: reanudar(a.ejecucionId) });
      case "cancelar":
        return Response.json({ ejecucion: cancelar(a.ejecucionId) });
      case "reintentar":
        return Response.json({ paso: reintentarPaso(a.pasoId, a.confirmarIA) });
      case "manual":
        return Response.json({ artefacto: completarManual(a.pasoId, a) });
      case "importar":
        return Response.json({ artefacto: await importarEncargo(a.pasoId) });
      case "aprobar":
        return Response.json({ paso: aprobarRevision(a.pasoId, a.comprobaciones) });
      case "editar_artefacto":
        return Response.json({ artefacto: editarArtefacto(a.artefactoId, a.contenido, a.nota) });
    }
  } catch (error) {
    return errorApi(error);
  }
}
