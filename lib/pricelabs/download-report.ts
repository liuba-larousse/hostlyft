import type { Page } from 'playwright-core';
import { readFileSync } from 'fs';

const TIMEOUT = 45_000;

export type ReportSegment = 'all' | 'ph' | 'building' | 'weeks';

interface ReportConfig {
  url: string;
  savedFilter: string | null;
}

const REPORT_CONFIG: Record<ReportSegment, ReportConfig> = {
  all: {
    url: 'https://app.pricelabs.co/report-builder/9276',
    savedFilter: null,
  },
  ph: {
    url: 'https://app.pricelabs.co/report-builder/9276',
    savedFilter: 'PH',
  },
  building: {
    url: 'https://app.pricelabs.co/report-builder/10420',
    savedFilter: null,
  },
  weeks: {
    url: 'https://app.pricelabs.co/report-builder/10678',
    savedFilter: null,
  },
};

/**
 * Download a report from PriceLabs Report Builder.
 * Sync ON/OFF is always ON by default — no need to set it.
 * For PH segment, loads the saved "PH" filter via Chakra UI menu.
 */
export async function downloadPortfolioReport(
  page: Page,
  segment: ReportSegment = 'all'
): Promise<Buffer> {
  const config = REPORT_CONFIG[segment];

  // Navigate to the report
  await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Only open filter panel if we need to apply a saved filter
  if (config.savedFilter) {
    // Open Listing Filter panel
    const filterButton = page.locator('button:has-text("Listing Filter")').first();
    await filterButton.waitFor({ state: 'visible', timeout: 10_000 });
    await filterButton.click();
    await page.waitForTimeout(1500);

    // Load saved filter — click the dropdown, then select the filter by name
    const savedDropdown = page.getByText('Custom Filters').first();
    if (await savedDropdown.isVisible().catch(() => false)) {
      await savedDropdown.click();
      await page.waitForTimeout(500);
      await page.getByRole('menuitem', { name: config.savedFilter }).first().click();
      await page.waitForTimeout(1000);
    }

    // Close the filter panel
    const closeBtn = page.locator('[id^="chakra-modal"] > button, button[aria-label="Close"]').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(1000);

    // Wait for report data to refresh after filter change
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

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
