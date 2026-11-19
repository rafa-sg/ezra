/**
 * Escenas y ambientes para la imagen de referencia IA (editable). Solo descripciones genéricas:
 * nunca un edificio, estadio, recinto, artista ni marca concretos.
 */
export const escenasCategoria = {
  musica: "live concert stage with colored lights and haze, crowd silhouettes seen from behind",
  feria: "traditional fair with a ferris wheel, food stalls and string lights",
  religioso: "colonial church plaza decorated with papel picado, procession candles, fireworks in the sky",
  cultura: "cultural festival with artisan stands and folkloric decorations",
  gastronomia: "table with Salvadoran dishes (pupusas, curtido, traditional drinks) at an outdoor market",
  deporte: "{deporte}, no recognizable athletes",
  navidad: "plaza with a giant illuminated Christmas tree and lights",
  otro: "generic event venue in El Salvador with people seen from behind",
} as const;
export type Escena = keyof typeof escenasCategoria;

/** Deporte inferido del título o la descripción (palabras sin acentos, en minúsculas). */
export const deportes: { palabras: string[]; escena: string }[] = [
  { palabras: ["futbol", "f.c.", "fc", "liga", "copa", "jornada", "vs", "c.d.", "cd"], escena: "football pitch in a stadium at night with floodlights" },
  { palabras: ["surf", "surfing", "olas"], escena: "surf competition on Pacific waves with surfboards on the black sand beach" },
  { palabras: ["softbol", "softball", "beisbol", "baseball"], escena: "softball diamond with bases and an outfield fence" },
  { palabras: ["maraton", "carrera", "km", "kilometros", "running", "10k", "5k", "21k", "trail", "duatlon", "triatlon"], escena: "road running race course with start arch and cones" },
  { palabras: ["ciclismo", "pedales", "bicicleta", "mtb", "enduro", "downhill", "bike", "biker"], escena: "mountain bike trail through a pine forest" },
  { palabras: ["skate", "skateboarding", "patineta"], escena: "downhill skateboarding road curving down a green hill" },
  { palabras: ["basquet", "baloncesto", "basketball"], escena: "indoor basketball court with hoops" },
  { palabras: ["voleibol", "volleyball", "voley"], escena: "beach volleyball court with a net on the sand" },
  { palabras: ["natacion", "swimming"], escena: "outdoor swimming pool with lane ropes" },
  { palabras: ["boxeo", "box", "mma", "lucha"], escena: "empty boxing ring under spotlights" },
  { palabras: ["golf"], escena: "golf course green with a flag" },
  { palabras: ["tenis", "tennis", "padel"], escena: "tennis court with a net" },
];
export const deporteGenerico = "sports venue with an empty playing field";

/** Palabras de Navidad: activan la escena navideña aunque la fecha no sea diciembre. */
export const palabrasNavidad = ["navidad", "navideno", "navidena", "villa navidena", "desfile navideno", "arbol", "christmas", "nochebuena"];

/** Ambientes genéricos y seguros según el lugar o el departamento. */
export const ambientes: { palabras: string[]; ambiente: string }[] = [
  { palabras: ["playa", "beach", "surf city", "el tunco", "el zonte", "la libertad puerto", "herradura", "costa del sol", "el cuco", "las flores", "mizata", "el sunzal"], ambiente: "Pacific beach with volcanic black sand" },
  { palabras: ["centro historico", "catedral", "plaza libertad", "plaza barrios"], ambiente: "colonial architecture in a historic city center" },
  { palabras: ["apaneca", "ataco", "juayua", "ruta de las flores", "alegria", "perquin", "la palma", "san ignacio", "citala", "montana", "volcan", "bosque", "chalatenango", "morazan"], ambiente: "pine forest mountain town" },
  { palabras: ["lago", "coatepeque", "ilopango", "suchitlan"], ambiente: "volcanic crater lake shore" },
  { palabras: ["estadio", "cancha", "parque"], ambiente: "open-air venue in a Salvadoran city" },
];
export const ambientePueblo = "small Salvadoran town plaza at dusk";
export const ambienteCiudad = "modern Salvadoran city at night";

/** Detalles visuales genéricos que se pueden tomar de la descripción (español → inglés). */
export const detallesVisuales: { palabras: string[]; detalle: string }[] = [
  { palabras: ["pólvora", "polvora", "fuegos artificiales", "toritos pintos", "quema de toritos"], detalle: "fireworks" },
  { palabras: ["ruedas", "rueda de chicago", "juegos mecanicos"], detalle: "carnival ferris wheel" },
  { palabras: ["desfile", "desfiles", "carrozas"], detalle: "colorful parade" },
  { palabras: ["carnaval"], detalle: "carnival decorations" },
  { palabras: ["procesion", "procesiones"], detalle: "procession with candles" },
  { palabras: ["artesanias", "artesanal", "artesanos"], detalle: "handcraft stalls" },
  { palabras: ["cafe"], detalle: "coffee cups and coffee beans" },
  { palabras: ["coco", "cocos"], detalle: "fresh coconuts" },
  { palabras: ["flores"], detalle: "colorful flowers" },
  { palabras: ["tablas de surf", "surfboards"], detalle: "surfboards" },
  { palabras: ["luces", "iluminacion"], detalle: "string lights" },
  { palabras: ["mariachi", "marimba"], detalle: "traditional musicians seen from behind" },
  { palabras: ["comida", "gastronomica", "gastronomico", "platillos", "pupusas"], detalle: "local food stalls" },
];
/** Géneros musicales: si la descripción lo dice, se usa el género (nunca el artista). */
export const generosMusicales = ["salsa", "rock", "pop", "reggaeton", "metal", "jazz", "cumbia", "bachata", "merengue", "electronic", "electronica", "classical", "clasica", "opera", "orquesta", "trova", "banda", "hip hop", "rap", "punk", "indie", "tropical", "romantica"];
