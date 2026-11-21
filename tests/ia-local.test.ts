import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { argumentosLocales, type EjecutorProceso } from "../src/lib/produccion/proveedores";
import { diagnosticar, probar, utilizable } from "../src/lib/produccion/ia-local";

/** Ayuda simulada que menciona todas las opciones que el estudio exige (o todas menos `quitar`). */
function ayuda(proveedor: "astra" | "claude", quitar = "") {
  return [...new Set(argumentosLocales(proveedor, "x", true).filter((a) => a.startsWith("--") && a !== quitar))].map((o) => `  ${o} <valor>`).join("\n");
}
const funciones = argumentosLocales("astra", "x")
  .flatMap((a, i, l) => (a === "--disable" ? [`${l[i + 1]}   stable   true`] : []))
  .join("\n");
/** Ejecutor falso: responde según los argumentos, sin lanzar procesos ni tocar la red. */
function falso(respuestas: { sesion?: string; quitar?: string; respuesta?: string; falla?: string }): EjecutorProceso {
  return async (...[, args]: Parameters<EjecutorProceso>) => {
    if (args[0] === "--version") return "codex-cli 9.9.9\n";
    if (args.includes("--help")) return ayuda(args[0] === "exec" ? "astra" : "claude", respuestas.quitar);
    if (args[0] === "features") return funciones;
    if (args[0] === "login") return respuestas.sesion ?? "Logged in using ChatGPT";
    if (args.includes("auth")) return respuestas.sesion ?? JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "no-debe-salir@example.com" });
    if (respuestas.falla) throw Object.assign(new Error("La herramienta de IA no completó el encargo."), { salida: respuestas.falla });
    // Prueba de respuesta: Codex escribe el archivo de --output-last-message; Claude responde JSON.
    const salida = args[args.indexOf("--output-last-message") + 1];
    if (args[0] === "exec") {
      await writeFile(salida, respuestas.respuesta ?? "OK");
      return "";
    }
    return JSON.stringify({ is_error: false, result: respuestas.respuesta ?? "OK" });
  };
}

test("encontrar el programa no basta: se distinguen instalación, opciones, sesión y prueba", async () => {
  assert.equal((await diagnosticar("astra", { binario: null })).estado, "no_instalado");
  const ok = await diagnosticar("astra", { binario: "/falso/codex", ejecutar: falso({}) });
  assert.equal(ok.estado, "sesion_ok");
  assert.equal(ok.version, "codex-cli 9.9.9");
  assert.ok(utilizable(ok));
  const sinSesion = await diagnosticar("astra", { binario: "/falso/codex", ejecutar: falso({ sesion: "Not logged in" }) });
  assert.equal(sinSesion.estado, "sesion_pendiente");
  assert.match(sinSesion.detalle, /codex login/);
  assert.ok(!utilizable(sinSesion));
  const conClave = await diagnosticar("astra", { binario: "/falso/codex", ejecutar: falso({ sesion: "Logged in using an API key - sk-***" }) });
  assert.equal(conClave.estado, "sesion_pendiente", "una clave de API facturada no cuenta como sesión del estudio");
  assert.ok(!JSON.stringify(conClave).includes("sk-"), "nunca se copia la salida técnica");
});

test("si la versión instalada no acepta una restricción, no se usa (no se quita la restricción)", async () => {
  const d = await diagnosticar("claude", { binario: "/falso/claude", ejecutar: falso({ quitar: "--safe-mode" }) });
  assert.equal(d.estado, "incompatible");
  assert.deepEqual(d.incompatibles, ["--safe-mode"]);
  assert.ok(!utilizable(d));
});

test("Claude: solo la sesión de claude.ai; el correo de la cuenta nunca aparece", async () => {
  const ok = await diagnosticar("claude", { binario: "/falso/claude", ejecutar: falso({}) });
  assert.equal(ok.estado, "sesion_ok");
  assert.ok(!JSON.stringify(ok).includes("example.com"));
  const otro = await diagnosticar("claude", { binario: "/falso/claude", ejecutar: falso({ sesion: JSON.stringify({ loggedIn: true, authMethod: "apiKey" }) }) });
  assert.equal(otro.estado, "sesion_pendiente");
  assert.match(otro.detalle, /claude auth login/);
});

test("la prueba del modelo es aparte y reconoce respuesta, límite de uso y error", async () => {
  const astra = await probar("astra", { binario: "/falso/codex", ejecutar: falso({}) });
  assert.equal(astra.estado, "prueba_ok");
  assert.equal(astra.prueba?.estado, "prueba_ok");
  const claude = await probar("claude", { binario: "/falso/claude", ejecutar: falso({}) });
  assert.equal(claude.estado, "prueba_ok");
  const limite = await probar("astra", { binario: "/falso/codex", ejecutar: falso({ falla: "ERROR: You've hit your usage limit." }) });
  assert.equal(limite.estado, "limite");
  assert.ok(!limite.detalle.includes("hit your"), "el mensaje técnico no se muestra");
  const raro = await probar("claude", { binario: "/falso/claude", ejecutar: falso({ respuesta: "Hola" }) });
  assert.equal(raro.estado, "error");
  // Sin sesión, la prueba no llega a invocar al modelo.
  const sinSesion = await probar("astra", { binario: "/falso/codex", ejecutar: falso({ sesion: "Not logged in" }) });
  assert.equal(sinSesion.estado, "sesion_pendiente");
  assert.equal(sinSesion.prueba, null);
});
