import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  // pdfkit charge ses polices standard (Helvetica…) par des require dynamiques
  // que le traçage de fichiers ne détecte pas : on les embarque explicitement
  // dans la fonction serverless qui génère les PDF (Vercel).
  outputFileTracingIncludes: {
    "/api/invoices/[id]/pdf": ["./node_modules/pdfkit/js/standard-fonts/**/*", "./node_modules/pdfkit/js/data/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
