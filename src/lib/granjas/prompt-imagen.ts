import {
  ambienteCiudad,
  ambientePueblo,
  ambientes,
  deporteGenerico,
  deportes,
  detallesVisuales,
  escenasCategoria,
  generosMusicales,
  palabrasNavidad,
  type Escena,
} from "./escenas-categoria";

/**
 * Prompt de la imagen de referencia IA, construido solo con frases fijas en inglés elegidas a partir
 * de los campos del evento (categoría, título, descripción, lugar, fecha y hora). Ningún texto del
 * evento se copia al prompt: así no pueden colarse artistas, marcas, patrocinadores ni recintos.
 */
export const VERSION_PLANTILLA = "2026-11-19.1";
export const NEGATIVO =
  "no text, no letters, no numbers, no logos, no watermarks, no brand names, no recognizable people or celebrities, no faces in close-up, no flags with text, no posters";

export type EventoPrompt = {
  titulo: string;
  descripcion: string;
  categoria: string;
  lugar: string;
  municipio: string;
  departamento: string;
  fecha: string | null;
  hora: string | null;
};
export type PromptImagen = { prompt: string; negativo: string; version: string; escena: Escena };

const normal = (t: string) =>
  ` ${t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
const contiene = (texto: string, palabras: string[]) => palabras.some((p) => texto.includes(` ${p} `));

const animos: Record<Escena, string> = {
  musica: "energetic, euphoric",
  feria: "festive, family-friendly",
  religioso: "festive, family-friendly",
  cultura: "lively, colorful",
  gastronomia: "warm, appetizing",
  deporte: "dynamic, competitive",
  navidad: "magical, festive",
  otro: "lively, welcoming",
};
const generoEnIngles: Record<string, string> = {
  electronica: "electronic",
  clasica: "classical",
  orquesta: "orchestral",
  romantica: "romantic ballad",
  banda: "brass band",
};
const ciudades = ["san salvador", "santa tecla", "antiguo cuscatlan", "san miguel", "santa ana", "soyapango", "mejicanos", "nuevo cuscatlan"];

/** Escena según la categoría; diciembre o palabras navideñas activan la navideña en eventos generales. */
function escenaDe(e: EventoPrompt, texto: string): Escena {
  const categoria = (["musica", "feria", "religioso", "cultura", "gastronomia", "deporte", "otro"] as const).find((c) => c === e.categoria) ?? "otro";
  if (contiene(texto, palabrasNavidad)) return "navidad";
  // Diciembre: la escena navideña reemplaza a las generales (feria, cultura, otro); las específicas se conservan.
  if (e.fecha?.slice(5, 7) === "12" && ["feria", "cultura", "otro"].includes(categoria)) return "navidad";
  return categoria;
}
function momentoDe(e: EventoPrompt, escena: Escena) {
  if (e.hora) {
    const h = Number(e.hora.slice(0, 2));
    return h < 17 ? "daytime" : h < 19 ? "evening" : "night";
  }
  return ["musica", "religioso", "feria", "navidad"].includes(escena) ? "evening" : "daytime";
}
function ambienteDe(e: EventoPrompt, escena: Escena) {
  const lugar = normal(`${e.lugar} ${e.municipio} ${e.departamento} ${e.titulo}`);
  const conocido = ambientes.find((a) => contiene(lugar, a.palabras.map((p) => normal(p).trim())));
  if (conocido) return conocido.ambiente;
  if (["religioso", "feria", "navidad"].includes(escena)) return ambientePueblo;
  return contiene(normal(`${e.municipio} ${e.lugar}`), ciudades) ? ambienteCiudad : ambientePueblo;
}

export function promptImagenEvento(e: EventoPrompt): PromptImagen {
  const titulo = normal(e.titulo);
  const descripcion = normal(e.descripcion);
  const escena = escenaDe(e, `${titulo}${descripcion}`);
  let textoEscena: string = escenasCategoria[escena];
  if (escena === "deporte") {
    const deporte = deportes.find((d) => contiene(`${titulo}${descripcion}`, d.palabras));
    textoEscena = textoEscena.replace("{deporte}", deporte?.escena ?? deporteGenerico);
  }
  if (escena === "musica") {
    // Solo el género, y solo si la descripción lo dice; nunca el artista.
    const genero = generosMusicales.find((g) => contiene(descripcion, [g]));
    if (genero) textoEscena = textoEscena.replace("live concert", `live ${generoEnIngles[genero] ?? genero} concert`);
  }
  const detalles: string[] = [];
  for (const d of detallesVisuales) {
    if (detalles.length >= 2) break;
    const primera = d.detalle.split(" ").at(-1)!;
    if (contiene(descripcion, d.palabras.map((p) => normal(p).trim())) && !textoEscena.includes(primera) && !detalles.includes(d.detalle)) detalles.push(d.detalle);
  }
  const prompt = [
    "Editorial photograph for an events listing in El Salvador.",
    `Scene: ${textoEscena}.`,
    `Setting: ${ambienteDe(e, escena)}.`,
    `Time: ${momentoDe(e, escena)}.`,
    `Mood: ${animos[escena]}.`,
    "Composition: vertical 4:5, main subject centered, empty space in the upper third, shallow depth of field.",
    "Style: realistic, natural colors, warm light, high quality, no frames.",
    ...(detalles.length ? [`Details: ${detalles.join(", ")}.`] : []),
  ].join(" ");
  return { prompt, negativo: NEGATIVO, version: VERSION_PLANTILLA, escena };
}
/** Lo que se envía al modelo: la API de imagen de Gemini no tiene campo negativo, va dentro del prompt. */
export const textoParaModelo = (p: { prompt: string; negativo: string }) => `${p.prompt} Avoid: ${p.negativo}.`;

/* ── Revisión de un prompt editado a mano ── */
const marcas = ["coca-cola", "coca cola", "pepsi", "pilsener", "golden", "suprema", "tigo", "claro", "movistar", "digicel", "mcdonald", "pollo campero", "campero", "pizza hut", "starbucks", "nike", "adidas", "red bull", "monster", "bancoagricola", "banco agricola", "cuscatlan", "davivienda", "smart ticket", "smartticket", "todoticket", "fun capital", "ticketmaster", "spotify", "netflix", "samsung", "apple", "toyota", "walmart", "super selectos", "la constancia", "salvacola", "tropical"];
const permitidas = new Set(["Editorial", "El", "Salvador", "Salvadoran", "Scene", "Setting", "Time", "Mood", "Composition", "Style", "Details", "Avoid", "Pacific", "Christmas", "I", "A", "The"]);
/**
 * Avisos sobre un prompt editado: nombres propios (palabras del título que no son genéricas o
 * palabras en mayúscula fuera de inicio de frase), marcas conocidas, @usuarios y #etiquetas.
 */
export function revisarPrompt(texto: string, evento: { titulo: string; lugar?: string }): string[] {
  const avisos: string[] = [];
  const t = normal(texto);
  for (const m of marcas) if (t.includes(` ${m} `)) avisos.push(`Marca: «${m}».`);
  if (/[@#][\p{L}\p{N}_.]+/u.test(texto)) avisos.push("Tiene @usuarios o #etiquetas.");
  const genericas = new Set(
    "de del la el los las en y a al con por para un una fiesta fiestas patronal patronales festival feria concierto tour gira show noche gran el salvador san santa 2025 2026 2027 vs world series edicion navidad navideno navidena villa desfile carnaval".split(
      " ",
    ),
  );
  const delTitulo = normal(evento.titulo).trim().split(" ").filter((p) => p.length > 2 && !genericas.has(p));
  // Una palabra del título que no es genérica y aparece en el prompt suele ser un nombre (artista, recinto, marca).
  for (const p of delTitulo.filter((x) => t.includes(` ${x} `))) avisos.push(`Palabra del título: «${p}» (¿nombre de artista, recinto o marca?).`);
  const mayusculas = [...texto.matchAll(/(?<![.:!?]\s|^)\b([A-ZÁÉÍÓÚÑ][\p{L}]+)/gu)].map((m) => m[1]).filter((w) => !permitidas.has(w));
  for (const w of [...new Set(mayusculas)].slice(0, 5)) avisos.push(`Nombre propio posible: «${w}».`);
  return [...new Set(avisos)];
}
