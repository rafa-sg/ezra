import { base } from "./db";
import { listarGranjas } from "./almacen";
import { leerConexion } from "./conexiones";
import { clasificarFuente } from "./confianza";
import { leerConfianzaDominios } from "./eventos";
import { diaLocal, instanteLocal, mesLocal, sumarDias } from "./tiempo";

/**
 * Panorama de Granjas (Fase 2 del rediseño): tarjetas con lo que cada granja produjo, el mapa de
 * conexiones (fuentes → Ezra → destinos, eventos por departamento) y el flujo de agentes de la
 * última ejecución. Todo sale de lo guardado; nada es de ejemplo.
 */
export const departamentos = [
  "Ahuachapán",
  "Santa Ana",
  "Sonsonate",
  "Chalatenango",
  "La Libertad",
  "San Salvador",
  "Cuscatlán",
  "La Paz",
  "Cabañas",
  "San Vicente",
  "Usulután",
  "San Miguel",
  "Morazán",
  "La Unión",
] as const;
/** Nombres legibles de las fuentes más comunes; el resto se muestra por su dominio. */
const nombresFuente: Record<string, string> = {
  "elsalvador.travel": "MITUR",
  "cultura.gob.sv": "Cultura",
  "istu.gob.sv": "ISTU",
  "smartticket.fun": "Smart Ticket",
  "todoticketsv.com": "Todoticket",
  "funcapital.com": "Fun Capital",
  "elsalvador.com": "El Diario de Hoy",
  "laprensagrafica.com": "La Prensa Gráfica",
  "diarioelsalvador.com": "Diario El Salvador",
};
const sinAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** Departamento canónico a partir de lo escrito en el evento (acentos y mayúsculas no importan). */
export function departamentoCanonico(texto: string | null | undefined): (typeof departamentos)[number] | null {
  if (!texto) return null;
  const t = sinAcento(texto);
  return departamentos.find((d) => sinAcento(d) === t) ?? null;
}

export function panoramaGranjas(ahora = new Date()) {
  const hoy = diaLocal(ahora);
  const desde30 = instanteLocal(sumarDias(hoy, -29)).toISOString();
  const inicioMes = instanteLocal(`${mesLocal(ahora)}-01`).toISOString();
  const db = base();

  const granjas = listarGranjas()
    .filter((g) => g.estado !== "archivada")
    .map((g) => {
      const ultima = db.prepare("select id, estado, creado, terminado from ejecuciones where granja_id = ? order by creado desc limit 1").get(g.id) as
        | { id: string; estado: string; creado: string; terminado: string | null }
        | undefined;
      const trabajando = ultima
        ? Number((db.prepare("select count(*) as n from pasos where ejecucion_id = ? and estado in ('recolectando', 'generando', 'en_cola')").get(ultima.id) as { n: number }).n) > 0
        : false;
      const horario = db.prepare("select activa, hora from horarios where granja_id = ?").get(g.id) as { activa: number; hora: string } | undefined;
      const cuenta = (sql: string, ...p: (string | number)[]) => Number((db.prepare(sql).get(...p) as { n: number }).n);
      return {
        id: g.id,
        nombre: g.nombre,
        estado: g.estado,
        proposito: g.ajustes.purpose ?? null,
        pasos: g.grafo.nodos.length,
        horario: horario ? { activa: Boolean(horario.activa), hora: horario.hora } : null,
        ultima: ultima ? { estado: ultima.estado, creado: ultima.creado } : null,
        trabajando,
        eventos30: cuenta("select count(*) as n from eventos where granja_id = ? and creado >= ?", g.id, desde30),
        posts30: cuenta("select count(*) as n from posts_ig where granja_id = ? and creado >= ?", g.id, desde30),
        tokensMes: cuenta("select coalesce(sum(total_tokens), 0) as n from consumo_ia where granja_id = ? and fecha >= ?", g.id, inicioMes),
      };
    });

  // Mapa: eventos vigentes por departamento (los descartados y los ya pasados no cuentan).
  const vigentes = db
    .prepare("select departamento, fecha, fecha_fin from eventos where estado != 'descartado'")
    .all() as { departamento: string | null; fecha: string | null; fecha_fin: string | null }[];
  const porDepto = new Map<string, number>();
  let sinDepto = 0;
  for (const e of vigentes) {
    if (e.fecha && (e.fecha_fin ?? e.fecha) < hoy) continue;
    const d = departamentoCanonico(e.departamento);
    if (d) porDepto.set(d, (porDepto.get(d) ?? 0) + 1);
    else sinDepto++;
  }

  // Fuentes: de dónde vinieron los eventos vigentes (una fuente por dominio o por cuenta de red).
  const ajustes = leerConfianzaDominios();
  const filas = db
    .prepare(
      `select f.url, f.via, f.cuenta, f.leido from evento_fuentes f join eventos e on e.id = f.evento_id
       where e.estado != 'descartado'`,
    )
    .all() as { url: string; via: string; cuenta: string | null; leido: string | null }[];
  const fuentes = new Map<string, { clave: string; etiqueta: string; tipo: string; eventos: number; ultimo: string | null }>();
  for (const f of filas) {
    const red = f.via === "instagram" || f.via === "facebook";
    const c = red ? null : clasificarFuente({ url: f.url, via: "web" }, ajustes);
    const clave = red ? `${f.via}:${f.cuenta ?? ""}` : c!.dominio;
    const etiqueta = red ? `${f.cuenta ? `@${f.cuenta.replace(/^@/, "")}` : f.via}` : (nombresFuente[c!.dominio] ?? c!.dominio);
    const actual = fuentes.get(clave) ?? { clave, etiqueta, tipo: red ? "cuenta_red" : c!.tipo, eventos: 0, ultimo: null };
    actual.eventos++;
    if (f.leido && (!actual.ultimo || f.leido > actual.ultimo)) actual.ultimo = f.leido;
    fuentes.set(clave, actual);
  }

  // Destinos: Spotmi (propuestas enviadas) e Instagram (posts listos y subidos).
  const cuenta = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
  const ig = leerConexion("instagram");
  const destinos = {
    spotmi: { enviados: cuenta("select count(*) as n from eventos where spotmi_estado is not null"), aprobados: cuenta("select count(*) as n from eventos where estado = 'aprobado'") },
    instagram: {
      cuenta: ig && (ig.estado === "conectada_publicacion" || ig.estado === "conectada_lectura") ? (ig.identidad?.nombre ?? "Instagram") : null,
      listos: cuenta("select count(*) as n from posts_ig where estado = 'listo'"),
      subidos: cuenta("select count(*) as n from posts_ig where estado = 'subido'"),
    },
  };

  // Flujo de agentes: una granja por tipo (la de horario activo o, si no, la de la ejecución más reciente),
  // eventos primero y después Instagram, con los pasos de su última ejecución en el orden del grafo.
  const elegir = (proposito: string) =>
    granjas
      .filter((g) => g.estado === "activa" && g.proposito === proposito)
      .sort((a, b) => Number(Boolean(b.horario?.activa)) - Number(Boolean(a.horario?.activa)) || (b.ultima?.creado ?? "").localeCompare(a.ultima?.creado ?? ""))[0]?.id;
  const elegidas = ["eventos_el_salvador", "post_instagram_eventos"].map(elegir).filter((x): x is string => Boolean(x));
  const todas = listarGranjas();
  const flujo = elegidas
    .map((id) => todas.find((g) => g.id === id)!)
    .flatMap((g) => {
      const ultima = granjas.find((x) => x.id === g.id)?.ultima;
      const ej = db.prepare("select id from ejecuciones where granja_id = ? order by creado desc limit 1").get(g.id) as { id: string } | undefined;
      const estados = ej ? (db.prepare("select nodo_id, estado from pasos where ejecucion_id = ?").all(ej.id) as { nodo_id: string; estado: string }[]) : [];
      return g.grafo.nodos
        .filter((n) => n.tipo === "agente" && n.agente)
        .map((n) => ({ granjaId: g.id, granja: g.nombre, agente: n.agente!, titulo: n.titulo, proveedor: n.proveedor, estado: estados.find((e) => e.nodo_id === n.id)?.estado ?? null, ejecucion: ultima?.creado ?? null }));
    });

  return {
    granjas,
    mapa: {
      departamentos: departamentos.map((d) => ({ nombre: d, eventos: porDepto.get(d) ?? 0 })),
      sinDepartamento: sinDepto,
      fuentes: [...fuentes.values()].sort((a, b) => b.eventos - a.eventos),
      destinos,
    },
    flujo,
  };
}
export type Panorama = ReturnType<typeof panoramaGranjas>;
