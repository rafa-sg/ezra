/** Prueba local solicitada por el propietario. Solo lectura pública y preparación;
 * los registros se crean con el backend de la app, sin editar data/ ni enviar medios. */
import { leerProduccion } from "../src/lib/produccion/almacen";
import { crearDesdeReceta, actualizarGranja, listarGranjas } from "../src/lib/granjas/almacen";
import { base } from "../src/lib/granjas/db";
import {
  iniciarEjecucion,
  estadoGranja,
  importarEncargo,
  completarManual,
} from "../src/lib/granjas/ejecucion";
import { procesarUno, dependenciasReales } from "../src/lib/granjas/trabajador";
import { leerPieza } from "../src/lib/granjas/publicacion";

async function main() {
  const encargoId = process.argv.find((a) => a.startsWith("--encargo="))?.slice(10);
  if (!encargoId || !process.argv.includes("--confirmar-prueba-local"))
    throw new Error(
      "Indica --encargo=UUID y --confirmar-prueba-local. Esta prueba no aprueba ni publica.",
    );
  const produccion = await leerProduccion();
  const encargo = produccion.encargos.find((e) => e.id === encargoId);
  if (!encargo?.resultado.trim())
    throw new Error("El encargo debe existir y tener un resultado manual para revisar.");
  const enCola = () =>
    base()
      .prepare("select ejecucion_id, tipo from trabajos where estado in ('pendiente','tomado')")
      .all() as { ejecucion_id: string | null; tipo: string }[];
  if (enCola().length)
    throw new Error(
      "Hay trabajos de otra ejecución. Termina o pausa ese trabajo antes de esta prueba.",
    );
  if (listarGranjas().some((g) => g.objetivo.includes(`Prueba local del encargo ${encargo.id}`)))
    throw new Error("La prueba de este encargo ya existe. Ábrela en Granjas; no se duplicó.");
  const receta = crearDesdeReceta("evento_verificado");
  const n = receta.grafo.nodos;
  const caza = n.find((x) => x.agente === "cazador")!;
  const texto = n.find((x) => x.agente === "descripcion")!;
  const hechos = n.find((x) => x.agente === "auditoria")!;
  const revision = n.find((x) => x.tipo === "revision")!;
  const publicar = n.find((x) => x.tipo === "publicacion")!;
  const fuente = {
    nombre: "Ficha oficial de El Salvador Travel",
    url: "https://elsalvador.travel/esp/event/noche-de-catrinas-concepcion-de-ataco/",
    imagen: "",
    nota: "Lectura pública. Año del anuncio original de Instagram e imagen todavía pendientes de verificación.",
  };
  const nodos = n
    .filter((x) => x.tipo !== "medios")
    .map((x) => ({
      ...x,
      proveedor: "manual" as const,
      ...(x.id === caza.id
        ? { encargoId: encargo.id, fuentes: [fuente], instrucciones: encargo.encargo }
        : {}),
      ...(x.id === texto.id
        ? {
            titulo: "Borrador de Instagram · pendiente de revisión",
            instrucciones: "Prepara una vista previa sin aprobar hechos ni derechos.",
          }
        : {}),
      ...(x.id === publicar.id
        ? { titulo: "Vista previa · no autorizar envío", canales: ["instagram" as const] }
        : {}),
    }));
  const conectar = (desde: string, hacia: string) => ({ id: crypto.randomUUID(), desde, hacia });
  // La vista previa puede prepararse mientras la rama de hechos espera revisión.
  // El publicador siempre exige aparte aprobación por hash y autorización de cuentas.
  const grafo = {
    nodos,
    aristas: [
      conectar(caza.id, hechos.id),
      conectar(caza.id, texto.id),
      conectar(hechos.id, revision.id),
      conectar(texto.id, revision.id),
      conectar(texto.id, publicar.id),
    ],
  };
  const granja = actualizarGranja(receta.id, receta.revision, {
    datos: {
      ...receta,
      nombre: "Primera prueba · Instagram",
      objetivo: `Prueba local del encargo ${encargo.id}. Fecha y derechos pendientes; no aprobar ni publicar.`,
      canales: ["instagram"],
      politicaFuentes: { dominios: ["elsalvador.travel"], maxFuentesPorPaso: 1 },
    },
    grafo,
  });
  const ejecucion = iniciarEjecucion(granja.id, {
    confirmarIA: false,
    usuario: "local:prueba-solicitada",
    encargos: new Map(produccion.encargos.map((e) => [e.id, e.version])),
  });
  const reales = await dependenciasReales();
  const dependencias = {
    ...reales,
    generar: async () => {
      throw new Error("Esta prueba no permite ejecutar IA.");
    },
    renderizar: async () => {
      throw new Error("Esta prueba no permite crear ni subir medios.");
    },
  };
  async function avanzar() {
    for (let i = 0; i < 25; i++) {
      const trabajos = enCola();
      if (trabajos.some((t) => t.tipo !== "paso" || t.ejecucion_id !== ejecucion.id))
        throw new Error("Apareció otro trabajo; la prueba se detuvo sin procesarlo.");
      if (!(await procesarUno("prueba-local-" + process.pid, { dependencias, concurrencia: 2 }))) {
        if (trabajos.some((t) => t.ejecucion_id === ejecucion.id)) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        return;
      }
    }
  }
  await avanzar();
  let detalle = estadoGranja(granja.id);
  const pasoCaza = detalle.ultima!.pasos.find((p) => p.nodoId === caza.id)!;
  if (pasoCaza.estado !== "esperando_manual")
    throw new Error("El cazador no está listo para importar: " + pasoCaza.estado);
  await importarEncargo(pasoCaza.id);
  await avanzar();
  detalle = estadoGranja(granja.id);
  const pasoTexto = detalle.ultima!.pasos.find((p) => p.nodoId === texto.id)!;
  const caption = encargo.resultado
    .match(/## Borrador de texto[^\n]*\n+([\s\S]*?)(?=\n## |$)/i)?.[1]
    ?.trim();
  if (!caption)
    throw new Error("No se encontró el texto del borrador; pega un resultado manual desde la app.");
  completarManual(pasoTexto.id, {
    contenido: caption,
    nota: "Texto manual del encargo vinculado. Fecha original e imagen pendientes de comprobación.",
  });
  await avanzar();
  detalle = estadoGranja(granja.id);
  const salida = detalle.ultima!.pasos.find((p) => p.nodoId === publicar.id)!;
  const pieza = salida.piezaId ? leerPieza(salida.piezaId) : null;
  const autorizaciones = (
    base()
      .prepare("select count(*) as n from autorizaciones where pieza_id = ?")
      .get(pieza?.id ?? "") as { n: number }
  ).n;
  const recibos = (
    base()
      .prepare("select count(*) as n from recibos where pieza_id = ?")
      .get(pieza?.id ?? "") as { n: number }
  ).n;
  if (!pieza || autorizaciones || recibos)
    throw new Error("La prueba no terminó con una vista previa sin envíos.");
  console.log(
    JSON.stringify(
      {
        granjaId: granja.id,
        ejecucionId: ejecucion.id,
        piezaId: pieza.id,
        hash: pieza.hash,
        estado: detalle.ultima!.estado,
        consultaFuente: detalle.artefactos
          .filter((a) => a.procedencia.origen === "fuentes")
          .map((a) => ({ id: a.id, contenido: JSON.parse(a.contenido) })),
        texto: pieza.contenido.textos.instagram,
        autorizaciones,
        recibos,
        iaEjecutada: false,
        mediosSubidos: false,
        pendiente:
          "Comprobar el anuncio original, fecha/año, derechos de imagen y cuentas de destino.",
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "La prueba se detuvo.");
  process.exitCode = 1;
});
