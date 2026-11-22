/**
 * Invitaciones de Clerk. Con el modo «Invite-only» de Clerk, solo quien recibe esta invitación puede
 * crear su cuenta; además Ezra exige que el correo esté en `miembros`, así que una cuenta creada por
 * otra vía tampoco entra. Las pruebas sustituyen estas dos funciones.
 */
export type InvitacionesClerk = {
  crear: (email: string, redireccion: string) => Promise<string>;
  revocar: (id: string) => Promise<void>;
};
const globales = globalThis as typeof globalThis & { ezraInvitacionesClerk?: InvitacionesClerk };
export function usarInvitacionesDePrueba(f: InvitacionesClerk | undefined) {
  globales.ezraInvitacionesClerk = f;
}
const reales: InvitacionesClerk = {
  async crear(email, redireccion) {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const cliente = await clerkClient();
    // ignoreExisting: si ya tenía cuenta en Clerk, la invitación igual se registra sin error.
    const inv = await cliente.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: redireccion,
      notify: true,
      ignoreExisting: true,
    });
    return inv.id;
  },
  async revocar(id) {
    const { clerkClient } = await import("@clerk/nextjs/server");
    await (await clerkClient()).invitations.revokeInvitation(id);
  },
};
export const invitacionesClerk = (): InvitacionesClerk => globales.ezraInvitacionesClerk ?? reales;
