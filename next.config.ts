import type { NextConfig } from "next";

const config: NextConfig = {
  // Las verificaciones compilan en otra carpeta para no pisar el servidor de desarrollo.
  distDir: process.env.EZRA_DIST_DIR || ".next",
  poweredByHeader: false,
  devIndicators: false,
  // En Docker el servidor escucha en 0.0.0.0 y Next solo admitiría localhost: sin esto, desde
  // http://127.0.0.1:3000 se bloquean los recursos de desarrollo y la recarga en vivo.
  allowedDevOrigins: ["127.0.0.1"],
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
