import type { Media, Post, Workspace } from "./model";
import { WorkflowError } from "./workflow";

// Mirrors the "Agregar evento" form of spotmi-web (src/features/events/esquema.ts)
// and its `eventos` bucket limits. Path (a) in DECISIONS: a package to copy by
// hand; nothing is sent to the site from here.
export const siteCategories = [
  "festival",
  "concierto",
  "feria",
  "deportivo",
  "cultural",
  "gastronomico",
  "religioso",
  "otro",
] as const;
export const siteDepartments = [
  "Ahuachapán",
  "Cabañas",
  "Chalatenango",
  "Cuscatlán",
  "La Libertad",
  "La Paz",
  "La Unión",
  "Morazán",
  "San Miguel",
  "San Salvador",
  "San Vicente",
  "Santa Ana",
  "Sonsonate",
  "Usulután",
] as const;
const siteImageTypes = ["image/jpeg", "image/png", "image/webp"];
const siteImageLimit = 5 * 1024 * 1024;
const pending = "(completar: ezrá no guarda este dato)";

/** Only approved, non-demo versions may leave ezrá for the site. */
export function siteEventPackage(post: Post, state: Workspace) {
  if (post.demo)
    throw new WorkflowError(
      "Los ejemplos no se envían al sitio. Duplícalo como borrador real primero.",
      422,
    );
  if (!["approved", "planned", "published"].includes(post.status))
    throw new WorkflowError("Solo una versión aprobada se exporta para el sitio.", 422);
  const media = state.media.filter((m) => post.mediaIds.includes(m.id));
  const usable = media.filter((m) => siteImageTypes.includes(m.mime) && m.size <= siteImageLimit);
  // The site stores a single cover image per event.
  const photo: Media | undefined = usable[0];
  const skipped = media
    .filter((m) => m !== photo)
    .map((m) =>
      !siteImageTypes.includes(m.mime)
        ? `${m.originalName}: el sitio solo acepta fotos JPEG, PNG o WebP.`
        : m.size > siteImageLimit
          ? `${m.originalName}: supera 5 MB, el límite del sitio.`
          : `${m.originalName}: el sitio guarda una sola foto de portada.`,
    );
  const warnings = [
    post.title.trim().length < 3 || post.title.trim().length > 160
      ? "El título debe tener entre 3 y 160 caracteres en el sitio."
      : "",
    post.caption.length > 2000
      ? "La descripción supera 2000 caracteres: el sitio la rechazará. Acórtala."
      : "",
    photo ? "" : "No hay una foto válida para la portada (JPEG, PNG o WebP de hasta 5 MB).",
  ].filter(Boolean);
  const sources = state.sources.filter((s) => post.sourceIds.includes(s.id));
  const text = `EVENTO PARA SPOTMI-WEB · copiar en «Agregar evento»
El sitio lo guarda como propuesta sin verificar: no será público hasta que alguien lo modere.
${warnings.length ? `\nAVISOS\n${warnings.map((w) => `- ${w}`).join("\n")}\n` : ""}
Título: ${post.title}
Fecha de inicio: ${pending}
Fecha de fin (opcional): ${pending}
Categoría: ${pending}
  Opciones: ${siteCategories.join(", ")}
Departamento: ${pending}
  Opciones: ${siteDepartments.join(", ")}
Municipio: ${pending}
Lugar: ${pending}
Horario: ${pending}
Organizador: ${pending}
Contacto: ${pending}
Sitio web (https://): ${pending}
Precio desde (USD): ${pending}

Descripción:
${post.caption}

Foto de portada: ${photo ? `foto/${photo.filename}` : "ninguna"}
El formulario del sitio todavía no sube fotos: envía la foto a quien modera el evento.
${skipped.length ? `\nArchivos no incluidos\n${skipped.map((s) => `- ${s}`).join("\n")}\n` : ""}
Fuentes verificadas en ezrá (para quien modera)
${sources.map((s) => `- ${s.name}: ${s.url} (revisión: ${s.reviewedOn || "pendiente"})`).join("\n") || "- ninguna"}

No inventes datos: deja en blanco lo que no hayas comprobado.
`;
  return { text, photo };
}
