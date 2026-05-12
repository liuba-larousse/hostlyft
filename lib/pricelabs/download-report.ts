import type { Page } from 'playwright-core';
import { readFileSync } from 'fs';

const TIMEOUT = 60_000;
const REPORT_URL = 'https://app.pricelabs.co/report-builder/9276';

/**
 * Download the portfolio report from PriceLabs Report Builder.
 * 1. Navigate to report page
 * 2. Open Listing Filter → set "Sync ON/OFF" = "ON"
 * 3. Click Download
 * 4. Return the XLSX buffer
 */
export async function downloadPortfolioReport(page: Page): Promise<Buffer> {
  // Navigate to the report
  await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

  // Wait for the report table to load
  await page.waitForTimeout(3000);

  // Click "Listing Filter" button to open filter panel
  const filterButton = page.locator('button:has-text("Listing Filter"), [class*="filter"]:has-text("Listing Filter")');
  if (await filterButton.isVisible().catch(() => false)) {
    await filterButton.click();
    await page.waitForTimeout(1000);

    // Check if "Sync ON/OFF" filter is already applied
    const syncFilterExists = await page.locator('text=Sync ON/OFF').isVisible().catch(() => false);

    if (!syncFilterExists) {
      // Need to add the filter — click "Add Filter" or the dropdown
      const addFilter = page.locator('text=Add Filter');
      if (await addFilter.isVisible().catch(() => false)) {
        await addFilter.click();
        await page.waitForTimeout(500);
      }

      // Select "Sync ON/OFF" from the filter dropdown
      // Look for select/dropdown elements and choose Sync ON/OFF
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

      // Set the value to "ON"
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

    // Close the filter panel
    const closeBtn = page.locator('[class*="filter"] button:has(svg), button[aria-label="close"], button:has-text("×")').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    } else {
      // Try pressing Escape to close
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(1000);
  }

  // Wait for the report data to refresh after filter
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  // Click Download button
  const downloadBtn = page.locator('button:has-text("Download"), a:has-text("Download")');
  await downloadBtn.waitFor({ state: 'visible', timeout: 10_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT });
  await downloadBtn.click();
  const download = await downloadPromise;

  const filePath = await download.path();
  if (!filePath) throw new Error('Download failed — no file path returned');

  return readFileSync(filePath);
}
