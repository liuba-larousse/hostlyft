import type { Browser, BrowserContext, Page } from 'playwright-core';

const PRICELABS_URL = 'https://app.pricelabs.co';
const LOGIN_URL = `${PRICELABS_URL}/signin`;
const TIMEOUT = 30_000;

export async function loginToPriceLabs(
  browser: Browser,
  email: string,
  password: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    acceptDownloads: true,
    downloadsPath: '/tmp',
  });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });

  // Fill email
  await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', {
    timeout: TIMEOUT,
  });
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', email);

  // Fill password
  await page.fill('input[type="password"]', password);

  // Submit
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: TIMEOUT }),
    page.click('button[type="submit"], input[type="submit"]'),
  ]);

  // Verify login succeeded — should be redirected away from /signin
  const url = page.url();
  if (url.includes('/signin') || url.includes('/login')) {
    throw new Error(`Login failed for ${email} — still on login page`);
  }

  return { context, page };
}
