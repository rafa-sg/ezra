import { createHash } from "node:crypto";
import { canonico, type Grafo, type Nodo } from "./modelo";

export const sha256 = (texto: string | Buffer) => createHash("sha256").update(texto).digest("hex");
/** Lo que define el trabajo de un paso: cambiarlo invalida sus resultados y los de sus derivados. */
export function configNodo(nodo: Nodo) {
  const resto: Partial<Nodo> = { ...nodo };
  delete resto.posicion;
  delete resto.titulo;
  return sha256(canonico(resto));
}
export function nodosCambiados(antes: Grafo, despues: Grafo): string[] {
  const previos = new Map(antes.nodos.map((n) => [n.id, configNodo(n)]));
  const cambiados = despues.nodos
    .filter((n) => previos.get(n.id) !== configNodo(n))
    .map((n) => n.id);
  const aristas = (g: Grafo) => new Set(g.aristas.map((a) => `${a.desde}>${a.hacia}`));
  const a1 = aristas(antes);
  const a2 = aristas(despues);
  for (const a of despues.aristas) if (!a1.has(`${a.desde}>${a.hacia}`)) cambiados.push(a.hacia);
  for (const a of antes.aristas)
    if (!a2.has(`${a.desde}>${a.hacia}`) && despues.nodos.some((n) => n.id === a.hacia)) cambiados.push(a.hacia);
  return [...new Set(cambiados)];
}

