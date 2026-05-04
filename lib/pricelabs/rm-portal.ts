import type { Page } from 'playwright-core';

const RM_PARTNERS_URL = 'https://app.pricelabs.co/rm-partners';
const TIMEOUT = 30_000;

/**
 * After logging in with RM Portal credentials, navigate to RM Partners page
 * and click on the target client to switch to their account view.
 */
export async function switchToRmClient(page: Page, clientName: string): Promise<void> {
  await page.goto(RM_PARTNERS_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });

  // Wait for the partner cards to load
  await page.waitForTimeout(2000);

  // Try to find and click the client card by name
  // PriceLabs RM Partners page shows client cards with name and email
  const clientCard = page.locator(`text="${clientName}"`).first();

  try {
    await clientCard.waitFor({ timeout: 10_000 });
    await clientCard.click();
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // After clicking, PriceLabs may show "Currently viewing" or redirect
    // Wait a moment for the account switch to complete
    await page.waitForTimeout(3000);
  } catch {
    // Try partial name match
    const cards = page.locator('[class*="card"], [class*="partner"], [class*="client"]');
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).textContent();
      if (text && text.toLowerCase().includes(clientName.toLowerCase())) {
        await cards.nth(i).click();
        await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
        await page.waitForTimeout(3000);
        return;
      }
    }

    throw new Error(`Could not find client "${clientName}" on RM Partners page. Available clients: check ${RM_PARTNERS_URL}`);
  }
}
