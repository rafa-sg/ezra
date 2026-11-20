import { base } from "../granjas/db";
import { listarGranjas } from "../granjas/almacen";
import { leerProduccion } from "./almacen";

/**
 * Lo que se relaciona con un encargo, solo por vínculos guardados (nunca por títulos parecidos):
 *  - eventos cuya fuente (principal o sumada) es exactamente una URL de las fuentes del encargo;
 *  - granjas cuyos pasos usan este encargo (nodo vinculado), con su última ejecución.
 */
export async function relacionesEncargo(id: string) {
  const encargo = (await leerProduccion()).encargos.find((e) => e.id === id);
  if (!encargo) return null;
  const urls = [...new Set(encargo.fuentes.map((f) => f.url))];
  const db = base();
  const eventos = urls.length
    ? (db
        .prepare(
          `select distinct e.id, e.titulo, e.fecha, e.departamento, e.estado, e.fuente_url as fuente
           from eventos e left join evento_fuentes f on f.evento_id = e.id
           where e.fuente_url in (${urls.map(() => "?").join(",")}) or f.url in (${urls.map(() => "?").join(",")})
           order by e.fecha`,
        )
        .all(...urls, ...urls) as { id: string; titulo: string; fecha: string | null; departamento: string | null; estado: string; fuente: string }[])
    : [];
  const granjas = listarGranjas()
    .filter((g) => g.grafo.nodos.some((n) => n.encargoId === id))
    .map((g) => {
      const ultima = db.prepare("select id, estado, creado from ejecuciones where granja_id = ? order by creado desc limit 1").get(g.id) as { id: string; estado: string; creado: string } | undefined;
      return { id: g.id, nombre: g.nombre, estado: g.estado, ultima: ultima ?? null };
    });
  return { eventos, granjas, fuentes: urls.length };
}
export type RelacionesEncargo = NonNullable<Awaited<ReturnType<typeof relacionesEncargo>>>;
