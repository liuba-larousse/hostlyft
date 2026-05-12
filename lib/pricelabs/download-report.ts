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
 * Apply filters and download a report from PriceLabs Report Builder.
 * PriceLabs uses Chakra UI — all dropdowns are custom menus, not native <select>.
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
  const filterButton = page.locator('button:has-text("Listing Filter")').first();
  await filterButton.waitFor({ state: 'visible', timeout: 10_000 });
  await filterButton.click();
  await page.waitForTimeout(1500);

  if (config.savedFilter) {
    // Load a saved filter (e.g., "PH") — Chakra UI Menu
    // Click the saved filters dropdown trigger (shows "Custom Filters" or similar)
    const savedDropdown = page.locator('[class*="menu"] button, button[id*="menu-button"]')
      .filter({ hasText: /Custom Filters|Saved|Select/i }).first();

    if (await savedDropdown.isVisible().catch(() => false)) {
      await savedDropdown.click();
      await page.waitForTimeout(500);
      // Click the menu item with the filter name
      await page.locator(`[role="menuitem"]:has-text("${config.savedFilter}")`).first().click();
      await page.waitForTimeout(1000);
    } else {
      // Try clicking any element that contains "Custom Filters" text
      const customFilters = page.getByText('Custom Filters').first();
      if (await customFilters.isVisible().catch(() => false)) {
        await customFilters.click();
        await page.waitForTimeout(500);
        await page.getByRole('menuitem', { name: config.savedFilter }).first().click();
        await page.waitForTimeout(1000);
      }
    }
  } else {
    // Ensure "Sync ON/OFF: ON" filter chip is present
    const syncChip = page.locator('text=Sync ON/OFF').first();
    const hasSyncFilter = await syncChip.isVisible().catch(() => false);

    if (!hasSyncFilter) {
      // Need to add the Sync ON/OFF filter manually
      // Click "Add Filter" link
      const addFilter = page.getByText('Add Filter').first();
      if (await addFilter.isVisible().catch(() => false)) {
        await addFilter.click();
        await page.waitForTimeout(500);
      }

      // The filter type dropdown — click it and select "Sync ON/OFF"
      // Chakra uses role="combobox" or custom select components
      const filterTypeSelect = page.locator('select').first();
      if (await filterTypeSelect.isVisible().catch(() => false)) {
        await filterTypeSelect.selectOption({ label: 'Sync ON/OFF' });
      } else {
        // Try Chakra-style: click the dropdown, then click the option
        const typeDropdown = page.locator('[class*="select"] button, [class*="Select"]').first();
        if (await typeDropdown.isVisible().catch(() => false)) {
          await typeDropdown.click();
          await page.waitForTimeout(300);
          await page.getByText('Sync ON/OFF', { exact: true }).click();
        }
      }
      await page.waitForTimeout(500);

      // Select "ON" value
      const valueSelect = page.locator('select').last();
      if (await valueSelect.isVisible().catch(() => false)) {
        await valueSelect.selectOption({ label: 'ON' });
      } else {
        const valDropdown = page.locator('[class*="select"] button, [class*="Select"]').last();
        if (await valDropdown.isVisible().catch(() => false)) {
          await valDropdown.click();
          await page.waitForTimeout(300);
          await page.locator('[role="option"]:has-text("ON"), [role="menuitem"]:has-text("ON")').first().click();
        }
      }
      await page.waitForTimeout(500);
    }
  }

  // Close the filter panel — look for X/close button in the drawer/panel
  const closeBtn = page.locator('button[aria-label="Close"], button[aria-label="close"]').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  } else {
    // Try the X button near "Listing Filter" heading
    const xBtn = page.locator('button:has(svg)').filter({ hasText: '' }).locator('near=:text("Listing Filter")').first();
    if (await xBtn.isVisible().catch(() => false)) {
      await xBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
  }
  await page.waitForTimeout(1000);

  // Wait for report data to refresh
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

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
