import { GEOGRAFIA, PERIMETRO_PAIS, type Punto } from "@/lib/granjas/geografia-sv";
import { ACCESOS, type Acceso } from "@/lib/granjas/datos-pais";

/* ── Proyección (equirrectangular corregida por latitud; a 13,7° la distorsión no se nota) ── */
const LNG0 = -90.16;
const LAT0 = 14.47;
const ESC = 270;
const COS = Math.cos((13.7 * Math.PI) / 180);
export const proyectar = (p: Punto): [number, number] => [
  300 + (p.lng - LNG0) * ESC * COS,
  230 + (LAT0 - p.lat) * ESC,
];
function dentroDe(x: number, y: number, anillo: [number, number][]) {
  let si = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
  }
  return si;
}
function centroide(anillos: [number, number][][]): [number, number] {
  const pts = [...anillos].sort((a, b) => b.length - a.length)[0];
  let [x, y, area] = [0, 0, 0];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    area += f;
    x += (pts[j][0] + pts[i][0]) * f;
    y += (pts[j][1] + pts[i][1]) * f;
  }
  return area ? [x / (3 * area), y / (3 * area)] : pts[0];
}
/** Matriz de puntos (cada punto sabe a qué departamento real pertenece) y el centro de cada departamento. */
let geoCache: {
  puntos: { x: number; y: number; d: string }[];
  centros: Record<string, [number, number]>;
} | null = null;
export function geo() {
  if (geoCache) return geoCache;
  const deptos = Object.values(GEOGRAFIA).map((d) => ({
    nombre: d.nombre,
    anillos: d.anillos.map((a) => a.map(proyectar)),
  }));
  const todos = deptos.flatMap((d) => d.anillos.flat());
  const [x0, x1] = [Math.min(...todos.map((p) => p[0])), Math.max(...todos.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...todos.map((p) => p[1])), Math.max(...todos.map((p) => p[1]))];
  const puntos: { x: number; y: number; d: string }[] = [];
  for (let y = y0; y <= y1; y += 7.5)
    for (let x = x0; x <= x1; x += 7.5) {
      const d = deptos.find((dep) => dep.anillos.some((a) => dentroDe(x, y, a)));
      if (d) puntos.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, d: d.nombre });
    }
  geoCache = {
    puntos,
    centros: Object.fromEntries(deptos.map((d) => [d.nombre, centroide(d.anillos)])),
  };
  return geoCache;
}
/** El país con espacio arriba para ezrá. */
/** El país centrado (sin la cápsula de arriba), con margen para los recorridos que llegan desde afuera. */
export const VB: [number, number, number, number] = [280, 200, 700, 400];
/** Punto de anclaje discreto de ezrá, integrado sobre el borde norte: origen de la conexión elegida. */
export const ANCLA: [number, number] = [640, 222];
export const X_PAIS: [number, number] = [308, 951];

type P2 = [number, number];
const f1 = (v: number) => v.toFixed(1);
const norm = ([x, y]: P2): P2 => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
/** Punto más cercano sobre el perímetro del país (los puestos terrestres quedan justo en la frontera). */
function sobreFrontera(p: P2): P2 {
  let mejor: P2 = p;
  let dist = Infinity;
  for (const anillo of PERIMETRO_PAIS) {
    const pts = anillo.map(proyectar);
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
      );
      const q: P2 = [a[0] + dx * t, a[1] + dy * t];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < dist) [dist, mejor] = [d, q];
    }
  }
  return mejor;
}
/** Dónde va la etiqueta de cada acceso (fuera de la silueta, junto a sus puestos). */
const ETIQUETAS: Record<Acceso["id"], P2> = {
  aeropuerto: [664, 566],
  guatemala: [352, 282],
  honduras: [748, 262],
};
export type PuestoGeo = { id: string; acceso: Acceso["id"]; punto: P2; camino: string; fin: P2 };
export type AccesoGeo = { acceso: Acceso; etiqueta: P2; puestos: PuestoGeo[] };
let accesosCache: AccesoGeo[] | null = null;
/**
 * Recorridos de llegada: una curva corta desde fuera de la silueta hasta el punto real de entrada.
 * Por tierra cruzan la frontera y terminan apenas dentro; por aire terminan en el aeropuerto.
 */
export function geometriaAccesos(): AccesoGeo[] {
  if (accesosCache) return accesosCache;
  const { puntos } = geo();
  const centro: P2 = [
    puntos.reduce((s, p) => s + p.x, 0) / puntos.length,
    puntos.reduce((s, p) => s + p.y, 0) / puntos.length,
  ];
  accesosCache = ACCESOS.map((acceso) => ({
    acceso,
    etiqueta: ETIQUETAS[acceso.id],
    puestos: acceso.puestos.map((p) => {
      const crudo = proyectar(p);
      if (acceso.tipo === "aereo") {
        const s: P2 = [crudo[0] - 46, crudo[1] + 82];
        const c: P2 = [crudo[0] - 52, crudo[1] + 26];
        return {
          id: p.id,
          acceso: acceso.id,
          punto: crudo,
          fin: crudo,
          camino: `M${f1(s[0])},${f1(s[1])} Q${f1(c[0])},${f1(c[1])} ${f1(crudo[0])},${f1(crudo[1])}`,
        };
      }
      const b = sobreFrontera(crudo);
      const o = norm([b[0] - centro[0], b[1] - centro[1]]);
      const perp: P2 = [-o[1], o[0]];
      const s: P2 = [b[0] + o[0] * 64, b[1] + o[1] * 64];
      const c: P2 = [b[0] + o[0] * 26 + perp[0] * 16, b[1] + o[1] * 26 + perp[1] * 16];
      const t = norm([b[0] - c[0], b[1] - c[1]]);
      const e: P2 = [b[0] + t[0] * 16, b[1] + t[1] * 16];
      return {
        id: p.id,
        acceso: acceso.id,
        punto: b,
        fin: e,
        camino: `M${f1(s[0])},${f1(s[1])} Q${f1(c[0])},${f1(c[1])} ${f1(b[0])},${f1(b[1])} L${f1(e[0])},${f1(e[1])}`,
      };
    }),
  }));
  return accesosCache;
}

let bordesCache: { nombre: string; d: string }[] | null = null;
/** Límites reales de cada departamento como trazos (para separarlos con una línea fina). */
export function bordes() {
  if (bordesCache) return bordesCache;
  bordesCache = Object.values(GEOGRAFIA).map((dep) => ({
    nombre: dep.nombre,
    d: dep.anillos
      .map((anillo) => {
        const pts = anillo.map(proyectar);
        return `M${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join("L")}Z`;
      })
      .join(""),
  }));
  return bordesCache;
}
