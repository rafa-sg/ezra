import { leerProduccion } from "./almacen";
import { base, json } from "../granjas/db";
import { listarEventos } from "../granjas/eventos";
import { diaLocal, sumarDias } from "../granjas/tiempo";

/**
 * Agenda del calendario. Cada entrada dice qué clase de fecha es, porque no significan lo mismo:
 *  - «prevista»: fecha que pusiste a un encargo. Ordena el trabajo; no programa ni publica nada.
 *  - «autorizada»: autorizaste publicar una versión exacta en ciertos destinos (aún no salió).
 *  - «publicada»: la plataforma confirmó la publicación (recibo con enlace o identificador).
 *  - «subida_manual»: marcaste un post como subido a mano a Instagram, con su enlace.
 *  - «evento»: un evento aprobado ocurre ese día (fecha confirmada en su fuente).
 */
export type TipoAgenda = "prevista" | "autorizada" | "publicada" | "subida_manual" | "evento";
export type EntradaAgenda = { tipo: TipoAgenda; id: string; fecha: string; titulo: string; detalle: string; estado: string; enlace: string | null; encargoId?: string };

export async function agenda(opciones: { desde?: string; hasta?: string } = {}, ahora = new Date()) {
  const hoy = diaLocal(ahora);
  const desde = opciones.desde ?? sumarDias(hoy, -30);
  const hasta = opciones.hasta ?? sumarDias(hoy, 90);
  const dentro = (dia: string) => dia >= desde && dia <= hasta;
  const local = (iso: string) => diaLocal(new Date(iso));
  const entradas: EntradaAgenda[] = [];

  for (const e of (await leerProduccion()).encargos)
    if (e.fechaPrevista && dentro(e.fechaPrevista.slice(0, 10)))
      entradas.push({ tipo: "prevista", id: `encargo-${e.id}`, fecha: e.fechaPrevista, titulo: e.titulo, detalle: `v${e.version} · ${e.canales.join(", ")}`, estado: e.estado, enlace: null, encargoId: e.id });

  // Autorizaciones de publicación (granjas): versión exacta y destinos; «usada» ya generó envíos.
  const titulo = (contenido: string) => json<{ titulo?: string }>(contenido, {}).titulo || "Pieza sin título";
  const autorizaciones = base()
    .prepare(
      `select a.id, a.estado, a.destinos, a.creado, a.expira, p.version, p.contenido, g.nombre as granja
       from autorizaciones a join piezas p on p.id = a.pieza_id join granjas g on g.id = p.granja_id
       where a.estado in ('vigente', 'usada') order by a.creado desc limit 500`,
    )
    .all() as { id: string; estado: string; destinos: string; creado: string; expira: string; version: number; contenido: string; granja: string }[];
  for (const a of autorizaciones)
    if (dentro(local(a.creado))) {
      const destinos = json<{ canal?: string }[]>(a.destinos, []).map((d) => d.canal).filter(Boolean);
      entradas.push({ tipo: "autorizada", id: `autorizacion-${a.id}`, fecha: a.creado, titulo: titulo(a.contenido), detalle: `${a.granja} · v${a.version} · ${destinos.join(", ") || "sin destinos"}`, estado: a.estado, enlace: null });
    }

  // Publicación confirmada por la plataforma (o propuesta recibida por Spotmi).
  const recibos = base()
    .prepare(
      `select r.id, r.canal, r.cuenta_nombre, r.estado, r.enlace, r.actualizado, p.contenido
       from recibos r join piezas p on p.id = r.pieza_id
       where r.estado in ('publicado', 'borrador_subido', 'propuesta_enviada') order by r.actualizado desc limit 500`,
    )
    .all() as { id: string; canal: string; cuenta_nombre: string; estado: string; enlace: string | null; actualizado: string; contenido: string }[];
  for (const r of recibos)
    if (dentro(local(r.actualizado)))
      entradas.push({ tipo: "publicada", id: `recibo-${r.id}`, fecha: r.actualizado, titulo: titulo(r.contenido), detalle: `${r.canal} · ${r.cuenta_nombre}`, estado: r.estado, enlace: r.enlace });

  // Posts de Instagram subidos a mano (el propietario pegó su enlace).
  const posts = base()
    .prepare("select p.id, p.subido, p.ig_url, p.cuenta, e.titulo from posts_ig p join eventos e on e.id = p.evento_id where p.estado = 'subido' and p.subido is not null")
    .all() as { id: string; subido: string; ig_url: string | null; cuenta: string; titulo: string }[];
  for (const p of posts)
    if (dentro(local(p.subido))) entradas.push({ tipo: "subida_manual", id: `post-${p.id}`, fecha: p.subido, titulo: p.titulo, detalle: `Instagram · ${p.cuenta}`, estado: "subido", enlace: p.ig_url });

  for (const e of listarEventos())
    if (e.estado === "aprobado" && e.fecha && dentro(e.fecha))
      entradas.push({ tipo: "evento", id: `evento-${e.id}`, fecha: e.hora ? `${e.fecha}T${e.hora}` : e.fecha, titulo: e.titulo, detalle: [e.lugar, e.municipio].filter(Boolean).join(" · "), estado: e.estadoVisible, enlace: e.fuenteUrl });

  // Las fechas de encargos y eventos son hora local; las demás, instantes UTC: se ordenan por día local.
  const dia = (x: EntradaAgenda) => (x.tipo === "prevista" || x.tipo === "evento" ? x.fecha.slice(0, 10) : local(x.fecha));
  entradas.sort((a, b) => dia(a).localeCompare(dia(b)) || a.fecha.localeCompare(b.fecha));
  return { desde, hasta, hoy, entradas: entradas.map((x) => ({ ...x, dia: dia(x) })) };
}
export type Agenda = Awaited<ReturnType<typeof agenda>>;
