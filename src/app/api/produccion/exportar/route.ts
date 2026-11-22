import { administrador } from "@/lib/granjas/api";
import JSZip from "jszip";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
import { leerProduccion } from "@/lib/produccion/almacen";
import { construirEncargo } from "@/lib/produccion/modelo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await administrador("encargos");
    const id = new URL(request.url).searchParams.get("id");
    const produccion = await leerProduccion();
    const zip = new JSZip();
    if (!id) zip.file("produccion-spotmi.json", JSON.stringify(produccion, null, 2));
    else {
      const encargo = produccion.encargos.find((e) => e.id === id);
      if (!encargo) throw new WorkflowError("Encargo no encontrado.", 404);
      zip.file("encargo.md", construirEncargo(encargo));
      zip.file("resultado.txt", encargo.resultado);
      zip.file("revision.json", JSON.stringify(encargo, null, 2));
      zip.file(
        "LEEME.txt",
        `${encargo.estado === "aprobado" ? "VERSIÓN APROBADA" : "BORRADOR SIN APROBAR"}\nEl paquete contiene texto y referencias a medios; no descarga imágenes ajenas ni incluye un video renderizado.\nLa fecha prevista se interpreta en America/El_Salvador. No programa ni publica en ninguna red.\nUsa encargo.md con el proveedor elegido y pega el resultado en Ezra para revisarlo.\n`,
      );
    }
    return new Response(new Uint8Array(await zip.generateAsync({ type: "uint8array" })), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="spotmi-${id ? "encargo" : "respaldo-produccion"}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
