import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen Docker mínima: copia solo lo necesario (ver Dockerfile.prod)
  output: "standalone",
  allowedDevOrigins: ["10.10.0.159"],
  eslint: {
    // ESLint corre en CI/dev; no bloquear el build de producción
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Errores de tipos se resuelven en dev; no bloquear el build de producción
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
