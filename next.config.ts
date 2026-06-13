import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen Docker mínima: copia solo lo necesario (ver Dockerfile.prod)
  output: "standalone",
  allowedDevOrigins: ['10.10.0.159'],
};

export default nextConfig;
