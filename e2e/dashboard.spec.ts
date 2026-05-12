import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
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

    const cards = [
      "Cloud Agents",
      "Artifacts",
      "Schedule",
      "Team",
      "Clients",
      "Cloud 9",
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
    await page.getByRole("button", { name: "Today" }).click();
  });

  test("cloud9 page loads with subtabs", async ({ page }) => {
    await page.goto("/dashboard/cloud9");
    await expect(page.getByText("Cloud 9")).toBeVisible();
    await expect(page.getByText("Cloud 9 Matrix")).toBeVisible();
    await expect(page.getByText("Action Log")).toBeVisible();
    await expect(page.getByText("Price Matrix")).toBeVisible();
  });

  test("price matrix page loads under cloud9", async ({ page }) => {
    await page.goto("/dashboard/cloud9/price-matrix");
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
    await page.getByText("Schedule").click();
    await expect(page).toHaveURL("/dashboard/schedule");
  });
});
