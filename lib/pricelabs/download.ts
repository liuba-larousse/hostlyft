import type { Page } from 'playwright-core';
import { readFileSync } from 'fs';

const TIMEOUT = 60_000;

// Possible bookings page URLs — we'll try each until the button appears
const BOOKINGS_URLS = [
  'https://app.pricelabs.co/portfolio/bookings',
  'https://app.pricelabs.co/bookings',
  'https://app.pricelabs.co/reservations',
  'https://app.pricelabs.co/',
];

const BUTTON_SELECTOR = '[qa-id="bookings-download-report-button"]';

export async function downloadBookingsCsv(page: Page): Promise<string> {
  // Try each URL until the download button appears
  for (const url of BOOKINGS_URLS) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Wait for SPA to settle
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const visible = await page.locator(BUTTON_SELECTOR).isVisible().catch(() => false);
    if (visible) break;
  }

  // Report where we ended up to aid debugging
  const landedUrl = page.url();
  const landedTitle = await page.title().catch(() => '');

  // Final wait for the button
  const found = await page.locator(BUTTON_SELECTOR).isVisible().catch(() => false);
  if (!found) {
    throw new Error(
      `Download button not found after trying all URLs. Ended up at: ${landedUrl} ("${landedTitle}")`
    );
  }

  // Click download and capture the file
  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT });
  await page.click(BUTTON_SELECTOR);
  const download = await downloadPromise;

  const filePath = await download.path();
  if (!filePath) {
    throw new Error('Download failed — no file path returned');
  }

  return readFileSync(filePath, 'utf-8');
}
