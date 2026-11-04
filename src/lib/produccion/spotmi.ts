import { z } from "zod";
import { WorkflowError } from "../workflow";
import { enlaceSeguro } from "./modelo";

export const fichaSpotmiSchema = z.object({
  id: z.string().uuid(),
  tipo: z.enum(["evento", "spot"]),
  titulo: z.string().max(200),
  descripcion: z.string().max(12000).nullable(),
  fecha: z.string().datetime({ offset: true }).nullable(),
  lugar: z.string().max(500).nullable(),
  departamento: z.string().max(120).nullable(),
  ruta: z
    .string()
    .max(500)
    .regex(/^\/es\/(eventos|lugares)\/[a-z0-9-]+$/),
  imagen: enlaceSeguro.nullable(),
  imagenGenerada: z.boolean(),
  fuente: enlaceSeguro.nullable(),
});
export const catalogoSpotmiSchema = z.object({
  version: z.literal(1),
  consultado: z.string().datetime(),
  fichas: z.array(fichaSpotmiSchema).max(300),
});
export type FichaSpotmi = z.infer<typeof fichaSpotmiSchema>;
export function direccionSpotmi() {
  let url: URL;
  try {
    url = new URL(process.env.SPOTMI_SITE_URL || "https://spotmi.com.sv");
  } catch {
    throw new WorkflowError("Revisa la dirección de Spotmi en la configuración del servidor.", 503);
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    )
  )
    throw new WorkflowError(
      "Revisa SPOTMI_SITE_URL: debe ser el origen https de Spotmi o un servidor local.",
      503,
    );
  return url.origin;
}
export async function leerJsonLimitado(respuesta: Response) {
  if (!respuesta.ok || !respuesta.body)
    throw new WorkflowError("No se pudo consultar el catálogo público de Spotmi.", 502);
  const lector = respuesta.body.getReader();
  const bloques: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > 2_000_000)
        throw new WorkflowError("El catálogo supera el límite de lectura.", 502);
      bloques.push(value);
    }
  } finally {
    await lector.cancel();
    lector.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(bloques).toString("utf8")) as unknown;
  } catch {
    throw new WorkflowError("Spotmi devolvió un catálogo con formato inválido.", 502);
  }
}
function enlacePublico(valor: string | null) {
  const leido = enlaceSeguro.safeParse(valor);
  return leido.success ? leido.data : null;
}
export function slugFicha(titulo: string, id: string) {
  return `${titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()}-${id.slice(0, 4)}`;
}
const eventoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  date: z.string(),
  venue: z.string().nullable(),
  department: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  source_url: z.string().nullable(),
  website: z.string().nullable(),
});
const lugarSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  department: z.string(),
  cover_image_url: z.string().nullable(),
  is_generated_image: z.boolean(),
});
export function configuracionPublica() {
  const direccion = process.env.SPOTMI_SUPABASE_URL?.trim();
  const clave = process.env.SPOTMI_SUPABASE_ANON_KEY?.trim();
  if (!direccion || !clave) return null;
  let url: URL;
  try {
    url = new URL(direccion);
  } catch {
    throw new WorkflowError("Revisa la conexión pública de Spotmi.", 503);
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".supabase.co") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new WorkflowError(
      "La conexión de datos de Spotmi debe usar su proyecto público de Supabase.",
      503,
    );
  let publica = clave.startsWith("sb_publishable_");
  if (!publica) {
    try {
      publica =
        JSON.parse(Buffer.from(clave.split(".")[1], "base64url").toString()).role === "anon";
    } catch {
      /* Una clave privada nunca se acepta aquí. */
    }
  }
  if (!publica)
    throw new WorkflowError(
      "El catálogo solo admite una clave pública anónima. No uses service role.",
      503,
    );
  return { origen: url.origin, clave };
}
/** Mismas políticas públicas de Spotmi: sin sesión de usuario ni permiso de escritura. */
export async function consultarSpotmi() {
  const configuracion = configuracionPublica();
  if (!configuracion) {
    const respuesta = await fetch(`${direccionSpotmi()}/api/editorial/catalogo`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    const leido = catalogoSpotmiSchema.safeParse(await leerJsonLimitado(respuesta));
    if (!leido.success)
      throw new WorkflowError(
        "La respuesta de Spotmi no coincide con el contrato del catálogo.",
        502,
      );
    return leido.data;
  }
  const ahora = new Date().toISOString();
  const consultar = async (tabla: string, parametros: Record<string, string>) => {
    const url = new URL(`/rest/v1/${tabla}`, configuracion.origen);
    for (const [clave, valor] of Object.entries(parametros)) url.searchParams.set(clave, valor);
    return leerJsonLimitado(
      await fetch(url, {
        cache: "no-store",
        redirect: "error",
        headers: {
          apikey: configuracion.clave,
          ...(configuracion.clave.startsWith("eyJ")
            ? { Authorization: `Bearer ${configuracion.clave}` }
            : {}),
        },
        signal: AbortSignal.timeout(12000),
      }),
    );
  };
  const [eventos, lugares] = await Promise.all([
    consultar("events", {
      select: "id,title,description,date,venue,department,cover_image_url,source_url,website",
      is_verified: "eq.true",
      or: `(date.gte.${ahora},end_date.gte.${ahora})`,
      order: "date.asc",
      limit: "200",
    }),
    consultar("places", {
      select: "id,name,description,department,cover_image_url,is_generated_image",
      source: "eq.official",
      is_verified: "eq.true",
      order: "name.asc",
      limit: "100",
    }),
  ]);
  const fichas: FichaSpotmi[] = [
    ...z
      .array(eventoSchema)
      .parse(eventos)
      .map((e) => ({
        id: e.id,
        tipo: "evento" as const,
        titulo: e.title,
        descripcion: e.description,
        fecha: e.date,
        lugar: e.venue,
        departamento: e.department,
        ruta: `/es/eventos/${slugFicha(e.title, e.id)}`,
        imagen: enlacePublico(e.cover_image_url),
        imagenGenerada: false,
        fuente: enlacePublico(e.source_url) || enlacePublico(e.website),
      })),
    ...z
      .array(lugarSchema)
      .parse(lugares)
      .map((l) => ({
        id: l.id,
        tipo: "spot" as const,
        titulo: l.name,
        descripcion: l.description,
        fecha: null,
        lugar: null,
        departamento: l.department,
        ruta: `/es/lugares/${slugFicha(l.name, l.id)}`,
        imagen: enlacePublico(l.cover_image_url),
        imagenGenerada: l.is_generated_image,
        fuente: null,
      })),
  ];
  return catalogoSpotmiSchema.parse({ version: 1, consultado: ahora, fichas });
}
