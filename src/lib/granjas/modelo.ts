import { z } from "zod";
import { agentes, canales, fuenteSchema, type Agente } from "../produccion/modelo";
import { farmPurposes } from "./purposes";

export const tiposArtefacto = ["investigacion", "guion", "texto", "imagen", "video", "revision"] as const;
export const tiposNodo = ["agente", "medios", "render", "revision", "publicacion"] as const;
export const proveedoresNodo = ["astra", "claude", "gemini", "manual", "local"] as const;
/** Especialistas que trabajan sin IA, con código local (verificar, redactar con plantilla, diseñar). */
export const agentesLocales: Agente[] = ["verificador", "redactor_ig", "disenador_post"];
export const formatos = ["publicacion", "carrusel", "video"] as const;
export type TipoArtefacto = (typeof tiposArtefacto)[number];
export type TipoNodo = (typeof tiposNodo)[number];
export type Canal = (typeof canales)[number];

/** Estados visibles de un paso; solo «recolectando» y «generando» indican trabajo real en curso. */
export const estadosPaso = [
  "inactivo",
  "esperando",
  "en_cola",
  "recolectando",
  "generando",
  "esperando_manual",
  "en_revision",
  "aprobado",
  "completado",
  "esperando_autorizacion",
  "desactualizado",
  "bloqueado",
  "fallido",
  "cancelado",
] as const;
export type EstadoPaso = (typeof estadosPaso)[number];
export const estadosTerminalesExito: EstadoPaso[] = ["completado", "aprobado"];
export const estadosTrabajando: EstadoPaso[] = ["recolectando", "generando"];

const id = z.string().uuid();
const coordenada = z.number().finite().min(-5000).max(5000);
export const nodoSchema = z.object({
  id,
  tipo: z.enum(tiposNodo),
  agente: z.enum(agentes).nullable().default(null),
  titulo: z.string().trim().min(1).max(160),
  instrucciones: z.string().max(8000).default(""),
  proveedor: z.enum(proveedoresNodo).default("manual"),
  fuentes: z.array(fuenteSchema).max(20).default([]),
  encargoId: id.nullable().default(null),
  medios: z.array(id).max(20).default([]),
  canales: z
    .array(z.enum(canales))
    .max(4)
    .refine((v) => new Set(v).size === v.length)
    .default([]),
  segundosPorImagen: z.number().int().min(1).max(15).default(4),
  // Búsqueda de Google (solo Gemini). Sin valor: activada en el cazador y apagada en el resto.
  // Es opcional a propósito: así los pasos que ya existían conservan su huella y sus resultados.
  busqueda: z.boolean().optional(),
  posicion: z.object({ x: coordenada, y: coordenada }),
});
export const aristaSchema = z.object({ id, desde: id, hacia: id });
export const grafoSchema = z.object({
  nodos: z.array(nodoSchema).max(40),
  aristas: z.array(aristaSchema).max(120),
});
export const politicaFuentesSchema = z.object({
  dominios: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Dominio inválido."),
    )
    .max(40),
  maxFuentesPorPaso: z.number().int().min(1).max(10).default(5),
});
export const datosGranjaSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  objetivo: z.string().trim().max(2000).default(""),
  formato: z.enum(formatos),
  canales: z
    .array(z.enum(canales))
    .max(4)
    .refine((v) => new Set(v).size === v.length),
  politicaFuentes: politicaFuentesSchema,
  ajustes: z
    .object({
      zonaHoraria: z.literal("America/El_Salvador").default("America/El_Salvador"),
      purpose: z.enum(farmPurposes).optional(),
      customPurpose: z.string().trim().max(60).optional(),
      // Granja «Eventos de El Salvador»: cuántos eventos nuevos por día y cuántos días hacia delante.
      eventos: z
        .object({ maxPorDia: z.number().int().min(1).max(30).default(10), diasAdelante: z.number().int().min(1).max(60).default(14) })
        .optional(),
      // Granja «Post para Instagram»: cuenta de destino (solo texto) y posts por día.
      instagram: z
        .object({ cuenta: z.string().trim().min(2).max(60).default("@spotmi.sv"), postsPorDia: z.number().int().min(1).max(20).default(3) })
        .optional(),
    })
    .default({ zonaHoraria: "America/El_Salvador" }),
});
export type Nodo = z.infer<typeof nodoSchema>;
/** Si el paso usará Google Search: solo con Gemini; por defecto, solo el cazador. */
export const busquedaActiva = (nodo: Pick<Nodo, "proveedor" | "agente" | "busqueda">) =>
  nodo.proveedor === "gemini" && (nodo.busqueda ?? nodo.agente === "cazador");
export type Arista = z.infer<typeof aristaSchema>;
export type Grafo = z.infer<typeof grafoSchema>;
export type DatosGranja = z.infer<typeof datosGranjaSchema>;
export type Granja = DatosGranja & {
  id: string;
  grafo: Grafo;
  estado: "activa" | "pausada" | "archivada";
  revision: number;
  receta: string | null;
  creado: string;
  actualizado: string;
};

const salidasAgente: Record<Agente, TipoArtefacto> = {
  cazador: "investigacion",
  guion: "guion",
  edicion: "guion",
  retencion: "revision",
  shorts: "guion",
  miniatura: "texto",
  comentarios: "texto",
  semana: "texto",
  descripcion: "texto",
  capitulos: "texto",
  auditoria: "revision",
  verificador: "investigacion",
  redactor_ig: "texto",
  disenador_post: "imagen",
};
const todos = [...tiposArtefacto];
export function aceptaNodo(nodo: Nodo): TipoArtefacto[] {
  if (nodo.tipo === "medios") return [];
  if (nodo.tipo === "render") return ["imagen", "video", "guion"];
  if (nodo.tipo === "publicacion") return ["texto", "imagen", "video", "revision"];
  return todos;
}
/** La revisión deja pasar lo que recibe, una vez aprobado. */
export function salidasNodo(nodo: Nodo, grafo: Grafo, visitados = new Set<string>()): TipoArtefacto[] {
  if (nodo.tipo === "agente") return [salidasAgente[nodo.agente ?? "cazador"]];
  if (nodo.tipo === "medios") return ["imagen", "video"];
  if (nodo.tipo === "render") return ["video"];
  if (nodo.tipo === "publicacion") return [];
  if (visitados.has(nodo.id)) return [];
  visitados.add(nodo.id);
  const tipos = new Set<TipoArtefacto>(["revision"]);
  for (const arista of grafo.aristas.filter((a) => a.hacia === nodo.id)) {
    const origen = grafo.nodos.find((n) => n.id === arista.desde);
    if (origen) for (const t of salidasNodo(origen, grafo, visitados)) tipos.add(t);
  }
  return [...tipos];
}

export type ProblemaGrafo = {
  codigo:
    | "nodo_duplicado"
    | "nodo_inexistente"
    | "arista_duplicada"
    | "bucle"
    | "ciclo"
    | "incompatible"
    | "agente_faltante";
  mensaje: string;
  nodoId?: string;
  aristaId?: string;
};
export function validarGrafo(grafo: Grafo): ProblemaGrafo[] {
  const problemas: ProblemaGrafo[] = [];
  const ids = new Set<string>();
  for (const nodo of grafo.nodos) {
    if (ids.has(nodo.id))
      problemas.push({ codigo: "nodo_duplicado", mensaje: "Hay dos pasos con el mismo identificador.", nodoId: nodo.id });
    ids.add(nodo.id);
    if (nodo.tipo === "agente" && !nodo.agente)
      problemas.push({ codigo: "agente_faltante", mensaje: `Elige la especialidad de «${nodo.titulo}».`, nodoId: nodo.id });
  }
  const pares = new Set<string>();
  for (const arista of grafo.aristas) {
    const desde = grafo.nodos.find((n) => n.id === arista.desde);
    const hacia = grafo.nodos.find((n) => n.id === arista.hacia);
    if (!desde || !hacia) {
      problemas.push({ codigo: "nodo_inexistente", mensaje: "Una conexión apunta a un paso que ya no existe.", aristaId: arista.id });
      continue;
    }
    if (arista.desde === arista.hacia) {
      problemas.push({ codigo: "bucle", mensaje: `«${desde.titulo}» no puede conectarse consigo mismo.`, aristaId: arista.id });
      continue;
    }
    const par = `${arista.desde}>${arista.hacia}`;
    if (pares.has(par))
      problemas.push({ codigo: "arista_duplicada", mensaje: `Ya existe la conexión «${desde.titulo}» → «${hacia.titulo}».`, aristaId: arista.id });
    pares.add(par);
    const ofrece = salidasNodo(desde, grafo);
    const acepta = aceptaNodo(hacia);
    if (!ofrece.some((t) => acepta.includes(t)))
      problemas.push({
        codigo: "incompatible",
        mensaje: `«${hacia.titulo}» no puede usar lo que entrega «${desde.titulo}» (${ofrece.join(", ") || "nada"}).`,
        aristaId: arista.id,
      });
  }
  // Kahn: si quedan pasos sin ordenar, hay un ciclo.
  const grado = new Map(grafo.nodos.map((n) => [n.id, 0]));
  for (const a of grafo.aristas) if (grado.has(a.hacia) && grado.has(a.desde)) grado.set(a.hacia, grado.get(a.hacia)! + 1);
  const cola = [...grado].filter(([, g]) => g === 0).map(([n]) => n);
  let ordenados = 0;
  while (cola.length) {
    const actual = cola.shift()!;
    ordenados++;
    for (const a of grafo.aristas.filter((x) => x.desde === actual && grado.has(x.hacia))) {
      grado.set(a.hacia, grado.get(a.hacia)! - 1);
      if (grado.get(a.hacia) === 0) cola.push(a.hacia);
    }
  }
  if (ordenados < grado.size)
    problemas.push({ codigo: "ciclo", mensaje: "Las conexiones forman un ciclo. Una granja debe avanzar siempre hacia delante." });
  return problemas;
}
export function ordenTopologico(grafo: Grafo): string[] {
  const grado = new Map(grafo.nodos.map((n) => [n.id, 0]));
  for (const a of grafo.aristas) grado.set(a.hacia, (grado.get(a.hacia) ?? 0) + 1);
  const cola = grafo.nodos.filter((n) => grado.get(n.id) === 0).map((n) => n.id);
  const orden: string[] = [];
  while (cola.length) {
    const actual = cola.shift()!;
    orden.push(actual);
    for (const a of grafo.aristas.filter((x) => x.desde === actual)) {
      grado.set(a.hacia, grado.get(a.hacia)! - 1);
      if (grado.get(a.hacia) === 0) cola.push(a.hacia);
    }
  }
  return orden;
}
export const antecesores = (grafo: Grafo, nodoId: string) =>
  grafo.aristas.filter((a) => a.hacia === nodoId).map((a) => a.desde);
export function descendientes(grafo: Grafo, desde: string[]): Set<string> {
  const vistos = new Set<string>();
  const pila = [...desde];
  while (pila.length) {
    const actual = pila.pop()!;
    for (const a of grafo.aristas.filter((x) => x.desde === actual))
      if (!vistos.has(a.hacia)) {
        vistos.add(a.hacia);
        pila.push(a.hacia);
      }
  }
  return vistos;
}

/** JSON canónico: el mismo contenido produce siempre el mismo hash. */
export function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor && typeof valor === "object")
    return `{${Object.keys(valor as object)
      .sort()
      .filter((k) => (valor as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonico((valor as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(valor);
}
/** Lo que falta para que un paso pueda ejecutarse, en lenguaje claro. */
export function faltantesNodo(nodo: Nodo, grafo: Grafo, contexto: { geminiHabilitado: boolean }) {
  const faltan: string[] = [];
  const entradas = antecesores(grafo, nodo.id);
  if (nodo.tipo === "agente") {
    if (nodo.proveedor === "gemini" && !contexto.geminiHabilitado)
      faltan.push("Gemini está deshabilitado en este estudio. Elige Astra, Claude o trabajo manual.");
    // Con la búsqueda de Google el cazador puede trabajar sin fuentes; sin ella, necesita al menos una.
    if (nodo.agente === "cazador" && !busquedaActiva(nodo) && !nodo.fuentes.length && !entradas.length)
      faltan.push(
        nodo.proveedor === "gemini"
          ? "Sin búsqueda de Google, agrega al menos una fuente (página oficial de eventos) para que el cazador trabaje."
          : "Agrega al menos una fuente para que el cazador investigue.",
      );
    if (nodo.agente !== "cazador" && !entradas.length && !nodo.instrucciones.trim())
      faltan.push("Conecta un paso anterior o escribe las instrucciones.");
    if (nodo.proveedor === "local" && !agentesLocales.includes(nodo.agente ?? "cazador"))
      faltan.push("Este especialista no trabaja sin IA. Elige Gemini, Astra, Claude o trabajo manual.");
    if (nodo.proveedor === "local" && nodo.agente === "verificador" && !entradas.length)
      faltan.push("Conecta el cazador al verificador.");
  }
  if (nodo.tipo === "medios" && !nodo.medios.length)
    faltan.push("Sube al menos una imagen o video propio o con permiso.");
  if (nodo.tipo === "render") {
    const tipos = entradas.flatMap((e) => {
      const n = grafo.nodos.find((x) => x.id === e);
      return n ? salidasNodo(n, grafo) : [];
    });
    if (!tipos.some((t) => t === "imagen" || t === "video"))
      faltan.push("Conecta un paso de medios con imágenes o videos para renderizar.");
  }
  if (nodo.tipo === "revision" && !entradas.length) faltan.push("Conecta lo que vas a revisar.");
  if (nodo.tipo === "publicacion") {
    if (!nodo.canales.length) faltan.push("Elige al menos un destino.");
    const tipos = entradas.flatMap((e) => {
      const n = grafo.nodos.find((x) => x.id === e);
      return n ? salidasNodo(n, grafo) : [];
    });
    if (!tipos.includes("texto")) faltan.push("Conecta un texto o descripción para la publicación.");
  }
  return faltan;
}

/* ── Recetas iniciales: instrucciones y espacios vacíos, sin eventos ni resultados inventados ── */
type Paso = Omit<Partial<Nodo>, "id" | "posicion"> & { clave: string; tipo: TipoNodo; titulo: string };
export type Receta = {
  clave:
    | "evento_verificado"
    | "carrusel_spot"
    | "video_vertical"
    | "instagram_post"
    | "facebook_post"
    | "tourist_guide"
    | "eventos_el_salvador"
    | "post_instagram_eventos";
  datos: DatosGranja;
  pasos: Paso[];
  conexiones: [string, string][];
};
const fuentesOficiales = [
  { nombre: "Agenda de turismo de El Salvador (MITUR)", url: "https://elsalvador.travel/esp/eventos/", imagen: "", nota: "" },
  { nombre: "Ministerio de Cultura", url: "https://www.cultura.gob.sv/feed/", imagen: "", nota: "" },
  { nombre: "Instituto Salvadoreño de Turismo (ISTU)", url: "https://istu.gob.sv/feed/", imagen: "", nota: "" },
];
const dominiosOficiales = ["elsalvador.travel", "cultura.gob.sv", "istu.gob.sv", "spotmi.com.sv"];
const hueco = "[Completa aquí: tema, lugar o fecha que quieres trabajar]";
export const recetas: Receta[] = [
  {
    clave: "evento_verificado",
    datos: {
      nombre: "Publicación de evento verificado",
      objetivo: `Anunciar un evento próximo con fecha confirmada en una fuente oficial. ${hueco}`,
      formato: "publicacion",
      canales: ["spotmi", "instagram", "facebook"],
      politicaFuentes: { dominios: dominiosOficiales, maxFuentesPorPaso: 5 },
      ajustes: { zonaHoraria: "America/El_Salvador" },
    },
    pasos: [
      { clave: "caza", tipo: "agente", agente: "cazador", titulo: "Encontrar el evento", fuentes: fuentesOficiales, instrucciones: `Busca eventos de los próximos 30 días. ${hueco}. Entrega fecha, lugar, organizador y enlace original.` },
      { clave: "hechos", tipo: "agente", agente: "auditoria", titulo: "Revisar hechos y vigencia", instrucciones: "Contrasta fecha, año, lugar y organizador con la fuente. Marca lo que no se pudo comprobar." },
      { clave: "texto", tipo: "agente", agente: "descripcion", titulo: "Redactar textos por canal", instrucciones: "Texto breve para cada canal elegido, con fuente y sin precios ni horarios no confirmados." },
      { clave: "medios", tipo: "medios", titulo: "Imagen propia o con permiso" },
      { clave: "revision", tipo: "revision", titulo: "Tu revisión" },
      { clave: "publicar", tipo: "publicacion", titulo: "Publicar versión aprobada", canales: ["spotmi", "instagram", "facebook"] },
    ],
    conexiones: [["caza", "hechos"], ["hechos", "texto"], ["texto", "revision"], ["medios", "revision"], ["revision", "publicar"]],
  },
  {
    clave: "carrusel_spot",
    datos: {
      nombre: "Carrusel de un spot",
      objetivo: `Presentar un lugar verificado en varias imágenes. ${hueco}`,
      formato: "carrusel",
      canales: ["instagram", "facebook"],
      politicaFuentes: { dominios: dominiosOficiales, maxFuentesPorPaso: 5 },
      ajustes: { zonaHoraria: "America/El_Salvador" },
    },
    pasos: [
      { clave: "caza", tipo: "agente", agente: "cazador", titulo: "Datos del spot", fuentes: fuentesOficiales.slice(0, 1), instrucciones: `Reúne datos verificables del lugar. ${hueco}` },
      { clave: "portada", tipo: "agente", agente: "miniatura", titulo: "Orden y portada del carrusel", instrucciones: "Propón el orden de las imágenes aportadas y el texto de portada. No inventes fotografías." },
      { clave: "texto", tipo: "agente", agente: "descripcion", titulo: "Texto del carrusel", instrucciones: "Texto por canal con créditos de imagen y fuente." },
      { clave: "medios", tipo: "medios", titulo: "Fotos del carrusel" },
      { clave: "auditoria", tipo: "agente", agente: "auditoria", titulo: "Auditoría final", instrucciones: "Revisa hechos, derechos de imagen y tono." },
      { clave: "revision", tipo: "revision", titulo: "Tu revisión" },
      { clave: "publicar", tipo: "publicacion", titulo: "Publicar versión aprobada", canales: ["instagram", "facebook"] },
    ],
    conexiones: [["caza", "portada"], ["portada", "texto"], ["texto", "auditoria"], ["auditoria", "revision"], ["texto", "revision"], ["medios", "revision"], ["revision", "publicar"]],
  },
  {
    clave: "video_vertical",
    datos: {
      nombre: "Video vertical",
      objetivo: `Video corto vertical a partir de material propio o autorizado. ${hueco}`,
      formato: "video",
      canales: ["instagram", "tiktok", "facebook"],
      politicaFuentes: { dominios: dominiosOficiales, maxFuentesPorPaso: 5 },
      ajustes: { zonaHoraria: "America/El_Salvador" },
    },
    pasos: [
      { clave: "caza", tipo: "agente", agente: "cazador", titulo: "Investigación", fuentes: fuentesOficiales.slice(0, 1), instrucciones: hueco },
      { clave: "hechos", tipo: "agente", agente: "auditoria", titulo: "Revisión de hechos", instrucciones: "Separa hechos comprobados de propuestas creativas." },
      { clave: "guion", tipo: "agente", agente: "guion", titulo: "Guion", instrucciones: "Guion de 20 a 45 segundos con gancho, desarrollo y cierre." },
      { clave: "montaje", tipo: "agente", agente: "edicion", titulo: "Hoja de montaje", instrucciones: "Orden de planos usando solo el material aportado." },
      { clave: "medios", tipo: "medios", titulo: "Clips e imágenes autorizados" },
      { clave: "render", tipo: "render", titulo: "Render vertical", segundosPorImagen: 4 },
      { clave: "texto", tipo: "agente", agente: "descripcion", titulo: "Texto y portada", instrucciones: "Descripción por canal y propuesta de portada." },
      { clave: "auditoria", tipo: "agente", agente: "auditoria", titulo: "Auditoría", instrucciones: "Revisa el video renderizado, el texto y los derechos." },
      { clave: "revision", tipo: "revision", titulo: "Tu revisión" },
      { clave: "publicar", tipo: "publicacion", titulo: "Publicar versión aprobada", canales: ["instagram", "tiktok", "facebook"] },
    ],
    conexiones: [["caza", "hechos"], ["hechos", "guion"], ["guion", "montaje"], ["montaje", "render"], ["medios", "render"], ["render", "auditoria"], ["guion", "texto"], ["texto", "auditoria"], ["auditoria", "revision"], ["render", "revision"], ["texto", "revision"], ["revision", "publicar"]],
  },
];
// Dedicated starting points share the existing reviewed publication flow.
for (const channel of ["instagram", "facebook"] as const) {
  const original = recetas[0];
  recetas.push({
    ...original,
    clave: `${channel}_post`,
    datos: {
      ...original.datos,
      nombre: channel === "instagram" ? "Post de Instagram" : "Post de Facebook",
      objetivo: "Preparar una publicación con texto, medios autorizados y revisión. Completa el tema en las instrucciones del primer paso.",
      canales: [channel],
      ajustes: { ...original.datos.ajustes, purpose: `${channel}_post` },
    },
    pasos: original.pasos.map((step) => ({
      ...step,
      ...(step.clave === "caza" ? { titulo: "Tema y fuentes", fuentes: [], instrucciones: "Escribe el tema y registra las fuentes autorizadas. Separa hechos comprobados de ideas." } : {}),
      ...(step.tipo === "publicacion" ? { canales: [channel] } : {}),
    })),
  });
}
recetas.push({
  clave: "tourist_guide",
  datos: {
    nombre: "Guía · Antiguo Cuscatlán",
    objetivo: "Preparar un cuaderno de campo con equipo, misiones, entrevistas, lugares, ideas y fuentes verificadas.",
    formato: "publicacion",
    canales: [],
    politicaFuentes: { dominios: dominiosOficiales, maxFuentesPorPaso: 5 },
    ajustes: { zonaHoraria: "America/El_Salvador", purpose: "tourist_guide" },
  },
  pasos: [],
  conexiones: [],
});

/** Fuentes iniciales de la granja de eventos: MITUR y sitios del Gobierno (incluye alcaldías *.gob.sv).
 * Ticketeras y recintos los agrega el propietario en Personalizar; nunca redes sociales. */
// Carteleras: MITUR y Gobierno, y las ticketeras. Todoticket y Fun Capital quedan permitidas para
// enlaces de boletos, pero hoy no se pueden leer desde Ezra (500 a nuestro agente; página solo con JavaScript).
export const dominiosEventos = ["elsalvador.travel", "gob.sv", "smartticket.fun", "todoticketsv.com", "funcapital.com"];
const fuentesEventos = [...fuentesOficiales, { nombre: "Cartelera de Smart Ticket", url: "https://www.smartticket.fun/es", imagen: "", nota: "" }];
recetas.unshift({
  clave: "eventos_el_salvador",
  datos: {
    nombre: "Eventos de El Salvador",
    objetivo:
      "Cada día, encontrar eventos de los próximos 45 días en El Salvador (conciertos, festivales, ferias, fiestas patronales, deportes y gastronomía) y dejarlos en la bandeja Eventos para tu revisión.",
    formato: "publicacion",
    canales: ["spotmi"],
    politicaFuentes: { dominios: dominiosEventos, maxFuentesPorPaso: 5 },
    ajustes: { zonaHoraria: "America/El_Salvador", purpose: "eventos_el_salvador", eventos: { maxPorDia: 10, diasAdelante: 45 } },
  },
  pasos: [
    {
      clave: "caza",
      tipo: "agente",
      agente: "cazador",
      titulo: "Cazador de eventos",
      proveedor: "gemini",
      instrucciones: "",
      // Si la búsqueda de Google no está disponible, el cazador trabaja con estas carteleras.
      fuentes: fuentesEventos,
    },
    { clave: "verif", tipo: "agente", agente: "verificador", titulo: "Verificador", proveedor: "local" },
  ],
  conexiones: [["caza", "verif"]],
});
recetas.splice(1, 0, {
  clave: "post_instagram_eventos",
  datos: {
    nombre: "Post para Instagram",
    objetivo:
      "Tomar eventos aprobados sin post y preparar, para cada uno, el texto y una imagen 1080×1350 para subirlos a mano a Instagram.",
    formato: "publicacion",
    canales: ["instagram"],
    politicaFuentes: { dominios: [], maxFuentesPorPaso: 5 },
    ajustes: { zonaHoraria: "America/El_Salvador", purpose: "post_instagram_eventos", instagram: { cuenta: "@spotmi.sv", postsPorDia: 3 } },
  },
  pasos: [
    {
      clave: "redactor",
      tipo: "agente",
      agente: "redactor_ig",
      titulo: "Redactor de Instagram",
      proveedor: "gemini",
      instrucciones: "Un texto por evento aprobado, con fecha, lugar, «Más info en spotmi» y 5–10 hashtags. Solo datos confirmados.",
    },
    {
      clave: "diseno",
      tipo: "agente",
      agente: "disenador_post",
      titulo: "Diseñador de post",
      proveedor: "local",
      instrucciones: "Imagen 1080×1350 con la plantilla de Spotmi. Fondo oficial solo con permiso registrado.",
    },
  ],
  conexiones: [["redactor", "diseno"]],
});
export function grafoDeReceta(receta: Receta): Grafo {
  const ids = new Map(receta.pasos.map((p) => [p.clave, crypto.randomUUID()]));
  const niveles = new Map<string, number>();
  for (const p of receta.pasos) niveles.set(p.clave, 0);
  for (let i = 0; i < receta.pasos.length; i++)
    for (const [a, b] of receta.conexiones) niveles.set(b, Math.max(niveles.get(b)!, niveles.get(a)! + 1));
  const filas = new Map<number, number>();
  return grafoSchema.parse({
    nodos: receta.pasos.map(({ clave, ...paso }) => {
      const nivel = niveles.get(clave)!;
      const fila = filas.get(nivel) ?? 0;
      filas.set(nivel, fila + 1);
      return {
        proveedor: "manual",
        ...paso,
        id: ids.get(clave),
        posicion: { x: 40 + nivel * 250, y: 40 + fila * 190 },
      };
    }),
    aristas: receta.conexiones.map(([a, b]) => ({ id: crypto.randomUUID(), desde: ids.get(a), hacia: ids.get(b) })),
  });
}
