/** Arranca el trabajador local de las granjas junto al servidor (solo en Node, nunca al compilar). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build")
    return;
  const { existsSync } = await import("node:fs");
  const { loadEnvFile } = await import("node:process");
  if (existsSync(".env.meta.local")) loadEnvFile(".env.meta.local");
  const { iniciarTrabajador } = await import("./lib/granjas/trabajador");
  iniciarTrabajador();
}
