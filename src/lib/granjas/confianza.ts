import { z } from "zod";

/**
 * Porcentaje de confianza de un evento (0–100). Parte del tipo de su mejor fuente y
 * suma o resta según coincidencias, datos por confirmar, contradicciones y antigüedad.
 * Es una ayuda para revisar: nunca aprueba ni descarta nada por sí sola.
 */
export const tiposFuente = ["organizador", "ticketera", "gobierno", "cuenta_red", "prensa", "agregador", "red_manual"] as const;
export type TipoFuente = (typeof tiposFuente)[number];
export const puntosTipo: Record<TipoFuente, number> = {
  organizador: 90,
  ticketera: 90,
  gobierno: 85,
  cuenta_red: 80,
  prensa: 65,
  agregador: 45,
  red_manual: 35,
};
/** Clasificación inicial; el propietario la cambia en «Confianza por dominio». */
export const dominiosConocidos: Record<string, TipoFuente> = {
  "smartticket.fun": "ticketera",
  "todoticketsv.com": "ticketera",
  "funcapital.com": "ticketera",
  "elsalvador.travel": "gobierno",
  "gob.sv": "gobierno",
  "elsalvador.com": "prensa",
  "laprensagrafica.com": "prensa",
  "elmundo.sv": "prensa",
  "diarioelsalvador.com": "prensa",
  "elsalvadortimes.com": "prensa",
  "ultimahora.sv": "prensa",
  "diario.elmundo.sv": "prensa",
};
/** Redes sociales: un enlace pegado a mano desde ellas vale 35. */
export const dominiosRedes = ["instagram.com", "facebook.com", "fb.com", "fb.me", "tiktok.com", "x.com", "twitter.com", "threads.net"];

export const ajusteDominioSchema = z.object({ tipo: z.enum(tiposFuente), puntos: z.number().int().min(0).max(100) });
export const confianzaDominiosSchema = z
  .record(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Dominio inválido."), ajusteDominioSchema)
  .refine((x) => Object.keys(x).length <= 200, "Máximo 200 dominios.");
export type ConfianzaDominios = z.infer<typeof confianzaDominiosSchema>;

export const dominioDe = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
};
const coincide = (host: string, dominio: string) => host === dominio || host.endsWith(`.${dominio}`);
const masEspecifico = <T>(host: string, tabla: Record<string, T>) =>
  Object.keys(tabla)
    .filter((d) => coincide(host, d))
    .sort((a, b) => b.length - a.length)[0];
export const esRedSocial = (host: string) => dominiosRedes.some((d) => coincide(host, d));

export type FuenteEvaluada = {
  url: string;
  via: "web" | "instagram" | "facebook" | "manual" | "desconocido";
  /** Cuenta de la red (si vino de una API) o vacío. */
  cuenta: string;
  /** Fecha de la publicación (post) si se conoce; si no, se usa la de lectura. */
  publicado: string | null;
  leido: string;
  /** Datos que esta fuente confirmó (fecha, hora, precio, lugar, titulo). */
  campos: string[];
  /** Lo que decía esta fuente (para coincidencias y contradicciones). */
  datos: Partial<Record<"fecha" | "hora" | "lugar" | "precio", string | null>>;
};
/** Tipo y puntos de una fuente según su vía, su dominio y los ajustes del propietario. */
export function clasificarFuente(f: Pick<FuenteEvaluada, "url" | "via">, ajustes: ConfianzaDominios = {}): { tipo: TipoFuente; puntos: number; dominio: string } {
  const dominio = dominioDe(f.url);
  if (f.via === "instagram" || f.via === "facebook") return { tipo: "cuenta_red", puntos: puntosTipo.cuenta_red, dominio };
  if (esRedSocial(dominio)) return { tipo: "red_manual", puntos: puntosTipo.red_manual, dominio };
  const propio = masEspecifico(dominio, ajustes);
  if (propio) return { tipo: ajustes[propio].tipo, puntos: ajustes[propio].puntos, dominio };
  const conocido = masEspecifico(dominio, dominiosConocidos);
  // Un dominio del gobierno que no se conoce también es gobierno.
  const tipo = conocido ? dominiosConocidos[conocido] : dominio.endsWith(".gob.sv") ? "gobierno" : "agregador";
  return { tipo, puntos: puntosTipo[tipo], dominio };
}

export type LineaDesglose = { concepto: string; puntos: number };
export type Confianza = { puntos: number; desglose: LineaDesglose[]; mejor: { url: string; tipo: TipoFuente } | null };
type EventoEvaluado = { fecha: string | null; fechaFin: string | null; hora: string | null; precio: string | null; lugar: string; municipio: string };

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** Dos lugares son compatibles si comparten una palabra significativa o uno contiene al otro. */
export function lugaresCompatibles(a: string, b: string) {
  const x = normal(a);
  const y = normal(b);
  if (!x || !y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  const vacias = new Set(["de", "del", "la", "el", "los", "las", "san", "centro", "parque", "plaza", "salvador"]);
  const px = new Set(x.split(" ").filter((p) => p.length > 2 && !vacias.has(p)));
  return y.split(" ").some((p) => px.has(p));
}
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 86_400_000;
/** Una fecha de otra fuente está dentro del evento (o a un día) si dura varios días. */
function fechaCompatible(evento: EventoEvaluado, otra: string) {
  if (!evento.fecha) return true;
  if (evento.fechaFin && otra >= evento.fecha && otra <= evento.fechaFin) return true;
  return dias(evento.fecha, otra) <= 1;
}
/** Origen independiente: el dominio (sin www.) o la cuenta de la red. */
const origenDe = (f: FuenteEvaluada) => (f.cuenta ? `${f.via}:${f.cuenta.toLowerCase()}` : dominioDe(f.url));

export function calcularConfianza(evento: EventoEvaluado, fuentes: FuenteEvaluada[], opciones: { hoy: string; ajustes?: ConfianzaDominios }): Confianza {
  const desglose: LineaDesglose[] = [];
  if (!fuentes.length) return { puntos: 0, desglose: [{ concepto: "Sin fuentes registradas", puntos: 0 }], mejor: null };
  const evaluadas = fuentes.map((f) => ({ f, ...clasificarFuente(f, opciones.ajustes) }));
  const mejor = evaluadas.reduce((a, b) => (b.puntos > a.puntos ? b : a));
  desglose.push({ concepto: `Mejor fuente: ${mejor.dominio || mejor.f.url} (${mejor.tipo})`, puntos: mejor.puntos });

  // +10: dos o más orígenes independientes coinciden en fecha y lugar.
  const fechaEvento = evento.fecha;
  const lugarEvento = [evento.lugar, evento.municipio].filter(Boolean).join(" ");
  const coinciden = new Set(
    evaluadas
      .filter(({ f }) => {
        const fecha = f.datos.fecha ?? (f.campos.includes("fecha") ? fechaEvento : null);
        if (!fecha || !fechaEvento || !fechaCompatible(evento, fecha)) return false;
        const lugar = f.datos.lugar ?? "";
        return !lugar || !lugarEvento || lugaresCompatibles(lugar, lugarEvento);
      })
      .map(({ f }) => origenDe(f)),
  );
  if (coinciden.size >= 2) desglose.push({ concepto: `${coinciden.size} fuentes independientes coinciden en fecha y lugar`, puntos: 10 });

  // −10 por cada dato por confirmar (hora, precio, lugar).
  if (!evento.hora) desglose.push({ concepto: "Hora por confirmar", puntos: -10 });
  if (!evento.precio) desglose.push({ concepto: "Precio por confirmar", puntos: -10 });
  if (!lugarEvento.trim()) desglose.push({ concepto: "Lugar por confirmar", puntos: -10 });

  // −20 si dos fuentes se contradicen (fecha, hora o lugar).
  const contradicciones: string[] = [];
  for (let i = 0; i < evaluadas.length; i++)
    for (let j = i + 1; j < evaluadas.length; j++) {
      const a = evaluadas[i].f.datos;
      const b = evaluadas[j].f.datos;
      if (origenDe(evaluadas[i].f) === origenDe(evaluadas[j].f)) continue;
      if (a.fecha && b.fecha && dias(a.fecha, b.fecha) > 1 && !(evento.fechaFin && [a.fecha, b.fecha].every((x) => fechaCompatible(evento, x!)))) contradicciones.push("fecha");
      if (a.hora && b.hora && a.hora !== b.hora) contradicciones.push("hora");
      if (a.lugar && b.lugar && !lugaresCompatibles(a.lugar, b.lugar)) contradicciones.push("lugar");
    }
  if (contradicciones.length) desglose.push({ concepto: `Fuentes que se contradicen (${[...new Set(contradicciones)].join(", ")})`, puntos: -20 });

  // −15 si la mejor fuente tiene más de 30 días (fecha de publicación o, si no se sabe, de lectura).
  const fechaMejor = (mejor.f.publicado ?? mejor.f.leido).slice(0, 10);
  if (fechaMejor && dias(fechaMejor, opciones.hoy) > 30 && fechaMejor < opciones.hoy) desglose.push({ concepto: "La fuente tiene más de 30 días", puntos: -15 });

  const puntos = Math.max(0, Math.min(100, desglose.reduce((s, l) => s + l.puntos, 0)));
  return { puntos, desglose, mejor: { url: mejor.f.url, tipo: mejor.tipo } };
}
export const nivelConfianza = (puntos: number) => (puntos >= 80 ? "alta" : puntos >= 50 ? "media" : "baja");
