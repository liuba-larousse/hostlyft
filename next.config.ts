import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium-min'],
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'hostlyft.vercel.app' }],
        destination: 'https://team.hostlyft.com/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
