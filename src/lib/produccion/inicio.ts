import { leerProduccion } from "./almacen";
import { estados } from "./modelo";
import { base } from "../granjas/db";
import { listarGranjas } from "../granjas/almacen";
import { listarConexiones } from "../granjas/conexiones";
import { estadoPresupuesto, imagenesIaHoy, leerLimiteImagenes } from "../granjas/consumo";
import { listarEventos } from "../granjas/eventos";
import { diaLocal, sumarDias } from "../granjas/tiempo";

/**
 * Inicio del estudio: todo sale de lo guardado (encargos en JSON, granjas, eventos y consumo en
 * SQLite, conexiones comprobadas). Nada se calcula a partir de supuestos ni de datos de ejemplo.
 */
export type Pendiente = { tipo: string; titulo: string; detalle: string; seccion: "encargos" | "granjas" | "eventos" | "conexiones" | "consumo"; id?: string };

export async function resumenInicio(ahora = new Date()) {
  const produccion = await leerProduccion();
  const hoy = diaLocal(ahora);
  const hasta = sumarDias(hoy, 14);
  const encargos = produccion.encargos;
  const porEstado = Object.fromEntries(estados.map((e) => [e, encargos.filter((x) => x.estado === e).length])) as Record<(typeof estados)[number], number>;
  const pendientes: Pendiente[] = [];
  for (const e of encargos.filter((x) => x.estado === "revision"))
    pendientes.push({ tipo: "encargo_revision", titulo: e.titulo, detalle: `Versión ${e.version} lista para revisar`, seccion: "encargos", id: e.id });
  for (const e of encargos.filter((x) => x.estado === "pendiente" && x.notaCambios))
    pendientes.push({ tipo: "encargo_cambios", titulo: e.titulo, detalle: `Cambios pedidos: ${e.notaCambios.slice(0, 140)}`, seccion: "encargos", id: e.id });

  // Granjas activas: su última ejecución y los pasos que esperan algo del propietario.
  const granjas = listarGranjas().filter((g) => g.estado === "activa");
  const ejecuciones = granjas.map((g) => {
    const u = base().prepare("select id, estado, creado, terminado from ejecuciones where granja_id = ? order by creado desc limit 1").get(g.id) as
      | { id: string; estado: string; creado: string; terminado: string | null }
      | undefined;
    const pasos = u ? (base().prepare("select estado, count(*) as n from pasos where ejecucion_id = ? group by estado").all(u.id) as { estado: string; n: number }[]) : [];
    const cuenta = (estado: string) => Number(pasos.find((p) => p.estado === estado)?.n ?? 0);
    const r = { granjaId: g.id, nombre: g.nombre, ultima: u ?? null, enRevision: cuenta("en_revision"), manual: cuenta("esperando_manual"), fallidos: cuenta("fallido") + cuenta("bloqueado") };
    if (r.enRevision) pendientes.push({ tipo: "granja_revision", titulo: g.nombre, detalle: `${r.enRevision} paso(s) esperan tu revisión`, seccion: "granjas", id: g.id });
    if (r.manual) pendientes.push({ tipo: "granja_manual", titulo: g.nombre, detalle: `${r.manual} paso(s) esperan trabajo manual`, seccion: "granjas", id: g.id });
    if (r.fallidos) pendientes.push({ tipo: "granja_error", titulo: g.nombre, detalle: `${r.fallidos} paso(s) fallaron o quedaron bloqueados en la última ejecución`, seccion: "granjas", id: g.id });
    return r;
  });

  const eventos = listarEventos();
  const nuevos = eventos.filter((e) => e.estado === "nuevo" && (!e.fecha || (e.fechaFin ?? e.fecha) >= hoy));
  if (nuevos.length) pendientes.push({ tipo: "eventos_nuevos", titulo: "Eventos nuevos", detalle: `${nuevos.length} evento(s) esperan aprobar o descartar`, seccion: "eventos" });
  const imagenesPendientes = eventos.filter((e) => e.imagenMedioId && !e.imagenConfirmada && e.imagenTipo !== "ia" && e.estado !== "descartado").length;
  if (imagenesPendientes) pendientes.push({ tipo: "imagenes", titulo: "Imágenes por confirmar", detalle: `${imagenesPendientes} imagen(es) oficiales pendientes de tu confirmación`, seccion: "eventos" });
  const postsListos = Number((base().prepare("select count(*) as n from posts_ig where estado = 'listo'").get() as { n: number }).n);
  if (postsListos) pendientes.push({ tipo: "posts", titulo: "Posts de Instagram", detalle: `${postsListos} post(s) listos para subir a mano`, seccion: "eventos" });

  const conexiones = listarConexiones().map((c) => ({ canal: c.canal, estado: c.estado, cuenta: c.identidad?.nombre ?? "", error: c.ultimoError }));
  const presupuesto = estadoPresupuesto(ahora);
  if (presupuesto.agotado) pendientes.push({ tipo: "presupuesto", titulo: "Presupuesto de Gemini", detalle: "Se alcanzó el límite: Gemini está en pausa", seccion: "consumo" });

  // Próximas fechas (14 días): encargos con fecha prevista y eventos aprobados con fecha confirmada.
  const proximas = [
    ...encargos
      .filter((e) => e.fechaPrevista && e.fechaPrevista.slice(0, 10) >= hoy && e.fechaPrevista.slice(0, 10) <= hasta)
      .map((e) => ({ tipo: "encargo" as const, id: e.id, titulo: e.titulo, fecha: e.fechaPrevista, estado: e.estado })),
    ...eventos
      .filter((e) => e.estado === "aprobado" && e.fecha && e.fecha >= hoy && e.fecha <= hasta)
      .map((e) => ({ tipo: "evento" as const, id: e.id, titulo: e.titulo, fecha: e.hora ? `${e.fecha}T${e.hora}` : e.fecha!, estado: e.estadoVisible })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    encargos: { total: encargos.length, porEstado, recientes: encargos.slice(0, 5).map((e) => ({ id: e.id, titulo: e.titulo, estado: e.estado, version: e.version, actualizado: e.actualizado })) },
    granjas: ejecuciones,
    eventos: { nuevos: nuevos.length, aprobados: eventos.filter((e) => e.estado === "aprobado").length, imagenesPendientes, postsListos },
    conexiones,
    consumo: { dia: presupuesto.dia, mes: presupuesto.mes, agotado: presupuesto.agotado, imagenesIA: { hoy: imagenesIaHoy(ahora), limite: leerLimiteImagenes() } },
    proximas,
    pendientes,
  };
}
export type ResumenInicio = Awaited<ReturnType<typeof resumenInicio>>;
