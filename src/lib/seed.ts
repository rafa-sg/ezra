import { type Post, type Workspace, today } from "./model";

export function createSeed(now = new Date()): Workspace {
  const day = today(now);
  const at = now.toISOString();
  const base: Post = {
    id: "",
    title: "",
    caption: "",
    channel: "instagram",
    format: "photo",
    status: "draft",
    sourceIds: ["demo-spotmi"],
    mediaIds: [],
    artwork: "coast",
    plannedAt: "",
    publishedUrl: "",
    checks: { facts: false, rights: false, brand: false },
    rejectionReason: "",
    demo: true,
    createdAt: at,
    updatedAt: at,
  };
  const nextDay = (offset: number) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  return {
    schemaVersion: 1,
    revision: 0,
    brand: {
      name: "Spotmi",
      website: "https://spotmi.com.sv",
      description: "Descubrir El Salvador, una buena historia a la vez.",
      audience: "Personas que buscan conocer El Salvador con curiosidad y respeto por lo local.",
      voice: "Cercana, útil y cálida. Español salvadoreño natural, sin exageraciones.",
      allowedTopics:
        "Naturaleza, pueblos, gastronomía, cultura y turismo responsable en El Salvador.",
      excludedTopics:
        "Rumores, política partidaria, promociones no verificadas y actividades que dañen el entorno.",
      rules:
        "Comprobar precios, horarios y fechas antes de publicar. Citar fuentes. No presentar imágenes generadas como fotografías reales. Pedir autorización para usar medios de terceros.",
    },
    sources: [
      {
        id: "demo-spotmi",
        name: "Archivo editorial de Spotmi",
        url: "https://spotmi.com.sv",
        kind: "owned",
        status: "approved",
        topics: "Historias y material propio",
        notes:
          "Fuente de demostración para practicar el flujo. No se ha consultado ni verificado el sitio.",
        reviewedOn: day,
        expiresOn: "",
        demo: true,
      },
      {
        id: "demo-tourism",
        name: "Portal de turismo de El Salvador",
        url: "https://elsalvador.travel",
        kind: "information",
        status: "pending",
        topics: "Destinos, cultura y naturaleza",
        notes:
          "Marcador de ejemplo pendiente de revisión. Autorizar solo después de comprobar el contenido y sus condiciones de uso.",
        reviewedOn: "",
        expiresOn: "",
        demo: true,
      },
      {
        id: "demo-mitur",
        name: "Ministerio de Turismo",
        url: "https://www.mitur.gob.sv",
        kind: "information",
        status: "pending",
        topics: "Información institucional",
        notes: "Marcador de ejemplo. No se ha rastreado este sitio.",
        reviewedOn: "",
        expiresOn: "",
        demo: true,
      },
    ],
    posts: [
      {
        ...base,
        id: "demo-coast",
        title: "El mar también es una pausa",
        caption:
          "Hay días que piden bajar el ritmo y escuchar el mar. 🌊\n\n¿Qué rincón de la costa salvadoreña te gustaría descubrir? Cuéntanos y construyamos juntos la próxima ruta.\n\n#Spotmi #ElSalvador #TurismoLocal",
        status: "review",
        artwork: "coast",
        plannedAt: `${nextDay(1)}T17:30`,
      },
      {
        ...base,
        id: "demo-volcano",
        title: "Una mirada hacia lo alto",
        caption:
          "Una historia para quienes disfrutan los paisajes de El Salvador. 🌿\n\nAntes de visitar un destino natural, consulta sus condiciones de acceso y acompáñate de información actualizada.\n\n#Spotmi #TurismoResponsable",
        status: "draft",
        artwork: "volcano",
        format: "carousel",
      },
      {
        ...base,
        id: "demo-town",
        title: "Historias entre calles y colores",
        caption:
          "Cada pueblo tiene una historia que merece escucharse. ✨\n\nApoya a los negocios locales y descubre los detalles a tu propio paso. ¿Cuál es tu recuerdo favorito de un paseo por El Salvador?\n\n#Spotmi #HistoriasLocales",
        channel: "facebook",
        status: "planned",
        artwork: "town",
        plannedAt: `${nextDay(3)}T10:00`,
        checks: { facts: true, rights: true, brand: true },
      },
      {
        ...base,
        id: "demo-coffee",
        title: "Una conversación, un buen café",
        caption:
          "Una taza puede ser el comienzo de una gran conversación. ☕\n\nQueremos conocer las historias detrás de nuestros sabores locales. ¿Qué lugar te gustaría recomendarnos?\n\n#Spotmi #SaboresDeElSalvador",
        status: "approved",
        artwork: "coffee",
        checks: { facts: true, rights: true, brand: true },
      },
    ],
    media: [],
    history: [
      {
        id: "welcome",
        at,
        title: "Tu estudio está listo",
        detail:
          "Se cargaron cuatro publicaciones de ejemplo. Las ilustraciones y fechas sirven para practicar; no hay redes conectadas.",
      },
    ],
  };
}
