import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium-min'],
  outputFileTracingIncludes: {
    '/api/pricelabs/*': ['./node_modules/playwright-core/**/*'],
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'hostlyft.vercel.app' }],
        destination: 'https://team.hostlyft.com/:path*',
        permanent: true,
      },
      {
        // Cloud 9 was removed — send old bookmarks / post-login callbackUrls to the dashboard
        source: '/dashboard/cloud9',
        destination: '/dashboard',
        permanent: true,
      },
      {
        source: '/dashboard/cloud9/:path*',
        destination: '/dashboard',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
