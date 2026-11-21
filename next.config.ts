import type { NextConfig } from "next";

const config: NextConfig = {
  // Las verificaciones compilan en otra carpeta para no pisar el servidor de desarrollo.
  distDir: process.env.EZRA_DIST_DIR || ".next",
  poweredByHeader: false,
  devIndicators: false,
  // En Docker el servidor escucha en 0.0.0.0 y Next solo admitiría localhost: sin esto, desde
  // http://127.0.0.1:3000 se bloquean los recursos de desarrollo y la recarga en vivo.
  allowedDevOrigins: ["127.0.0.1"],
  // Solo en Docker (compose.yaml): en Mac y Windows los avisos de archivos cambiados no siempre cruzan
  // a la máquina virtual de Docker, así que Next revisa los archivos cada cierto tiempo. Fuera de
  // Docker no se usa (la guía de Next lo desaconseja salvo como último recurso).
  ...(Number(process.env.EZRA_DOCKER_POLL) > 0 ? { watchOptions: { pollIntervalMs: Number(process.env.EZRA_DOCKER_POLL) } } : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};
export default config;
