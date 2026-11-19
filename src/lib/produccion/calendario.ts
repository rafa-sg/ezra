import type { Encargo } from "./modelo";
import type { Evento } from "../granjas/eventos";
import { sumarDias } from "../granjas/tiempo";

/**
 * Exporta el calendario como iCalendar (RFC 5545). La fecha de un encargo es solo «prevista»:
 * cada entrada lo dice en su descripción. Los eventos aprobados van como día completo (o con su
 * hora confirmada). Horas de El Salvador (UTC−6, sin horario de verano) convertidas a UTC.
 */
const escapar = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Líneas de máximo 75 octetos (plegado del estándar). */
function plegar(linea: string) {
  const partes: string[] = [];
  let resto = linea;
  while (Buffer.byteLength(resto) > 75) {
    let corte = 75;
    while (Buffer.byteLength(resto.slice(0, corte)) > 75) corte--;
    partes.push(resto.slice(0, corte));
    resto = ` ${resto.slice(corte)}`;
  }
  partes.push(resto);
  return partes.join("\r\n");
}
const formato = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const utc = (localSv: string, minutos = 0) => formato(new Date(Date.parse(`${localSv}:00-06:00`) + minutos * 60000));
const dia = (d: string) => d.replace(/-/g, "");
export function calendarioIcs(encargos: Encargo[], eventos: Evento[], ahora = new Date()) {
  const sello = formato(ahora);
  const lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ezra//Spotmi//ES", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Ezra · Spotmi", "X-WR-TIMEZONE:America/El_Salvador"];
  for (const e of encargos.filter((x) => x.fechaPrevista)) {
    lineas.push(
      "BEGIN:VEVENT",
      `UID:encargo-${e.id}@ezra.local`,
      `DTSTAMP:${sello}`,
      `DTSTART:${utc(e.fechaPrevista)}`,
      `DTEND:${utc(e.fechaPrevista, 30)}`,
      `SUMMARY:${escapar(`[Encargo · ${e.estado}] ${e.titulo}`)}`,
      `DESCRIPTION:${escapar(`Fecha prevista en Ezra (versión ${e.version}). No programa ni publica en ninguna red.\n${e.canales.join(", ")}`)}`,
      "END:VEVENT",
    );
  }
  for (const e of eventos.filter((x) => x.fecha)) {
    const lugar = [e.lugar, e.municipio, e.departamento].filter(Boolean).join(", ");
    lineas.push(
      "BEGIN:VEVENT",
      `UID:evento-${e.id}@ezra.local`,
      `DTSTAMP:${sello}`,
      ...(e.hora ? [`DTSTART:${utc(`${e.fecha}T${e.hora}`)}`] : [`DTSTART;VALUE=DATE:${dia(e.fecha!)}`, `DTEND;VALUE=DATE:${dia(sumarDias(e.fechaFin ?? e.fecha!, 1))}`]),
      `SUMMARY:${escapar(e.titulo)}`,
      ...(lugar ? [`LOCATION:${escapar(lugar)}`] : []),
      `DESCRIPTION:${escapar(`Evento aprobado en Ezra. Fuente: ${e.fuenteUrl}${e.precio ? `\nPrecio: ${e.precio}` : ""}`)}`,
      `URL:${e.fuenteUrl}`,
      "END:VEVENT",
    );
  }
  lineas.push("END:VCALENDAR");
  return `${lineas.map(plegar).join("\r\n")}\r\n`;
}
