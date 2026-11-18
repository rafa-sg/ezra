export const farmPurposes = ["instagram_post", "facebook_post", "tourist_guide", "carousel", "video", "custom", "eventos_el_salvador", "post_instagram_eventos"] as const;
export type FarmPurpose = (typeof farmPurposes)[number];
export const purposeLabels: Record<FarmPurpose, string> = {
  instagram_post: "Post de Instagram",
  facebook_post: "Post de Facebook",
  tourist_guide: "Guía turística",
  carousel: "Carrusel",
  video: "Video",
  custom: "Personalizada",
  eventos_el_salvador: "Eventos de El Salvador",
  post_instagram_eventos: "Post para Instagram",
};

/** Existing farms keep their data and can be classified without changing their destinations. */
export function farmPurpose(farm: { ajustes: { purpose?: FarmPurpose }; formato: string; canales: string[] }): FarmPurpose {
  if (farm.ajustes.purpose) return farm.ajustes.purpose;
  if (farm.formato === "video") return "video";
  if (farm.formato === "carrusel") return "carousel";
  if (farm.canales.length === 1 && farm.canales[0] === "instagram") return "instagram_post";
  if (farm.canales.length === 1 && farm.canales[0] === "facebook") return "facebook_post";
  return "custom";
}
