import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium-min'],
};

export default nextConfig;
