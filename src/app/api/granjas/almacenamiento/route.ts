import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import JSZip from "jszip";
import { errorApi, propietario } from "@/lib/granjas/api";
import { archivoBase, base, carpetaMedios, carpetaRespaldos, copiarBase } from "@/lib/granjas/db";
import { resumenCola } from "@/lib/granjas/cola";
import { dataDirectory } from "@/lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tamano = async (archivo: string) => (await stat(archivo).catch(() => null))?.size ?? 0;

/** Dónde vive cada cosa, sin rutas de secretos ni tokens. */
export async function GET(request: Request) {
  try {
    await propietario();
    if (new URL(request.url).searchParams.get("descargar") === "1") return respaldo();
    const db = base();
    const cuenta = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    const remotos = db
      .prepare("select canal, estado, count(*) as n from recibos group by canal, estado")
      .all() as { canal: string; estado: string; n: number }[];
    return Response.json({
      local: true,
      nube: false,
      zonaHoraria: "America/El_Salvador",
      rutas: {
        base: archivoBase,
        medios: carpetaMedios,
        respaldos: carpetaRespaldos,
        encargos: path.join(dataDirectory, "produccion-spotmi.json"),
      },
      bytes: { base: await tamano(archivoBase), medios: Number((db.prepare("select coalesce(sum(bytes), 0) as n from medios").get() as { n: number }).n) },
      conteos: {
        granjas: cuenta("select count(*) as n from granjas"),
        ejecuciones: cuenta("select count(*) as n from ejecuciones"),
        artefactos: cuenta("select count(*) as n from artefactos"),
        medios: cuenta("select count(*) as n from medios"),
        piezas: cuenta("select count(*) as n from piezas"),
        recibos: cuenta("select count(*) as n from recibos"),
      },
      cola: resumenCola(),
      remotos,
      trabajador: process.env.EZRA_GRANJAS_TRABAJADOR === "0" ? "desactivado en este servidor" : "dentro del servidor local",
    });
  } catch (error) {
    return errorApi(error);
  }
}

/** Respaldo sin tokens: la copia exportada borra credenciales y estados OAuth. */
async function respaldo() {
  const carpeta = await mkdtemp(path.join(tmpdir(), "ezra-respaldo-"));
  try {
    const copia = path.join(carpeta, "granjas.sqlite");
    copiarBase(copia);
    const limpia = new DatabaseSync(copia);
    limpia.exec("update conexiones set token_cifrado = null; delete from estados_oauth; vacuum;");
    limpia.close();
    const zip = new JSZip();
    zip.file("granjas.sqlite", await readFile(copia));
    zip.file(
      "LEEME.txt",
      `Respaldo de granjas de Ezra (${new Date().toISOString()}).\nIncluye granjas, ejecuciones, resultados, vistas previas y recibos. No incluye tokens: tras restaurar hay que volver a conectar las cuentas.\nLos archivos de imagen y video están en ${carpetaMedios} y deben copiarse aparte (sus sumas sha256 están en la tabla medios).\nPara restaurar: detén el servidor, guarda una copia de data/granjas/ y reemplaza granjas.sqlite.\n`,
    );
    return new Response(new Uint8Array(await zip.generateAsync({ type: "uint8array" })), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="ezra-granjas-respaldo.zip"',
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
