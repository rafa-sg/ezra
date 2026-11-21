/**
 * Datos oficiales del país para las capas «Población» e «Ingresos» del mapa de Inicio.
 * Solo cifras publicadas por la fuente indicada; lo que no tiene fuente queda en null y la
 * interfaz dice «Datos aún no disponibles».
 */

/** VII Censo de Población y VI de Vivienda 2024 (ONEC/BCR), tabla «Población total por departamento,
 * municipio, distrito de residencia y edades quinquenales según sexo» (fila TOTAL de cada departamento). */
export const POBLACION_2024 = {
  etiqueta: "Población censada · 2024",
  anio: 2024,
  fuente: "VII Censo de Población y VI de Vivienda 2024 · ONEC/BCR",
  url: "https://censo2024.bcr.gob.sv/wp-content/uploads/tablas-geoportal/2025/TAB_POB_2.pdf",
  total: 6_029_976,
  /** Personas censadas sin departamento de residencia especificado (no se ubican en el mapa). */
  noEspecificado: 107_055,
  departamentos: {
    Ahuachapán: 348_880,
    "Santa Ana": 552_938,
    Sonsonate: 470_455,
    Chalatenango: 185_930,
    "La Libertad": 765_879,
    "San Salvador": 1_563_371,
    Cuscatlán: 244_901,
    "La Paz": 318_374,
    Cabañas: 143_049,
    "San Vicente": 161_857,
    Usulután: 325_494,
    "San Miguel": 447_634,
    Morazán: 169_784,
    "La Unión": 224_375,
  } as Record<string, number>,
};

export type Cifra = {
  valor: number;
  /** Período que cubre la cifra, p. ej. «enero–octubre 2026». */
  periodo: string;
  fuente: string;
  url: string;
  /** Registros por día (habilitan el filtro diario). */
  porDia?: { dia: string; valor: number }[];
} | null;

export type Puesto = { id: string; nombre: string; lugar: string; lat: number; lng: number; entradas: Cifra };
export type Acceso = {
  id: "aeropuerto" | "guatemala" | "honduras";
  nombre: string;
  tipo: "aereo" | "terrestre";
  puestos: Puesto[];
  /** Entradas migratorias (DGME) del acceso completo: la métrica comparable entre los tres. */
  entradas: Cifra;
  /** Solo aeropuerto: pasajeros en llegadas (CEPA), otra métrica distinta de las entradas migratorias. */
  pasajerosLlegada?: Cifra;
};

export const FUENTE_DGME = "Dirección General de Migración y Extranjería (DGME) · entradas migratorias";
export const FUENTE_CEPA = "CEPA · pasajeros en llegadas";

/** Puntos reales de entrada (coordenadas de cada puesto o del aeropuerto). Cifras pendientes de fuente oficial. */
export const ACCESOS: Acceso[] = [
  {
    id: "aeropuerto",
    nombre: "Aeropuerto",
    tipo: "aereo",
    puestos: [
      { id: "aies", nombre: "Aeropuerto Internacional de El Salvador San Óscar Arnulfo Romero", lugar: "San Luis Talpa, La Paz", lat: 13.4409, lng: -89.0557, entradas: null },
    ],
    entradas: null,
    pasajerosLlegada: null,
  },
  {
    id: "guatemala",
    nombre: "Guatemala",
    tipo: "terrestre",
    puestos: [
      { id: "hachadura", nombre: "La Hachadura", lugar: "Ahuachapán", lat: 13.8628, lng: -90.0867, entradas: null },
      { id: "chinamas", nombre: "Las Chinamas", lugar: "Ahuachapán", lat: 13.9653, lng: -89.9553, entradas: null },
      { id: "san-cristobal", nombre: "San Cristóbal", lugar: "Candelaria de la Frontera, Santa Ana", lat: 14.1326, lng: -89.6704, entradas: null },
      { id: "anguiatu", nombre: "Anguiatú", lugar: "Metapán, Santa Ana", lat: 14.3958, lng: -89.5203, entradas: null },
    ],
    entradas: null,
  },
  {
    id: "honduras",
    nombre: "Honduras",
    tipo: "terrestre",
    puestos: [
      { id: "el-poy", nombre: "El Poy", lugar: "Citalá, Chalatenango", lat: 14.3712, lng: -89.2047, entradas: null },
      { id: "el-amatillo", nombre: "El Amatillo", lugar: "Pasaquina, La Unión", lat: 13.5943, lng: -87.7573, entradas: null },
    ],
    entradas: null,
  },
];
