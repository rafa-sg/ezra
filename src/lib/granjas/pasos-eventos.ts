import type { Artefacto } from "./almacen";
import type { Ejecucion } from "./ejecucion";
import type { Nodo } from "./modelo";
import { esRedireccionBusqueda, fuentesDeBusqueda, leerCandidatos, promptCazadorEventos, type Candidato } from "./cazador";
import { candidatosDeRedes, type CandidatoRed, type ResumenRedes } from "./redes";
import { costoLlamada, leerTarifas, type FilaConsumo } from "./consumo";
import { completarImagenEvento, type GenerarReferencia, type ResultadoCompletar } from "./completar-imagenes";
import { estadoImagenesIA, generarReferencia } from "./imagen-ia";
import type { MaterialFuente } from "./fuentes";
import { eventosCreadosHoy, referenciasLocales } from "./eventos";
import { base, json } from "./db";
import { diaLocal } from "./tiempo";
import { verificarCandidatos, type DepsVerificador } from "./verificador";

/**
 * Especialistas de la granja «Eventos de El Salvador» dentro del motor de granjas:
 * el cazador usa un prompt propio (JSON) y el verificador trabaja sin IA.
 */
export type DepsEspecialistas = DepsVerificador & {
  ahora?: () => Date;
  /** Lectura de cuentas en redes (por defecto, las API oficiales de Meta con las «Cuentas a seguir»). */
  redes?: typeof candidatosDeRedes;
  /** Imagen de referencia IA (las pruebas la simulan); por defecto Gemini con su límite diario. */
  referenciaIA?: GenerarReferencia;
  /** Tiempo del paso «Imagen» (las pruebas lo acortan). */
  tiempoImagen?: { porEventoMs: number; totalMs: number };
};
/**
 * El trabajador corta un paso a los 8 minutos y daría la ejecución por fallida aunque los eventos
 * ya estén en la bandeja. El paso «Imagen» se detiene antes: lo que falte queda para «Completar imágenes».
 */
export const TIEMPO_IMAGEN = { porEventoMs: 75_000, totalMs: 5 * 60_000 };
/** Ventana por defecto de la búsqueda diaria de eventos (de hoy a 60 días). */
export const DIAS_ADELANTE = 60;
export const esGranjaEventos = (e: Ejecucion) => e.instantanea.ajustes?.purpose === "eventos_el_salvador";
export function limiteEventos(e: Ejecucion) {
  const porDia = e.instantanea.ajustes?.eventos?.maxPorDia ?? 10;
  return Math.min(porDia, e.instantanea.limites?.eventos ?? porDia);
}

export const esCazadorEventos = (nodo: Nodo, ejecucion: Ejecucion) => nodo.agente === "cazador" && esGranjaEventos(ejecucion);
/** Prompt del cazador cuando la granja es la de eventos; null en cualquier otra granja. */
export function promptEspecial(
  nodo: Nodo,
  ejecucion: Ejecucion,
  modo: { busqueda: boolean; material: MaterialFuente[] },
  ahora = new Date(),
): { prompt: string; maxTokens: number } | null {
  if (!esCazadorEventos(nodo, ejecucion)) return null;
  const hoy = diaLocal(ahora);
  return {
    prompt: promptCazadorEventos({
      hoy,
      diasAdelante: ejecucion.instantanea.ajustes?.eventos?.diasAdelante ?? DIAS_ADELANTE,
      maximo: limiteEventos(ejecucion),
      dominios: ejecucion.instantanea.politica.dominios,
      // Lo que ya está en la bandeja (y sigue vigente) no se vuelve a pedir; el verificador deduplica igual.
      conocidos: referenciasLocales()
        .filter((r) => !r.fecha || (r.hasta ?? r.fecha) >= hoy)
        .map((r) => (r.fecha ? `${r.titulo} (${r.fecha})` : r.titulo)),
      instrucciones: nodo.instrucciones,
      busqueda: modo.busqueda,
      material: modo.material,
    }),
    // JSON de hasta 20 eventos más el razonamiento del modelo.
    maxTokens: 8192,
  };
}

/** Resultado de un especialista sin IA: sus artefactos y el estado en que queda el paso. */
export type ResultadoLocal = {
  artefactos: { tipo: Artefacto["tipo"]; contenido: string; medioId?: string; medioSha?: string }[];
  detalle: string;
  bloqueado?: boolean;
};

export async function verificarPaso(ejecucion: Ejecucion, entradas: Artefacto[], deps: DepsEspecialistas): Promise<ResultadoLocal> {
  const delCazador: Candidato[] = [];
  const deBusqueda = new Set<string>();
  let invalidos = 0;
  // El resumen de fuentes que guarda el cazador no es una lista de eventos.
  for (const a of entradas.filter((x) => (x.tipo === "investigacion" || x.tipo === "texto") && x.procedencia.origen !== "fuentes")) {
    const leido = leerCandidatos(a.contenido);
    delCazador.push(...leido.candidatos);
    invalidos += leido.invalidos;
    for (const u of fuentesDeBusqueda(a.contenido)) deBusqueda.add(u);
  }
  const ahora = deps.ahora?.() ?? new Date();
  const hoy = diaLocal(ahora);
  const diasAdelante = ejecucion.instantanea.ajustes?.eventos?.diasAdelante ?? DIAS_ADELANTE;
  // Cuentas oficiales en redes (solo API de Meta; sin cuentas o sin conexión no se llama a nada).
  let redes: { candidatos: CandidatoRed[]; resumen: ResumenRedes } = { candidatos: [], resumen: { cuentas: 0, posts: 0, candidatos: 0, errores: [], omitido: "" } };
  try {
    redes = await (deps.redes ?? candidatosDeRedes)({
      hoy,
      diasAdelante,
      conocidos: referenciasLocales()
        .filter((r) => !r.fecha || (r.hasta ?? r.fecha) >= hoy)
        .map((r) => (r.fecha ? `${r.titulo} (${r.fecha})` : r.titulo)),
      gemini: { granjaId: ejecucion.granjaId, ejecucionId: ejecucion.id },
    });
  } catch (error) {
    redes.resumen.errores.push(error instanceof Error ? error.message.slice(0, 200) : "No se pudieron leer las redes.");
  }
  // Orden: Fuentes web, cuentas de Instagram, páginas de Facebook y, al final, lo que trajo la búsqueda de Google.
  const esBusqueda = (c: Candidato) => esRedireccionBusqueda(c.fuente_url) || deBusqueda.has(c.fuente_url);
  const candidatos: (Candidato | CandidatoRed)[] = [
    ...delCazador.filter((c) => !esBusqueda(c)),
    ...redes.candidatos.filter((c) => c.red.via === "instagram"),
    ...redes.candidatos.filter((c) => c.red.via === "facebook"),
    ...delCazador.filter(esBusqueda),
  ];
  const notaRedes = [redes.resumen.posts ? `${redes.resumen.posts} post(s) de ${redes.resumen.cuentas} cuenta(s)` : "", ...redes.resumen.errores].filter(Boolean).join(" · ");
  if (!candidatos.length)
    return {
      artefactos: [{ tipo: "investigacion", contenido: JSON.stringify({ revisados: 0, nuevos: [], duplicados: [], actualizados: [], descartados: [], invalidos, redes: redes.resumen }, null, 2) }],
      detalle: `El cazador no entregó eventos en el formato esperado (JSON) y las cuentas en redes no trajeron eventos. Reintenta el cazador o pega un resultado manual.${notaRedes ? ` Redes: ${notaRedes}.` : ""}`,
      bloqueado: true,
    };
  const restantes = Math.max(0, limiteEventos(ejecucion) - eventosCreadosHoy(ejecucion.granjaId, ahora));
  const r = await verificarCandidatos(
    candidatos,
    {
      hoy,
      diasAdelante,
      dominios: ejecucion.instantanea.politica.dominios,
      // Los eventos nuevos tienen un máximo diario; los que ya existen igual suman su fuente y se actualizan.
      restantes,
      referencias: referenciasLocales(),
      granjaId: ejecucion.granjaId,
      ejecucionId: ejecucion.id,
    },
    deps,
  );
  const sumadas = r.duplicados.filter((d) => d.fuenteNueva).length;
  const partes = [
    `${r.nuevos.length} evento(s) nuevo(s) en la bandeja`,
    r.actualizados.length ? `${r.actualizados.length} actualizado(s)` : "",
    r.duplicados.length ? `${r.duplicados.length} duplicado(s)${sumadas ? ` (${sumadas} con fuente nueva)` : ""}` : "",
    r.conImagen ? `${r.conImagen} imagen(es)` : "",
    r.descartados.length ? `${r.descartados.length} descartado(s)` : "",
    !restantes || r.omitidosPorLimite ? `máximo de eventos nuevos de hoy alcanzado${r.omitidosPorLimite ? ` (${r.omitidosPorLimite} quedan para mañana)` : ""}` : "",
    r.spotmi === "no_disponible" ? "Spotmi no respondió: duplicados revisados solo contra Ezra" : "",
    notaRedes ? `redes: ${notaRedes}` : "",
  ].filter(Boolean);
  return { artefactos: [{ tipo: "investigacion", contenido: JSON.stringify({ ...r, invalidos, redes: redes.resumen }, null, 2) }], detalle: `${partes.join(" · ")}.` };
}

/**
 * Paso «Imagen»: para los eventos nuevos que dejó el verificador aplica el orden afiche oficial ›
 * post oficial (API) › foto de prensa › referencia IA (si está encendida y hay cupo) › cuadro azul.
 */
export async function imagenPaso(ejecucion: Ejecucion, entradas: Artefacto[], deps: DepsEspecialistas): Promise<ResultadoLocal> {
  const ids = [
    ...new Set(
      entradas
        .filter((a) => a.tipo === "investigacion")
        .flatMap((a) => json<{ nuevos?: { id?: string }[] }>(a.contenido, {}).nuevos ?? [])
        .map((n) => n.id)
        .filter((x): x is string => typeof x === "string"),
    ),
  ];
  const estado = await estadoImagenesIA();
  let iaDisponible = estado.activa;
  const generar: GenerarReferencia =
    deps.referenciaIA ??
    (async (id) => {
      const r = await generarReferencia(id, { contexto: { granjaId: ejecucion.granjaId, ejecucionId: ejecucion.id } });
      // Sin facturación o sin cupo no tiene sentido seguir pidiendo imágenes en esta ejecución.
      if (!r.ok && (("facturacion" in r && r.facturacion) || /límite|cupo/.test(r.motivo))) iaDisponible = false;
      return r.ok ? { ok: true, motivo: r.motivo } : { ok: false, motivo: r.motivo };
    });
  const resultados: ResultadoCompletar[] = [];
  const tiempo = deps.tiempoImagen ?? TIEMPO_IMAGEN;
  const limite = Date.now() + tiempo.totalMs;
  // Una sola lectura de cada cartelera y de cada portada para todo el lote (antes se repetían por evento).
  const compartido = { portadas: new Map(), listados: new Map() };
  let pendientes = 0;
  for (const id of ids) {
    const queda = limite - Date.now();
    if (queda <= 0) {
      pendientes++;
      continue;
    }
    let reloj: NodeJS.Timeout | undefined;
    try {
      resultados.push(
        await Promise.race([
          completarImagenEvento(id, { descargar: deps.descargar, referenciaIA: iaDisponible ? generar : null, ...compartido }),
          new Promise<never>((_, reject) => {
            reloj = setTimeout(() => reject(new Error("tardó demasiado; queda para «Completar imágenes»")), Math.min(tiempo.porEventoMs, queda));
          }),
        ]),
      );
    } catch (error) {
      resultados.push({ id, titulo: id, estado: "sin_imagen", motivo: error instanceof Error ? error.message.slice(0, 160) : "error" });
    } finally {
      clearTimeout(reloj);
    }
  }
  const cuenta = (...e: ResultadoCompletar["estado"][]) => resultados.filter((r) => e.includes(r.estado)).length;
  const imagenes = { revisados: ids.length - pendientes, pendientes, afiche: cuenta("afiche", "ticketera"), red: cuenta("red"), prensa: cuenta("prensa"), ia: cuenta("ia"), sinImagen: cuenta("sin_imagen"), yaTenian: cuenta("ya_tenia") };
  const partes = [
    `${ids.length} evento(s) nuevo(s) revisado(s)`,
    imagenes.afiche ? `${imagenes.afiche} afiche(s)` : "",
    imagenes.red ? `${imagenes.red} de cuentas oficiales` : "",
    imagenes.prensa ? `${imagenes.prensa} foto(s) de prensa` : "",
    imagenes.ia ? `${imagenes.ia} referencia(s) IA` : "",
    imagenes.sinImagen ? `${imagenes.sinImagen} sin imagen` : "",
    pendientes ? `${pendientes} quedan para «Completar imágenes» (se acabó el tiempo del paso)` : "",
    !estado.activa ? `IA: ${estado.motivo}` : !iaDisponible ? "IA detenida en esta ejecución (sin facturación o sin cupo)" : "",
  ].filter(Boolean);
  return { artefactos: [{ tipo: "investigacion", contenido: JSON.stringify({ imagenes, detalle: resultados }, null, 2) }], detalle: `${partes.join(" · ")}.` };
}

/** Resumen de una ejecución de la granja de eventos: lo que dejó el verificador, los tokens y el costo estimado. */
export function resumenEjecucionEventos(ejecucionId: string) {
  const filas = base()
    .prepare("select contenido from artefactos where ejecucion_id = ? and tipo = 'investigacion' and procedencia like '%\"origen\":\"local\"%' order by creado desc")
    .all(ejecucionId) as { contenido: string }[];
  const leidos = filas.map((f) => json<Record<string, unknown>>(f.contenido, {}));
  // El verificador deja «nuevos»; el paso Imagen deja «imagenes».
  const v = (leidos.find((x) => Array.isArray(x.nuevos)) ?? {}) as { nuevos?: unknown[]; duplicados?: { fuenteNueva?: boolean }[]; actualizados?: unknown[]; descartados?: unknown[]; conImagen?: number };
  const img = (leidos.find((x) => x.imagenes) as { imagenes?: { afiche: number; red: number; prensa: number; ia: number } } | undefined)?.imagenes;
  const consumo = base().prepare("select * from consumo_ia where ejecucion_id = ?").all(ejecucionId) as FilaConsumo[];
  const tarifas = leerTarifas();
  const costos = consumo.map((f) => costoLlamada(f, tarifas));
  return {
    verificado: Array.isArray(v.nuevos),
    nuevos: v.nuevos?.length ?? 0,
    actualizados: v.actualizados?.length ?? 0,
    duplicados: v.duplicados?.length ?? 0,
    fuentesSumadas: v.duplicados?.filter((d) => d.fuenteNueva).length ?? 0,
    descartados: v.descartados?.length ?? 0,
    conImagen: (v.conImagen ?? 0) + (img ? img.afiche + img.red + img.prensa : 0),
    conImagenIA: img?.ia ?? 0,
    tokens: consumo.reduce((s, f) => s + Number(f.total_tokens), 0),
    llamadas: consumo.length,
    errores: consumo.filter((f) => f.error).length,
    /** USD según las tarifas de Consumo; null si algún modelo no tiene tarifa. */
    costo: costos.some((c) => c === null) ? null : costos.reduce<number>((s, c) => s + (c ?? 0), 0),
  };
}
