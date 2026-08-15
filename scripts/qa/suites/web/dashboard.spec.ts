import { test, expect } from "./fixtures/admin";

test.describe("Dashboard", () => {
  test("shows KPI cards with counts", async ({ adminPage: page }) => {
    await page.goto("/dashboard");

    // KPI cards should be visible
    const kpiCards = page.getByTestId("kpi-card");
    await expect(kpiCards.first()).toBeVisible();
  });
});
