import type { Page } from 'playwright-core';
import { readFileSync } from 'fs';

const TIMEOUT = 45_000;

// Each segment has its own Report Builder URL — no client-side derivation needed.
export type ReportSegment = 'all' | 'ph' | 'exclPh' | 'building' | 'weeks' | 'listing';

const REPORT_URLS: Record<ReportSegment, string> = {
  all: 'https://app.pricelabs.co/report-builder/9276',
  ph: 'https://app.pricelabs.co/report-builder/11774',
  exclPh: 'https://app.pricelabs.co/report-builder/11775',
  building: 'https://app.pricelabs.co/report-builder/10420',
  weeks: 'https://app.pricelabs.co/report-builder/10678',
  listing: 'https://app.pricelabs.co/report-builder/10744',
};

/**
 * Download a report from PriceLabs Report Builder.
 * No filter interaction — each segment has its own URL with Sync ON by default.
 */
export async function downloadPortfolioReport(
  page: Page,
  segment: ReportSegment = 'all'
): Promise<Buffer> {
  const url = REPORT_URLS[segment];

  // Navigate to the report
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Click Download button
  const downloadBtn = page.locator('#rb-template-top-panel-download-report-btn');
  await downloadBtn.waitFor({ state: 'visible', timeout: 10_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT });
  await downloadBtn.click();
  const download = await downloadPromise;

  const filePath = await download.path();
  if (!filePath) throw new Error('Download failed — no file path returned');

  return readFileSync(filePath);
}
