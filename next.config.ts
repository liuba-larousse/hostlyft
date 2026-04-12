import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/pricelabs/daily-report': ['./node_modules/@sparticuz/chromium/**/*'],
  },
};

export default nextConfig;
