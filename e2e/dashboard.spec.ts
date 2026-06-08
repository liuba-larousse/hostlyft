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
      "Schedule",
      "Team",
      "Clients",
    ];
    for (const card of cards) {
      await expect(page.getByText(card, { exact: true })).toBeVisible();
    }
  });

  test("sidebar navigation contains all expected links", async ({ page }) => {
    await page.goto("/dashboard");

    const navItems = [
      "Overview",
      "Schedule",
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

  test("quick access cards navigate to correct pages", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByText("Schedule").click();
    await expect(page).toHaveURL("/dashboard/schedule");
  });
});
