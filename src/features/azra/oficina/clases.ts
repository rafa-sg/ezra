import type { Agente, Encargo } from "@/lib/produccion/modelo";
import { tipoResultado } from "@/lib/produccion/resumen-encargo";
import type { FarmPurpose } from "@/lib/granjas/purposes";

/**
 * Clases visuales de granja: cada una tiene su color de post-it y su estilo de setup en la oficina.
 * Es solo presentación: todavía no existe un vínculo guardado entre encargo y granja, así que el
 * encargo se ubica por el tipo de resultado de su agente.
 */
export const clases = ["virales", "clips", "eventos", "post", "carrusel", "otro"] as const;
export type Clase = (typeof clases)[number];

export type Tema = "gamerMorado" | "gamerCian" | "clasico" | "creativo";

export const infoClase: Record<
  Clase,
  { nombre: string; papel: [string, string, string]; fondo: string; tema: Tema; descripcion: string }
> = {
  virales: { nombre: "Videos virales", papel: ["#ece6ff", "#d9cffa", "#c4b6f2"], fondo: "#f6f4fd", tema: "gamerMorado", descripcion: "Busca lo que funciona en un tema y explica por qué" },
  clips: { nombre: "Clips", papel: ["#e6f5fc", "#c9e6f6", "#aed6ee"], fondo: "#f2f8fc", tema: "gamerCian", descripcion: "Corta tus videos en clips verticales con subtítulos" },
  eventos: { nombre: "Eventos de El Salvador", papel: ["#fff8cf", "#fbec9f", "#f4dc76"], fondo: "#fdfaea", tema: "clasico", descripcion: "Caza eventos y verifica cada fecha y lugar" },
  post: { nombre: "Post para Instagram", papel: ["#fdecf1", "#f9d1dc", "#f2b6c6"], fondo: "#fdf4f6", tema: "creativo", descripcion: "Texto e imagen listos para subir" },
  carrusel: { nombre: "Carrusel de un spot", papel: ["#eaf7ee", "#d1ecd8", "#b5dfc1"], fondo: "#f3f9f4", tema: "creativo", descripcion: "Láminas de un lugar con fotos reales" },
  otro: { nombre: "Otros encargos", papel: ["#f4f3f0", "#e8e6e0", "#d6d3ca"], fondo: "#f7f6f3", tema: "creativo", descripcion: "Encargos que todavía no tienen granja" },
};

export function claseDeAgente(agente: Agente): Clase {
  const t = tipoResultado(agente);
  if (t === "videos") return "virales";
  if (t === "video" || t === "guion") return "clips";
  if (t === "eventos") return "eventos";
  if (t === "post" || t === "imagen" || t === "texto") return "post";
  return "otro";
}

export function claseDePurpose(p: FarmPurpose): Clase {
  if (p === "clips") return "clips";
  if (p === "video") return "virales";
  if (p === "eventos_el_salvador") return "eventos";
  if (p === "carousel" || p === "tourist_guide") return "carrusel";
  if (p === "custom") return "otro";
  return "post";
}

export type EstadoNota = "fila" | "trabajando" | "revisar" | "aprobado" | "rechazado" | "cambios";

export function estadoNota(e: Pick<Encargo, "estado" | "notaCambios">, ejecutando: boolean): EstadoNota {
  if (ejecutando || e.estado === "preparando") return "trabajando";
  if (e.estado === "revision") return "revisar";
  if (e.estado === "aprobado") return "aprobado";
  if (e.estado === "rechazado") return "rechazado";
  return e.notaCambios ? "cambios" : "fila";
}

export const etiquetaNota: Record<EstadoNota, string> = {
  fila: "En fila",
  trabajando: "Trabajando",
  revisar: "Para revisar",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cambios: "Cambios pedidos",
};
