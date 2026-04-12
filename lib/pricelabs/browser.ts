import type { Browser } from 'playwright-core';

export async function launchBrowser(): Promise<Browser> {
  const isVercel = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

  if (isVercel) {
    // On Vercel: use lightweight chromium from @sparticuz/chromium
    const chromium = (await import('@sparticuz/chromium')).default;
    const { chromium: playwright } = await import('playwright-core');
    return playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    // Locally: use Playwright's bundled browser
    const { chromium } = await import('playwright-core');
    return chromium.launch({ headless: true });
  }
}
