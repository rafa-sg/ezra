import { z } from "zod";
import { administrador, cuerpo, errorApi } from "@/lib/granjas/api";
import { claveConfigurada } from "@/lib/granjas/cripto";
import { conectarDirecto, desconectar, guiaRedireccion, listarConexiones, seleccionarPagina, verificarConexion } from "@/lib/granjas/conexiones";
import { versionGraph } from "@/lib/granjas/adaptadores";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const canal = z.enum(["instagram", "facebook", "tiktok", "youtube", "spotmi"]);
const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("verificar"), canal }),
  z.object({ accion: z.literal("desconectar"), canal }),
  z.object({ accion: z.literal("conectar"), canal: z.literal("spotmi") }),
  z.object({ accion: z.literal("pagina"), paginaId: z.string().regex(/^\d{1,30}$/) }),
]);

export async function GET() {
  try {
    await administrador("conexiones");
    return Response.json({ conexiones: listarConexiones(), claveTokens: claveConfigurada(), redireccionBase: guiaRedireccion(), versionGraph: versionGraph() });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    await administrador("conexiones", "escribir");
    const a = await cuerpo(request, accion, 2000);
    if (a.accion === "verificar") return Response.json({ conexion: await verificarConexion(a.canal) });
    if (a.accion === "desconectar") return Response.json(await desconectar(a.canal));
    if (a.accion === "conectar") return Response.json({ conexion: await conectarDirecto("spotmi") });
    return Response.json({ conexion: await seleccionarPagina(a.paginaId) });
  } catch (error) {
    return errorApi(error);
  }
}
