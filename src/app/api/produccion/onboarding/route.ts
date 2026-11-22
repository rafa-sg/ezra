import { cuerpo, errorApi, propietario } from "@/lib/granjas/api";
import { ensurePilotBusinesses } from "@/lib/businesses";
import { defaultBusinessId } from "@/lib/model";
import { listarGranjas } from "@/lib/granjas/almacen";
import { listarConexiones } from "@/lib/granjas/conexiones";
import { geminiProduccionHabilitado } from "@/lib/ia/gemini";
import { leerProduccion } from "@/lib/produccion/almacen";
import { avanzarOnboarding, leerOnboarding, plantillas } from "@/lib/produccion/onboarding";
import { diagnosticoReciente, utilizable } from "@/lib/produccion/ia-local";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Espacios de trabajo de la organización de la cuenta (sin el archivo histórico). */
async function espacios(organizationId: string) {
  // Igual que el resto de la app: si el directorio aún no existe, se crea con los espacios del piloto.
  const directorio = await ensurePilotBusinesses();
  return directorio.businesses
    .filter((b) => b.organizationId === organizationId && b.id !== defaultBusinessId)
    .map((b) => ({ id: b.id, nombre: b.name }));
}
async function disponibles() {
  const [codex, claude] = await Promise.all([
    diagnosticoReciente("astra"),
    diagnosticoReciente("claude"),
  ]);
  return {
    gemini: geminiProduccionHabilitado(),
    astra: utilizable(codex),
    claude: utilizable(claude),
  };
}
async function vista(usuario: string, organizationId: string, email: string) {
  const estado = leerOnboarding(usuario);
  const produccion = await leerProduccion();
  const encargo = estado.encargoId
    ? (produccion.encargos.find((e) => e.id === estado.encargoId) ?? null)
    : null;
  const granjas = listarGranjas();
  return {
    estado,
    cuenta: { email, organizacion: organizationId },
    espacios: await espacios(organizationId),
    proveedores: await disponibles(),
    // Qué ya existe para cada objetivo: la guía lo reutiliza en vez de crearlo otra vez.
    existentes: Object.fromEntries(
      Object.entries(plantillas).map(([objetivo, p]) => [
        objetivo,
        p.receta
          ? (granjas.find(
              (g) =>
                g.estado === "activa" && (g.receta === p.receta || g.ajustes.purpose === p.receta),
            )?.nombre ?? null)
          : null,
      ]),
    ),
    plantillas: Object.fromEntries(
      Object.entries(plantillas).map(([k, p]) => [
        k,
        {
          titulo: p.encargo.titulo,
          agente: p.encargo.agente,
          fuentes: p.encargo.fuentes.length,
          receta: p.receta,
        },
      ]),
    ),
    encargo: encargo && {
      id: encargo.id,
      titulo: encargo.titulo,
      estado: encargo.estado,
      version: encargo.version,
    },
    granja: (() => {
      const g = estado.granjaId ? granjas.find((x) => x.id === estado.granjaId) : undefined;
      return g ? { id: g.id, nombre: g.nombre } : null;
    })(),
    // Estado comprobado de las conexiones externas (la guía no conecta nada: solo dice qué falta).
    conexiones: listarConexiones().map((c) => ({ canal: c.canal, estado: c.estado })),
    // Una cuenta con trabajo previo no recibe la guía de forma automática.
    tieneTrabajo: produccion.encargos.length > 0 || granjas.some((g) => g.estado === "activa"),
  };
}
export async function GET() {
  try {
    const { cuenta, usuario } = await propietario();
    return Response.json(await vista(usuario, cuenta.organizationId, cuenta.email), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorApi(error);
  }
}
export async function POST(request: Request) {
  try {
    const { cuenta, usuario } = await propietario();
    const crudo = await cuerpo(request, z.record(z.string(), z.unknown()), 10_000);
    const p = await disponibles();
    await avanzarOnboarding(usuario, crudo, {
      espacios: (await espacios(cuenta.organizationId)).map((e) => e.id),
      proveedorPorDefecto: p.gemini ? "gemini" : p.claude ? "claude" : p.astra ? "astra" : "gemini",
    });
    return Response.json(await vista(usuario, cuenta.organizationId, cuenta.email));
  } catch (error) {
    return errorApi(error);
  }
}
