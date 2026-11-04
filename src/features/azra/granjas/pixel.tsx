import type { EstadoPaso } from "@/lib/granjas/modelo";

export const colores = [
  "#efa474",
  "#91b7d9",
  "#b4a3ec",
  "#9ecda3",
  "#f1c775",
  "#b3a1e8",
  "#efa474",
  "#91b7d9",
  "#a6c6b6",
  "#92a9db",
  "#b9c7d0",
];

/**
 * Personaje del estudio. Con `estado`, añade un gesto ligero ligado al estado real del
 * paso: solo «recolectando» y «generando» se mueven, porque solo ahí hay trabajo en curso.
 */
export function Pixel({
  indice = 0,
  grande = false,
  estado,
}: {
  indice?: number;
  grande?: boolean;
  estado?: EstadoPaso;
}) {
  const clases = ["ep-pixel", grande ? "ep-pixel-grande" : "", estado ? `eg-pixel eg-pixel-${estado}` : ""].join(" ");
  return (
    <svg className={clases} viewBox="0 0 100 100" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M25 93h51v5H25z" fill="#000" opacity=".22" />
      <g className="eg-cuerpo">
        <path d="M43 7h8v16h-8z" fill="#789293" />
        <path className="eg-antena" d="M39 4h16v9H39z" fill={indice % 3 ? "#d6ef8d" : "#8bdded"} />
        <path
          d="M24 26h51v45H24zM17 39h7v18h-7zM75 39h7v18h-7zM30 71h10v15H30zM59 71h10v15H59z"
          fill={colores[indice % colores.length]}
        />
        <path d="M29 22h41v7H29zM23 29h53v5H23z" fill={indice % 2 ? "#c8de91" : "#cc766e"} />
        <path d="M33 43h7v9h-7zM59 43h7v9h-7z" fill="#142431" />
        {estado === "fallido" || estado === "bloqueado" ? (
          <path d="M42 60h13v3H42z" fill="#142431" />
        ) : indice % 3 === 0 ? (
          <path d="M43 59h11v3H43z" fill="#142431" />
        ) : (
          <path d="M42 58h13v6H42z" fill="#e9efe6" />
        )}
        {indice === 3 || indice === 10 ? (
          <path d="M29 39h15v17H29zM55 39h15v17H55zM44 44h11v3H44z" stroke="#243548" fill="none" strokeWidth="3" />
        ) : null}
      </g>
      <path d="M5 81h90v7H5zM12 88h6v12h-6zM82 88h6v12h-6z" fill="#71664b" />
      <path d="M62 61h29v20H62z" fill="#34485a" />
      <path className="eg-pantalla" d="M66 65h21v12H66z" fill="#20313e" />
      <path className="eg-lineas" d="M72 69h8v2h-8zM72 73h12v2H72z" fill="#b9d48c" />
      {estado === "recolectando" && <path className="eg-lupa" d="M6 50h10v10H6zM9 53h4v4H9zM15 59h4v4h-4z" fill="#d7ee9c" />}
      {(estado === "aprobado" || estado === "completado") && <path d="M80 8h6v6h-6zM74 14h6v6h-6zM86 2h6v6h-6z" fill="#d7ee9c" />}
      {(estado === "fallido" || estado === "bloqueado") && <path d="M80 4h5v5h-5zM90 4h5v5h-5zM85 9h5v5h-5zM80 14h5v5h-5zM90 14h5v5h-5z" fill="#f08b7d" />}
    </svg>
  );
}
