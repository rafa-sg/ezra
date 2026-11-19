import { z } from "zod";
import { WorkflowError } from "../workflow";
import { listarGranjas } from "./almacen";
import { candidatoSchema, type Candidato } from "./cazador";
import { auditar } from "./db";
import { referenciasLocales, type Referencia } from "./eventos";
import type { Respuesta } from "./fuentes";
import { eventosPublicosSpotmi } from "./spotmi-publico";
import { diaLocal, diaValido } from "./tiempo";
import { verificarCandidatos } from "./verificador";

/**
 * Importa eventos con el mismo formato que devuelve el cazador y los pasa por el mismo
 * verificador: normaliza, deduplica contra Ezra y Spotmi, deja «por confirmar» lo que
 * la fuente no muestra y descarga la imagen oficial (pendiente de tu confirmación).
 */
export const MAX_IMPORTAR = 200;
const dominio = z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/);
export async function importarEventos(
  crudo: unknown,
  opciones: {
    /** Dominios que valen solo para esta importación (por ejemplo, notas de prensa). */
    dominiosExtra?: string[];
    descargar?: (u: URL, l: number, t: number) => Promise<Respuesta>;
    catalogoSpotmi?: () => Promise<Referencia[]>;
    ahora?: Date;
  } = {},
) {
  const lista = Array.isArray(crudo) ? crudo : Array.isArray((crudo as { eventos?: unknown })?.eventos) ? (crudo as { eventos: unknown[] }).eventos : null;
  if (!lista) throw new WorkflowError("El archivo debe ser un arreglo JSON de eventos (o un objeto con «eventos»).", 422);
  if (lista.length > MAX_IMPORTAR) throw new WorkflowError(`Importa como máximo ${MAX_IMPORTAR} eventos por vez.`, 413);
  const candidatos: Candidato[] = [];
  const invalidos: { posicion: number; motivo: string }[] = [];
  lista.forEach((item, i) => {
    const leido = candidatoSchema.safeParse(item);
    if (leido.success) candidatos.push(leido.data);
    else invalidos.push({ posicion: i + 1, motivo: leido.error.issues.slice(0, 2).map((x) => `${x.path.join(".") || "evento"}: ${x.message}`).join("; ") });
  });
  const granja = listarGranjas().find((g) => g.ajustes.purpose === "eventos_el_salvador" && g.estado === "activa");
  const extra = z.array(dominio).max(20).parse(opciones.dominiosExtra ?? []);
  const dominios = [...new Set([...(granja?.politicaFuentes.dominios ?? []), ...extra])];
  if (!dominios.length) throw new WorkflowError("No hay dominios permitidos: crea la granja «Eventos de El Salvador» o indica los dominios.", 422);
  const ahora = opciones.ahora ?? new Date();
  const hoy = diaLocal(ahora);
  // La ventana cubre hasta el último evento del archivo (máximo 180 días).
  const ultimo = candidatos.map((c) => c.fecha?.slice(0, 10) ?? "").filter((d) => diaValido(d)).sort().at(-1) ?? hoy;
  const diasAdelante = Math.min(180, Math.max(1, Math.ceil((Date.parse(`${ultimo}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000) + 1));
  const r = await verificarCandidatos(
    candidatos,
    { hoy, diasAdelante, dominios, restantes: MAX_IMPORTAR, referencias: referenciasLocales(), granjaId: granja?.id ?? null, ejecucionId: null, origen: "importacion" },
    { descargar: opciones.descargar, catalogoSpotmi: opciones.catalogoSpotmi ?? eventosPublicosSpotmi },
  );
  const resumen = {
    recibidos: lista.length,
    invalidos,
    nuevos: r.nuevos.length,
    duplicados: r.duplicados.length,
    descartados: r.descartados.length,
    conImagen: r.conImagen,
    conDatosPorConfirmar: r.nuevos.filter((n) => n.porConfirmar.length).length,
    spotmi: r.spotmi,
    detalle: r,
  };
  auditar("eventos.importar", granja?.id ?? "sin-granja", { recibidos: lista.length, nuevos: r.nuevos.length, dominiosExtra: extra });
  return resumen;
}
