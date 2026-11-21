/** Formato de los cortes de ingresos (sin dependencias de servidor: lo usa también la interfaz). */
export const COLUMNAS = ["fuente", "metrica", "periodo_tipo", "desde", "hasta", "puesto_o_pais", "valor"] as const;

/** Plantilla descargable: columnas y ejemplos con el valor vacío (se completa con el corte oficial). */
export const PLANTILLA_CSV = `${COLUMNAS.join(",")}
DGME,ingresos,semestre,2024-01-01,2024-06-30,La Hachadura,
DGME,ingresos,semestre,2024-01-01,2024-06-30,total,
DGME,ingresos,mes,2026-01-01,2026-01-31,El Amatillo,
DGME,ingresos,mes,2026-01-01,2026-01-31,Guatemala,
MITUR,visitantes,mes,2026-01-01,2026-01-31,total,
MITUR,visitantes,mes,2026-01-01,2026-01-31,Estados Unidos,
`;

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
/** «nov 2026», «ene–jun 2024», «2024». */
export function etiquetaPeriodo(desde: string, hasta: string) {
  const [a1, m1] = [desde.slice(0, 4), Number(desde.slice(5, 7))];
  const [a2, m2] = [hasta.slice(0, 4), Number(hasta.slice(5, 7))];
  if (a1 === a2 && m1 === 1 && m2 === 12) return a1;
  if (a1 === a2 && m1 === m2) return `${MES[m1 - 1]} ${a1}`;
  return a1 === a2 ? `${MES[m1 - 1]}–${MES[m2 - 1]} ${a1}` : `${MES[m1 - 1]} ${a1} – ${MES[m2 - 1]} ${a2}`;
}
