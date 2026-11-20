import { leerProduccion } from "./almacen";
import { estados, siguienteAccion } from "./modelo";
import { estadoEjecucion } from "./resumen-encargo";
import { base } from "../granjas/db";
import { listarGranjas } from "../granjas/almacen";
import { listarConexiones } from "../granjas/conexiones";
import { estadoPresupuesto, imagenesIaHoy, leerLimiteImagenes } from "../granjas/consumo";
import { listarEventos } from "../granjas/eventos";
import { diaLocal, instanteLocal, sumarDias } from "../granjas/tiempo";

/**
 * Inicio del estudio: todo sale de lo guardado (encargos en JSON, granjas, eventos y consumo en
 * SQLite, conexiones comprobadas). Nada se calcula a partir de supuestos ni de datos de ejemplo.
 */
export type Pendiente = { tipo: string; titulo: string; detalle: string; seccion: "encargos" | "granjas" | "eventos" | "conexiones" | "consumo"; id?: string };

/** Acciones del propietario que cuentan como «resueltas» para el % del día (salen de la auditoría). */
export const ACCIONES_RESUELTAS = ["evento.aprobar", "evento.descartar", "evento.imagen.confirmar", "post.subido", "paso.aprobar", "pieza.aprobar"];
export const DIAS_SERIE = 30;
export type PuntoSerie = { dia: string; eventos: number; postsCreados: number; postsSubidos: number; tokens: number; proximas: number };

/**
 * Series por día para el Pulso: 30 días hacia atrás (eventos encontrados, posts preparados y subidos,
 * tokens de Gemini) y 14 hacia adelante (fechas próximas). Todo de lo guardado, en hora de El Salvador.
 */
export function seriesPulso(ahora: Date, proximas: { fecha: string }[]): { pasado: PuntoSerie[]; futuro: { dia: string; proximas: number }[] } {
  const hoy = diaLocal(ahora);
  const desde = sumarDias(hoy, -(DIAS_SERIE - 1));
  const desdeIso = instanteLocal(desde).toISOString();
  const pasado = new Map<string, PuntoSerie>();
  for (let i = 0; i < DIAS_SERIE; i++) {
    const dia = sumarDias(desde, i);
    pasado.set(dia, { dia, eventos: 0, postsCreados: 0, postsSubidos: 0, tokens: 0, proximas: 0 });
  }
  const sumar = (iso: string | null, campo: "eventos" | "postsCreados" | "postsSubidos" | "tokens", n = 1) => {
    if (!iso) return;
    const p = pasado.get(diaLocal(new Date(iso)));
    if (p) p[campo] += n;
  };
  for (const f of base().prepare("select creado from eventos where creado >= ?").all(desdeIso) as { creado: string }[]) sumar(f.creado, "eventos");
  for (const f of base().prepare("select creado, subido from posts_ig where creado >= ? or subido >= ?").all(desdeIso, desdeIso) as { creado: string; subido: string | null }[]) {
    if (f.creado >= desdeIso) sumar(f.creado, "postsCreados");
    if (f.subido && f.subido >= desdeIso) sumar(f.subido, "postsSubidos");
  }
  for (const f of base().prepare("select fecha, total_tokens from consumo_ia where fecha >= ?").all(desdeIso) as { fecha: string; total_tokens: number }[])
    sumar(f.fecha, "tokens", Number(f.total_tokens) || 0);
  const futuro = Array.from({ length: 14 }, (_, i) => {
    const dia = sumarDias(hoy, i);
    return { dia, proximas: proximas.filter((p) => p.fecha.slice(0, 10) === dia).length };
  });
  return { pasado: [...pasado.values()], futuro };
}

/** % del día: lo que resolviste hoy frente a lo que queda pendiente ahora. Sin nada que hacer, 100 %. */
export function progresoDia(ahora: Date, pendientesActuales: number, aprobadosHoyEncargos: number) {
  const hoy = diaLocal(ahora);
  const marcas = ACCIONES_RESUELTAS.map(() => "?").join(", ");
  const fila = base()
    .prepare(`select count(*) as n from auditoria where accion in (${marcas}) and fecha >= ? and fecha < ?`)
    .get(...ACCIONES_RESUELTAS, instanteLocal(hoy).toISOString(), instanteLocal(sumarDias(hoy, 1)).toISOString()) as { n: number };
  const resueltas = Number(fila.n) + aprobadosHoyEncargos;
  const total = resueltas + pendientesActuales;
  return { resueltas, pendientes: pendientesActuales, porcentaje: total ? Math.round((resueltas / total) * 100) : 100 };
}

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

  // Siguiente paso útil: lo que más pesa primero (revisar, corregir, desbloquear); si no hay nada, lo que avanza el trabajo.
  const orden = ["encargo_revision", "encargo_cambios", "granja_error", "granja_revision", "granja_manual", "presupuesto", "eventos_nuevos", "imagenes", "posts"];
  const urgente = [...pendientes].sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo))[0];
  const porEjecutar = encargos.find((e) => e.estado === "pendiente" && !e.resultado.trim());
  const porEnviar = encargos.find((e) => (e.estado === "pendiente" || e.estado === "preparando") && e.resultado.trim());
  const sinFecha = encargos.find((e) => e.estado === "aprobado" && !e.fechaPrevista);
  const siguiente: { accion: string; titulo: string; seccion: Pendiente["seccion"] | "calendario"; id?: string } = urgente
    ? { accion: urgente.tipo, titulo: urgente.titulo, seccion: urgente.seccion, id: urgente.id }
    : !encargos.length
      ? { accion: "primer_encargo", titulo: "", seccion: "encargos" }
      : porEnviar
        ? { accion: "enviar_revision", titulo: porEnviar.titulo, seccion: "encargos", id: porEnviar.id }
        : porEjecutar
          ? { accion: "ejecutar", titulo: porEjecutar.titulo, seccion: "encargos", id: porEjecutar.id }
          : sinFecha
            ? { accion: "planificar", titulo: sinFecha.titulo, seccion: "calendario" }
            : { accion: "nuevo_encargo", titulo: "", seccion: "encargos" };
  // En curso: encargos que avanzan (sin esperar revisión) y granjas ejecutándose ahora.
  const enCurso = [
    ...encargos
      .filter((e) => (e.estado === "pendiente" || e.estado === "preparando") && !e.notaCambios)
      .map((e) => ({ tipo: "encargo" as const, id: e.id, titulo: e.titulo, detalle: siguienteAccion(e), seccion: "encargos" as const })),
    ...ejecuciones.filter((g) => g.ultima?.estado === "en_curso").map((g) => ({ tipo: "granja" as const, id: g.granjaId, titulo: g.nombre, detalle: "en_curso", seccion: "granjas" as const })),
  ].slice(0, 8);
  const terminados = encargos
    .filter((e) => e.estado === "aprobado")
    .sort((a, b) => b.actualizado.localeCompare(a.actualizado))
    .slice(0, 5)
    .map((e) => ({ id: e.id, titulo: e.titulo, version: e.version, fechaPrevista: e.fechaPrevista, actualizado: e.actualizado }));

  const aprobadosHoy = encargos.filter((e) => e.estado === "aprobado" && diaLocal(new Date(e.actualizado)) === hoy).length;

  // Pantalla de trabajo: en ejecución y bloqueados, eventos por revisar, contenido listo y actividad reciente.
  const trabajando = granjas
    .map((g) => {
      const u = ejecuciones.find((x) => x.granjaId === g.id)?.ultima;
      if (!u || u.estado !== "en_curso") return null;
      const activos = Number((base().prepare("select count(*) as n from pasos where ejecucion_id = ? and estado in ('recolectando', 'generando', 'en_cola')").get(u.id) as { n: number }).n);
      return { tipo: "granja" as const, id: g.id, titulo: g.nombre, detalle: `${activos} paso(s) trabajando`, desde: u.creado };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const bloqueados = [
    ...ejecuciones.filter((g) => g.fallidos > 0).map((g) => ({ tipo: "granja" as const, id: g.granjaId, titulo: g.nombre, detalle: `${g.fallidos} paso(s) fallaron o quedaron bloqueados`, desde: g.ultima?.creado ?? null })),
    ...encargos
      .filter((e) => (e.estado === "pendiente" || e.estado === "preparando") && estadoEjecucion(e).estado === "fallida")
      .map((e) => {
        const ej = estadoEjecucion(e);
        return { tipo: "encargo" as const, id: e.id, titulo: e.titulo, detalle: ej.motivo.slice(0, 160), desde: ej.fecha };
      }),
  ];
  const porRevisar = nuevos
    .slice()
    .sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"))
    .slice(0, 6)
    .map((e) => ({ id: e.id, titulo: e.titulo, fecha: e.fecha, departamento: e.departamento || null, confianza: e.confianza.puntos }));
  const postsFila = base()
    .prepare("select p.id, p.estado, p.subido, p.ig_url, p.actualizado, e.titulo from posts_ig p join eventos e on e.id = p.evento_id where p.estado in ('listo', 'subido') order by p.actualizado desc limit 6")
    .all() as { id: string; estado: string; subido: string | null; ig_url: string | null; actualizado: string; titulo: string }[];
  const listo = [
    ...encargos
      .filter((e) => e.estado === "aprobado")
      .slice(0, 6)
      .map((e) => ({ tipo: "encargo" as const, id: e.id, titulo: e.titulo, estado: "lista_para_descargar", fecha: e.actualizado, enlace: null as string | null })),
    ...postsFila.map((p) => ({ tipo: "post" as const, id: p.id, titulo: `Post · ${p.titulo}`, estado: p.estado === "subido" ? "confirmada_por_usuario" : "pendiente_subida_manual", fecha: p.subido ?? p.actualizado, enlace: p.ig_url })),
  ]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 8);
  const actividad = (base().prepare("select fecha, accion, objeto from auditoria order by fecha desc limit 10").all() as { fecha: string; accion: string; objeto: string }[]).map((a) => ({ ...a, objeto: a.objeto.slice(0, 80) }));
  return {
    trabajo: { trabajando, bloqueados, porRevisar, listo, actividad },
    series: seriesPulso(ahora, proximas),
    progreso: progresoDia(ahora, pendientes.length, aprobadosHoy),
    granjasActivas: granjas.length,
    siguiente,
    enCurso,
    terminados,
    encargos: { total: encargos.length, porEstado, recientes: encargos.slice(0, 5).map((e) => ({ id: e.id, titulo: e.titulo, estado: e.estado, version: e.version, actualizado: e.actualizado })) },
    granjas: ejecuciones,
    eventos: {
      nuevos: nuevos.length,
      aprobados: eventos.filter((e) => e.estado === "aprobado").length,
      enBandeja: eventos.filter((e) => e.estado !== "descartado" && (!e.fecha || (e.fechaFin ?? e.fecha) >= hoy)).length,
      imagenesPendientes,
      postsListos,
      postsSubidos: Number((base().prepare("select count(*) as n from posts_ig where estado = 'subido'").get() as { n: number }).n),
    },
    conexiones,
    consumo: { dia: presupuesto.dia, mes: presupuesto.mes, agotado: presupuesto.agotado, imagenesIA: { hoy: imagenesIaHoy(ahora), limite: leerLimiteImagenes() } },
    proximas,
    pendientes,
  };
}
export type ResumenInicio = Awaited<ReturnType<typeof resumenInicio>>;
