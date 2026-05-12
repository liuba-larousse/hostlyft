import { test, expect } from "@playwright/test";

// These tests require an authenticated session.
// Set PLAYWRIGHT_STORAGE_STATE to a saved auth state file, or
// configure the auth setup fixture below.

test.describe("Dashboard", () => {
  // Skip if no auth state is available — these tests require a logged-in session
  test.skip(
    !process.env.PLAYWRIGHT_STORAGE_STATE,
    "Requires PLAYWRIGHT_STORAGE_STATE for authenticated tests"
  );

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined,
  });

  test("dashboard home page loads with quick access cards", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Welcome back");
    await expect(page.getByText("Quick access")).toBeVisible();

    // Verify all quick access cards are present
    const cards = [
      "Cloud Agents",
      "Artifacts",
      "Schedule",
      "Team",
      "Clients",
      "Cloud 9",
      "Price Matrix",
    ];
    for (const card of cards) {
      await expect(page.getByText(card, { exact: true })).toBeVisible();
    }
  });

  test("sidebar navigation contains all expected links", async ({ page }) => {
    await page.goto("/dashboard");

    const navItems = [
      "Overview",
      "Cloud Agents",
      "Artifacts",
      "Schedule",
      "Cloud 9",
      "Price Matrix",
      "Team",
      "Clients",
      "Marketing",
      "Client Reports",
    ];

    for (const item of navItems) {
      await expect(page.getByRole("link", { name: item })).toBeVisible();
    }
  });

  test("schedule page loads and shows weekly view", async ({ page }) => {
    await page.goto("/dashboard/schedule");
    await expect(page.getByText("Weekly Schedule")).toBeVisible();
    await expect(page.getByText("This Week")).toBeVisible();
    await expect(page.getByText("Import")).toBeVisible();
    await expect(page.getByText("Backlog")).toBeVisible();
  });

  test("schedule week navigation works", async ({ page }) => {
    await page.goto("/dashboard/schedule");
    await expect(page.getByText("Weekly Schedule")).toBeVisible();

    // Navigate to next week
    const nextBtn = page.locator('button:has(svg)').filter({ hasText: '' }).nth(1);
    await page.getByRole("button", { name: "Today" }).click();
  });

  test("cloud9 page loads", async ({ page }) => {
    await page.goto("/dashboard/cloud9");
    await page.waitForLoadState("networkidle");
    // Cloud9Matrix loads dynamically — just verify the page doesn't error
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("price matrix page loads", async ({ page }) => {
    await page.goto("/dashboard/price-matrix");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("booking reports page loads", async ({ page }) => {
    await page.goto("/dashboard/client-reports");
    await expect(page.getByText("Booking Reports")).toBeVisible();
  });

  test("team page loads", async ({ page }) => {
    await page.goto("/dashboard/team");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("clients page loads", async ({ page }) => {
    await page.goto("/dashboard/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("artifacts page loads with built-in components", async ({ page }) => {
    await page.goto("/dashboard/artifacts");
    await expect(page.getByText("Artifacts")).toBeVisible();
    await expect(page.getByText("Revenue Forecast")).toBeVisible();
    await expect(page.getByText("Seasonality Analytics")).toBeVisible();
  });

  test("quick access cards navigate to correct pages", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByText("Cloud 9").click();
    await expect(page).toHaveURL("/dashboard/cloud9");

    await page.goto("/dashboard");
    await page.getByText("Price Matrix").click();
    await expect(page).toHaveURL("/dashboard/price-matrix");

    await page.goto("/dashboard");
    await page.getByText("Schedule").click();
    await expect(page).toHaveURL("/dashboard/schedule");
  });
});
