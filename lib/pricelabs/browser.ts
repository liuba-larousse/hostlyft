import type { Browser } from 'playwright-core';

// Chromium binary hosted on GitHub releases — downloaded at runtime on Vercel (x64)
const CHROMIUM_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.x64.tar';

export async function launchBrowser(): Promise<Browser> {
  const isVercel = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

  if (isVercel) {
    // On Vercel: chromium-min downloads the binary at runtime (no bundling needed)
    const chromium = (await import('@sparticuz/chromium-min')).default;
    const { chromium: playwright } = await import('playwright-core');
    return playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(CHROMIUM_URL),
      headless: true,
    });
  } else {
    // Locally: use Playwright's bundled browser
    const { chromium } = await import('playwright-core');
    return chromium.launch({ headless: true });
  }
}
