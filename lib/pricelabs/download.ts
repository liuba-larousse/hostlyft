import type { Page } from 'playwright-core';
import { readFileSync } from 'fs';

const BOOKINGS_URL = 'https://app.pricelabs.co/portfolio/bookings';
const TIMEOUT = 60_000;

export async function downloadBookingsCsv(page: Page): Promise<string> {
  // Navigate to bookings page
  await page.goto(BOOKINGS_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });

  // Wait for the download button to appear
  await page.waitForSelector('#bookings-download-report-button', { timeout: TIMEOUT });

  // Click download and capture the file
  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT });
  await page.click('#bookings-download-report-button');
  const download = await downloadPromise;

  // Wait for download to finish and get path
  const filePath = await download.path();
  if (!filePath) {
    throw new Error('Download failed — no file path returned');
  }

  return readFileSync(filePath, 'utf-8');
}
