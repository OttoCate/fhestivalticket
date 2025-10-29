import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export for GitHub Pages
  output: "export",
  // Project pages path
  basePath: "/fhestivalticket",
  assetPrefix: "/fhestivalticket/",
  trailingSlash: true,
  // Expose base path to client
  env: {
    NEXT_PUBLIC_BASE_PATH: "/fhestivalticket",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
