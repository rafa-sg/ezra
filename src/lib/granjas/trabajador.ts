import { hostname } from "node:os";
import { WorkflowError } from "../workflow";
import { devolver, recuperarVencidos, renovar, terminar, tomar, type Trabajo } from "./cola";
import { ejecutarPaso, type Dependencias } from "./pasos";
import { confirmarRecibo, ejecutarPublicacion } from "./publicacion";
import { recolectarFuentes } from "./fuentes";
import { renderizarVertical } from "./medios";
import { leerPaso } from "./ejecucion";
import { eventosPublicosSpotmi } from "./spotmi-publico";

/**
 * Trabajador durable: toma trabajos de SQLite con arriendo, los renueva mientras
 * trabaja y los recupera si el proceso se interrumpe. No depende del navegador.
 * Corre dentro del servidor de Next (instrumentation) o con `npm run granjas:trabajador`.
 */
const ARRIENDO = 90_000;
const LIMITES: Record<Trabajo["tipo"], number> = { paso: 8 * 60_000, publicar: 6 * 60_000, confirmar: 2 * 60_000 };

export async function dependenciasReales(): Promise<Dependencias> {
  const { generarGemini, generarLocal } = await import("../produccion/proveedores");
  const { leerProduccion } = await import("../produccion/almacen");
  const { mesEnElSalvador } = await import("./pasos");
  return {
    generar: (encargo, prompt, contexto, opciones) =>
      encargo.proveedor === "gemini" ? generarGemini(encargo, prompt, contexto, opciones) : generarLocal(encargo, { prompt }),
    especialistas: { catalogoSpotmi: eventosPublicosSpotmi },
    recolectar: recolectarFuentes,
    renderizar: renderizarVertical,
    analizarVideo: async (video, prompt, contexto) => {
      const { analizarVideoGemini } = await import("../ia/gemini");
      return analizarVideoGemini(contexto, video, prompt);
    },
    usosLegado: async () => {
      const mes = mesEnElSalvador(new Date().toISOString());
      return (await leerProduccion()).usos.filter((u) => mesEnElSalvador(u.fecha) === mes).length;
    },
  };
}

async function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let reloj: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<T>((_, reject) => {
        reloj = setTimeout(() => reject(new WorkflowError("El trabajo superó su tiempo máximo.", 504)), ms);
      }),
    ]);
  } finally {
    clearTimeout(reloj);
  }
}

export async function procesarUno(
  id: string,
  opciones: { concurrencia?: number; dependencias?: Dependencias } = {},
): Promise<boolean> {
  recuperarVencidos();
  const trabajo = tomar(id, { concurrencia: opciones.concurrencia ?? 2, arriendoMs: ARRIENDO });
  if (!trabajo) return false;
  const latido = setInterval(() => renovar(trabajo.id, id, ARRIENDO), 20_000);
  try {
    if (trabajo.tipo === "paso") {
      const deps = opciones.dependencias ?? (await dependenciasReales());
      const resultado = await conLimite(ejecutarPaso(trabajo.carga.pasoId, deps), LIMITES.paso);
      if (resultado === "devuelto") devolver(trabajo.id, id, new Date(Date.now() + 5000).toISOString());
      else if (typeof resultado === "object") devolver(trabajo.id, id, new Date(Date.now() + resultado.esperaMs).toISOString());
      else terminar(trabajo.id, id, "hecho");
    } else if (trabajo.tipo === "publicar") {
      await conLimite(ejecutarPublicacion(trabajo.carga.reciboId), LIMITES.publicar);
      terminar(trabajo.id, id, "hecho");
    } else {
      await conLimite(confirmarRecibo(trabajo.carga.reciboId, Number(trabajo.carga.ronda ?? 1)), LIMITES.confirmar);
      terminar(trabajo.id, id, "hecho");
    }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error inesperado.";
    terminar(trabajo.id, id, "fallido", mensaje);
    if (trabajo.tipo === "paso") {
      try {
        const paso = leerPaso(trabajo.carga.pasoId);
        if (["recolectando", "generando", "en_cola"].includes(paso.estado)) {
          const { actualizarPaso, avanzar } = await import("./ejecucion");
          actualizarPaso(paso.id, { estado: "fallido", error: mensaje.slice(0, 500), detalle: "El paso falló. Puedes reintentarlo." });
          avanzar(paso.ejecucionId);
        }
      } catch {
        /* El paso pudo borrarse o cancelarse. */
      }
    }
  } finally {
    clearInterval(latido);
  }
  return true;
}

type Globales = typeof globalThis & { ezraTrabajador?: { detener: () => void } };
export function iniciarTrabajador() {
  const globales = globalThis as Globales;
  if (globales.ezraTrabajador || process.env.EZRA_GRANJAS_TRABAJADOR === "0") return;
  const id = `${hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
  const concurrencia = Math.min(4, Math.max(1, Number(process.env.EZRA_GRANJAS_CONCURRENCIA) || 2));
  let activo = true;
  let enCurso = 0;
  const ciclo = async () => {
    while (activo && enCurso < concurrencia) {
      enCurso++;
      // Cada ranura toma un trabajo; la base limita la concurrencia total entre procesos.
      const tomado = await procesarUno(id, { concurrencia })
        .catch(() => false)
        .finally(() => {
          enCurso--;
        });
      if (!tomado) break;
    }
  };
  const reloj = setInterval(() => void ciclo(), 1500);
  reloj.unref?.();
  // Horario: una revisión por minuto (y una al arrancar o despertar la Mac).
  let revisando = false;
  const horario = async () => {
    if (revisando || !activo) return;
    revisando = true;
    try {
      const { revisarHorarios } = await import("./horario");
      for (const r of await revisarHorarios())
        if (r.accion !== "pausada") console.log(`[horario] ${r.granjaId}: ${r.accion} ${r.detalle}`);
    } catch (error) {
      console.error("[horario]", error instanceof Error ? error.message : error);
    } finally {
      revisando = false;
    }
  };
  const relojHorario = setInterval(() => void horario(), 60_000);
  relojHorario.unref?.();
  const primera = setTimeout(() => void horario(), 5_000);
  primera.unref?.();
  globales.ezraTrabajador = {
    detener: () => {
      activo = false;
      clearInterval(reloj);
      clearInterval(relojHorario);
      clearTimeout(primera);
    },
  };
}
