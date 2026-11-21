import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  argumentosLocales,
  buscarHerramienta,
  ejecutarProceso,
  type EjecutorProceso,
} from "./proveedores";

/**
 * Diagnóstico de los adaptadores locales (Codex con la sesión de ChatGPT y Claude Code con la de
 * claude.ai). Encontrar el ejecutable no acredita nada: se distingue cada etapa.
 *  - no_instalado: no está el programa.
 *  - sesion_pendiente: está, pero sin sesión válida (o con un método que el estudio no usa, como una clave de API).
 *  - incompatible: la versión instalada no acepta alguna de las restricciones que el estudio exige (no se quitan).
 *  - sesion_ok: programa, opciones y sesión comprobados (sin invocar al modelo).
 *  - prueba_ok: además, una respuesta real del modelo en esta comprobación.
 *  - limite: el proveedor respondió con un límite de uso.
 *  - error: falló algo más (sin detalles de la cuenta).
 * Nunca se leen ni guardan tokens, correos ni la salida técnica completa.
 */
export const estadosIA = [
  "no_instalado",
  "sesion_pendiente",
  "incompatible",
  "sesion_ok",
  "prueba_ok",
  "limite",
  "error",
] as const;
export type EstadoIA = (typeof estadosIA)[number];
export type ProveedorLocal = "astra" | "claude";
export const diagnosticoSchema = z.object({
  proveedor: z.enum(["astra", "claude"]),
  estado: z.enum(estadosIA),
  version: z.string().max(80).nullable(),
  incompatibles: z.array(z.string().max(60)).max(40),
  detalle: z.string().max(300),
  comprobado: z.string(),
  /** Última prueba de respuesta del modelo (separada de la comprobación de sesión). */
  prueba: z
    .object({ estado: z.enum(estadosIA), en: z.string(), ms: z.number().int().min(0) })
    .nullable(),
});
export type DiagnosticoIA = z.infer<typeof diagnosticoSchema>;

const binarioDe = (p: ProveedorLocal) => (p === "astra" ? "codex" : "claude");
const LIMITE =
  /usage limit|rate limit|limit reached|quota|too many requests|\b429\b|hit your limit/i;

/** Opciones que el estudio exige y que la versión instalada debe aceptar (según su propia ayuda). */
export async function revisarOpciones(
  proveedor: ProveedorLocal,
  binario: string,
  ejecutar: EjecutorProceso,
  carpeta: string,
) {
  const exigidas = [
    ...new Set(argumentosLocales(proveedor, "salida.txt", true).filter((a) => a.startsWith("--"))),
  ];
  const ayuda = await ejecutar(
    binario,
    proveedor === "astra" ? ["exec", "--help"] : ["--help"],
    "",
    carpeta,
    15000,
    true,
  );
  const faltan = exigidas.filter(
    (op) => !new RegExp(`(^|[\\s,\\[])${op.replace(/[-]/g, "\\-")}(?![\\w-])`, "m").test(ayuda),
  );
  if (proveedor === "astra") {
    // Las funciones que se desactivan deben existir con ese nombre; si no, la restricción no se aplicaría.
    const lista = await ejecutar(binario, ["features", "list"], "", carpeta, 15000, true);
    const args = argumentosLocales("astra", "salida.txt");
    const funciones = args.flatMap((a, i) => (a === "--disable" ? [args[i + 1]] : []));
    for (const f of funciones)
      if (!new RegExp(`^${f}\\b`, "m").test(lista)) faltan.push(`--disable ${f}`);
  }
  return faltan;
}

/** Sesión: Codex debe usar la cuenta de ChatGPT; Claude Code, la de claude.ai (nunca una clave de API facturada). */
async function revisarSesion(
  proveedor: ProveedorLocal,
  binario: string,
  ejecutar: EjecutorProceso,
  carpeta: string,
) {
  if (proveedor === "astra") {
    const salida = await ejecutar(binario, ["login", "status"], "", carpeta, 15000, true).catch(
      () => "",
    );
    if (/ChatGPT/i.test(salida)) return { ok: true, detalle: "Sesión de ChatGPT activa en Codex." };
    if (/API key/i.test(salida))
      return {
        ok: false,
        detalle:
          "Codex usa una clave de API. Este estudio solo usa la sesión de ChatGPT: ejecuta «codex login» en la Terminal.",
      };
    return {
      ok: false,
      detalle:
        "Codex no tiene sesión. Abre la Terminal, ejecuta «codex login» y entra con tu cuenta de ChatGPT.",
    };
  }
  const salida = await ejecutar(
    binario,
    ["--safe-mode", "auth", "status", "--json"],
    "",
    carpeta,
    15000,
  ).catch(() => "");
  let acceso: { loggedIn?: boolean; authMethod?: string } = {};
  try {
    acceso = JSON.parse(salida);
  } catch {
    return { ok: false, detalle: "No se pudo leer el estado de sesión de Claude Code." };
  }
  if (acceso.loggedIn && acceso.authMethod === "claude.ai")
    return { ok: true, detalle: "Sesión de claude.ai activa en Claude Code." };
  if (acceso.loggedIn)
    return {
      ok: false,
      detalle:
        "Claude Code usa otro método de acceso. Este estudio solo usa tu cuenta de claude.ai: ejecuta «claude auth login» en la Terminal.",
    };
  return {
    ok: false,
    detalle:
      "Claude Code no tiene sesión. Abre la Terminal, ejecuta «claude auth login» y entra con tu cuenta de Claude.",
  };
}

/** Comprobación sin invocar al modelo: programa, versión, opciones exigidas y sesión. */
export async function diagnosticar(
  proveedor: ProveedorLocal,
  opciones: { binario?: string | null; ejecutar?: EjecutorProceso } = {},
): Promise<DiagnosticoIA> {
  const ejecutar = opciones.ejecutar ?? ejecutarProceso;
  const binario =
    opciones.binario === undefined
      ? await buscarHerramienta(binarioDe(proveedor))
      : opciones.binario;
  const base = {
    proveedor,
    version: null,
    incompatibles: [] as string[],
    comprobado: new Date().toISOString(),
    prueba: null,
  };
  if (!binario)
    return {
      ...base,
      estado: "no_instalado",
      detalle:
        proveedor === "astra"
          ? "No se encontró Codex en esta computadora."
          : "No se encontró Claude Code en esta computadora.",
    };
  const carpeta = await mkdtemp(path.join(tmpdir(), "ezra-diagnostico-"));
  try {
    const version =
      (await ejecutar(binario, ["--version"], "", carpeta, 15000).catch(() => ""))
        .split("\n")[0]
        .trim()
        .slice(0, 80) || null;
    const incompatibles = await revisarOpciones(proveedor, binario, ejecutar, carpeta).catch(() => [
      "(no se pudo leer la ayuda)",
    ]);
    if (incompatibles.length)
      return {
        ...base,
        version,
        incompatibles,
        estado: "incompatible",
        detalle:
          "La versión instalada no acepta todas las restricciones de seguridad del estudio. No se usará hasta actualizarla.",
      };
    const sesion = await revisarSesion(proveedor, binario, ejecutar, carpeta);
    return {
      ...base,
      version,
      estado: sesion.ok ? "sesion_ok" : "sesion_pendiente",
      detalle: sesion.detalle,
    };
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

/**
 * Prueba explícita: pide al modelo una respuesta mínima con las mismas restricciones que un encargo
 * (sin archivos, comandos, búsqueda ni publicación). Consume un intento del plan del proveedor.
 */
export async function probar(
  proveedor: ProveedorLocal,
  opciones: { binario?: string | null; ejecutar?: EjecutorProceso } = {},
): Promise<DiagnosticoIA> {
  const diag = await diagnosticar(proveedor, opciones);
  if (diag.estado !== "sesion_ok") return diag;
  const ejecutar = opciones.ejecutar ?? ejecutarProceso;
  const binario = opciones.binario ?? (await buscarHerramienta(binarioDe(proveedor)));
  const carpeta = await mkdtemp(path.join(tmpdir(), "ezra-prueba-"));
  const salida = path.join(carpeta, "resultado.txt");
  const inicio = Date.now();
  const resultado = (estado: EstadoIA, detalle: string): DiagnosticoIA => ({
    ...diag,
    estado,
    detalle,
    prueba: { estado, en: new Date().toISOString(), ms: Date.now() - inicio },
  });
  try {
    const crudo = await ejecutar(
      binario!,
      argumentosLocales(proveedor, salida),
      "Responde únicamente con la palabra OK.",
      carpeta,
      120000,
      true,
    );
    let texto = "";
    if (proveedor === "astra") texto = await readFile(salida, "utf8").catch(() => "");
    else {
      try {
        const r = JSON.parse(crudo) as { is_error?: boolean; result?: unknown };
        if (r.is_error)
          return resultado(
            LIMITE.test(String(r.result)) ? "limite" : "error",
            LIMITE.test(String(r.result))
              ? "Claude respondió con un límite de uso. Vuelve a probar más tarde."
              : "Claude no completó la prueba.",
          );
        texto = typeof r.result === "string" ? r.result : "";
      } catch {
        return resultado("error", "Claude no devolvió el formato esperado.");
      }
    }
    return /\bOK\b/i.test(texto)
      ? resultado("prueba_ok", "El modelo respondió a la prueba.")
      : resultado("error", "El modelo respondió, pero no con lo pedido en la prueba.");
  } catch (error) {
    const tecnico = String((error as { salida?: string }).salida ?? "");
    if (LIMITE.test(tecnico))
      return resultado(
        "limite",
        "El proveedor respondió con un límite de uso. Vuelve a probar más tarde.",
      );
    return resultado("error", (error as Error).message.slice(0, 200));
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

/** ¿Se puede ofrecer el proveedor en encargos y pasos? Solo con sesión comprobada (o prueba correcta). */
export const utilizable = (d: DiagnosticoIA | null) =>
  Boolean(d && (d.estado === "sesion_ok" || d.estado === "prueba_ok" || d.estado === "limite"));

/* Estado reciente en memoria (las rutas que lo consultan seguido no lanzan procesos en cada petición). */
const cache = new Map<ProveedorLocal, { en: number; d: DiagnosticoIA }>();
export async function diagnosticoReciente(proveedor: ProveedorLocal, maxMs = 120_000) {
  const c = cache.get(proveedor);
  if (c && Date.now() - c.en < maxMs) return c.d;
  const d = await diagnosticar(proveedor).catch((): DiagnosticoIA => ({
    proveedor,
    estado: "error",
    version: null,
    incompatibles: [],
    detalle: "No se pudo comprobar.",
    comprobado: new Date().toISOString(),
    prueba: null,
  }));
  cache.set(proveedor, { en: Date.now(), d });
  return d;
}
export function recordar(d: DiagnosticoIA) {
  cache.set(d.proveedor, { en: Date.now(), d });
}
