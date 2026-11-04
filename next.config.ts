import type { NextConfig } from "next";

const config: NextConfig = {
  // Las verificaciones compilan en otra carpeta para no pisar el servidor de desarrollo.
  distDir: process.env.EZRA_DIST_DIR || ".next",
  poweredByHeader: false,
  devIndicators: false,
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
