import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { cuerpo, errorApi, propietario } from "@/lib/granjas/api";
import { WorkflowError } from "@/lib/workflow";
import {
  cambiarRol,
  guardarInvitacionClerk,
  invitacionDe,
  invitar,
  leerMiembro,
  listarMiembros,
  retirar,
} from "@/lib/equipo/almacen";
import { invitacionesClerk } from "@/lib/equipo/clerk";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("invitar"), datos: z.unknown() }),
  z.object({ accion: z.literal("cambiar"), datos: z.unknown() }),
  z.object({ accion: z.literal("retirar"), id: z.string().uuid() }),
  z.object({ accion: z.literal("reenviar"), id: z.string().uuid() }),
]);

/** Cada miembro ve su propio acceso; solo el propietario ve la lista del equipo. */
export async function GET() {
  try {
    const cuenta = await requireAccount();
    if (!cuenta.equipo)
      throw new WorkflowError("Esta cuenta no pertenece al equipo de Spotmi.", 403);
    const yo = { ...cuenta.equipo, email: cuenta.email, nombre: cuenta.displayName };
    return Response.json(
      { yo, miembros: cuenta.equipo.rol === "propietario" ? listarMiembros() : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorApi(error);
  }
}

async function enviarInvitacion(id: string, email: string, origen: string) {
  // Clerk manda el correo. Si falla (sin red, límite de 100 por hora), la persona sigue en la lista y se
  // puede reenviar; Ezra igual exige su correo para dejarla entrar.
  try {
    const anterior = invitacionDe(id);
    if (anterior)
      await invitacionesClerk()
        .revocar(anterior)
        .catch(() => undefined);
    guardarInvitacionClerk(id, await invitacionesClerk().crear(email, `${origen}/sign-up`));
    return "";
  } catch {
    guardarInvitacionClerk(id, null);
    return "No se pudo enviar el correo de invitación de Clerk. La persona quedó en la lista: pulsa «Reenviar» más tarde.";
  }
}

export async function POST(request: Request) {
  try {
    const { cuenta } = await propietario();
    const a = await cuerpo(request, accion, 4000);
    const origen = new URL(request.url).origin;
    if (a.accion === "invitar") {
      const miembro = invitar(a.datos, cuenta.email);
      const aviso = await enviarInvitacion(miembro.id, miembro.email, origen);
      return Response.json({ miembro, aviso, miembros: listarMiembros() });
    }
    if (a.accion === "cambiar") {
      const miembro = cambiarRol(a.datos);
      return Response.json({ miembro, aviso: "", miembros: listarMiembros() });
    }
    if (a.accion === "reenviar") {
      const m = leerMiembro(a.id);
      if (!m || m.estado !== "invitado")
        throw new WorkflowError("Solo se reenvían invitaciones pendientes.", 409);
      const aviso = await enviarInvitacion(m.id, m.email, origen);
      return Response.json({ miembro: m, aviso, miembros: listarMiembros() });
    }
    const pendiente = invitacionDe(a.id);
    const miembro = retirar(a.id);
    const aviso = "";
    if (pendiente)
      await invitacionesClerk()
        .revocar(pendiente)
        .catch(() => undefined);
    return Response.json({ miembro, aviso, miembros: listarMiembros() });
  } catch (error) {
    return errorApi(error);
  }
}
