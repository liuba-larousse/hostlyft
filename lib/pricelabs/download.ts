import type { Page } from 'playwright-core';
import { readFileSync } from 'fs';

const TIMEOUT = 60_000;

const BOOKINGS_URLS = [
  'https://app.pricelabs.co/portfolio_analytics/bookings',
  'https://app.pricelabs.co/portfolio/bookings',
];

const BUTTON_SELECTOR = '[qa-id="bookings-download-report-button"]';

export async function downloadBookingsFile(page: Page): Promise<Buffer> {
  // Navigate to the bookings page
  for (const url of BOOKINGS_URLS) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const visible = await page.locator(BUTTON_SELECTOR).isVisible().catch(() => false);
    if (visible) break;
  }

  const landedUrl = page.url();
  const found = await page.locator(BUTTON_SELECTOR).isVisible().catch(() => false);
  if (!found) {
    throw new Error(`Download button not found at ${landedUrl}`);
  }

  // Capture the file download
  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT });
  await page.click(BUTTON_SELECTOR);
  const download = await downloadPromise;

  const filePath = await download.path();
  if (!filePath) throw new Error('Download failed — no file path returned');

  return readFileSync(filePath);
}
