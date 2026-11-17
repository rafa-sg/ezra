import { z } from "zod";

const shortText = z.string().trim().max(180);
const text = z.string().max(6000);
const date = z.union([z.literal(""), z.iso.date()]);
const httpsUrl = z.union([z.literal(""), z.url().max(2000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Usa un enlace https sin credenciales.")]);
const id = z.string().uuid();
export const guideChannels = ["instagram", "facebook", "reel", "tiktok", "guide"] as const;
export const guideChecksSchema = z.object({ facts: z.boolean(), rights: z.boolean(), brand: z.boolean(), route: z.boolean() });
export const guideContentSchema = z.object({
  title: shortText.min(2),
  destination: shortText.min(2),
  subtitle: shortText,
  visitDate: date,
  audience: z.enum(["team", "visitors"]),
  coverMediaId: id.nullable(),
  coverCredit: z.string().max(500),
  overview: text,
  history: text,
  questions: text,
  routeNotes: text,
  fieldNotes: text,
  team: z.array(z.object({ id, name: shortText.min(1), role: shortText })).max(12),
  missions: z.array(z.object({
    id, title: shortText.min(1), question: z.string().max(500), notes: z.string().max(1500), completedBy: z.array(id).max(12),
  })).max(48),
  stops: z.array(z.object({
    id, name: shortText.min(1), category: shortText, notes: z.string().max(1500), sourceUrl: httpsUrl,
    checkedOn: date, verified: z.boolean(),
  })).max(40),
  ideas: z.array(z.object({
    id, channel: z.enum(guideChannels), hook: shortText, shots: z.string().max(1500), closing: z.string().max(500),
    owner: shortText, status: z.enum(["idea", "recorded", "editing", "ready"]),
  })).max(30),
  sources: z.array(z.object({ id, title: shortText.min(1), url: httpsUrl, consultedOn: date })).max(40),
}).superRefine((guide, ctx) => {
  for (const key of ["team", "missions", "stops", "ideas", "sources"] as const) {
    if (new Set(guide[key].map((item) => item.id)).size !== guide[key].length)
      ctx.addIssue({ code: "custom", path: [key], message: "Hay elementos repetidos." });
  }
  const members = new Set(guide.team.map((member) => member.id));
  guide.missions.forEach((mission, index) => {
    if (new Set(mission.completedBy).size !== mission.completedBy.length || mission.completedBy.some((member) => !members.has(member)))
      ctx.addIssue({ code: "custom", path: ["missions", index, "completedBy"], message: "Revisa los integrantes de esta misión." });
  });
});
export type GuideContent = z.infer<typeof guideContentSchema>;
export type GuideChecks = z.infer<typeof guideChecksSchema>;
export type GuideVersion = {
  farmId: string; version: number; content: GuideContent; hash: string; checks: Partial<GuideChecks>; approvedAt: string | null; createdAt: string;
};
export type GuideResponse = { guide: GuideVersion | null; history: { version: number; approvedAt: string | null; createdAt: string }[] };
export const emptyGuideChecks = (): GuideChecks => ({ facts: false, rights: false, brand: false, route: false });

/** Editorial prompts only: no businesses, historical claims, opening times or prices are seeded. */
export function createGuideTemplate(destination = "Antiguo Cuscatlán"): GuideContent {
  const prompts = [
    ["Una persona que vive aquí", "¿Qué historia de este lugar te gustaría que más personas conocieran?"],
    ["Una pupusería", "¿Qué hace especial su forma de preparar las pupusas?"],
    ["Un negocio familiar", "¿Cómo empezó el negocio y qué los hace seguir?"],
    ["Una persona que nos visita", "¿Qué te trajo hoy y qué te sorprendió?"],
    ["Un emprendimiento", "¿Qué problema o sueño dio origen a tu proyecto?"],
    ["Alguien que cocina", "¿Qué sabor te gustaría que recordara quien viene?"],
    ["Un artista o artesano", "¿Qué historia hay detrás de lo que hacés?"],
    ["Una persona mayor", "¿Qué recuerdo de este lugar te gustaría compartir?"],
    ["Una recomendación local", "¿Qué rincón recomendarías y por qué?"],
    ["Un detalle que pasa desapercibido", "¿Qué significa este detalle para las personas del lugar?"],
    ["Una historia de comunidad", "¿Qué une a quienes viven o trabajan aquí?"],
    ["Un hallazgo del día", "¿Qué descubrimos que queremos seguir investigando?"],
  ];
  return {
    title: `${destination}, historias por descubrir`, destination,
    subtitle: "Un día para explorar, escuchar y contar.", visitDate: "", audience: "team", coverMediaId: null, coverCredit: "",
    overview: "", history: "", routeNotes: "", fieldNotes: "",
    questions: "Entrada: Hola, somos Spotmi y estamos conociendo el lugar. ¿Tenés un minuto para conversar?\n\nPara profundizar: ¿Por qué? ¿Me das un ejemplo? ¿Qué pasó después?\n\nAntes de grabar o publicar voz e imagen, pedí permiso y anotá su alcance. Conversar no equivale a autorizar una publicación. Si la persona no desea participar, agradecele y seguí.\n\nCierre: ¿Qué nombre te gustaría que apareciera? ¿Qué información debemos confirmar antes de compartirla?",
    team: [], missions: prompts.map(([title, question]) => ({ id: crypto.randomUUID(), title, question, notes: "", completedBy: [] })),
    stops: [], ideas: [], sources: [],
  };
}

export function guidePendingItems(content: GuideContent): string[] {
  const pending: string[] = [];
  if (!content.overview.trim()) pending.push("Escribí la presentación del destino con información comprobada.");
  if (!content.sources.length || content.sources.some((source) => !source.url || !source.consultedOn))
    pending.push("Agregá las fuentes y su fecha de consulta.");
  if (!content.stops.length || content.stops.some((stop) => !stop.verified || !stop.sourceUrl || !stop.checkedOn))
    pending.push("Confirmá al menos un lugar y registrá fuente y fecha para cada parada.");
  if (content.coverMediaId && !content.coverCredit.trim()) pending.push("Completá el crédito y permiso de la portada.");
  return pending;
}
