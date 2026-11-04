import type { Granja, Grafo, Nodo, TipoNodo } from "@/lib/granjas/modelo";
import type { Ejecucion, Paso } from "@/lib/granjas/ejecucion";
import type { Artefacto } from "@/lib/granjas/almacen";
import type { Conexion } from "@/lib/granjas/conexiones";
import type { ContenidoPieza } from "@/lib/granjas/pieza";
import type { Agente } from "@/lib/produccion/modelo";

export type MedioResumen = {
  id: string;
  mime: string;
  nombre: string;
  ancho: number | null;
  alto: number | null;
  duracion: number | null;
  licencia: string;
  generado: boolean;
  bytes: number;
  origen?: string;
};
export type Resumen = {
  granjas: Granja[];
  recetas: { clave: string; nombre: string; objetivo: string; formato: string; pasos: number }[];
  encargos: { id: string; titulo: string; agente: Agente; version: number; estado: string; origen: string }[];
  medios: MedioResumen[];
  ia: { astra: boolean; claude: boolean; gemini: boolean };
};
export type Recibo = {
  id: string;
  canal: "instagram" | "facebook" | "tiktok" | "spotmi";
  cuenta: string;
  estado: string;
  remotoId: string | null;
  enlace: string | null;
  error: string;
  creado: string;
  actualizado: string;
};
export type VistaPieza = {
  pieza: { id: string; version: number; hash: string; contenido: ContenidoPieza; creado: string; actualizado: string };
  aprobada: boolean;
  medios: (MedioResumen & { sha256: string })[];
  recibos: Recibo[];
  versiones: { version: number; hash: string; creado: string }[];
};
export type Detalle = {
  granja: Granja;
  ejecuciones: Omit<Ejecucion, "instantanea">[];
  ultima: (Ejecucion & { pasos: Paso[] }) | null;
  artefactos: Artefacto[];
  aprobaciones: { pasoId: string; vigente: boolean }[];
  faltantes: Record<string, string[]>;
  piezas: VistaPieza[];
  ahora: string;
};
export type ConexionesRespuesta = { conexiones: Conexion[]; claveTokens: boolean; redireccionBase: string; versionGraph: string };
export type { Granja, Grafo, Nodo, Paso, Artefacto, Conexion, TipoNodo, ContenidoPieza };

export async function pedir<T>(ruta: string, cuerpo?: object): Promise<T> {
  const respuesta = await fetch(ruta, cuerpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) } : undefined);
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error || `Error ${respuesta.status}`);
  return datos as T;
}
export const nodoNuevo = (tipo: TipoNodo, posicion: { x: number; y: number }, agente: Agente | null = null, titulo = ""): Nodo => ({
  id: crypto.randomUUID(),
  tipo,
  agente: tipo === "agente" ? (agente ?? "cazador") : null,
  titulo: titulo || (tipo === "agente" ? "Nuevo agente" : tipo === "medios" ? "Medios autorizados" : tipo === "render" ? "Render vertical" : tipo === "revision" ? "Tu revisión" : "Publicar"),
  instrucciones: "",
  proveedor: "manual",
  fuentes: [],
  encargoId: null,
  medios: [],
  canales: tipo === "publicacion" ? ["spotmi"] : [],
  segundosPorImagen: 4,
  posicion,
});
