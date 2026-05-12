import type { Page } from 'playwright-core';
import { readFileSync } from 'fs';

const TIMEOUT = 60_000;

export type ReportSegment = 'all' | 'ph' | 'building' | 'weeks';

interface ReportConfig {
  url: string;
  savedFilter: string | null;  // Name of saved filter to load, or null for manual Sync ON
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
 * Download a portfolio report from PriceLabs Report Builder.
 *
 * @param segment - 'all' (Sync ON), 'ph' (saved PH filter), 'building' (by-building report, Sync ON)
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

  // Open Listing Filter panel
  const filterButton = page.locator('button:has-text("Listing Filter"), [class*="filter"]:has-text("Listing Filter")');
  await filterButton.waitFor({ state: 'visible', timeout: 10_000 });
  await filterButton.click();
  await page.waitForTimeout(1500);

  if (config.savedFilter) {
    // Load a saved filter (e.g., "PH") from the dropdown
    const dropdownTrigger = page.locator('[class*="saved"] select, [class*="filter"] select').first();
    if (await dropdownTrigger.isVisible().catch(() => false)) {
      await dropdownTrigger.selectOption({ label: config.savedFilter });
    } else {
      const customDropdown = page.locator('text=Custom Filters').locator('..');
      if (await customDropdown.isVisible().catch(() => false)) {
        await customDropdown.click();
        await page.waitForTimeout(500);
        const option = page.locator(`text="${config.savedFilter}"`).first();
        if (await option.isVisible().catch(() => false)) {
          await option.click();
        }
      }
    }
    await page.waitForTimeout(1000);
  } else {
    // Ensure Sync ON/OFF = ON is applied
    const syncFilterExists = await page.locator('text=Sync ON/OFF').isVisible().catch(() => false);

    if (!syncFilterExists) {
      const addFilter = page.locator('text=Add Filter');
      if (await addFilter.isVisible().catch(() => false)) {
        await addFilter.click();
        await page.waitForTimeout(500);
      }

      const filterDropdowns = page.locator('select, [role="listbox"], [role="combobox"]');
      const count = await filterDropdowns.count();
      for (let i = 0; i < count; i++) {
        const dropdown = filterDropdowns.nth(i);
        const options = await dropdown.locator('option').allTextContents().catch(() => []);
        if (options.some(o => o.includes('Sync'))) {
          await dropdown.selectOption({ label: 'Sync ON/OFF' });
          break;
        }
      }
      await page.waitForTimeout(500);

      const valueDropdowns = page.locator('select, [role="listbox"], [role="combobox"]');
      const valCount = await valueDropdowns.count();
      for (let i = 0; i < valCount; i++) {
        const dropdown = valueDropdowns.nth(i);
        const options = await dropdown.locator('option').allTextContents().catch(() => []);
        if (options.some(o => o === 'ON')) {
          await dropdown.selectOption({ label: 'ON' });
          break;
        }
      }
      await page.waitForTimeout(500);
    }
  }

  // Close the filter panel
  const closeBtn = page.locator('button[aria-label="close"], button:has-text("×"), [class*="filter"] button:has(svg[class*="close"]), button:has(svg):near(:text("Listing Filter"))').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(1000);

  // Wait for report data to refresh
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  // Click Download
  const downloadBtn = page.locator('button:has-text("Download"), a:has-text("Download")');
  await downloadBtn.waitFor({ state: 'visible', timeout: 10_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT });
  await downloadBtn.click();
  const download = await downloadPromise;

  const filePath = await download.path();
  if (!filePath) throw new Error('Download failed — no file path returned');

  return readFileSync(filePath);
}
