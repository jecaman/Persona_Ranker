/** @type {import('next').NextConfig} */
const nextConfig = {
  // Incluye la carpeta data/ en el bundle de Vercel
  // Sin esto, fs.readFileSync no encontraría persona_spec.md en producción
  experimental: {
    outputFileTracingIncludes: {
      "/api/rank": ["./data/**"],
    },
  },
};

export default nextConfig;
