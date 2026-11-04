/**
 * Trabajador de granjas en un proceso aparte. Útil si el servidor de Next se
 * ejecuta con EZRA_GRANJAS_TRABAJADOR=0. Necesita la Mac encendida y despierta.
 */
import { iniciarTrabajador } from "../src/lib/granjas/trabajador";

process.env.EZRA_GRANJAS_TRABAJADOR = "1";
iniciarTrabajador();
console.log("Trabajador de granjas activo. Ctrl+C para detenerlo.");
setInterval(() => {}, 1 << 30);
