import type { Browser, BrowserContext, Page } from 'playwright-core';

// PriceLabs is a SPA — the root redirects to login when unauthenticated
const LOGIN_URL = 'https://app.pricelabs.co/';
const TIMEOUT = 45_000;

export async function loginToPriceLabs(
  browser: Browser,
  email: string,
  password: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    acceptDownloads: true,
  });
  const page = await context.newPage();

  // Navigate to root — SPA will redirect to login form
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

  // Wait for email input to appear (SPA may take a moment to render)
  await page.waitForSelector(
    'input[type="email"], input[name="email"], input[placeholder*="email" i], input[autocomplete="email"]',
    { timeout: TIMEOUT }
  );

  // Fill email
  await page.fill(
    'input[type="email"], input[name="email"], input[placeholder*="email" i], input[autocomplete="email"]',
    email
  );

  // Fill password
  await page.fill('input[type="password"]', password);

  // Submit — SPA navigation won't fire a full page reload, so just wait for network idle
  await page.click('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in")');
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

  // Verify we're no longer on the login screen
  const url = page.url();
  if (url.includes('/signin') || url.includes('/login') || url.includes('/#/')) {
    // Check if an error message is visible
    const errorText = await page.locator('[class*="error"], [class*="alert"], [role="alert"]').textContent().catch(() => '');
    throw new Error(`Login failed for ${email} — still on login page. ${errorText ?? ''}`);
  }

  return { context, page };
}
