import { base } from "../granjas/db";
import { estadoPresupuesto, type Periodo } from "../granjas/consumo";
import { LIMITE_IA_MENSUAL } from "../granjas/pasos";
import { instanteLocal, mesLocal, siguienteMes } from "../granjas/tiempo";
import { leerAjuste } from "../granjas/ajustes";
import { leerProduccion } from "../produccion/almacen";
import { diagnosticoSchema, type DiagnosticoIA, type ProveedorLocal } from "../produccion/ia-local";
import { mesEnElSalvador } from "../produccion/generacion";
import { claveGemini, geminiProduccionHabilitado, modeloGemini } from "./gemini";

/**
 * Resumen de uso de las tres IAs del estudio, al estilo de «Uso» de ChatGPT, pero con lo que Ezra sí
 * mide: Gemini por tokens contra el presupuesto que escribe el propietario; Astra (Codex) y Claude por
 * intentos contra el límite compartido de 30 al mes. Ningún porcentaje sale de un proveedor: si no hay
 * límite escrito, el porcentaje es null y la interfaz lo dice. Nunca devuelve claves, prompts ni correos.
 */
export type UsoLocal = {
  proveedor: ProveedorLocal;
  usados: number;
  /** Último estado comprobado de la sesión local (programa y sesión; «limite» si el proveedor lo reportó). */
  estado: DiagnosticoIA["estado"] | null;
  comprobado: string | null;
};
export type ResumenUsoIA = {
  ahora: string;
  gemini: {
    configurado: boolean;
    habilitado: boolean;
    modelo: string;
    dia: Periodo;
    mes: Periodo;
    agotado: "dia" | "mes" | null;
  };
  /** Límite único de intentos para Astra y Claude (encargos y granjas). */
  intentos: { limite: number; usados: number; porcentaje: number; reanuda: string };
  astra: UsoLocal;
  claude: UsoLocal;
};

function intentosGranjas(mes: string) {
  const filas = base()
    .prepare("select fecha, proveedor from usos_ia where proveedor <> 'gemini'")
    .all() as {
    fecha: string;
    proveedor: string;
  }[];
  return filas.filter((u) => mesEnElSalvador(u.fecha) === mes);
}

export async function resumenUsoIA(ahora: Date = new Date()): Promise<ResumenUsoIA> {
  const iso = ahora.toISOString();
  const mes = mesEnElSalvador(iso);
  const produccion = await leerProduccion();
  const proveedorDe = new Map(produccion.encargos.map((e) => [e.id, e.proveedor]));
  const conteo: Record<ProveedorLocal, number> = { astra: 0, claude: 0 };
  let total = 0;
  // Los usos de encargos guardan solo el encargo: el proveedor sale de ese encargo (si se borró, cuenta
  // en el total compartido sin asignarse a ninguna de las dos).
  for (const u of produccion.usos) {
    if (mesEnElSalvador(u.fecha) !== mes) continue;
    total += 1;
    const p = proveedorDe.get(u.encargoId);
    if (p === "astra" || p === "claude") conteo[p] += 1;
  }
  for (const u of intentosGranjas(mes)) {
    total += 1;
    if (u.proveedor === "astra" || u.proveedor === "claude") conteo[u.proveedor] += 1;
  }
  const local = (p: ProveedorLocal): UsoLocal => {
    const d = leerAjuste(`ia-local:${p}`, diagnosticoSchema.nullable(), null);
    return {
      proveedor: p,
      usados: conteo[p],
      estado: d?.prueba?.estado === "limite" ? "limite" : (d?.estado ?? null),
      comprobado: d?.comprobado ?? null,
    };
  };
  const presupuesto = estadoPresupuesto(ahora);
  return {
    ahora: iso,
    gemini: {
      configurado: Boolean(claveGemini()),
      habilitado: geminiProduccionHabilitado(),
      modelo: modeloGemini(),
      dia: presupuesto.dia,
      mes: presupuesto.mes,
      agotado: presupuesto.agotado,
    },
    intentos: {
      limite: LIMITE_IA_MENSUAL,
      usados: total,
      porcentaje: Math.min(100, Math.round((total / LIMITE_IA_MENSUAL) * 1000) / 10),
      reanuda: instanteLocal(`${siguienteMes(mesLocal(ahora))}-01`).toISOString(),
    },
    astra: local("astra"),
    claude: local("claude"),
  };
}
