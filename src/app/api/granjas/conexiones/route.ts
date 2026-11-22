import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { claveConfigurada } from "@/lib/granjas/cripto";
import {
  conectarDirecto,
  conexionDe,
  desconectar,
  estadoCanales,
  guiaRedireccion,
  listarConexiones,
  seleccionarPagina,
  verificarConexion,
} from "@/lib/granjas/conexiones";
import { versionGraph } from "@/lib/granjas/adaptadores";
import { guiasRedes } from "@/lib/granjas/guias-redes";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().uuid();
const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("verificar"), id }),
  z.object({ accion: z.literal("desconectar"), id }),
  z.object({ accion: z.literal("conectar"), canal: z.literal("spotmi") }),
  z.object({ accion: z.literal("pagina"), id, paginaId: z.string().regex(/^\d{1,30}$/) }),
]);

/**
 * Cuentas que esta sesión puede ver: las compartidas de Spotmi (propietario y socios) y sus personales.
 * Nunca incluye tokens; una cuenta personal ajena no aparece.
 */
export async function GET() {
  try {
    const { equipo } = await administrador("conexiones");
    return Response.json(
      {
        conexiones: listarConexiones(equipo),
        canales: estadoCanales(equipo),
        guias: guiasRedes(equipo),
        rol: equipo.rol,
        claveTokens: claveConfigurada(),
        redireccionBase: guiaRedireccion(),
        versionGraph: versionGraph(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    const { equipo } = await administrador("conexiones", "escribir");
    const a = await cuerpo(request, accion, 2000);
    if (a.accion === "conectar") {
      if (equipo.rol !== "propietario")
        throw new WorkflowError("Solo el propietario conecta la cuenta editorial de Spotmi web.", 403);
      return Response.json({ conexion: await conectarDirecto("spotmi") });
    }
    if (a.accion === "verificar") {
      conexionDe(a.id, equipo, "usar");
      return Response.json({ conexion: await verificarConexion(a.id) });
    }
    conexionDe(a.id, equipo, "administrar");
    if (a.accion === "desconectar") return Response.json(await desconectar(a.id));
    return Response.json({ conexion: await seleccionarPagina(a.paginaId, a.id) });
  } catch (error) {
    return errorApi(error);
  }
}
