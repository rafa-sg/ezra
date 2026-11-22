/**
 * Arranca el trabajador local de las granjas junto al servidor (solo en Node, nunca al compilar).
 * El código de Node vive en instrumentation-node.ts: con la comparación directa de NEXT_RUNTIME, Next
 * descarta esta rama al compilar para Edge y ya no avisa de `node:fs`/`node:process`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { arrancar } = await import("./instrumentation-node");
    await arrancar();
  }
}
