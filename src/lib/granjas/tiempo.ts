/**
 * Calendario de El Salvador (UTC−6 todo el año, sin horario de verano desde 1987).
 * Los días, semanas y meses del presupuesto y del horario se cuentan en esta zona.
 */
export const ZONA = "America/El_Salvador";
const formato = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function partes(fecha: Date) {
  const p = Object.fromEntries(formato.formatToParts(fecha).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, semana: dias.indexOf(p.weekday) };
}
/** AAAA-MM-DD en El Salvador. */
export const diaLocal = (fecha: Date = new Date()) => partes(fecha).dia;
/** AAAA-MM en El Salvador. */
export const mesLocal = (fecha: Date = new Date()) => partes(fecha).dia.slice(0, 7);
/** HH:MM (24 h) en El Salvador. */
export const horaLocal = (fecha: Date = new Date()) => partes(fecha).hora;
/** 0 = domingo … 6 = sábado, en El Salvador. */
export const diaSemanaLocal = (fecha: Date = new Date()) => partes(fecha).semana;
/** Instante en que empieza ese día (o esa hora) en El Salvador. */
export const instanteLocal = (dia: string, hora = "00:00") => new Date(`${dia}T${hora}:00-06:00`);
export function sumarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Lunes de la semana local que contiene la fecha. */
export function inicioSemanaLocal(fecha: Date = new Date()) {
  const semana = diaSemanaLocal(fecha);
  return sumarDias(diaLocal(fecha), -((semana + 6) % 7));
}
export function siguienteMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}
export const diaValido = (dia: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(dia) && new Date(`${dia}T12:00:00Z`).toISOString().slice(0, 10) === dia;
