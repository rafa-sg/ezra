import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

/** Solo Node: variables de Meta y trabajador de las granjas. No corre durante `next build`. */
export async function arrancar() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (existsSync(".env.meta.local")) loadEnvFile(".env.meta.local");
  const { iniciarTrabajador } = await import("./lib/granjas/trabajador");
  iniciarTrabajador();
}
