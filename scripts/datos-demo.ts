/**
 * Datos ficticios para un entorno de desarrollo nuevo (por ejemplo, el contenedor de Docker).
 *
 * Uso: EZRA_DATA_DIR=/ruta/de/prueba npm run demo:datos -- tu-correo+clerk_test@example.com
 *
 * - Exige EZRA_DATA_DIR explícito y se niega a escribir en la carpeta data/ del proyecto,
 *   para que nunca mezcle ejemplos con datos reales.
 * - El correo queda como administración (el mismo paso que `npm run access:owner`). Ese correo
 *   debe iniciar sesión y verificarse en Clerk: no hay atajos de acceso.
 * - Todo lo que crea dice «(ejemplo)» y usa direcciones de example.test. No llama a IA,
 *   no lee sitios ni publica nada. Si ya hay eventos, no agrega otros.
 */
import path from "node:path";

const correo = process.argv[2];
const carpeta = process.env.EZRA_DATA_DIR;
if (!carpeta) {
  console.error(
    "Falta EZRA_DATA_DIR. Este comando solo escribe en una carpeta de datos de prueba.",
  );
  process.exit(1);
}
if (path.resolve(carpeta) === path.resolve("data")) {
  console.error(
    "EZRA_DATA_DIR apunta a data/ del proyecto. Usa otra carpeta para los datos de prueba.",
  );
  process.exit(1);
}

async function main() {
  const { configureOwner } = await import("../src/lib/access-store");
  const db = await import("../src/lib/granjas/db");
  const ev = await import("../src/lib/granjas/eventos");
  const ig = await import("../src/lib/granjas/instagram");
  const tiempo = await import("../src/lib/granjas/tiempo");
  const granjas = await import("../src/lib/granjas/almacen");
  const prod = await import("../src/lib/produccion/almacen");
  const modelo = await import("../src/lib/produccion/modelo");

  if (correo) {
    await configureOwner(correo);
    console.log(`Administración: ${correo}`);
  }

  const { n } = db.base().prepare("select count(*) as n from eventos").get() as { n: number };
  if (n > 0) {
    console.log(`Ya hay ${n} evento(s) en ${carpeta}; no se agregaron ejemplos.`);
    return;
  }

  const granja = granjas.crearDesdeReceta("eventos_el_salvador");
  granjas.crearDesdeReceta("post_instagram_eventos");
  const url = (s: string) => `https://ejemplo.test/eventos/${s}`;
  const nuevo = (titulo: string, departamento: string, dias: number, slug: string) =>
    ev.crearEvento({
      titulo: `${titulo} (ejemplo)`,
      fecha: tiempo.sumarDias(tiempo.diaLocal(), dias),
      hora: null,
      lugar: "Lugar de ejemplo",
      municipio: "",
      departamento,
      categoria: "cultura",
      precio: null,
      boletosUrl: null,
      fuenteUrl: url(slug),
      confirmadoEn: {},
      sugerencias: {},
      descripcion: "Evento ficticio para probar Ezra en desarrollo.",
      imagenUrl: null,
      notaVerificacion: "",
      granjaId: granja.id,
      ejecucionId: null,
    });

  const festival = nuevo("Festival de ejemplo", "Cuscatlán", 3, "festival");
  const aprobado = ev.aprobarEvento(festival.id, ev.leerEvento(festival.id).revision);
  ig.crearPost({
    eventoId: aprobado.id,
    granjaId: null,
    ejecucionId: null,
    cuenta: "@cuenta.ejemplo",
    texto: ig.textoPlantilla(aprobado),
    textoOrigen: "plantilla",
    nota: "",
  });
  nuevo("Concierto de ejemplo", "San Salvador", 5, "concierto");
  nuevo("Feria de ejemplo", "La Libertad", 8, "feria");

  const fuente = (slug: string) => [
    { nombre: "Fuente de ejemplo", url: url(slug), imagen: "", nota: "" },
  ];
  let revision = modelo.crearEncargo({
    titulo: "Post del Festival de ejemplo",
    agente: "redactor_ig",
    proveedor: "claude",
    canales: ["instagram"],
    encargo: "Un post breve que invite al festival.",
    resultado: "",
    fuentes: fuente("festival"),
    fechaPrevista: "",
  });
  revision = modelo.anotar(
    {
      ...revision,
      estado: "revision",
      resultado: "Texto de ejemplo para revisar.",
      origenResultado: "claude",
    },
    "generado",
  );
  const pendiente = modelo.crearEncargo({
    titulo: "Descripción del Concierto de ejemplo",
    agente: "descripcion",
    proveedor: "claude",
    canales: ["spotmi"],
    encargo: "Descripción breve.",
    resultado: "",
    fuentes: fuente("concierto"),
    fechaPrevista: "",
  });
  const actual = await prod.leerProduccion();
  await prod.guardarProduccion(actual.revision, (a) => ({
    ...a,
    encargos: [revision, pendiente, ...a.encargos],
  }));

  console.log(`Listo: 3 eventos, 1 post y 2 encargos de ejemplo en ${carpeta}.`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
