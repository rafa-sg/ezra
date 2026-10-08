/**
 * Shared catalog for the company form: who ezrá is used for, the main goal, business
 * category and the niches each category allows. These are preferences only: none of
 * them enables an integration, grants a permission or implies a feature already works.
 */
type Label = { es: string; en: string };
const option = <T extends string>(id: T, es: string, en: string) => ({
  id,
  label: { es, en } as Label,
});

export const audiences = [
  option("own_business", "Mi propia empresa o negocio", "My own company or business"),
  option("own_social", "Mis propias redes sociales", "My own social media"),
  option("personal_brand", "Mi marca personal", "My personal brand"),
  option("freelance_clients", "Mis clientes como freelancer", "My clients as a freelancer"),
  option("agency_clients", "Los clientes de mi agencia", "My agency's clients"),
  option("employer", "La empresa donde trabajo", "The company I work for"),
  option("organization", "Una organización o comunidad", "An organization or community"),
  option("new_project", "Un proyecto o emprendimiento nuevo", "A new project or venture"),
  option("other", "Otro", "Other"),
] as const;
export type Audience = (typeof audiences)[number]["id"];
/** Personal contexts never require a business classification. */
export const personalAudiences: readonly Audience[] = ["own_social", "personal_brand"];

export const goals = [
  option("create_content", "Crear y organizar contenido", "Create and organize content"),
  option("manage_social", "Gestionar mis redes sociales", "Manage my social media"),
  option("customer_messages", "Atender mensajes de clientes", "Answer customer messages"),
  option("support_bot", "Configurar un bot de atención", "Set up a support bot"),
  option("promote", "Promocionar productos o servicios", "Promote products or services"),
  option("leads", "Captar clientes potenciales", "Capture leads"),
  option("multi_brand", "Gestionar varias marcas o clientes", "Manage several brands or clients"),
  option("metrics", "Consultar resultados y métricas", "Review results and metrics"),
  option("centralize", "Centralizar mi trabajo de marketing", "Centralize my marketing work"),
  option("explore", "Explorar y aprender", "Explore and learn"),
  option("other", "Otro", "Other"),
] as const;
export type Goal = (typeof goals)[number]["id"];

const niche = option;
export const categories = [
  {
    ...option("tourism", "Turismo y viajes", "Tourism and travel"),
    niches: [
      niche("tour_guide", "Guía turística", "Tour guide"),
      niche("destination_promotion", "Promoción de destinos", "Destination promotion"),
      niche("experiences_tours", "Experiencias y tours", "Experiences and tours"),
      niche("lodging", "Alojamiento", "Lodging"),
      niche("travel_agency", "Agencia de viajes", "Travel agency"),
      niche("local_info", "Información y recomendaciones locales", "Local information and tips"),
    ],
  },
  {
    ...option("retail", "Comercio y tiendas", "Retail and stores"),
    niches: [
      niche("clothing", "Ropa y accesorios", "Clothing and accessories"),
      niche("electronics", "Electrónica", "Electronics"),
      niche("home", "Hogar", "Home"),
      niche("online_store", "Tienda en línea", "Online store"),
      niche("general_retail", "Comercio general", "General retail"),
    ],
  },
  {
    ...option("vehicles", "Vehículos y movilidad", "Vehicles and mobility"),
    niches: [
      niche("motorcycle_sales", "Venta de motocicletas", "Motorcycle sales"),
      niche("car_sales", "Venta de automóviles", "Car sales"),
      niche("parts_accessories", "Repuestos y accesorios", "Parts and accessories"),
      niche("repair_maintenance", "Taller y mantenimiento", "Repair and maintenance"),
      niche("vehicle_rental", "Alquiler de vehículos", "Vehicle rental"),
    ],
  },
  {
    ...option("food", "Gastronomía", "Food and drink"),
    niches: [
      niche("restaurant", "Restaurante", "Restaurant"),
      niche("cafe", "Cafetería", "Café"),
      niche("bakery", "Panadería", "Bakery"),
      niche("delivery", "Comida a domicilio", "Food delivery"),
      niche("catering", "Catering", "Catering"),
    ],
  },
  {
    ...option("professional_services", "Servicios profesionales", "Professional services"),
    niches: [
      niche("legal", "Servicios legales", "Legal services"),
      niche("accounting", "Contabilidad y finanzas", "Accounting and finance"),
      niche("consulting", "Consultoría", "Consulting"),
      niche(
        "architecture_engineering",
        "Arquitectura e ingeniería",
        "Architecture and engineering",
      ),
      niche("home_services", "Servicios para el hogar", "Home services"),
    ],
  },
  {
    ...option("marketing", "Marketing y publicidad", "Marketing and advertising"),
    niches: [
      niche("agency", "Agencia", "Agency"),
      niche("community_management", "Community management", "Community management"),
      niche("marketing_consulting", "Consultoría", "Consulting"),
      niche("digital_ads", "Publicidad digital", "Digital advertising"),
      niche("content_production", "Producción de contenido", "Content production"),
    ],
  },
  {
    ...option("arts_design", "Arte, diseño y creatividad", "Art, design and creativity"),
    niches: [
      niche("graphic_design", "Diseño gráfico", "Graphic design"),
      niche("illustration", "Ilustración", "Illustration"),
      niche("crafts", "Artesanías", "Crafts"),
      niche("visual_arts", "Artes visuales", "Visual arts"),
      niche("music", "Música", "Music"),
    ],
  },
  {
    ...option("technology", "Tecnología", "Technology"),
    niches: [
      niche("software", "Desarrollo de software", "Software development"),
      niche("it_support", "Soporte técnico", "IT support"),
      niche("saas", "Aplicaciones y plataformas", "Apps and platforms"),
      niche("tech_retail", "Venta de equipos", "Equipment sales"),
    ],
  },
  {
    ...option("education", "Educación y formación", "Education and training"),
    niches: [
      niche("school", "Colegio o centro educativo", "School"),
      niche("courses", "Cursos y talleres", "Courses and workshops"),
      niche("tutoring", "Clases particulares", "Tutoring"),
      niche("online_learning", "Formación en línea", "Online learning"),
    ],
  },
  {
    ...option("health", "Salud y bienestar", "Health and wellness"),
    niches: [
      niche("clinic", "Clínica o consultorio", "Clinic or practice"),
      niche("fitness", "Gimnasio y entrenamiento", "Gym and training"),
      niche("nutrition", "Nutrición", "Nutrition"),
      niche("mental_health", "Salud mental", "Mental health"),
      niche("pharmacy", "Farmacia", "Pharmacy"),
    ],
  },
  {
    ...option("beauty", "Belleza y cuidado personal", "Beauty and personal care"),
    niches: [
      niche("salon", "Salón de belleza", "Beauty salon"),
      niche("barbershop", "Barbería", "Barbershop"),
      niche("spa", "Spa", "Spa"),
      niche("cosmetics", "Cosméticos", "Cosmetics"),
      niche("nails", "Uñas", "Nails"),
    ],
  },
  {
    ...option("real_estate", "Bienes raíces", "Real estate"),
    niches: [
      niche("sales", "Venta de propiedades", "Property sales"),
      niche("rentals", "Alquiler de propiedades", "Property rentals"),
      niche("brokerage", "Corretaje inmobiliario", "Real estate brokerage"),
      niche("development", "Desarrollo de proyectos", "Property development"),
    ],
  },
  {
    ...option("entertainment", "Entretenimiento y eventos", "Entertainment and events"),
    niches: [
      niche("event_planning", "Organización de eventos", "Event planning"),
      niche("venues", "Locales y salones", "Venues"),
      niche("live_music", "Música en vivo", "Live music"),
      niche("nightlife", "Bares y vida nocturna", "Bars and nightlife"),
    ],
  },
  {
    ...option("media", "Medios y creación de contenido", "Media and content creation"),
    niches: [
      niche("creator", "Creador de contenido", "Content creator"),
      niche("influencer", "Influencer", "Influencer"),
      niche("blog", "Blog", "Blog"),
      niche("digital_media", "Medio digital", "Digital media"),
      niche("photo_video", "Fotografía y video", "Photography and video"),
    ],
  },
  {
    ...option("organizations", "Organizaciones y comunidades", "Organizations and communities"),
    niches: [
      niche("nonprofit", "Organización sin fines de lucro", "Nonprofit"),
      niche("church", "Iglesia o comunidad religiosa", "Church or faith community"),
      niche("association", "Asociación o gremio", "Association"),
      niche("public_institution", "Institución pública", "Public institution"),
    ],
  },
  {
    ...option("personal", "Uso personal / Sin negocio", "Personal use / No business"),
    niches: [
      niche("personal_social", "Redes personales", "Personal social media"),
      niche("hobby", "Pasatiempo", "Hobby"),
      niche("portfolio", "Portafolio", "Portfolio"),
      niche("personal_project", "Proyecto personal", "Personal project"),
      niche("not_applicable", "No aplica", "Not applicable"),
    ],
  },
  { ...option("other", "Otro", "Other"), niches: [] },
] as const;
export type Category = (typeof categories)[number]["id"];
/** Every niche id, used only for type checks; validity depends on the category. */
export type Niche = (typeof categories)[number]["niches"][number]["id"] | "other";

export const categoryIds = categories.map((c) => c.id) as [Category, ...Category[]];
export const audienceIds = audiences.map((a) => a.id) as [Audience, ...Audience[]];
export const goalIds = goals.map((g) => g.id) as [Goal, ...Goal[]];

/** Niches offered for a category, always ending with «Otro» (not for «Otro» itself). */
export function nichesFor(category: string) {
  const found = categories.find((c) => c.id === category);
  if (!found || found.id === "other") return [];
  return [...found.niches, niche("other", "Otro", "Other")];
}
export const nicheValid = (category: string, value: string) =>
  nichesFor(category).some((n) => n.id === value);

/** Previously saved values that are no longer in the catalog, mapped explicitly. */
export const legacyCategories: Record<string, Category> = { creative: "arts_design" };
